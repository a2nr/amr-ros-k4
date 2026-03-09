"""GPIO hardware implementation for Raspberry Pi."""

from .interface import HardwareInterface


class GpioHardware(HardwareInterface):
    """
    Real GPIO hardware implementation for Raspberry Pi.

    Uses RPi.GPIO to control physical LED pins.
    This implementation is only usable on Raspberry Pi hardware.
    """

    def __init__(self) -> None:
        try:
            import RPi.GPIO as GPIO

            self._gpio = GPIO
            self._gpio.setmode(GPIO.BCM)
            self._gpio.setwarnings(False)
            self._initialized = True
        except (ImportError, RuntimeError):
            self._initialized = False

    def set_led(self, pin: int, state: bool) -> None:
        if not self._initialized:
            raise RuntimeError("GPIO not available on this platform")
        self._gpio.setup(pin, self._gpio.OUT)
        self._gpio.output(pin, self._gpio.HIGH if state else self._gpio.LOW)

    def is_ready(self) -> bool:
        return self._initialized
    
    def set_digital_out(self, gpio: int, state: bool) -> None:
        if not self._initialized:
            raise RuntimeError("GPIO not available on this platform")
        self._gpio.setup(gpio, self._gpio.OUT)
        self._gpio.output(gpio, self._gpio.HIGH if state else self._gpio.LOW)
