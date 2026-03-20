# Quickstart — Adding a New Block

## Overview: Auto-Discovery on Both Sides

Both JS and Python use the same pattern: **decorator/register + auto-discovery**. Adding a new block:

```
Step     File                                                       Action
────     ────                                                       ──────
1. JS    src/blockly_app/blockly_app/ui/blockly/blocks/<name>.js    Create — BlockRegistry.register({...})
         src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js  Edit — add filename to BLOCK_FILES array
2. Py    src/blockly_executor/blockly_executor/handlers/<name>.py   Create — @handler("command") function
```

**Files that do NOT need changes:** [`index.html`](../blockly_app/ui/index.html), [`conftest.py`](../../blockly_executor/test/conftest.py), [`executor_node.py`](../../blockly_executor/blockly_executor/executor_node.py), [`BlocklyAction.action`](../../blockly_interfaces/action/BlocklyAction.action), [`handlers/__init__.py`](../../blockly_executor/blockly_executor/handlers/__init__.py). Both toolbox and handler registry are auto-generated.

---

## Step 1 — Create Block File (JS)

Create `src/blockly_app/blockly_app/ui/blockly/blocks/move_forward.js`:

```javascript
BlockRegistry.register({
  name: 'move_forward',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#7B1FA2',
  tooltip: 'Move robot forward with given speed and duration',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Move forward speed')
        .appendField(new Blockly.FieldNumber(50, 0, 100, 1), 'SPEED')
        .appendField('for')
        .appendField(new Blockly.FieldNumber(1000, 0), 'DURATION_MS')
        .appendField('ms');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#7B1FA2');
      this.setTooltip('Move robot forward with given speed and duration');
    }
  },

  generator: function (block) {
    const speed = block.getFieldValue('SPEED');
    const durationMs = block.getFieldValue('DURATION_MS');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('move_forward', { speed: '" + speed + "', duration_ms: '" + durationMs + "' });\n"
    );
  }
});
```

Then add to [`manifest.js`](../blockly_app/ui/blockly/blocks/manifest.js):

```javascript
const BLOCK_FILES = [
  'digitalOut.js',
  'digitalIn.js',
  'delay.js',
  'move_forward.js',    // ← add here
];
```

**No `index.html` changes needed.** No toolbox XML editing. The block appears automatically in the "Robot" category.

---

## Step 2 — Register Handler in Python

Create a new file in `handlers/` or add to an existing one. Use the `@handler` decorator — auto-discovery handles the rest.

Each handler contains **both dummy and real hardware logic**. Use `hardware.is_real()` to branch, and `hardware.log()` to record actions for testing.

```python
# src/blockly_executor/blockly_executor/handlers/movement.py
from . import handler
from .hardware import Hardware

@handler("move_forward")
def handle_move_forward(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    speed = int(params["speed"])
    duration_ms = int(params["duration_ms"])
    if not (0 <= speed <= 100):
        raise ValueError(f"speed must be 0-100, got: {speed}")
    hardware.log(f"move_forward(speed={speed}, duration_ms={duration_ms})")

    if hardware.is_real():
        # Real hardware — lazy import, publish to ROS2 topic
        # TODO: hardware.node.create_publisher(...) etc.
        hardware.node.get_logger().info(f"Moving forward at {speed} for {duration_ms}ms")

    return (True, f"Moved forward at speed {speed} for {duration_ms}ms")
```

No imports to update, no registry list to edit. The file is auto-discovered on startup.

**Verify immediately** (no Blockly UI needed):

```bash
# Terminal 1
pixi run executor

# Terminal 2 — send goal manually
pixi run bash -c 'source install/setup.bash && ros2 action send_goal /execute_blockly_action blockly_interfaces/action/BlocklyAction "{command: move_forward, param_keys: [speed, duration_ms], param_values: [50, 1000]}"'
```

---

## Step 3 — Write Integration Test (Optional)

Create `src/blockly_executor/test/test_block_move_forward.py`:

