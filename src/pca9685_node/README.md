# pca9685_node — PCA9685 16-Channel PWM Controller (C++, I2C)

ROS2 node for controlling PCA9685 PWM channels via Linux I2C (`ioctl`). Subscribes to write commands — no external library needed, uses kernel headers only.

**Platform:** linux-aarch64 only (Raspberry Pi)

## ROS2 Interface

| Direction | Topic | Message | Description |
|---|---|---|---|
| Subscribe | `/pwm/write` | `PwmWrite` | Set PWM duty cycle on a channel |

```
# PwmWrite.msg (executor → pca9685_node)
uint8 address       # I2C device address (e.g. 0x40)
uint8 channel       # PWM channel (0-15)
uint16 value        # Duty cycle (0-4095, 12-bit)
```

PCA9685 is write-only — no read/feedback message needed.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `i2c_device` | string | `/dev/i2c-1` | Linux I2C device path |
| `frequency` | int | `50` | PWM frequency Hz (all channels) |

## File Structure

```
src/pca9685_node/
├── CMakeLists.txt              # ament_cmake — NO external lib dependency
├── package.xml                 # depend: rclcpp, blockly_interfaces
├── include/pca9685_node/
│   └── pca9685_node.hpp        # Pca9685Node class + I2C helpers + register constants
└── src/
    ├── pca9685_node.cpp         # I2C init, configure_frequency, write_callback, set_pwm
    └── main.cpp                 # rclcpp::spin(node)
```

## Build & Run

```bash
pixi run build-pca9685    # installs system deps (apt) + builds
pixi run pca9685-node     # start node with default parameters

# Custom parameters
source install/setup.bash
ros2 run pca9685_node pca9685_node --ros-args \
  -p i2c_device:=/dev/i2c-0 \
  -p frequency:=1000
```

## PCA9685 Register Map

| Register | Address | Description |
|---|---|---|
| MODE1 | `0x00` | Sleep/restart, auto-increment |
| LED0_ON_L | `0x06` | Channel 0 ON timing (4 registers per channel) |
| PRE_SCALE | `0xFE` | PWM frequency: `prescale = round(25MHz / (4096 * freq)) - 1` |

## Implementation Notes

- Uses Linux I2C via `ioctl()` + `linux/i2c-dev.h` — no external library dependency
- **Multi-address support**: I2C slave address is sent per-message (`ioctl(I2C_SLAVE)` on every write), so one node can control multiple PCA9685 boards (0x40-0x7F, configurable via solder bridges)
- Frequency is configured once at startup on default address 0x40 (sleep → set prescale → wake + auto-increment → restart)
- Channel validation: values > 15 are rejected, values > 4095 are clamped
- PWM duty cycle: ON=0, OFF=value (simple duty cycle mode, 4 bytes per channel with auto-increment)

## I2C Debugging

```bash
# Check available I2C buses
ls /dev/i2c-*

# Scan devices on bus 1 (needs i2c-tools)
i2cdetect -y 1
```
