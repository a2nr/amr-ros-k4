# Creating Custom Blocks in Blockly

## 7. Creating Custom Blocks in Blockly

### 7.1 Overview: Auto-Discovery on Both Sides

Both JS and Python use the same pattern: **decorator/register + auto-discovery**. Adding a new block:

```
Step     File                                                       Action
────     ────                                                       ──────
1. JS    src/blockly_app/blockly_app/ui/blockly/blocks/<name>.js    Create — BlockRegistry.register({...})
         src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js  Edit — add filename to BLOCK_FILES array
2. Py    src/blockly_executor/blockly_executor/handlers/<name>.py   Create — @handler("command") function
```

**Files that do NOT need changes:** [`index.html`](blockly_app/ui/index.html), [`conftest.py`](../blockly_executor/test/conftest.py), [`executor_node.py`](../blockly_executor/blockly_executor/executor_node.py), [`BlocklyAction.action`](../blockly_interfaces/action/BlocklyAction.action), [`handlers/__init__.py`](../blockly_executor/blockly_executor/handlers/__init__.py). Both toolbox and handler registry are auto-generated.

### 7.2 Step 1 — Create Block File (JS)

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

Then add to [`manifest.js`](blockly_app/ui/blockly/blocks/manifest.js):

```javascript
const BLOCK_FILES = [
  'led_on.js',
  'led_off.js',
  'delay.js',
  'move_forward.js',    // ← add here
];
```

**No `index.html` changes needed.** No toolbox XML editing. The block appears automatically in the "Robot" category.

### 7.3 Step 2 — Register Handler in Python

Create a new file in `handlers/` or add to an existing one. Use the `@handler` decorator — auto-discovery handles the rest.

Each handler contains **both dummy and real hardware logic**. Use `hardware.is_real()` to branch, and `hardware.log()` to record actions for testing.

```python
# src/blockly_executor/blockly_executor/handlers/movement.py
from . import handler
from ..hardware import Hardware

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

### 7.4 Step 3 — Write Integration Test (Optional)

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

### 7.5 Name Consistency Reference Table

```
handlers.py                blocks/<name>.js             blocks/<name>.js
───────────                ────────────────             ─────────────────
"move_forward"         ==  name: 'move_forward'     ==  'move_forward' in executeAction
params["speed"]        ==  'SPEED' in FieldNumber   ==  getFieldValue('SPEED')
params["duration_ms"]  ==  'DURATION_MS'            ==  getFieldValue('DURATION_MS')
```


### 7.6 Block Type Overview

There are three fundamental block shapes. Choose based on what the block **does**:

| Type | Shape | Returns | Use case | Examples |
|------|-------|---------|----------|---------|
| **Statement** | Top + bottom notches | Nothing (side effect) | Execute an action on the robot | `led_on`, `led_off`, `delay` |
| **Output** | Left plug, no notches | A value | Read a sensor, compute something | `read_distance`, `read_temperature` |
| **Container** | Statement input socket | Nothing | Wrap a block stack (loop body, condition body) | Custom `repeat_until_clear` |

> Output blocks can be plugged into `appendValueInput()` sockets of other blocks (e.g., plug `read_distance` into `move_to(X=..., Y=...)`)

---

### 7.7 `BlockRegistry.register()` — All Fields

```js
BlockRegistry.register({
  // ── Required ────────────────────────────────────────────────────────────
  name:          'my_command',   // Unique block ID. Must match Python @handler("my_command")
  category:      'Robot',        // Toolbox category label. New names auto-create a category.
  color:         '#4CAF50',      // Block body hex color
  definition:    { init: function() { … } },  // Blockly visual definition
  generator:     function(block) { … },        // JS code generator

  // ── Optional ────────────────────────────────────────────────────────────
  categoryColor: '#5b80a5',      // Category sidebar color (default: '#5b80a5')
  tooltip:       'Description',  // Hover text (also set inside init via setTooltip)
  outputType:    'Number',       // Set ONLY for output blocks ('Number', 'String', 'Boolean')
                                 // When present, generator must return [code, Order] array
});
```

**`name` is the contract** — it must exactly match the `@handler("name")` string in Python. A mismatch causes `Unknown command: 'name'` at runtime.

---

### 7.8 `definition.init` — Complete Reference

The `definition` field takes a plain object with one required key: `init`. This function runs once when Blockly creates the block. Inside `init`, `this` refers to the block instance.

**Call order inside `init`:**
1. `appendXxxInput()` rows — build the visual layout top-to-bottom
2. Connection methods — define how the block connects to others
3. Style methods — set color and tooltip

---

#### Input Rows — Visual Layout

Every input row is a horizontal strip. Rows stack top-to-bottom. Fields chain left-to-right within a row.

```
appendDummyInput()                  appendValueInput('X')              appendStatementInput('DO')
┌───────────────────────────┐      ┌─────────────────────┬──┐        ┌──────────────────────────┐
│  [label]  [field]  [label]│      │  [label]  [field]   │◄─┤socket  │  do                      │
└───────────────────────────┘      └─────────────────────┴──┘        │  ┌────────────────────┐  │
  no sockets, no plug                right side has an input socket   │  │ (block stack here) │  │
                                     that accepts output block plugs  │  └────────────────────┘  │
                                                                      └──────────────────────────┘
