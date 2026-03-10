"""
Handler registry with @handler decorator and auto-discovery.

To add a new command handler:
1. Create a .py file in this directory (or add to an existing one)
2. Use the @handler decorator:

    from . import handler

    @handler("my_command")
    def handle_my_command(params, hardware):
        value = params["key"]
        return (True, f"Done: {value}")

That's it. The file is auto-discovered, the function is auto-registered.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Callable

from .hardware import Hardware

# Global list that collects (command_name, function) pairs during import.
# Each @handler("name") call appends here. HandlerRegistry.__init__
# consumes this list and binds hardware to each function.
_REGISTERED_HANDLERS: list[tuple[str, Callable]] = []


def handler(command: str) -> Callable:
    """Decorator that registers a function as a command handler.

    The decorated function must accept (params: dict[str,str], hardware) and
    return (bool, str).
    """

    def decorator(fn: Callable) -> Callable:
        _REGISTERED_HANDLERS.append((command, fn))
        return fn

    return decorator


def _auto_discover_handlers() -> None:
    """Import all .py modules in this package to trigger @handler decorators."""
    package_dir = Path(__file__).parent
    for module_info in pkgutil.iter_modules([str(package_dir)]):
        if module_info.name.startswith("_"):
            continue
        importlib.import_module(f".{module_info.name}", __package__)


class HandlerRegistry:
    """Maps command names to handler functions.

    On init, auto-discovers all handler modules in this package and binds
    the hardware interface to each registered handler.
    """

    def __init__(self, hardware: Hardware) -> None:
        self._hardware = hardware
        self._handlers: dict[str, Callable[[dict[str, str]], tuple[bool, str]]] = {}

        _auto_discover_handlers()

        for command, fn in _REGISTERED_HANDLERS:
            self._handlers[command] = lambda params, _fn=fn: _fn(params, hardware)

    def execute(self, command: str, params: dict[str, str]) -> tuple[bool, str]:
        handler_fn = self._handlers.get(command)
        if handler_fn is None:
            return (False, f"Unknown command: '{command}'")
        return handler_fn(params)


__all__ = ["HandlerRegistry", "handler"]
