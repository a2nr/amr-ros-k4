# System Architecture & Integration Flow

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     Desktop Application                        │
│                       (pywebview)                              │
│                                                                │
│  ┌──────────────────────┐                                      │
│  │     Blockly UI       │  HTML/JS                             │
│  │                      │                                      │
│  │  • User assembles    │  Blockly is the EXECUTOR —           │
│  │    blocks visually   │  not just an editor.                 │
│  │  • if/else, loops,   │                                      │
│  │    variables (native)│  When encountering a robot           │
│  │  • Block highlighting│  action block, Blockly calls         │
│  │    during execution  │  Python and WAITS for result.        │
│  │  • HMI Panel (right) │                                      │
│  │    LED/Number/Text/  │  Client-side blocks (print, HMI)    │
│  │    Gauge widgets     │  call JS functions directly — no     │
│  │                      │  ROS2 round-trip.                    │
│  │  [Run] [Stop]        │                                      │
│  └──────────┬───────────┘                                      │
│             │  JS ↔ Python bridge (pywebview API)              │
│             │  • execute_action(command, keys, values)         │
│             │  ← return: {success, message}                    │
│  ┌──────────▼───────────┐                                      │
│  │  BlocklyAPI          │  Python / rclpy                      │
│  │  (blockly_app/app.py)│                                      │
│  │                      │  Runs in pywebview thread;           │
│  │  • Receives command  │  polls futures resolved by           │
│  │    from Blockly      │  background spin thread.             │
│  │  • Sends Action Goal │                                      │
│  │  • Waits for Result  │                                      │
│  │  • Returns to JS     │                                      │
│  └──────────┬───────────┘                                      │
└─────────────┼──────────────────────────────────────────────────┘
              │  ROS2 Action — BlocklyAction.action
              │  (one action per call)
┌─────────────▼──────────────────────────────────────────────────┐
│             Executor Node                                      │
│             (Action Server)                                    │
│                                                                │
│  Handles ONE action at a time. Has no concept of               │
│  "program" — sequencing is controlled entirely by Blockly.     │
│                                                                │
│  ┌─────────────────────┐                                       │
│  │  HandlerRegistry    │   Extensible command map              │
│  │  • digital_out      │                                       │
│  │  • digital_in       │                                       │
│  │  • delay            │                                       │
│  └──────────┬──────────┘                                       │
│  ┌──────────▼──────────┐                                       │
│  │  Hardware context   │   Unified Hardware class              │
│  │  • mode="dummy"     │   logging only (dev & test)           │
│  │  • mode="real"      │   ROS2 pub/sub to gpio_node           │
│  └──────────┬──────────┘                                       │
└─────────────┼────────────────────────────────────────────────────┘
              │  ROS2 Topics: /gpio/write, /gpio/state
┌─────────────▼────────────────────────────────────────────────────┐
│             GPIO Node (Raspberry Pi, C++)                        │
│             libgpiod digital I/O (hardware-only)                 │
│                                                                  │
│  Subscribes /gpio/write → set pin HIGH/LOW                       │
│  Publishes  /gpio/state → input pin readings (10 Hz)             │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Threading Model

The application uses a carefully designed threading model to avoid rclpy's "Executor is already spinning" error:

```
┌─────────────────────────────────────────────────────┐
│                    Process: app.py                  │
│                                                     │
│  Main Thread (pywebview)                            │
│  ├── webview.start()          ← blocks here         │
│  ├── BlocklyAPI.execute_action() called from JS     │
│  │   └── _wait_for_future()   ← polls future.done() │
│  │       (does NOT call spin)                       │
│  │                                                  │
│  Background Thread (daemon)                         │
│  └── MultiThreadedExecutor.spin()                   │
│      └── processes action client callbacks          │
│          (goal response, result, feedback)          │
└─────────────────────────────────────────────────────┘
```

**Why `MultiThreadedExecutor` in the app but NOT in the executor node:**

- **App (client side):** Uses [`MultiThreadedExecutor`](../src/blockly_app/blockly_app/app.py:162) because the background spin thread must process action client callbacks while the main thread polls `future.done()`. A single-threaded executor would work too, but `MultiThreadedExecutor` ensures callbacks are processed promptly.

- **Executor Node (server side):** Uses simple [`rclpy.spin(node)`](../src/blockly_executor/blockly_executor/executor_node.py:123) with the default single-threaded executor. Using `MultiThreadedExecutor` with `ReentrantCallbackGroup` on the server side causes action result delivery failures with `rmw_fastrtps_cpp` — the client receives default-constructed results (`success=False, message=''`) instead of the actual values.

### 2.3 ROS2 Interface Contract

Defined in [`BlocklyAction.action`](../src/blockly_interfaces/action/BlocklyAction.action):

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

---