```

---

#### `appendDummyInput()` — Label / field row (no sockets)

Use when the block only needs static inline fields. No output block can connect here.

```js
init: function () {
  this.appendDummyInput()         // creates one horizontal row
    .appendField('Speed')         // text label (no key needed)
    .appendField(
      new Blockly.FieldNumber(50, 0, 100, 1), 'SPEED'
    )                             // interactive field — key 'SPEED'
    .appendField('%');            // another text label after the field

  // Visual: ┌─ Speed [50] % ─┐
}
```

Multiple `appendDummyInput()` calls stack as separate rows:

```js
init: function () {
  this.appendDummyInput().appendField('Motor Config');  // header label row
  this.appendDummyInput()
    .appendField('Left ')
    .appendField(new Blockly.FieldNumber(50, -100, 100, 1), 'LEFT');
  this.appendDummyInput()
    .appendField('Right')
    .appendField(new Blockly.FieldNumber(50, -100, 100, 1), 'RIGHT');

  // Visual:
  // ┌──────────────────────────┐
  // │  Motor Config            │
  // │  Left  [-100..100]       │
  // │  Right [-100..100]       │
  // └──────────────────────────┘
}
```

---

#### `appendValueInput('KEY')` — Socket row (accepts output blocks)

Use when you want the user to plug in a sensor or value block. The socket appears on the **right side** of the row. The label (if any) appears on the left.

```js
init: function () {
  this.appendValueInput('SPEED')   // 'SPEED' is the key used in valueToCode()
    .setCheck('Number')            // only accept Number-type output blocks
                                   // use setCheck(null) or omit to accept any type
    .appendField('Drive at');      // label to the left of the socket

  // Visual: ┌─ Drive at ◄──(output block plugs here) ─┐
}
```

Multiple `appendValueInput` rows, collapsed inline with `setInputsInline(true)`:

```js
init: function () {
  this.appendValueInput('X').setCheck('Number').appendField('X');
  this.appendValueInput('Y').setCheck('Number').appendField('Y');
  this.setInputsInline(true);   // ← collapses rows side-by-side

  // setInputsInline(false) (default): rows stacked vertically
  // setInputsInline(true):  rows placed side-by-side on one line

  // Visual (inline): ┌─ X ◄─ Y ◄─ ─┐
}
```

Reading the plugged-in block value in the generator:
```js
generator: function (block) {
  // valueToCode returns the generated expression for the plugged-in block
  // Falls back to the default ('0', '', etc.) if the socket is empty
  const x = javascript.javascriptGenerator.valueToCode(
    block, 'X', javascript.Order.ATOMIC   // Order.ATOMIC: value is a safe atom (no parens needed)
  ) || '0';                               // || '0': fallback if socket is empty
}
```

---

#### `appendStatementInput('KEY')` — Indented block stack slot

Use for container blocks (loops, conditionals) where the user places a stack of blocks inside.

```js
init: function () {
  this.appendDummyInput()
    .appendField('While obstacle');

  this.appendStatementInput('BODY')    // 'BODY' is the key for statementToCode()
    .appendField('do');                // optional label next to the slot opening

  // Visual:
  // ┌────────────────────────────────┐
  // │  While obstacle                │
  // │  do                            │
  // │    ┌──────────────────────┐    │
  // │    │ (blocks stack here)  │    │
  // │    └──────────────────────┘    │
  // └────────────────────────────────┘
}
```

Reading the inner stack in the generator:
```js
generator: function (block) {
  const inner = javascript.javascriptGenerator.statementToCode(block, 'BODY');
  // statementToCode returns the generated code for ALL blocks stacked inside 'BODY'
  // Returns '' if the slot is empty
  return "while (true) {\n" + inner + "}\n";
}
```

---

#### Connection / Shape Methods

These define the block's shape. Call them **after** all `appendXxx` rows.

```js
// ── Statement block (stackable in a sequence) ─────────────────────────────
this.setPreviousStatement(true, null);
//                         ↑     ↑── type filter: null = accept any block above
//                         └── true = show top notch
this.setNextStatement(true, null);
//   same params — shows bottom notch so another block can connect below

