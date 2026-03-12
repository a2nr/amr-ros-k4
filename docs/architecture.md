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
│  │                      │                                      │
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

---

## 8. Blockly–ROS2 Integration Flow

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
highlightBlock('block_abc123');
await executeAction('digital_out', { gpio: '17', state: 'true' });
```

Native Blockly blocks (loops, conditionals, variables) use Blockly's built-in JavaScript generators.

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

1. [`runDebug()`](../src/blockly_app/blockly_app/ui/blockly/core/debug-engine.js:87) wraps `executeAction` with breakpoint checking
2. Before each action, it checks if `debugState.currentBlockId` is in `activeBreakpoints`
3. If a breakpoint is hit, execution pauses via a `Promise` that only resolves when the user clicks Step Over/Step Into
4. A 300ms delay is added between blocks for visual feedback
5. Stop sets `stopRequested = true` and resolves any pending pause Promise, causing the next `executeAction` call to throw `'STOP_EXECUTION'`

---
