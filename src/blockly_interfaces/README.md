# blockly_interfaces — ROS2 Interfaces

Provides custom ROS2 action and message definitions for the Blockly Robot Controller.

## BlocklyAction.action

Defined in [`action/BlocklyAction.action`](action/BlocklyAction.action):

```
# GOAL — one instruction to execute
string command         # e.g. "digital_out", "delay", "digital_in"
string[] param_keys    # e.g. ["gpio", "state"]
string[] param_values  # e.g. ["17", "true"]
---
# RESULT — sent after action completes or fails
bool success
string message         # success message or informative error description
---
# FEEDBACK — sent during execution
string status          # "executing" | "done" | "error"
```

This interface is **generic by design** — adding new commands never requires modifying the `.action` file. The `command` + `param_keys`/`param_values` pattern supports any instruction with any parameters.

## GpioWrite.msg & GpioRead.msg

Defined in [`msg/GpioWrite.msg`](msg/GpioWrite.msg) and [`msg/GpioRead.msg`](msg/GpioRead.msg):

```
# GpioWrite — digital output command (executor → gpio_node)
uint8 pin
bool state

# GpioRead — digital input state (gpio_node → executor)
uint8 pin
bool state
```

Used for communication between the executor's GPIO handlers and the `gpio_node` running on Raspberry Pi.

## PwmWrite.msg

Defined in [`msg/PwmWrite.msg`](msg/PwmWrite.msg):

```
# PwmWrite — PWM duty cycle command (executor → pca9685_node)
uint8 address       # I2C device address (e.g. 0x40)
uint8 channel       # PWM channel (0-15)
uint16 value        # Duty cycle (0-4095, 12-bit)
```

Used for communication between the executor's PWM handler and the `pca9685_node` running on Raspberry Pi.

## EncoderRead.msg

Defined in [`msg/EncoderRead.msg`](msg/EncoderRead.msg):

```
# EncoderRead — rotary encoder angle (as5600_node → executor)
uint8 encoder_id       # Encoder index (0, 1, 2, ...)
float32 angle          # Angle in degrees (0.0-360.0)
uint16 raw_angle       # Raw 12-bit value (0-4095)
```

Used for communication between the `as5600_node` running on Raspberry Pi and the executor's encoder handler.

## Building

```bash
pixi run build-interfaces
```

This must be run before building any other package. The generated Python modules are then importable as:

```python
from blockly_interfaces.action import BlocklyAction
from blockly_interfaces.msg import GpioWrite, GpioRead, PwmWrite, EncoderRead
```

## Usage

See [`src/blockly_executor/README.md`](../blockly_executor/README.md) for how the executor uses this interface, and [`src/blockly_app/BLOCKS.md`](../blockly_app/BLOCKS.md#79-data-flow-js-block--python-handler--hardware) for the full data flow from JS block to hardware.