// ── Output block (value-returning, plugs into sockets) ────────────────────
this.setOutput(true, 'Number');
//                    ↑── output type: 'Number' | 'String' | 'Boolean' | null (any)
// ⚠ setOutput is MUTUALLY EXCLUSIVE with setPreviousStatement / setNextStatement

// ── Standalone (no connections — rare) ───────────────────────────────────
// Omit all three. Block floats freely, cannot connect to anything.
```

Type filter (second argument) restricts which blocks can connect:

```js
this.setPreviousStatement(true, 'RobotAction'); // only connects below RobotAction blocks
this.setNextStatement(true, 'RobotAction');
// Matching blocks must also declare:
//   this.setOutput(true, 'RobotAction')   ← on the output side
// Rarely needed in this project — use null for unrestricted.
```

---

#### Style Methods

```js
this.setColour('#4CAF50');          // block body color — hex string OR hue int (0–360)
this.setTooltip('Hover text');      // shown when user hovers over the block
this.setHelpUrl('https://...');     // optional: opens URL when user clicks '?' on block
```

> Always use **hex strings** (e.g. `'#4CAF50'`) to match the project's color scheme. The `color` field in `BlockRegistry.register()` and `setColour()` inside `init` should use the same value.

---

#### Layout Control — `setInputsInline`

```js
this.setInputsInline(true);    // compact: all appendValueInput rows on ONE line
this.setInputsInline(false);   // (default) each appendValueInput row on its OWN line
```

`setInputsInline` only affects `appendValueInput` rows — `appendDummyInput` rows are always inline.

---

#### Complete Multi-Row Example

A block combining all input types:

```js
definition: {
  init: function () {
    // ── Row 1: DummyInput — header label + FieldNumber ──────────────────
    this.appendDummyInput()
      .appendField('Drive until <')
      .appendField(new Blockly.FieldNumber(20, 1, 500, 1), 'THRESHOLD')
      .appendField('cm');

    // ── Row 2+3: ValueInput — two sockets, collapsed inline ─────────────
    this.appendValueInput('SPEED_L')
      .setCheck('Number')
      .appendField('L');
    this.appendValueInput('SPEED_R')
      .setCheck('Number')
      .appendField('R');
    this.setInputsInline(true);    // collapse rows 2+3 side-by-side

    // ── Row 4: StatementInput — block stack slot ─────────────────────────
    this.appendStatementInput('ON_ARRIVAL')
      .appendField('then');

    // ── Connection shape ─────────────────────────────────────────────────
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);

    // ── Style ────────────────────────────────────────────────────────────
    this.setColour('#FF5722');
    this.setTooltip('Drive at given speeds until obstacle is closer than threshold');
  },
},

