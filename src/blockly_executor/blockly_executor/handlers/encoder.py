"""AS5600 encoder handler — read cached angle from /encoder/state topic.

Real mode communication:
  encoder_read ← subscribe EncoderRead from /encoder/state ← as5600_node reads I2C
"""

import threading

from . import handler
from .hardware import Hardware


def _get_encoder_state_subscriber(hardware: Hardware):
    """Lazy-create a subscriber for /encoder/state with per-encoder cache.

    as5600_node publishes EncoderRead per encoder periodically.
    Subscriber caches latest angle per encoder_id.
    """
    if not hasattr(hardware.node, "_encoder_state_cache"):
        from blockly_interfaces.msg import EncoderRead

        hardware.node._encoder_state_cache = {}
        hardware.node._encoder_state_lock = threading.Lock()

        def _encoder_state_cb(msg: EncoderRead):
            with hardware.node._encoder_state_lock:
                hardware.node._encoder_state_cache[msg.encoder_id] = {
                    "angle": msg.angle,
                    "raw_angle": msg.raw_angle,
                }

        hardware.node._encoder_state_sub = hardware.node.create_subscription(
            EncoderRead, "/encoder/state", _encoder_state_cb, 10
        )
    return hardware.node._encoder_state_cache


@handler("encoder_read")
def handle_encoder_read(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    encoder_id = int(params["encoder_id"])
    hardware.log(f"encoder_read(id={encoder_id})")

    if hardware.is_real():
        cache = _get_encoder_state_subscriber(hardware)
        with hardware.node._encoder_state_lock:
            data = cache.get(encoder_id)

        if data is None:
            return (True, "0.0")
        return (True, str(data["angle"]))

    # Dummy mode — return 0.0
    return (True, "0.0")
