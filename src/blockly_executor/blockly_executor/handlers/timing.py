"""Timing command handlers — delay and future time-based operations."""

import time

from . import handler
from .hardware import Hardware


@handler("delay")
def handle_delay(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    duration_ms = int(params["duration_ms"])
    time.sleep(duration_ms / 1000.0)
    return (True, f"Delayed {duration_ms}ms")