### 2.4 HMI Panel — LabVIEW-style Front Panel

Terinspirasi oleh LabVIEW yang memiliki **Front Panel** (controls & indicators) dan **Block Diagram** (visual programming). Blockly sudah menjadi "Block Diagram". HMI Panel adalah "Front Panel" — menampilkan widget **indicators** (satu arah: code → display) dan **controls** (dua arah: user input ↔ code) yang dikontrol programmatically dari generated code.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Toolbar: [Run] [Debug] [Step] [Stop]   [Blocks|Code]   [Save] [Open]│
├──────────────────────────┬──────────┬──────────────────────────────────┤
│                          │  drag ↔  │                                  │
│    Blockly Workspace     │ divider  │     HMI Panel (gridstack.js)     │
│                          │          │                                  │
│  ┌─────────────────────┐ │          │  ┌──────┐ ┌──────────────────┐  │
│  │ Main Program        │ │          │  │ LED1 │ │  Heading  [rad]  │  │
│  │  set [odom] to ...  │ │          │  │ * ON │ │   1.57           │  │
│  │  digital_out(17,1)  │ │          │  └──────┘ └──────────────────┘  │
│  │  delay(1000)        │ │          │  ┌──────────────────────────┐   │
│  └─────────────────────┘ │          │  │  Speed      [cm/s]      │   │
│  ┌─────────────────────┐ │          │  │   42.5                  │   │
│  │ HMI Program         │ │          │  └──────────────────────────┘   │
│  │  HMI LED "LED1" ... │ │          │  ┌──────────────────────────┐   │
│  │  HMI Number "Hd"..  │ │          │  │  Battery       ### 72%  │   │
│  └─────────────────────┘ │          │  └──────────────────────────┘   │
│                          │          │                                  │
├──────────────────────────┴──────────┴──────────────────────────────────┤
│  drag ↕ divider                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  Console:  === Program started ===                                     │
│            USER LOG >>> Hello World                                     │
│            === Program completed ===                                   │
└────────────────────────────────────────────────────────────────────────┘
```

**Key components:**

| Module | File | Fungsi |
|--------|------|--------|
| HMI Manager | `core/hmi-manager.js` | Global `HMI` object — indicators: `setLED()`, `setNumber()`, `setText()`, `setGauge()`; controls: `setButton()`/`getButton()`, `setSlider()`/`getSlider()`, `setSwitch()`/`getSwitch()`; lifecycle: `clearAll()`. GridStack integration, layout serialization, mode management (design/runtime). |
| HMI Preview | `core/hmi-preview.js` | Workspace change listener — widgets appear/disappear saat block di-place/delete (design-time preview). Reconcile function handles undo/redo edge cases. |
| Resizable Panels | `core/resizable-panels.js` | Drag-to-resize dividers: vertical (Blockly↔HMI) dan horizontal (workspace↔console). Auto-resize Blockly canvas via `Blockly.svgResize()`. |

**Two modes:**
- **Design mode**: Grid unlocked (drag/resize widgets), preview values, dimmed appearance. Active saat tidak ada program berjalan.
- **Runtime mode**: Grid locked, live values dari running code, bright appearance. Active saat program berjalan.

**Widget types — Indicators** (satu arah: code → display):

| Widget | JS API | Fungsi |
|--------|--------|--------|
| LED | `HMI.setLED(name, state, color)` | On/off indicator with configurable color |
| Number | `HMI.setNumber(name, value, unit)` | Numeric display with unit label |
| Text | `HMI.setText(name, text)` | Text string display |
| Gauge | `HMI.setGauge(name, value, min, max)` | Horizontal bar gauge with range |

**Widget types — Controls** (dua arah: user input ↔ code):

| Widget | SET API | GET API | Fungsi |
|--------|---------|---------|--------|
| Button | `HMI.setButton(name, label, color)` | `HMI.getButton(name)` → Boolean | Latch-until-read: return `true` sekali per klik, auto-reset ke `false` |
| Slider | `HMI.setSlider(name, value, min, max)` | `HMI.getSlider(name)` → Number | Drag range input. `_userValue` tracking mencegah `setSlider()` menimpa posisi user |
| Switch | `HMI.setSwitch(name, state)` | `HMI.getSwitch(name)` → Boolean | Toggle ON/OFF. `_userState` tracking mencegah `setSwitch()` menimpa toggle user |

Control widgets menggunakan **user interaction tracking** — state dari user (klik/drag/toggle) disimpan terpisah dari programmatic `set*()` call, sehingga HMI loop yang memanggil `set*()` setiap ~50ms tidak menimpa input user. Design-time preview auto-increment widget names saat block duplikat di-place.

### 2.5 Concurrent Execution — Main Program + HMI Program

Saat workspace memiliki **dua program block** (`main_program` + `main_hmi_program`), keduanya berjalan bersamaan via `Promise.all()`.

```
generateCode(workspace)
        |
        v
