"""Base class for handler modules."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..hardware.interface import HardwareInterface


class HandlerModule(ABC):
    """
    Abstract base class for handler modules.

    Each handler module groups related commands (e.g., GPIO commands,
    timing commands, navigation commands). Subclasses must implement
    register() to bind their commands to the registry.

    Example:
        class GpioHandlers(HandlerModule):
            def register(self, registry, hardware):
                registry.register("led_on", lambda p: self._led_on(p, hardware))
    """

    @abstractmethod
    def register(
        self,
        registry: "HandlerRegistry",
        hardware: "HardwareInterface",
    ) -> None:
        """
        Register all commands provided by this handler module.

        Args:
            registry: The HandlerRegistry to register commands with.
            hardware: The hardware interface for hardware operations.
        """
        ...