generator: function (block) {
  const threshold = block.getFieldValue('THRESHOLD');
  const speedL = javascript.javascriptGenerator.valueToCode(block, 'SPEED_L', javascript.Order.ATOMIC) || '50';
  const speedR = javascript.javascriptGenerator.valueToCode(block, 'SPEED_R', javascript.Order.ATOMIC) || '50';
  const body   = javascript.javascriptGenerator.statementToCode(block, 'ON_ARRIVAL');
  return (
    "highlightBlock('" + block.id + "');\n" +
    "await executeAction('drive_until', {" +
      " threshold: '" + threshold + "'," +
      " speed_l: String(" + speedL + ")," +
      " speed_r: String(" + speedR + ")" +
    " });\n" +
    body
  );
},
```

Visual result:
```
┌──────────────────────────────────────────────────┐
│  Drive until < [20] cm                           │
│  L ◄─(speed)  R ◄─(speed)                       │
│  then                                            │
│    ┌────────────────────────────────────────┐    │
│    │ (on-arrival blocks stack here)         │    │
│    └────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

### 7.9 Data Flow: JS Block → Python Handler → Hardware

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
debug-engine.js eval()s the generated JS
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

### 7.10 Real Block Examples from This Project

#### `led_on` — Statement block with FieldNumber

**JS** ([blocks/led_on.js](blockly_app/ui/blockly/blocks/led_on.js)):
```js
BlockRegistry.register({
  name: 'led_on',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#4CAF50',
  tooltip: 'Turn on LED at the specified GPIO pin',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('LED ON  pin')
        .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
      //                              ↑       ↑  ↑   ↑
      //                           default  min max step
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#4CAF50');
      this.setTooltip('Turn on LED at the specified GPIO pin');
    },
  },

  generator: function (block) {
    const pin = block.getFieldValue('PIN');    // reads the PIN field value
    return (
      "highlightBlock('" + block.id + "');\n" +           // visual debugger highlight
      "await executeAction('led_on', { pin: '" + pin + "' });\n"
    //                        ↑ command name (must match @handler)
    //                                          ↑ param key  ↑ param value (always string)
    );
  },
});
```

**Python** ([handlers/gpio.py](../blockly_executor/blockly_executor/handlers/gpio.py)):
```python
from . import handler
from ..hardware import Hardware

@handler("led_on")                                      # ← must match JS name
def handle_led_on(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    pin = int(params["pin"])                            # params values are always strings — cast as needed
    hardware.log(f"set_led(pin={pin}, state=True)")     # always log for testing

    if hardware.is_real():
        # TODO: publish to ROS2 topic for Pi hardware
        hardware.node.get_logger().info(f"LED on pin {pin} ON")

    return (True, f"LED on pin {pin} turned ON")        # (success: bool, message: str)
```

---

#### `led_off` — Statement block (same pattern, different color)

**JS** ([blocks/led_off.js](blockly_app/ui/blockly/blocks/led_off.js)):
```js
BlockRegistry.register({
  name: 'led_off',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#FF9800',           // orange — visually distinct from led_on
  tooltip: 'Turn off LED at the specified GPIO pin',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('LED OFF  pin')
        .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF9800');
      this.setTooltip('Turn off LED at the specified GPIO pin');
    },
  },

  generator: function (block) {
    const pin = block.getFieldValue('PIN');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('led_off', { pin: '" + pin + "' });\n"
    );
  },
});
```

**Python** ([handlers/gpio.py](../blockly_executor/blockly_executor/handlers/gpio.py)):
```python
@handler("led_off")
def handle_led_off(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.log(f"set_led(pin={pin}, state=False)")

    if hardware.is_real():
        hardware.node.get_logger().info(f"LED on pin {pin} OFF")

    return (True, f"LED on pin {pin} turned OFF")
```

> Multiple handlers can live in the same `.py` file — they are auto-discovered by `pkgutil.iter_modules`.

---

#### `delay` — Statement block with multiple field decorators

**JS** ([blocks/delay.js](blockly_app/ui/blockly/blocks/delay.js)):
```js
BlockRegistry.register({
  name: 'delay',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#2196F3',
  tooltip: 'Wait for the specified duration in milliseconds',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Delay')
        .appendField(new Blockly.FieldNumber(500, 0, 60000, 100), 'DURATION_MS')
        .appendField('ms');     // ← plain text label appended after the field
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Wait for the specified duration in milliseconds');
    },
  },

  generator: function (block) {
    const ms = block.getFieldValue('DURATION_MS');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('delay', { duration_ms: '" + ms + "' });\n"
    );
  },
});
```

