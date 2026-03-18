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
  'digitalOut.js',
  'digitalIn.js',
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
| **Statement** | Top + bottom notches | Nothing (side effect) | Execute an action on the robot | `digital_out`, `delay` |
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

#### `digitalOut` — Statement block with FieldNumber + ValueInput

**JS** ([blocks/digitalOut.js](blockly_app/ui/blockly/blocks/digitalOut.js)):
```js
BlockRegistry.register({
  name: 'digitalOut',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#4CAF50',
  tooltip: 'set a digital output pin to HIGH (turn on LED)',

  definition: {
    init: function () {
      this.appendValueInput('digitalOut')
        .appendField(' gpio:')
        .appendField(new Blockly.FieldNumber(1, 0, 27, 1), 'GPIO')
        //                              ↑       ↑  ↑   ↑
        //                           default  min max step
        .setCheck('Boolean')          // accepts Boolean output blocks
        .appendField(' state:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#4CAF50');
      this.setTooltip('set a digital output pin to HIGH (turn on LED)');
    }
  },

  generator: function (block) {
    const GPIO = block.getFieldValue('GPIO');
    const STATE = Blockly.JavaScript.valueToCode(
      block, 'digitalOut', Blockly.JavaScript.ORDER_ATOMIC
    ) || 'false';
    return (
      "highlightBlock('" + block.id + "');\n" +
      "await executeAction('digital_out', { gpio: '" + GPIO + "', state: '" + STATE + "' });\n"
    //                        ↑ command name (must match @handler)
    //                                          ↑ param keys    ↑ param values (always string)
    );
  }
});
```

**Python** ([handlers/gpio.py](../blockly_executor/blockly_executor/handlers/gpio.py)):
```python
from . import handler
from .hardware import Hardware

@handler("digital_out")                                 # ← must match JS name
def handle_digital_out(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])                          # params values are always strings — cast
    state_raw = str(params["state"]).lower()
    state = state_raw in ("true", "1", "high")          # explicit string-to-bool parsing
    state_str = "HIGH" if state else "LOW"
    hardware.log(f"set_digital_out(gpio={gpio}, state={state})")

    if hardware.is_real():
        from blockly_interfaces.msg import GpioWrite
        pub = _get_gpio_write_publisher(hardware)       # lazy publisher creation
        msg = GpioWrite()
        msg.pin = gpio
        msg.state = state
        pub.publish(msg)                                # publish to /gpio/write → gpio_node

    return (True, f"GPIO pin {gpio} set to {state_str}")
```

---

#### `digitalIn` — Output block (returns a value)

**JS** ([blocks/digitalIn.js](blockly_app/ui/blockly/blocks/digitalIn.js)):
```js
BlockRegistry.register({
  name: 'digitalIn',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#E91E63',
  tooltip: 'Read digital input pin state (returns 0 or 1)',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Digital Read gpio:')
        .appendField(new Blockly.FieldNumber(5, 0, 27, 1), 'GPIO');
      this.setOutput(true, 'Number');   // ← output block, returns Number
      this.setColour('#E91E63');
      this.setTooltip('Read digital input pin state (returns 0 or 1)');
    }
  },

  generator: function (block) {
    const gpio = block.getFieldValue('GPIO');
    const code =
      "parseFloat((await executeAction('digital_in', { gpio: '" + gpio + "' })).message)";
    return [code, Blockly.JavaScript.ORDER_AWAIT];
    //      ↑ returns [code, precedence] for output blocks
  }
});
```

**Python** ([handlers/gpio.py](../blockly_executor/blockly_executor/handlers/gpio.py)):
```python
@handler("digital_in")
def handle_digital_in(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])
    hardware.log(f"read_digital_in(gpio={gpio})")

    if hardware.is_real():
        cache = _get_gpio_state_subscriber(hardware)    # lazy subscriber + cache
        with hardware.node._gpio_state_lock:
            state = cache.get(gpio)
        return (True, "1" if state else "0")

    return (True, "0")                                  # dummy mode — always LOW
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
from .hardware import Hardware

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
from .hardware import Hardware

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
  'digitalOut.js',
  'digitalIn.js',
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

### 7.15 Template E — Client-side Statement Block (no Python handler)

Client-side blocks call JavaScript functions directly — no `executeAction()`, no Python handler, no ROS2 round-trip. Used for **print** (console output) and **HMI widgets** (LED, Number, Text, Gauge).

**Print block** — calls `consoleLog()` directly:

```js
// src/blockly_app/blockly_app/ui/blockly/blocks/print.js

