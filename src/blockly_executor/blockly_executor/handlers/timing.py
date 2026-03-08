"""Timing command handlers — delay and future time-based operations."""

import time

from . import handler


@handler("delay")
def handle_delay(params: dict[str, str], hardware) -> tuple[bool, str]:
    duration_ms = int(params["duration_ms"])
    time.sleep(duration_ms / 1000.0)
    return (True, f"Delayed {duration_ms}ms")