**Python** ([handlers/timing.py](../blockly_executor/blockly_executor/handlers/timing.py)):
```python
import time
from . import handler
from ..hardware import Hardware

@handler("delay")
def handle_delay(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    duration_ms = int(params["duration_ms"])
    time.sleep(duration_ms / 1000.0)
    return (True, f"Delayed {duration_ms}ms")
```

---

### 7.11 Template A — Statement Block (action command)

Copy-paste starting point for any new action block:

```js
// src/blockly_app/blockly_app/ui/blockly/blocks/MY_BLOCK.js

BlockRegistry.register({
  name: 'MY_COMMAND',           // ← change this (must match @handler)
  category: 'Robot',            // ← choose or create a category
  categoryColor: '#5b80a5',
  color: '#9C27B0',             // ← pick a hex color
  tooltip: 'Short description of what this block does',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Label text')
        .appendField(new Blockly.FieldNumber(0, 0, 100, 1), 'PARAM1');
        // add more .appendField(...) calls for more parameters

      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9C27B0');
      this.setTooltip('Short description of what this block does');
    },
  },

  generator: function (block) {
    const param1 = block.getFieldValue('PARAM1');
    // Statement generators return a string (not an array)
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('MY_COMMAND', { param1: '" + param1 + "' });\n"
    );
  },
});
```

Corresponding Python handler:
```python
# src/blockly_executor/blockly_executor/handlers/MY_FILE.py
from . import handler
from ..hardware import Hardware

@handler("MY_COMMAND")
def handle_my_command(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    param1 = params["param1"]          # always str — cast as needed (int, float, etc.)
    hardware.log(f"my_command(param1={param1})")

    if hardware.is_real():
        # Real hardware logic — ROS2 publish, GPIO, etc.
        # Use lazy imports here for dependencies not available in dev
        hardware.node.get_logger().info(f"my_command: {param1}")

    return (True, f"Done: {param1}")
```

After creating both files, add the JS filename to [manifest.js](blockly_app/ui/blockly/blocks/manifest.js):
```js
const BLOCK_FILES = [
  'led_on.js',
  'led_off.js',
  'delay.js',
  'MY_BLOCK.js',    // ← add here
];
```

---

### 7.12 Template B — Output Block (sensor / computed value)

Output blocks expose a **left plug** and plug into input sockets of other blocks. They have **no** top/bottom notches and cannot stand alone in a stack.

```js
// src/blockly_app/blockly_app/ui/blockly/blocks/read_distance.js

BlockRegistry.register({
  name: 'read_distance',
  category: 'Sensors',
  categoryColor: '#a5745b',
  color: '#E91E63',
  tooltip: 'Read distance from ultrasonic sensor in cm',
  outputType: 'Number',         // ← required for output blocks; determines socket type-check

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Distance')
        .appendField(new Blockly.FieldDropdown([
          ['Front', 'front'],
          ['Left',  'left'],
          ['Right', 'right'],
        ]), 'SENSOR_ID');

      this.setOutput(true, 'Number');   // ← left plug; NO setPreviousStatement / setNextStatement
      this.setColour('#E91E63');
      this.setTooltip('Read distance from ultrasonic sensor in cm');
    },
  },

  // Output block generators MUST return [expression_string, Order] — NOT a plain string
  generator: function (block) {
    const sensorId = block.getFieldValue('SENSOR_ID');
    // executeAction returns { success, message } — use .message to extract the value
    const code = "(await executeAction('read_distance', { sensor_id: '" + sensorId + "' })).message";
    return [code, javascript.Order.AWAIT];
  //        ↑ expression      ↑ operator precedence (Order.AWAIT for async expressions)
  },
});
```

Python handler:
```python
@handler("read_distance")
def handle_read_distance(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    sensor_id = params["sensor_id"]
    hardware.log(f"read_distance(sensor_id={sensor_id})")

    if hardware.is_real():
        # TODO: subscribe to sensor topic, return actual reading
        distance = 0.0  # placeholder
    else:
        distance = 42.0  # dummy test value

    return (True, str(distance))   # message becomes the expression value in JS
```

