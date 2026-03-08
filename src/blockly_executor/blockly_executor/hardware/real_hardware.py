"""Real hardware implementation — communicates with hardware nodes via ROS2."""

from rclpy.node import Node

from .interface import HardwareInterface


class RealHardware(HardwareInterface):
    """Hardware interface that talks to ROS2 nodes running on the Raspberry Pi.

    Each hardware operation publishes to a topic or calls a service on the
    Pi-side hardware nodes. The executor does NOT run on the Pi directly.

    Args:
        node: The ROS2 node to create publishers/clients on.
    """

    def __init__(self, node: Node) -> None:
        self._node = node
        self._logger = node.get_logger()
        # TODO: create publishers/service clients for Pi hardware nodes
        # e.g. self._led_pub = node.create_publisher(...)
        self._logger.info("RealHardware initialized (stub — publishers TBD)")

    def set_led(self, pin: int, state: bool) -> None:
        # TODO: publish to Pi hardware node
        self._logger.info(f"RealHardware.set_led(pin={pin}, state={state}) — stub")

    def is_ready(self) -> bool:
        # TODO: check if Pi hardware nodes are reachable
        return True