BlockRegistry.register({
  name: 'print',
  category: 'Program',
  categoryColor: '#FF9800',
  color: '#FFCA28',
  tooltip: 'Print a value to the console for debugging',

  definition: {
    init: function () {
      this.appendValueInput('TEXT')
        .appendField('Print');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FFCA28');
      this.setTooltip('Print a value to the console for debugging');
    },
  },

  generator: function (block) {
    var value = Blockly.JavaScript.valueToCode(
      block, 'TEXT', Blockly.JavaScript.ORDER_ATOMIC
    ) || "''";
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "consoleLog(String( ' USER LOG >>> ' + " + value + "), 'print');\n"
    //  ^^^^^^^^^^^^^^^^ direct JS function call — no executeAction!
    );
  },
});
```

**No Python handler needed.** The block works entirely in the browser. Add the JS filename to `manifest.js` and it's done.

---

### 7.16 Template F — HMI Widget Block (client-side, design-time preview)

HMI blocks create/update widgets in the HMI Panel. They call `HMI.set*()` functions directly (client-side) and support design-time preview — widgets appear when blocks are placed, not just at runtime.

**HMI LED block:**

```js
// src/blockly_app/blockly_app/ui/blockly/blocks/hmiSetLed.js

BlockRegistry.register({
  name: 'hmiSetLed',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Set an LED indicator on/off in the HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('STATE')
        .appendField('HMI LED')
        .appendField(new Blockly.FieldTextInput('LED1'), 'NAME')
        .appendField('color')
        .appendField(new Blockly.FieldDropdown([
          ['green', '#4caf50'],
          ['red', '#f44336'],
          ['yellow', '#ffeb3b'],
          ['blue', '#2196f3'],
          ['orange', '#ff9800'],
          ['white', '#ffffff'],
        ]), 'COLOR')
        .setCheck('Boolean')
        .appendField('state:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Set an LED indicator on/off in the HMI panel');
    },
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var color = block.getFieldValue('COLOR');
    var state = Blockly.JavaScript.valueToCode(
      block, 'STATE', Blockly.JavaScript.ORDER_ATOMIC
    ) || 'false';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setLED('" + name + "', Boolean(" + state + "), '" + color + "');\n"
    //  ^^^^^^^^^^ direct call to HMI manager — no executeAction!
    );
  },
});
```

**HMI Number block** — numeric display with unit:

```js
generator: function (block) {
    var name = block.getFieldValue('NAME');
    var unit = block.getFieldValue('UNIT');
    var value = Blockly.JavaScript.valueToCode(
      block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC
    ) || '0';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setNumber('" + name + "', Number(" + value + "), '" + unit + "');\n"
    );
  },
```

**HMI Gauge block** — bar gauge with min/max:

```js
generator: function (block) {
    var name = block.getFieldValue('NAME');
    var min = block.getFieldValue('MIN');
    var max = block.getFieldValue('MAX');
    var value = Blockly.JavaScript.valueToCode(
      block, 'VALUE', Blockly.JavaScript.ORDER_ATOMIC
    ) || '0';
    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setGauge('" + name + "', Number(" + value + "), " + min + ", " + max + ");\n"
    );
  },
```

**Key differences from ROS2 action blocks:**
- Generator calls `HMI.set*()` instead of `executeAction()`
- No Python handler file needed
- Widgets get design-time preview via `hmi-preview.js` (auto-detected by block type)
- All HMI blocks use `FieldTextInput('Name')` for widget identifier (`NAME` field)
- Category: `HMI`, color: `#00BCD4`

**Adding a new HMI widget type:**
1. Add render function `_renderFoo(body, widget)` in `core/hmi-manager.js`
2. Add public API method `setFoo(name, ...)` that stores state and calls `_scheduleRender(name)`
3. Add `case 'foo':` to the `_render()` switch
4. Create block file `blocks/hmiFoo.js` — generator calls `HMI.setFoo(...)`
5. Add to `manifest.js`
6. Add entry to `HMI_BLOCK_TYPES` in `core/hmi-preview.js` for design-time preview