> The JS expression `.message` retrieves the string from the ROS2 result. If the value needs to be numeric, wrap it: `parseFloat((await executeAction(…)).message)`.

---

### 7.13 Template C — Block with Value Input Sockets (accepts other blocks)

Value input sockets let output blocks plug into a statement block as dynamic parameters.

```js
// src/blockly_app/blockly_app/ui/blockly/blocks/move_to.js

BlockRegistry.register({
  name: 'move_to',
  category: 'Navigation',
  categoryColor: '#5ba55b',
  color: '#00BCD4',
  tooltip: 'Move robot to target X and Y coordinates',

  definition: {
    init: function () {
      // appendValueInput creates a socket where output blocks plug in
      this.appendValueInput('X')
        .setCheck('Number')       // only accept Number-type output blocks
        .appendField('Move to X');
      this.appendValueInput('Y')
        .setCheck('Number')
        .appendField('Y');
      this.setInputsInline(true); // place inputs side-by-side instead of stacked
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Move robot to target X and Y coordinates');
    },
  },

  generator: function (block) {
    // valueToCode generates code for the plugged-in block; falls back to '0' if empty
    const x = javascript.javascriptGenerator.valueToCode(block, 'X', javascript.Order.ATOMIC) || '0';
    const y = javascript.javascriptGenerator.valueToCode(block, 'Y', javascript.Order.ATOMIC) || '0';
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('move_to', { x: String(" + x + "), y: String(" + y + ") });\n"
      //                                      ↑ wrap in String() — params must be strings
    );
  },
});
```

Python handler:
```python
@handler("move_to")
def handle_move_to(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    x = float(params["x"])
    y = float(params["y"])
    hardware.log(f"move_to(x={x}, y={y})")

    if hardware.is_real():
        # TODO: publish to cmd_vel or navigation topic
        hardware.node.get_logger().info(f"Moving to ({x}, {y})")

    return (True, f"Moved to ({x}, {y})")
```

---

### 7.14 Template D — Container Block (statement input socket)

Container blocks hold a **stack of other blocks** inside them, like a loop or conditional. They use `appendStatementInput()`.

```js
BlockRegistry.register({
  name: 'repeat_n_times',
  category: 'Control',
  categoryColor: '#5ba55b',
  color: '#FF5722',
  tooltip: 'Repeat the inner blocks N times',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Repeat')
        .appendField(new Blockly.FieldNumber(3, 1, 100, 1), 'TIMES')
        .appendField('times');
      this.appendStatementInput('DO')   // ← creates an indented slot for block stacks
        .appendField('do');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF5722');
      this.setTooltip('Repeat the inner blocks N times');
    },
  },

  generator: function (block) {
    const times = block.getFieldValue('TIMES');
    // statementToCode generates code for all blocks stacked inside DO
    const inner = javascript.javascriptGenerator.statementToCode(block, 'DO');
    return (
      "highlightBlock('" + block.id + "');\n" +
      "for (let _i = 0; _i < " + times + "; _i++) {\n" +
      inner +
      "}\n"
    );
    // Note: no executeAction needed — this block is pure JS control flow
  },
});
```

> Container blocks that implement pure JS control flow (loops, if/else) do **not** need a Python handler. Only blocks that call `executeAction()` need one.

---

### 7.15 `executeAction()` and `highlightBlock()` Reference

Both functions are provided by [bridge.js](blockly_app/ui/blockly/core/bridge.js) and injected into the eval context by [debug-engine.js](blockly_app/ui/blockly/core/debug-engine.js).

#### `await executeAction(command, params)`

```js
// Sends a ROS2 action goal and waits for the result.
// Returns: { success: bool, message: string }
const result = await executeAction('my_command', {
  key1: 'value1',   // all values must be strings
  key2: String(someNumber),
});

if (!result.success) {
  console.error(result.message);
}
```

- **Always `await`** — omitting `await` means the next block runs immediately before the hardware finishes.
- **All param values must be strings** — the ROS2 action interface uses `string[]` arrays. Use `String(n)` or template literals for numbers.
- Returns after the Python handler calls `goal_handle.succeed()` (which is always called, even for logical failures).

