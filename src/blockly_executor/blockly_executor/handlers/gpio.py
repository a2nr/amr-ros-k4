"""GPIO command handlers — digital output and digital input.

Each handler contains both dummy (logging) and real (ROS2 publish) behavior.
When adding a new GPIO block, just add a new @handler function here.

Real mode communication:
  digital_out → publish GpioWrite to /gpio/write → gpio_node sets physical pin
  digital_in  ← subscribe GpioRead from /gpio/state ← gpio_node reads physical pin
"""

import threading

from . import handler
from .hardware import Hardware


def _get_gpio_write_publisher(hardware: Hardware):
    """Lazy-create a publisher for /gpio/write on the executor node.

    Publisher disimpan sebagai atribut di hardware.node agar hanya dibuat
    sekali (lazy init). Pendekatan ini menghindari modifikasi Hardware class
    saat menambah handler baru — semua state ROS2 dikelola oleh handler.
    """
    if not hasattr(hardware.node, "_gpio_write_pub"):
        from blockly_interfaces.msg import GpioWrite

        hardware.node._gpio_write_pub = hardware.node.create_publisher(
            GpioWrite, "/gpio/write", 10
        )
    return hardware.node._gpio_write_pub


def _get_gpio_state_subscriber(hardware: Hardware):
    """Lazy-create a subscriber for /gpio/state with a pin state cache.

    gpio_node mempublikasikan state semua input pin secara periodik.
    Subscriber ini menyimpan state terakhir setiap pin di dict cache
    {pin: bool}. Handler digital_in membaca cache ini saat dipanggil.

    Lock digunakan secara defensif — callback subscription bisa dipanggil
    dari context yang berbeda tergantung executor model ROS2.
    """
    if not hasattr(hardware.node, "_gpio_state_cache"):
        from blockly_interfaces.msg import GpioRead

        hardware.node._gpio_state_cache = {}
        hardware.node._gpio_state_lock = threading.Lock()

        def _gpio_state_cb(msg: GpioRead):
            with hardware.node._gpio_state_lock:
                hardware.node._gpio_state_cache[msg.pin] = msg.state

        hardware.node._gpio_state_sub = hardware.node.create_subscription(
            GpioRead, "/gpio/state", _gpio_state_cb, 10
        )
    return hardware.node._gpio_state_cache


@handler("digital_out")
def handle_digital_out(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])

    # Parsing string ke bool secara eksplisit karena bool("false") == True
    # di Python (semua non-empty string adalah truthy).
    state_raw = str(params["state"]).lower()
    state = state_raw in ("true", "1", "high")
    state_str = "HIGH" if state else "LOW"
    hardware.log(f"set_digital_out(gpio={gpio}, state={state})")

    if hardware.is_real():
        from blockly_interfaces.msg import GpioWrite

        pub = _get_gpio_write_publisher(hardware)
        msg = GpioWrite()
        msg.pin = gpio
        msg.state = state
        pub.publish(msg)
        hardware.node.get_logger().info(f"GPIO pin {gpio} set to {state_str}")

    return (True, f"GPIO pin {gpio} set to {state_str}")


@handler("digital_in")
def handle_digital_in(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])
    hardware.log(f"read_digital_in(gpio={gpio})")

    if hardware.is_real():
        # Baca state pin dari cache yang diupdate oleh subscriber /gpio/state.
        # Cache mungkin belum terisi jika gpio_node belum publish — return 0.
        cache = _get_gpio_state_subscriber(hardware)
        with hardware.node._gpio_state_lock:
            state = cache.get(gpio)

        if state is None:
            return (True, "0")
        return (True, "1" if state else "0")

    # Dummy mode — selalu return 0 (LOW)
    return (True, "0")
