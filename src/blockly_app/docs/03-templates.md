# Block Templates

Copy-paste starting points for all block shapes. Choose the template that matches your block type, then customize.

---

## Template A — Statement Block (action command)

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

After creating both files, add the JS filename to [`manifest.js`](../blockly_app/ui/blockly/blocks/manifest.js):
```js
const BLOCK_FILES = [
  'digitalOut.js',
  'digitalIn.js',
  'delay.js',
  'MY_BLOCK.js',    // ← add here
];
```

---

## Template B — Output Block (sensor / computed value)

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

## Template C — Block with Value Input Sockets (accepts other blocks)

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

## Template D — Container Block (statement input socket)

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

## Template E — Client-side Statement Block (no Python handler)

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

## Template F — HMI Widget Block (client-side, design-time preview)

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

### HMI Control Blocks (interactive — SET + GET pair)

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
