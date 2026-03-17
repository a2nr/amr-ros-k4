"""Odometry handler — read cached robot-level pose/velocity from nav_msgs/Odometry.

Real mode communication:
  odometry_read ← subscribe nav_msgs/Odometry from odometry_encoder/odom ← as5600_node
  Future: odometry_imu/odom, odometry_optical/odom, etc.

Units: cm for position, cm/s for velocity, rad for heading, rad/s for angular velocity.
"""

import math
import threading

from . import handler
from .hardware import Hardware

# Topic mapping: source name → topic
_SOURCE_TOPICS = {
    "encoder": "odometry_encoder/odom",
}


def _quaternion_to_yaw(q):
    """Convert quaternion to yaw angle (2D heading)."""
    siny = 2.0 * (q.w * q.z + q.x * q.y)
    cosy = 1.0 - 2.0 * (q.y * q.y + q.z * q.z)
    return math.atan2(siny, cosy)


def _get_odometry_subscriber(hardware: Hardware, source: str):
    """Lazy-create a subscriber for a specific odometry source.

    Each source gets its own subscription and cache entry.
    """
    cache_attr = "_odometry_cache"
    lock_attr = "_odometry_lock"
    subs_attr = "_odometry_subs"

    if not hasattr(hardware.node, cache_attr):
        hardware.node._odometry_cache = {}
        hardware.node._odometry_lock = threading.Lock()
        hardware.node._odometry_subs = {}

    if source not in hardware.node._odometry_subs:
        from nav_msgs.msg import Odometry

        topic = _SOURCE_TOPICS.get(source, f"odometry_{source}/odom")

        def _odom_cb(msg: Odometry):
            yaw = _quaternion_to_yaw(msg.pose.pose.orientation)
            with hardware.node._odometry_lock:
                hardware.node._odometry_cache[source] = {
                    "x": msg.pose.pose.position.x,
                    "y": msg.pose.pose.position.y,
                    "heading": yaw,
                    "vx": msg.twist.twist.linear.x,
                    "vy": msg.twist.twist.linear.y,
                    "omega_z": msg.twist.twist.angular.z,
                }

        hardware.node._odometry_subs[source] = (
            hardware.node.create_subscription(Odometry, topic, _odom_cb, 10)
        )

    return hardware.node._odometry_cache


@handler("odometry_read")
def handle_odometry_read(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    source = params.get("source", "encoder")
    field = params["field"]
    hardware.log(f"odometry_read(source={source}, field={field})")

    if hardware.is_real():
        cache = _get_odometry_subscriber(hardware, source)
        with hardware.node._odometry_lock:
            data = cache.get(source)

        if data is None:
            return (True, "0.0")

        value = data.get(field, 0.0)
        return (True, str(value))

    # Dummy mode — return 0.0
    return (True, "0.0")
