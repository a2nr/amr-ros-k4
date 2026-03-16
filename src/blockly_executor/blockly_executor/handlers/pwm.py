"""PWM command handler — PCA9685 16-channel PWM control via I2C.

Real mode communication:
  pwm_write → publish PwmWrite to /pwm/write → pca9685_node writes I2C register
"""

from . import handler
from .hardware import Hardware


def _get_pwm_write_publisher(hardware: Hardware):
    """Lazy-create a publisher for /pwm/write on the executor node."""
    if not hasattr(hardware.node, "_pwm_write_pub"):
        from blockly_interfaces.msg import PwmWrite

        hardware.node._pwm_write_pub = hardware.node.create_publisher(
            PwmWrite, "/pwm/write", 10
        )
    return hardware.node._pwm_write_pub


@handler("pwm_write")
def handle_pwm_write(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    address = int(params["address"])
    channel = int(params["channel"])
    value = int(params["value"])

    if channel < 0 or channel > 15:
        return (False, f"Invalid channel {channel} (must be 0-15)")

    if value < 0 or value > 4095:
        return (False, f"Invalid PWM value {value} (must be 0-4095)")

    hardware.log(f"pwm_write(addr=0x{address:02X}, ch={channel}, val={value})")

    if hardware.is_real():
        from blockly_interfaces.msg import PwmWrite

        pub = _get_pwm_write_publisher(hardware)
        msg = PwmWrite()
        msg.address = address
        msg.channel = channel
        msg.value = value
        pub.publish(msg)
        hardware.node.get_logger().info(
            f"PWM write: addr=0x{address:02X} ch={channel} value={value}"
        )

    return (True, f"PWM ch{channel} set to {value} (addr=0x{address:02X})")