Returns { definitions, mainCode, hmiCode }
        |
        v
debug-engine.js detects structured result -> _runConcurrent()
        |
        v
Single execution with shared scope:
+----------------------------------------------------------+
| (async function() {                                      |
|   // -- Shared definitions (variables, functions) -----  |
|   var myVar;                                             |
|   async function myFunc() { ... }                        |
|                                                          |
|   var _main = (async function() {                        |
|     // Main program -- has highlightBlock (visual+stop)  |
|     await highlightBlock('...');                         |
|     await executeAction('digital_out', {...});           |
|   })();                                                  |
|                                                          |
|   var _hmi = (async function() {                         |
|     // HMI program -- highlightBlock shadowed to no-op   |
|     var highlightBlock = async function() {              |
|       if (debugState.stopRequested) throw ...;           |
|     };                                                   |
|     while (!debugState.stopRequested) {                  |
|       HMI.setLED('LED1', true, '#4caf50');              |
|       HMI.setNumber('X', myVar);                        |
|       await new Promise(r => setTimeout(r, 50)); //20Hz |
|     }                                                    |
|   })();                                                  |
|                                                          |
|   await _main;                  // main drives completion|
|   debugState.stopRequested = true; // signal HMI to stop|
|   await _hmi;                   // wait for HMI cleanup |
| })()                                                     |
+----------------------------------------------------------+
```

**Design decisions:**
- **Shared scope**: Definitions (variables, functions) ada di outer IIFE — kedua program share via closure. Variable yang diubah di main langsung terlihat di HMI.
- **Main drives completion**: Saat main selesai, `stopRequested = true` -> HMI loop keluar.
- **HMI full speed**: `highlightBlock` di-shadow ke async no-op (hanya check stop). Tidak ada visual delay.
- **Debug mode**: Hanya main program yang memiliki stepping/breakpoints. HMI berjalan tanpa interupsi.

### 2.6 Two Block Execution Models

Blocks terbagi dua berdasarkan cara eksekusi:

| Model | Blocks | Mechanism | Latency |
|-------|--------|-----------|---------|
| **ROS2 action** | `digitalOut`, `digitalIn`, `delay`, `pwmWrite`, `odometryRead` | `await executeAction()` -> Python -> ROS2 -> handler -> result | Network round-trip (~10-100ms) |
| **Client-side** | `print`, `hmiSetLed`, `hmiSetNumber`, `hmiSetText`, `hmiSetGauge` | Direct JS function call (`consoleLog()`, `HMI.set*()`) | Instant (~0ms) |

Client-side blocks **tidak membutuhkan Python handler** — generator langsung memanggil fungsi JavaScript global. Ini membuat HMI responsif karena tidak ada overhead jaringan.

---

## 8. Blockly-ROS2 Integration Flow

### 8.1 End-to-End Execution Flow

When the user presses **Run**, the following sequence occurs:

```
User presses [Run]
       │
       ▼
① Blockly generates JavaScript code from workspace blocks
   javascript.javascriptGenerator.workspaceToCode(workspace)
       │
       ▼
② Generated code is wrapped in async function and eval()'d
   (async function() {
     highlightBlock('block_abc123');
     await executeAction('digital_out', { gpio: '17', state: 'true' });
     highlightBlock('block_def456');
     await executeAction('delay', { duration_ms: '500' });
   })()
       │
       ▼
③ executeAction() calls Python via pywebview bridge
   window.pywebview.api.execute_action("digital_out", ["gpio","state"], ["17","true"])
       │
       ▼
④ BlocklyAPI.execute_action() builds ROS2 Action Goal
   goal.command = "digital_out"
   goal.param_keys = ["gpio", "state"]
   goal.param_values = ["17", "true"]
       │
       ▼
⑤ Action Client sends goal asynchronously
   send_future = client.send_goal_async(goal)
       │
       ▼
⑥ _wait_for_future() polls until goal is accepted
   (background spin thread processes the callback)
       │
       ▼
⑦ Executor Node receives goal, publishes "executing" feedback
       │
       ▼
⑧ HandlerRegistry.execute("digital_out", {"gpio": "17", "state": "true"})
   → publish GpioWrite(pin=17, state=True) to /gpio/write
   → returns (True, "GPIO pin 17 set to HIGH")
       │
       ▼
⑨ Executor Node calls goal_handle.succeed(), returns Result
       │
       ▼
⑩ _wait_for_future() receives result, returns to BlocklyAPI
       │
       ▼
⑪ BlocklyAPI returns {success: true, message: "..."} to JavaScript
       │
       ▼