#### `highlightBlock(blockId)`

```js
highlightBlock(block.id);
```

Visually highlights the currently executing block in the workspace. Call it **first** in every statement generator so the user can see which block is running. For output blocks it is optional (they have no visual position in the stack).

---

### 7.16 Quick Reference: Blockly Field Types

| Field | Constructor | Returns | Use Case |
|-------|-------------|---------|----------|
| **Number** | `new Blockly.FieldNumber(default, min, max, step)` | number string | Pin, duration, speed, PWM |
| **Text** | `new Blockly.FieldTextInput('default')` | string | Topic name, label |
| **Dropdown** | `new Blockly.FieldDropdown([['Label','value'], …])` | value string | Direction, sensor ID, mode |
| **Checkbox** | `new Blockly.FieldCheckbox('TRUE')` | `'TRUE'` / `'FALSE'` | On/off toggle, enable flag |
| **Colour** | `new Blockly.FieldColour('#ff0000')` | hex string | LED RGB color |
| **Angle** | `new Blockly.FieldAngle(90)` | angle string | Rotation, steering |
| **Image** | `new Blockly.FieldImage('url', w, h)` | _(no value)_ | Icon decoration on block |

All field values retrieved via `block.getFieldValue('FIELD_NAME')` are **strings**. Cast with `parseInt()`, `parseFloat()`, or `Number()` in JS, or `int()` / `float()` in Python, as needed.

---

### 7.17 Quick Reference: Input and Connection Types

| Method | What it creates | When to use |
|--------|----------------|-------------|
| `setPreviousStatement(true, null)` | Top notch | Block can connect below another block |
| `setNextStatement(true, null)` | Bottom notch | Block can connect above another block |
| `setOutput(true, 'Type')` | Left plug | Block returns a value (output block) — mutually exclusive with previous/next |
| `appendDummyInput()` | Horizontal row | Inline fields only, no sockets |
| `appendValueInput('NAME')` | Input socket (right side) | Accept an output block plug |
| `appendStatementInput('NAME')` | Statement socket (indented slot) | Accept a block stack (loop body, etc.) |
| `setInputsInline(true)` | Collapse multi-input rows into one line | When `appendValueInput` rows should be side-by-side |
| `.setCheck('Type')` | Type constraint on socket | Restrict which output blocks can plug in (`'Number'`, `'String'`, `'Boolean'`) |

---

### 7.18 Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Block `name` / `@handler` string | `snake_case` | `led_on`, `read_distance`, `move_to` |
| JS file | `<name>.js` or `camelCase.js` | `led_on.js`, `digitalOut.js` |
| Python handler file | `<topic>.py` (group related handlers) | `gpio.py`, `timing.py`, `motors.py` |
| Field key in `getFieldValue` | `UPPER_SNAKE` | `'PIN'`, `'DURATION_MS'`, `'SENSOR_ID'` |
| param key in `executeAction` | `snake_case` | `{ pin: '3' }`, `{ duration_ms: '500' }` |
| param key in Python `params["…"]` | `snake_case` | `params["duration_ms"]` |

---

### 7.19 Step-by-Step Checklist — Adding a New Block

```
1. Create  src/blockly_app/…/ui/blockly/blocks/<name>.js
           └─ Call BlockRegistry.register({ name, category, color, definition, generator })
           └─ name must exactly match the Python @handler string

2. Edit    src/blockly_app/…/ui/blockly/blocks/manifest.js
           └─ Add '<name>.js' to the BLOCK_FILES array

3. Create  src/blockly_executor/…/handlers/<name>.py  (or add to existing file)
           └─ from . import handler
           └─ from ..hardware import Hardware
           └─ @handler("name")
           └─ def handle_name(params, hardware: Hardware): ...  →  return (bool, str)
           └─ hardware.log(...) for testing + hardware.is_real() for real logic

4. Test    pixi run executor   (Terminal 1)
           pixi run app        (Terminal 2) — drag block, click Run
           pixi run test -- src/blockly_executor/test/test_block_<name>.py -v
```

No changes needed to `index.html`, `executor_node.py`, `handlers/__init__.py`, or `BlocklyAction.action`.


---
