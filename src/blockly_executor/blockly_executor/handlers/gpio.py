"""GPIO command handlers — LED on/off and future GPIO operations."""

from . import handler


@handler("led_on")
def handle_led_on(params: dict[str, str], hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.set_led(pin, True)
    return (True, f"LED on pin {pin} turned ON")


@handler("led_off")
def handle_led_off(params: dict[str, str], hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.set_led(pin, False)
    return (True, f"LED on pin {pin} turned OFF")