```python
"""Integration test for Blockly instruction: move_forward"""


def test_block_move_forward_returns_success(exe_action):
    result = exe_action("move_forward", speed="50", duration_ms="200")
    assert result.result.success is True


def test_block_move_forward_sends_executing_feedback(exe_action):
    result = exe_action("move_forward", speed="50", duration_ms="200")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_move_forward_missing_speed_returns_failure(exe_action):
    result = exe_action("move_forward", duration_ms="200")
    assert result.result.success is False
    assert "speed" in result.result.message.lower()
```

---

## Name Consistency Reference Table

```
handlers.py                blocks/<name>.js             blocks/<name>.js
───────────                ────────────────             ─────────────────
"move_forward"         ==  name: 'move_forward'     ==  'move_forward' in executeAction
params["speed"]        ==  'SPEED' in FieldNumber   ==  getFieldValue('SPEED')
params["duration_ms"]  ==  'DURATION_MS'            ==  getFieldValue('DURATION_MS')
```

---

## Data Flow: JS Block → Python Handler → Hardware

```
User drags block into workspace
        │
        ▼
[Run button pressed]
        │
        ▼
Blockly generates JS code from block.generator()
  ─ Statement:  string code ending with \n
  ─ Output:     [expression_string, Order]
        │
        ▼
debug-engine.js executes the generated JS
        │
        ▼
await executeAction('my_command', { key: 'value', … })
  → bridge.js calls window.pywebview.api.execute_action(command, keys, values)
        │
        ▼
BlocklyAPI.execute_action() in app.py
  → ROS2 Action Client sends Goal { command, param_keys, param_values }
        │
        ▼
ExecutorNode receives goal, calls HandlerRegistry.execute(command, params)
        │
        ▼
@handler("my_command") function(params, hardware)
  → hardware.log(...)             ← always logged for testing
  → if hardware.is_real(): ...    ← real hardware (ROS2 publish/GPIO)
        │
        ▼
Returns (True, "LED on pin 3 turned ON")
  → goal_handle.succeed()  →  result.success=True, result.message=...
        │
        ▼
await executeAction() resolves → JS continues to next block
```

---

## Step-by-Step Checklist — Adding a New Block

**Path A — ROS2 Action Block** (robot commands, sensor reads):

```
1. Create  src/blockly_app/…/ui/blockly/blocks/<name>.js
           └─ Call BlockRegistry.register({ name, category, color, definition, generator })
           └─ generator calls await executeAction('name', { key: 'value' })
           └─ name must exactly match the Python @handler string

2. Edit    src/blockly_app/…/ui/blockly/blocks/manifest.js
           └─ Add '<name>.js' to the BLOCK_FILES array

3. Create  src/blockly_executor/…/handlers/<name>.py  (or add to existing file)
           └─ from . import handler
           └─ from .hardware import Hardware
           └─ @handler("name")
           └─ def handle_name(params, hardware: Hardware): ...  →  return (bool, str)
           └─ hardware.log(...) for testing + hardware.is_real() for real logic

4. Test    pixi run executor   (Terminal 1)
           pixi run app        (Terminal 2) — drag block, click Run
           pixi run test -- src/blockly_executor/test/test_block_<name>.py -v
```

**Path B — Client-side Block** (print, HMI, pure JS):

```
1. Create  src/blockly_app/…/ui/blockly/blocks/<name>.js
           └─ Call BlockRegistry.register({ name, category, color, definition, generator })
           └─ generator calls JS function directly (consoleLog(), HMI.set*(), etc.)
           └─ NO executeAction(), NO Python handler needed

2. Edit    src/blockly_app/…/ui/blockly/blocks/manifest.js
           └─ Add '<name>.js' to the BLOCK_FILES array

3. Test    pixi run app — drag block, click Run (no executor needed for client-side blocks)
```

No changes needed to `index.html`, `executor_node.py`, `handlers/__init__.py`, or `BlocklyAction.action`.

---