⑫ Blockly continues to next block (await resolves)
```

### 8.2 Code Generation Pipeline

Each custom block has a **code generator** defined in its block file (e.g., [`blocks/digitalOut.js`](../src/blockly_app/blockly_app/ui/blockly/blocks/digitalOut.js)) that produces JavaScript code. For example, the `digitalOut` block with gpio=17 and state=true generates:

```javascript
await highlightBlock('block_abc123');
await executeAction('digital_out', { gpio: '17', state: 'true' });
```

Client-side blocks (print, HMI) generate direct JS function calls instead of `executeAction`:

```javascript
await highlightBlock('block_def456');
consoleLog(String(' USER LOG >>> ' + myVar), 'print');

await highlightBlock('block_ghi789');
HMI.setLED('LED1', Boolean(true), '#4caf50');
```

`generateCode(ws)` (in [`async-procedures.js`](../src/blockly_app/blockly_app/ui/blockly/core/async-procedures.js)) replaces direct `workspaceToCode()`. When a `main_program` block exists, only function definitions + main body are generated. See §8.6 for full details.

Native Blockly blocks (loops, conditionals) use Blockly's built-in generators. `variables_set` is overridden to add `highlightBlock()` for debug support.

### 8.3 pywebview Bridge Mechanism

pywebview exposes Python objects to JavaScript through `window.pywebview.api`. In [`app.py`](../src/blockly_app/blockly_app/app.py:181):

```python
window = webview.create_window(..., js_api=api)
```

This makes all public methods of `BlocklyAPI` callable from JavaScript:

```javascript
const result = await window.pywebview.api.execute_action("digital_out", ["gpio","state"], ["17","true"]);
// result = { success: true, message: "GPIO pin 17 set to HIGH" }
```

The call is **synchronous from JavaScript's perspective** — the `await` pauses Blockly's execution until Python returns.

### 8.4 Future Waiting Without Blocking

The [`_wait_for_future()`](../src/blockly_app/blockly_app/app.py:26) function is the key to avoiding the "Executor is already spinning" error:

```python
def _wait_for_future(future, timeout_sec=30.0):
    deadline = time.monotonic() + timeout_sec
    while not future.done():
        if time.monotonic() > deadline:
            raise TimeoutError(...)
        time.sleep(0.01)  # 10ms polling
    return future.result()
```

**Why this works:** The background thread running `MultiThreadedExecutor.spin()` processes all ROS2 callbacks, including action client responses. When a response arrives, the executor's spin loop invokes the callback which marks the future as done. The `_wait_for_future()` function simply waits for this to happen.

### 8.5 Debug Mode Flow

When Debug Mode is enabled:

1. [`runDebug()`](../src/blockly_app/blockly_app/ui/blockly/core/debug-engine.js:200) wraps `executeAction` with breakpoint checking
2. `highlightBlock()` is overridden to an async version that can pause execution
3. All pause logic lives in the async `highlightBlock()` override — this is the single pause point
4. Pause conditions: first block, breakpoints, step-over/step-into boundaries
5. A 300ms delay is added between blocks for visual feedback (auto-run mode)
6. Stop sets `stopRequested = true` and resolves any pending pause Promise, causing the next `highlightBlock` call to throw `'STOP_EXECUTION'`

**Call depth tracking** (for Step Over):
- `enterFunction()` / `exitFunction()` injected around procedure calls by `async-procedures.js`
- Step Over skips blocks deeper than `stepStartDepth` (function bodies)
- Step Into pauses at every `highlightBlock()` regardless of depth

**Concurrent debug mode** (main + HMI programs):
- Main program: full debug stepping (breakpoints, step over/into, visual highlighting)
- HMI program: runs uninterrupted at full speed — `highlightBlock` shadowed to async stop check
- Both share variable scope via closure in single outer IIFE

### 8.6 Code Generation Pipeline — `generateCode(ws)`

[`async-procedures.js`](../src/blockly_app/blockly_app/ui/blockly/core/async-procedures.js) provides `generateCode(ws)` which replaces `workspaceToCode()`:

| Workspace state | Return value | Execution path |
|----------------|-------------|----------------|
| No `main_program` block | Plain string (backward compatible) | `_runSingle()` |
| `main_program` only | Plain string (definitions + main body) | `_runSingle()` |
| `main_program` + `main_hmi_program` | `{ definitions, mainCode, hmiCode }` | `_runConcurrent()` |

**Built-in generator overrides** in `async-procedures.js`:
- `procedures_defreturn` / `procedures_defnoreturn` → generates `async function` instead of `function`
- `procedures_callreturn` → wraps in async IIFE with `enterFunction()` / `exitFunction()`
- `procedures_callnoreturn` → adds `await highlightBlock()` + call depth tracking
- `variables_set` → adds `await highlightBlock()` before variable assignment

---
