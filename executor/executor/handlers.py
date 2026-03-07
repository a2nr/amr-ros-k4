"""Handler registry and command handlers for the executor."""

import time
from typing import Callable

from .hardware.interface import HardwareInterface


class HandlerRegistry:
    """
    Registry of command handlers that maps command names to handler functions.

    Each handler receives a params dict and the hardware interface,
    and returns a tuple of (success: bool, message: str).
    """

    def __init__(self, hardware: HardwareInterface) -> None:
        self._hardware = hardware
        self._handlers: dict[str, Callable[[dict[str, str]], tuple[bool, str]]] = {}
        self._register_default_handlers()

    def _register_default_handlers(self) -> None:
        """Register the built-in command handlers."""
        self.register("led_on", self._handle_led_on)
        self.register("led_off", self._handle_led_off)
        self.register("delay", self._handle_delay)

    def register(
        self,
        command: str,
        handler: Callable[[dict[str, str]], tuple[bool, str]],
    ) -> None:
        """Register a new command handler."""
        self._handlers[command] = handler

    def execute(self, command: str, params: dict[str, str]) -> tuple[bool, str]:
        """
        Execute a command by name with given parameters.

        Args:
            command: The command name (e.g. "led_on", "delay").
            params: Dictionary of parameters for the command.

        Returns:
            Tuple of (success, message).

        Raises:
            KeyError: If a required parameter is missing from params.
        """
        handler = self._handlers.get(command)
        if handler is None:
            return (False, f"Unknown command: '{command}'")
        return handler(params)

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

    def _handle_delay(self, params: dict[str, str]) -> tuple[bool, str]:
        """Wait for specified duration in milliseconds."""
        duration_ms = int(params["duration_ms"])
        time.sleep(duration_ms / 1000.0)
        return (True, f"Delayed {duration_ms}ms")
