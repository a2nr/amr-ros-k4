"""Dummy hardware implementation for development and testing."""

from .interface import HardwareInterface


class DummyHardware(HardwareInterface):
    """
    In-memory hardware implementation that logs all operations.

    LED states are stored in a dict and every command is recorded
    in call_log for inspection during tests.
    """

    def __init__(self) -> None:
        self.led_states: dict[int, bool] = {}
        self.call_log: list[str] = []

    def set_led(self, pin: int, state: bool) -> None:
        self.led_states[pin] = state
        self.call_log.append(f"set_led(pin={pin}, state={state})")

    def is_ready(self) -> bool:
        self.call_log.append("is_ready()")
        return True
