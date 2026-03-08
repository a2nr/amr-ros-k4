"""GPIO command handlers — LED on/off and future GPIO operations."""

from ..hardware.interface import HardwareInterface
from .base import HandlerModule


class GpioHandlers(HandlerModule):
    """
    Handler module for GPIO-related commands.

    Commands:
        - led_on:  Turn on LED at specified pin
        - led_off: Turn off LED at specified pin
    """

    def register(self, registry, hardware: HardwareInterface) -> None:
        self._hardware = hardware
        registry.register("led_on", self._handle_led_on)
        registry.register("led_off", self._handle_led_off)

    def _handle_led_on(self, params: dict[str, str]) -> tuple[bool, str]:
        """Turn on LED at specified pin."""
        pin = int(params["pin"])
        self._hardware.set_led(pin, True)
        return (True, f"LED on pin {pin} turned ON")

    def _handle_led_off(self, params: dict[str, str]) -> tuple[bool, str]:
        """Turn off LED at specified pin."""
        pin = int(params["pin"])
        self._hardware.set_led(pin, False)
        return (True, f"LED on pin {pin} turned OFF")
