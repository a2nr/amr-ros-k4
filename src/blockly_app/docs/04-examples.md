# Real Block Examples

Annotated source code of blocks already built in this project, and a master table of all current block categories.

---

## `digitalOut` — Statement block with FieldNumber + ValueInput

**JS** ([blocks/digitalOut.js](../blockly_app/ui/blockly/blocks/digitalOut.js)):
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

**Python** ([handlers/gpio.py](../../blockly_executor/blockly_executor/handlers/gpio.py)):
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

## `digitalIn` — Output block (returns a value)

**JS** ([blocks/digitalIn.js](../blockly_app/ui/blockly/blocks/digitalIn.js)):
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

**Python** ([handlers/gpio.py](../../blockly_executor/blockly_executor/handlers/gpio.py)):
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

## `delay` — Statement block with multiple field decorators

**JS** ([blocks/delay.js](../blockly_app/ui/blockly/blocks/delay.js)):
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

**Python** ([handlers/timing.py](../../blockly_executor/blockly_executor/handlers/timing.py)):
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

## Block Type Overview — All Categories

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
