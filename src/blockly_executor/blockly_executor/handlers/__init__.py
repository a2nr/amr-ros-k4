"""
Handler registry and auto-discovery for command handler modules.

Each handler module in this package implements the HandlerModule interface
and registers its commands with the HandlerRegistry during initialization.

To add a new handler category:
1. Create a new file (e.g., movement.py) with a class extending HandlerModule
2. Add an import and instantiation in HANDLER_MODULES below
"""

from typing import Callable

from ..hardware.interface import HardwareInterface
from .base import HandlerModule

# Import all handler modules
from .gpio import GpioHandlers
from .timing import TimingHandlers

# All handler modules to be auto-registered.
# Add new handler module instances here when creating new categories.
HANDLER_MODULES: list[HandlerModule] = [
    GpioHandlers(),
    TimingHandlers(),
]


class HandlerRegistry:
    """
    Registry of command handlers that maps command names to handler functions.

    Each handler receives a params dict and returns a tuple of
    (success: bool, message: str).

    Handler modules are auto-registered from HANDLER_MODULES during init.
    """

    def __init__(self, hardware: HardwareInterface) -> None:
        self._hardware = hardware
        self._handlers: dict[str, Callable[[dict[str, str]], tuple[bool, str]]] = {}
        self._register_all_modules()

    def _register_all_modules(self) -> None:
        """Auto-register all handler modules from HANDLER_MODULES."""
        for module in HANDLER_MODULES:
            module.register(self, self._hardware)

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


__all__ = ["HandlerRegistry", "HandlerModule", "HANDLER_MODULES"]