#### HMI Control Blocks (interactive — SET + GET pair)

Control widgets (Button, Slider, Switch) have both a **SET block** (statement, create/configure) and a **GET block** (value, read user interaction). User interaction state is tracked separately from programmatic state to prevent HMI loop overwrites.

**HMI Button GET block** (value, latch-until-read):

```js
generator: function (block) {
    var name = block.getFieldValue('NAME');
    return ['HMI.getButton(\'' + name + '\')', Blockly.JavaScript.ORDER_FUNCTION_CALL];
    // Returns Boolean — true once per click, then auto-resets to false
},
```

**HMI Slider GET block** (value, user-drag tracking):

```js
generator: function (block) {
    var name = block.getFieldValue('NAME');
    return ['HMI.getSlider(\'' + name + '\')', Blockly.JavaScript.ORDER_FUNCTION_CALL];
    // Returns Number — user-dragged value takes priority over programmatic setSlider()
},
```

**HMI Switch GET block** (value, user-toggle tracking):

```js
generator: function (block) {
    var name = block.getFieldValue('NAME');
    return ['HMI.getSwitch(\'' + name + '\')', Blockly.JavaScript.ORDER_FUNCTION_CALL];
    // Returns Boolean — user-toggled state takes priority over programmatic setSwitch()
},
```

**User interaction tracking pattern:**
- **Button**: `pointerdown` event → `widget._pressed = true`. `getButton()` reads and resets (latch).
- **Slider**: `_userHasInteracted` flag persists after drag release. `setSlider()` skips `_userValue` overwrite once user has interacted.
- **Switch**: `_userState` stores user toggle separately. `setSwitch()` skips re-render once `_userState` is set.
- **Design-time**: `hmi-preview.js` auto-increments widget names when duplicate blocks are placed (`LED1` → `LED2`).

---

### 7.17 Block Type Overview — All Categories

| Category | Blocks | Execution Model |
|----------|--------|-----------------|
| **Program** | `main_program`, `main_hmi_program`, `print` | Entry points / client-side |
| **Robot** | `digitalOut`, `digitalIn`, `delay`, `pwmWrite`, `odometryRead`, `odometryGet` | ROS2 action (except `odometryGet`) |
| **HMI** | `hmiSetLed`, `hmiSetNumber`, `hmiSetText`, `hmiSetGauge`, `hmiSetButton`, `hmiGetButton`, `hmiSetSlider`, `hmiGetSlider`, `hmiSetSwitch`, `hmiGetSwitch` | Client-side (`HMI.set*()`/`HMI.get*()`) |
| **Logic** | `controls_if`, `logic_compare`, `logic_operation`, `logic_boolean` | Built-in Blockly |
| **Loops** | `controls_repeat_ext`, `controls_whileUntil` | Built-in Blockly |
| **Math** | `math_number`, `math_arithmetic` | Built-in Blockly |
| **Text** | `text`, `text_join`, `text_length` | Built-in Blockly |
| **Variables** | `variables_set`, `variables_get` | Built-in Blockly (with highlight override) |
| **Functions** | `procedures_defnoreturn`, `procedures_callnoreturn`, etc. | Built-in Blockly (with async override) |

---

### 7.18 `executeAction()` and `highlightBlock()` Reference

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

### 7.19 Quick Reference: Blockly Field Types

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

### 7.20 Quick Reference: Input and Connection Types

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

### 7.21 Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Block `name` / `@handler` string | `snake_case` | `digital_out`, `read_distance`, `move_to` |
| JS file | `<name>.js` or `camelCase.js` | `digitalOut.js`, `digitalIn.js` |
| Python handler file | `<topic>.py` (group related handlers) | `gpio.py`, `timing.py`, `motors.py` |
| Field key in `getFieldValue` | `UPPER_SNAKE` | `'PIN'`, `'DURATION_MS'`, `'SENSOR_ID'` |
| param key in `executeAction` | `snake_case` | `{ pin: '3' }`, `{ duration_ms: '500' }` |
| param key in Python `params["…"]` | `snake_case` | `params["duration_ms"]` |

---

### 7.22 Step-by-Step Checklist — Adding a New Block

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
