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
"""

import rclpy
from rclpy.node import Node

from blockly_interfaces.msg import GpioWrite, GpioRead

# gpiod hanya tersedia di Raspberry Pi (linux-aarch64).
# Pada dev machine (linux-64), import akan gagal dan node
# berjalan dalam simulation mode.
try:
    import gpiod
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
        self.declare_parameter("gpio_chip", "gpiochip0")  # default chip untuk Pi

        self._output_pins = (
            self.get_parameter("output_pins").get_parameter_value().integer_array_value
        )
        self._input_pins = (
            self.get_parameter("input_pins").get_parameter_value().integer_array_value
        )
        rate = (
            self.get_parameter("input_publish_rate").get_parameter_value().double_value
        )
        chip_name = (
            self.get_parameter("gpio_chip").get_parameter_value().string_value
        )

        self._chip = None
        self._output_lines: dict[int, object] = {}
        self._input_lines: dict[int, object] = {}

        if HAS_GPIOD:
            self._setup_gpio(chip_name)
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
            f"GpioNode ready — outputs={list(self._output_pins)}, "
            f"inputs={list(self._input_pins)}, "
            f"gpiod={'yes' if HAS_GPIOD else 'no (simulation)'}"
        )

    def _setup_gpio(self, chip_name: str) -> None:
        """Konfigurasi GPIO lines via gpiod.

        Setiap pin di-request dengan consumer name "gpio_node" agar mudah
        diidentifikasi via `gpioinfo` jika ada konflik.
        """
        self._chip = gpiod.Chip(chip_name)

        for pin in self._output_pins:
            line = self._chip.get_line(pin)
            line.request(consumer="gpio_node", type=gpiod.LINE_REQ_DIR_OUT)
            self._output_lines[pin] = line
            self.get_logger().info(f"Configured pin {pin} as OUTPUT")

        for pin in self._input_pins:
            line = self._chip.get_line(pin)
            line.request(consumer="gpio_node", type=gpiod.LINE_REQ_DIR_IN)
            self._input_lines[pin] = line
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

        if pin not in self._output_lines and HAS_GPIOD:
            self.get_logger().warn(
                f"Pin {pin} not configured as output — ignoring write"
            )
            return

        if HAS_GPIOD:
            self._output_lines[pin].set_value(1 if state else 0)

        self.get_logger().info(f"GPIO write: pin={pin} state={state_str}")

    def _read_callback(self) -> None:
        """Baca semua input pin dan publish state masing-masing.

        Dipanggil oleh timer secara periodik (default 10 Hz).
        Setiap pin dipublish sebagai message terpisah agar subscriber
        bisa memfilter berdasarkan pin number.
        """
        for pin, line in self._input_lines.items():
            msg = GpioRead()
            msg.pin = pin

            if HAS_GPIOD:
                msg.state = bool(line.get_value())
            else:
                msg.state = False  # simulation: selalu LOW

            self._state_pub.publish(msg)

    def destroy_node(self) -> None:
        """Release GPIO lines saat shutdown.

        Penting untuk melepaskan line agar pin bisa digunakan kembali
        oleh proses lain tanpa reboot. Jika tidak di-release, gpiod
        akan menandai pin sebagai "busy".
        """
        for line in self._output_lines.values():
            line.release()
        for line in self._input_lines.values():
            line.release()
        if self._chip is not None:
            self._chip.close()
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
