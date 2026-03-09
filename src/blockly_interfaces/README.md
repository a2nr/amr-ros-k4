# blockly_interfaces — ROS2 Action Interface

Provides the single custom ROS2 action definition used for all Blockly commands.

## BlocklyAction.action

Defined in [`action/BlocklyAction.action`](action/BlocklyAction.action):

```
# GOAL — one instruction to execute
string command         # e.g. "led_on", "delay", "move_forward"
string[] param_keys    # e.g. ["pin"]
string[] param_values  # e.g. ["3"]
---
# RESULT — sent after action completes or fails
bool success
string message         # success message or informative error description
---
# FEEDBACK — sent during execution
string status          # "executing" | "done" | "error"
```

This interface is **generic by design** — adding new commands never requires modifying the `.action` file. The `command` + `param_keys`/`param_values` pattern supports any instruction with any parameters.

## Building

```bash
pixi run build-interfaces
```

This must be run before building any other package. The generated Python module is then importable as:

```python
from blockly_interfaces.action import BlocklyAction
```

## Usage

See [`src/blockly_executor/README.md`](../blockly_executor/README.md) for how the executor uses this interface, and [`src/blockly_app/BLOCKS.md`](../blockly_app/BLOCKS.md#79-data-flow-js-block--python-handler--hardware) for the full data flow from JS block to hardware.
