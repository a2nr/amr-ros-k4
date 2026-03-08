"""Timing command handlers — delay and future time-based operations."""

import time

from ..hardware.interface import HardwareInterface
from .base import HandlerModule


class TimingHandlers(HandlerModule):
    """
    Handler module for time-based commands.

    Commands:
        - delay: Wait for specified duration in milliseconds
    """

    def register(self, registry, hardware: HardwareInterface) -> None:
        self._hardware = hardware
        registry.register("delay", self._handle_delay)

    def _handle_delay(self, params: dict[str, str]) -> tuple[bool, str]:
        """Wait for specified duration in milliseconds."""
        duration_ms = int(params["duration_ms"])
        time.sleep(duration_ms / 1000.0)
        return (True, f"Delayed {duration_ms}ms")
