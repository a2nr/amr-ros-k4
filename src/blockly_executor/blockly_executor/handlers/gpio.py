"""GPIO command handlers — LED on/off and digital output.

Each handler contains both dummy (logging) and real (ROS2/GPIO) behavior.
When adding a new GPIO block, just add a new @handler function here.
"""

from . import handler
from ..hardware import Hardware


@handler("led_on")
def handle_led_on(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.log(f"set_led(pin={pin}, state=True)")

    if hardware.is_real():
        # TODO: publish to ROS2 topic for Pi hardware node
        hardware.node.get_logger().info(f"LED on pin {pin} ON")

    return (True, f"LED on pin {pin} turned ON")


@handler("led_off")
def handle_led_off(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.log(f"set_led(pin={pin}, state=False)")

    if hardware.is_real():
        # TODO: publish to ROS2 topic for Pi hardware node
        hardware.node.get_logger().info(f"LED on pin {pin} OFF")

    return (True, f"LED on pin {pin} turned OFF")


@handler("digital_out")
def handle_digital_out(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])
    state = bool(params["state"])
    state_str = "HIGH" if state else "LOW"
    hardware.log(f"set_digital_out(gpio={gpio}, state={state})")

    if hardware.is_real():
        # TODO: publish to ROS2 topic for Pi hardware node
        hardware.node.get_logger().info(f"GPIO pin {gpio} set to {state_str}")

    return (True, f"GPIO pin {gpio} set to {state_str}")