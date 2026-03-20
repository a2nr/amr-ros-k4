# Block API Reference

## Block Type Overview

There are three fundamental block shapes. Choose based on what the block **does**:

| Type | Shape | Returns | Use case | Examples |
|------|-------|---------|----------|---------|
| **Statement** | Top + bottom notches | Nothing (side effect) | Execute an action on the robot | `digital_out`, `delay` |
| **Output** | Left plug, no notches | A value | Read a sensor, compute something | `read_distance`, `read_temperature` |
| **Container** | Statement input socket | Nothing | Wrap a block stack (loop body, condition body) | Custom `repeat_until_clear` |

> Output blocks can be plugged into `appendValueInput()` sockets of other blocks (e.g., plug `read_distance` into `move_to(X=..., Y=...)`)

---

## `BlockRegistry.register()` — All Fields

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

## `definition.init` — Complete Reference

The `definition` field takes a plain object with one required key: `init`. This function runs once when Blockly creates the block. Inside `init`, `this` refers to the block instance.

**Call order inside `init`:**
1. `appendXxxInput()` rows — build the visual layout top-to-bottom
2. Connection methods — define how the block connects to others
3. Style methods — set color and tooltip

---

### Input Rows — Visual Layout

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

### `appendDummyInput()` — Label / field row (no sockets)

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

### `appendValueInput('KEY')` — Socket row (accepts output blocks)

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

### `appendStatementInput('KEY')` — Indented block stack slot

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

### Connection / Shape Methods

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

### Style Methods

```js
this.setColour('#4CAF50');          // block body color — hex string OR hue int (0–360)
this.setTooltip('Hover text');      // shown when user hovers over the block
this.setHelpUrl('https://...');     // optional: opens URL when user clicks '?' on block
```

> Always use **hex strings** (e.g. `'#4CAF50'`) to match the project's color scheme. The `color` field in `BlockRegistry.register()` and `setColour()` inside `init` should use the same value.

---

### Layout Control — `setInputsInline`

```js
this.setInputsInline(true);    // compact: all appendValueInput rows on ONE line
this.setInputsInline(false);   // (default) each appendValueInput row on its OWN line
```

`setInputsInline` only affects `appendValueInput` rows — `appendDummyInput` rows are always inline.

---

### Complete Multi-Row Example

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

## `executeAction()` and `highlightBlock()` Reference

Both functions are provided by [bridge.js](../blockly_app/ui/blockly/core/bridge.js) and injected into the eval context by [debug-engine.js](../blockly_app/ui/blockly/core/debug-engine.js).

### `await executeAction(command, params)`

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

### `highlightBlock(blockId)`

```js
highlightBlock(block.id);
```

Visually highlights the currently executing block in the workspace. Call it **first** in every statement generator so the user can see which block is running. For output blocks it is optional (they have no visual position in the stack).

---

## Quick Reference: Blockly Field Types

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

## Quick Reference: Input and Connection Types

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

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Block `name` / `@handler` string | `snake_case` | `digital_out`, `read_distance`, `move_to` |
| JS file | `<name>.js` or `camelCase.js` | `digitalOut.js`, `digitalIn.js` |
| Python handler file | `<topic>.py` (group related handlers) | `gpio.py`, `timing.py`, `motors.py` |
| Field key in `getFieldValue` | `UPPER_SNAKE` | `'PIN'`, `'DURATION_MS'`, `'SENSOR_ID'` |
| param key in `executeAction` | `snake_case` | `{ pin: '3' }`, `{ duration_ms: '500' }` |
| param key in Python `params["…"]` | `snake_case` | `params["duration_ms"]` |

---
