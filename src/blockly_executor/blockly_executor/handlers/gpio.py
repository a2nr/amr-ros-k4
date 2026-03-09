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

@handler("digital_out")
def handle_digital_out(params: dict[str, str], hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])
    state = bool(params["state"])
    hardware.set_digital_out(gpio, state)
    state_str = "HIGH" if state else "LOW"
    return (True, f"GPIO pin {gpio} set to {state_str}")