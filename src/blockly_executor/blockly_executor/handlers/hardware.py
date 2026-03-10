"""Hardware context — provides mode, ROS2 node, and call_log to handlers."""

from __future__ import annotations


class Hardware:
    """
    Hardware context passed to every handler.

    Handlers check hardware.is_real() to decide between dummy (logging)
    and real (ROS2 publish/GPIO) behavior. This class never needs
    modification when adding new blocks — all logic lives in handlers.

    Attributes:
        mode: "dummy" for testing/dev, "real" for actual hardware.
        node: ROS2 Node instance (only available when mode="real").
        call_log: List of logged actions for testing/debugging.
    """

    def __init__(self, mode: str = "dummy", node=None) -> None:
        self.mode = mode
        self.node = node
        self.call_log: list[str] = []

    def is_real(self) -> bool:
        """Check if running in real hardware mode."""
        return self.mode == "real"

    def log(self, message: str) -> None:
        """Log a hardware action for testing/debugging."""
        self.call_log.append(message)
