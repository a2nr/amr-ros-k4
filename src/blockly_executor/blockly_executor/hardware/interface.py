"""Abstract base class for hardware interfaces."""

from abc import ABC, abstractmethod


class HardwareInterface(ABC):
    """
    Abstract hardware interface that all hardware implementations must extend.

    Subclasses must implement all abstract methods. Attempting to instantiate
    this class directly or a subclass that doesn't implement all methods
    will raise TypeError.
    """

    @abstractmethod
    def set_led(self, pin: int, state: bool) -> None:
        """
        Set LED state on the given pin.

        Args:
            pin: GPIO pin number.
            state: True to turn on, False to turn off.
        """
        ...

    @abstractmethod
    def is_ready(self) -> bool:
        """
        Check if the hardware interface is ready for commands.

        Returns:
            True if hardware is initialized and ready.
        """
        ...
    
    @abstractmethod
    def set_digital_out(self, gpio: int, state: bool) -> None:
        """
        Set a GPIO pin to HIGH or LOW.

        Args:
            gpio: GPIO pin number.
            state: True for HIGH, False for LOW.
        """
        ...
