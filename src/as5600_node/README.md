# as5600_node — AS5600 12-bit Magnetic Rotary Encoder (C++, I2C)

ROS2 node for reading AS5600 magnetic rotary position sensors via Linux I2C (`ioctl`). Publishes angle data periodically. Supports multiple encoders on separate I2C buses.

**Platform:** linux-aarch64 only (Raspberry Pi)

## ROS2 Interface

| Direction | Topic | Message | Description |
|---|---|---|---|
| Publish | `/encoder/state` | `EncoderRead` | Periodic angle readings per encoder |

```
# EncoderRead.msg (as5600_node → executor)
uint8 encoder_id       # Encoder index (0, 1, 2, ...)
float32 angle          # Angle in degrees (0.0-360.0)
uint16 raw_angle       # Raw 12-bit value (0-4095)
```

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `i2c_devices` | string[] | `["/dev/i2c-1"]` | List of I2C device paths, one per encoder |
| `publish_rate` | double | `10.0` | Publish frequency Hz |

## File Structure

```
src/as5600_node/
├── CMakeLists.txt              # ament_cmake — NO external lib dependency
├── package.xml                 # depend: rclcpp, blockly_interfaces
├── include/as5600_node/
│   └── as5600_node.hpp         # As5600Node class + I2C helpers + register constants
└── src/
    ├── as5600_node.cpp          # I2C init, timer_callback, read_raw_angle
    └── main.cpp                 # rclcpp::spin(node)
```

## Build & Run

```bash
pixi run build-as5600     # installs system deps (apt) + builds
pixi run as5600-node      # start node with default parameters (1 encoder)

# 3 encoders on separate buses, 20 Hz
source install/setup.bash
ros2 run as5600_node as5600_node --ros-args \
  -p i2c_devices:="['/dev/i2c-1', '/dev/i2c-3', '/dev/i2c-4']" \
  -p publish_rate:=20.0
```

## AS5600 Register Map

| Register | Address | Description |
|---|---|---|
| RAW_ANGLE | `0x0C`-`0x0D` | 12-bit raw angle (0-4095) |
| STATUS | `0x0B` | Magnet detect status |
| AGC | `0x1A` | Automatic gain control |

## Implementation Notes

- AS5600 has a **fixed I2C address (0x36)** — cannot be changed. For multiple encoders, each must be on a **separate I2C bus**
- Uses Linux I2C via `ioctl()` + `linux/i2c-dev.h` — no external library dependency
- `I2C_SLAVE` address is set once per fd at startup (each fd is dedicated to one bus/encoder)
- Raw angle read: write register `0x0C`, read 2 bytes → `((buf[0] & 0x0F) << 8) | buf[1]` (12-bit)
- Angle conversion: `raw * 360.0 / 4096.0` degrees
- Timer callback iterates all fds and publishes one `EncoderRead` per encoder with `encoder_id` matching the index in `i2c_devices`

## Raspberry Pi I2C Setup

The Pi has one hardware I2C bus (`/dev/i2c-1`) by default. For multiple AS5600 encoders, enable extra I2C buses via GPIO bit-banging overlays in `/boot/config.txt`:

```
# Extra I2C buses using GPIO pins
dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=17,i2c_gpio_scl=27
dtoverlay=i2c-gpio,bus=4,i2c_gpio_sda=22,i2c_gpio_scl=23
```

After reboot, verify with `ls /dev/i2c-*` and `i2cdetect -y <bus>`.
