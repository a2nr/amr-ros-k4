"""ROS2 GPIO node — digital input/output for Raspberry Pi via gpiod.

Node ini berjalan di Raspberry Pi dan menjadi jembatan antara ROS2 topic
dengan pin GPIO fisik. Executor handler di sisi desktop publish/subscribe
ke topic node ini untuk mengontrol hardware.

Alur komunikasi:
  Executor → publish GpioWrite ke /gpio/write → node ini → gpiod set pin
  Node ini → timer baca pin → publish GpioRead ke /gpio/state → Executor

Jika gpiod tidak tersedia (misalnya di x86 dev machine), node tetap berjalan
dalam simulation mode — hanya logging tanpa akses hardware. Ini memungkinkan
pengembangan dan testing tanpa Pi.

Menggunakan gpiod v2.x API (request_lines / LineSettings / Value).
"""

import rclpy
from rclpy.node import Node

from blockly_interfaces.msg import GpioWrite, GpioRead

# gpiod hanya tersedia di Raspberry Pi (linux-aarch64).
# Pada dev machine (linux-64), import akan gagal dan node
# berjalan dalam simulation mode.
try:
    import gpiod
    from gpiod.line import Direction, Value
    HAS_GPIOD = True
except ImportError:
    HAS_GPIOD = False


class GpioNode(Node):

    def __init__(self) -> None:
        super().__init__("gpio_node")

        # Pin-pin yang dikonfigurasi bisa diubah via ROS2 parameter saat launch.
        # Contoh: ros2 run gpio_node gpio_node --ros-args -p output_pins:=[17,27]
        self.declare_parameter("output_pins", [17, 27, 22])
        self.declare_parameter("input_pins", [5, 6, 13])
        self.declare_parameter("input_publish_rate", 10.0)  # Hz
        self.declare_parameter("gpio_chip", "/dev/gpiochip0")  # gpiod v2.x butuh path lengkap

        self._output_pins = list(
            self.get_parameter("output_pins").get_parameter_value().integer_array_value
        )
        self._input_pins = list(
            self.get_parameter("input_pins").get_parameter_value().integer_array_value
        )
        rate = (
            self.get_parameter("input_publish_rate").get_parameter_value().double_value
        )
        chip_name = (
            self.get_parameter("gpio_chip").get_parameter_value().string_value
        )

        # gpiod v2.x: request_lines() mengembalikan LineRequest object,
        # bukan per-line object seperti v1.x.
        self._output_request = None
        self._input_request = None

        # Instance flag — True hanya jika gpiod tersedia DAN chip berhasil dibuka.
        # Berbeda dari module-level HAS_GPIOD yang hanya cek import.
        self._has_hardware = False

        if HAS_GPIOD:
            try:
                self._setup_gpio(chip_name)
                self._has_hardware = True
            except (FileNotFoundError, PermissionError, OSError) as e:
                # gpiod terinstall tapi GPIO chip tidak ada (dev machine x86)
                # atau permission denied — fallback ke simulation mode
                self.get_logger().warn(
                    f"gpiod available but cannot open {chip_name}: {e} "
                    "— running in simulation mode"
                )
        else:
            self.get_logger().warn(
                "gpiod not available — running in simulation mode (log only)"
            )

        # Terima perintah digital output dari executor
        self._write_sub = self.create_subscription(
            GpioWrite, "/gpio/write", self._write_callback, 10
        )

        # Publikasikan state digital input untuk dibaca executor
        self._state_pub = self.create_publisher(GpioRead, "/gpio/state", 10)

        # Timer polling — baca semua input pin secara periodik.
        # Pendekatan polling dipilih karena gpiod event/interrupt
        # memerlukan konfigurasi edge detection yang lebih kompleks.
        if self._input_pins:
            period = 1.0 / rate
            self._read_timer = self.create_timer(period, self._read_callback)

        self.get_logger().info(
            f"GpioNode ready — outputs={self._output_pins}, "
            f"inputs={self._input_pins}, "
            f"gpiod={'yes' if self._has_hardware else 'no (simulation)'}"
        )

    def _setup_gpio(self, chip_name: str) -> None:
        """Konfigurasi GPIO lines via gpiod v2.x API.

        gpiod v2.x menggunakan request_lines() untuk merequest semua pin
        sekaligus, berbeda dari v1.x yang per-line. LineSettings menentukan
        direction (input/output) untuk setiap pin.
        """
        # Request output lines sebagai satu batch
        if self._output_pins:
            out_config = {
                pin: gpiod.LineSettings(direction=Direction.OUTPUT)
                for pin in self._output_pins
            }
            self._output_request = gpiod.request_lines(
                chip_name, consumer="gpio_node", config=out_config
            )
            for pin in self._output_pins:
                self.get_logger().info(f"Configured pin {pin} as OUTPUT")

        # Request input lines sebagai satu batch
        if self._input_pins:
            in_config = {
                pin: gpiod.LineSettings(direction=Direction.INPUT)
                for pin in self._input_pins
            }
            self._input_request = gpiod.request_lines(
                chip_name, consumer="gpio_node", config=in_config
            )
            for pin in self._input_pins:
                self.get_logger().info(f"Configured pin {pin} as INPUT")

    def _write_callback(self, msg: GpioWrite) -> None:
        """Handle perintah digital output dari executor.

        Hanya pin yang sudah dikonfigurasi sebagai output yang akan diproses.
        Pin yang tidak terdaftar akan di-ignore dengan warning — ini mencegah
        akses ke pin yang belum di-request di gpiod (akan menyebabkan error).
        """
        pin = int(msg.pin)
        state = msg.state
        state_str = "HIGH" if state else "LOW"

        if pin not in self._output_pins and self._has_hardware:
            self.get_logger().warn(
                f"Pin {pin} not configured as output — ignoring write"
            )
            return

        if self._has_hardware and self._output_request:
            value = Value.ACTIVE if state else Value.INACTIVE
            self._output_request.set_value(pin, value)

        self.get_logger().info(f"GPIO write: pin={pin} state={state_str}")

    def _read_callback(self) -> None:
        """Baca semua input pin dan publish state masing-masing.

        Dipanggil oleh timer secara periodik (default 10 Hz).
        Setiap pin dipublish sebagai message terpisah agar subscriber
        bisa memfilter berdasarkan pin number.
        """
        for pin in self._input_pins:
            msg = GpioRead()
            msg.pin = pin

            if self._has_hardware and self._input_request:
                msg.state = self._input_request.get_value(pin) == Value.ACTIVE
            else:
                msg.state = False  # simulation: selalu LOW

            self._state_pub.publish(msg)

    def destroy_node(self) -> None:
        """Release GPIO lines saat shutdown.

        gpiod v2.x: release() dipanggil pada LineRequest object,
        bukan per-line seperti v1.x.
        """
        if self._has_hardware:
            if self._output_request:
                self._output_request.release()
            if self._input_request:
                self._input_request.release()
            self.get_logger().info("GPIO lines released")
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)

    node = GpioNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
