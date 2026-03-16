# gpio_node — Raspberry Pi GPIO Node (C++, libgpiod)

ROS2 node for digital I/O on Raspberry Pi via libgpiod v2 C API. Subscribes to write commands and publishes input pin states.

**Platform:** linux-aarch64 only (Raspberry Pi)

## ROS2 Interface

| Direction | Topic | Message | Description |
|---|---|---|---|
| Subscribe | `/gpio/write` | `GpioWrite` | Set output pin HIGH/LOW |
| Publish | `/gpio/state` | `GpioRead` | Polled input pin states |

```
# GpioWrite.msg (executor → gpio_node)
uint8 pin
bool state

# GpioRead.msg (gpio_node → executor)
uint8 pin
bool state
```

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `output_pins` | int[] | `[17, 27, 22]` | GPIO pins configured as output |
| `input_pins` | int[] | `[5, 6, 13]` | GPIO pins configured as input |
| `input_publish_rate` | double | `10.0` | Input polling frequency (Hz) |
| `gpio_chip` | string | `/dev/gpiochip0` | GPIO chip device path |

## File Structure

```
src/gpio_node/
├── CMakeLists.txt              # ament_cmake, pkg_check_modules(libgpiod)
├── package.xml                 # depend: rclcpp, blockly_interfaces
├── include/gpio_node/
│   └── gpio_node.hpp           # GpioNode class + gpiod C API raw pointers
└── src/
    ├── gpio_node.cpp            # setup_gpio, write_callback, read_callback
    └── main.cpp                 # rclcpp::spin(node)
```

## Build & Run

```bash
pixi run build-gpio       # installs system deps (apt) + builds
pixi run gpio-node        # start node with default parameters

# Custom parameters
source install/setup.bash
ros2 run gpio_node gpio_node --ros-args \
  -p output_pins:="[17, 27]" \
  -p input_pins:="[5, 6]" \
  -p gpio_chip:=/dev/gpiochip4
```

`build-gpio` automatically runs `setup-dep` which installs system libraries via apt:
```bash
sudo apt install -y libgpiod-dev gpiod liblttng-ust-dev lttng-tools
```

## Implementation Notes

- Uses **libgpiod v2 C API** (`gpiod.h`), not C++ bindings (`gpiod.hpp`/`libgpiodcxx`) — conda-forge only ships the C library
- All gpiod resources (`gpiod_line_request`, `gpiod_line_config`, etc.) are managed manually via `gpiod_*_free()` in the destructor
- Output and input pins are requested as **single batch** line requests for efficiency
- Writes to pins not listed in `output_pins` are ignored with a warning
- Input pins are polled via a `create_wall_timer` at the configured rate — each poll publishes one `GpioRead` message per input pin
