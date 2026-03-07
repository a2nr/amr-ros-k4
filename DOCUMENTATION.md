# Blockly ROS2 Robot Controller — Technical Documentation

Comprehensive technical documentation for the Blockly ROS2 Robot Controller project. This document covers architecture, setup, file details, custom block creation, integration flow, testing, and troubleshooting.

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. System Architecture](#2-system-architecture)
  - [2.1 High-Level Architecture Diagram](#21-high-level-architecture-diagram)
  - [2.2 Threading Model](#22-threading-model)
  - [2.3 ROS2 Interface Contract](#23-ros2-interface-contract)
- [3. Directory Structure](#3-directory-structure)
- [4. Installation](#4-installation)
  - [4.1 Prerequisites](#41-prerequisites)
  - [4.2 Step-by-Step Setup](#42-step-by-step-setup)
  - [4.3 Building the Blockly Vendor Files](#43-building-the-blockly-vendor-files)
- [5. Running the Project](#5-running-the-project)
  - [5.1 Running the Desktop Application](#51-running-the-desktop-application)
  - [5.2 Running the Executor Node Standalone](#52-running-the-executor-node-standalone)
  - [5.3 Running the Test Suite](#53-running-the-test-suite)
- [6. Detailed File Reference](#6-detailed-file-reference)
  - [6.1 Application Layer — app/](#61-application-layer--app)
  - [6.2 Executor Layer — executor/](#62-executor-layer--executor)
  - [6.3 ROS2 Interfaces — interfaces/](#63-ros2-interfaces--interfaces)
  - [6.4 Test Suite — tests/](#64-test-suite--tests)
  - [6.5 Configuration Files](#65-configuration-files)
- [7. Creating Custom Blocks in Blockly](#7-creating-custom-blocks-in-blockly)
  - [7.1 Overview: 4 Files, 3 Layers](#71-overview-4-files-3-layers)
  - [7.2 Step 1 — Register Handler in Python](#72-step-1--register-handler-in-python)
  - [7.3 Step 2 — Define Visual Block in blocks.js](#73-step-2--define-visual-block-in-blocksjs)
  - [7.4 Step 3 — Define Runtime Behavior in executor.js](#74-step-3--define-runtime-behavior-in-executorjs)
  - [7.5 Step 4 — Write Integration Test](#75-step-4--write-integration-test)
  - [7.6 Name Consistency Reference Table](#76-name-consistency-reference-table)
- [8. Blockly–ROS2 Integration Flow](#8-blocklyros2-integration-flow)
  - [8.1 End-to-End Execution Flow](#81-end-to-end-execution-flow)
  - [8.2 Code Generation Pipeline](#82-code-generation-pipeline)
  - [8.3 pywebview Bridge Mechanism](#83-pywebview-bridge-mechanism)
  - [8.4 Future Waiting Without Blocking](#84-future-waiting-without-blocking)
  - [8.5 Debug Mode Flow](#85-debug-mode-flow)
- [9. Testing](#9-testing)
  - [9.1 Testing Philosophy](#91-testing-philosophy)
  - [9.2 conftest.py — Shared Fixtures](#92-conftestpy--shared-fixtures)
  - [9.3 Test File Structure](#93-test-file-structure)
  - [9.4 Adding a New Test File](#94-adding-a-new-test-file)
  - [9.5 Running Tests](#95-running-tests)
- [10. Troubleshooting & Known Issues](#10-troubleshooting--known-issues)

---

## 1. Project Overview

The Blockly ROS2 Robot Controller is a visual programming system that allows users to control an AMR (Autonomous Mobile Robot) by assembling drag-and-drop blocks in a desktop application. The system bridges three technologies:

| Technology | Role |
|---|---|
| **Blockly** | Visual programming editor AND runtime executor |
| **pywebview** | Desktop window hosting the Blockly UI, with a JS↔Python bridge |
| **rclpy (ROS2 Jazzy)** | Action Client/Server for robot command execution |
| **Pixi** | Environment manager with RoboStack for isolated ROS2 dependencies |

**Key design principle:** Blockly is not just an editor — it is the program executor. When Blockly encounters a robot action block, it calls Python via the pywebview bridge, waits for the ROS2 Action to complete, then continues to the next block. This means native Blockly constructs like loops, conditionals, and variables work naturally without any ROS2-side implementation.

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Desktop Application                        │
│                      (pywebview)                              │
│                                                               │
│  ┌─────────────────────┐                                      │
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
│             │  • execute_action(command, keys, values)          │
│             │  ← return: {success, message}                    │
│  ┌──────────▼───────────┐                                      │
│  │  BlocklyAPI          │  Python / rclpy                      │
│  │  (app/app.py)        │                                      │
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
│             Executor Node                                       │
│             (Action Server)                                     │
│                                                                 │
│  Handles ONE action at a time. Has no concept of                │
│  "program" — sequencing is controlled entirely by Blockly.      │
│                                                                 │
│  ┌─────────────────────┐                                        │
│  │  HandlerRegistry     │  Extensible command map                │
│  │  • led_on            │                                        │
│  │  • led_off           │                                        │
│  │  • delay             │                                        │
│  └──────────┬──────────┘                                        │
│  ┌──────────▼──────────┐                                        │
│  │  Hardware Interface  │  Abstraction layer                     │
│  │  • DummyHardware     │  for dev & test                        │
│  │  • GpioHardware      │  for Raspberry Pi                      │
│  └─────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Threading Model

The application uses a carefully designed threading model to avoid rclpy's "Executor is already spinning" error:

```
┌─────────────────────────────────────────────────────┐
│                    Process: app.py                    │
│                                                       │
│  Main Thread (pywebview)                              │
│  ├── webview.start()          ← blocks here           │
│  ├── BlocklyAPI.execute_action() called from JS       │
│  │   └── _wait_for_future()   ← polls future.done()  │
│  │       (does NOT call spin)                         │
│  │                                                     │
│  Background Thread (daemon)                            │
│  └── MultiThreadedExecutor.spin()                     │
│      └── processes action client callbacks             │
│          (goal response, result, feedback)             │
└─────────────────────────────────────────────────────┘
```

**Why `MultiThreadedExecutor` in the app but NOT in the executor node:**

- **App (client side):** Uses [`MultiThreadedExecutor`](app/app.py:162) because the background spin thread must process action client callbacks while the main thread polls `future.done()`. A single-threaded executor would work too, but `MultiThreadedExecutor` ensures callbacks are processed promptly.

- **Executor Node (server side):** Uses simple [`rclpy.spin(node)`](executor/executor/executor_node.py:123) with the default single-threaded executor. Using `MultiThreadedExecutor` with `ReentrantCallbackGroup` on the server side causes action result delivery failures with `rmw_fastrtps_cpp` — the client receives default-constructed results (`success=False, message=''`) instead of the actual values.

### 2.3 ROS2 Interface Contract

Defined in [`BlocklyAction.action`](interfaces/action/BlocklyAction.action):

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

---

## 3. Directory Structure

```
blockly_ros2/
│
├── pixi.toml                              # Environment & task definitions
├── package.json                           # Node.js deps for Blockly vendor files
│
├── interfaces/                            # ROS2 custom interface package
│   ├── package.xml                        # ROS2 package manifest
│   ├── CMakeLists.txt                     # Build config for colcon
│   └── action/
│       └── BlocklyAction.action           # Single action for all instructions
│
├── executor/                              # ROS2 Executor Node package
│   └── executor/
│       ├── __init__.py
│       ├── executor_node.py               # ROS2 Action Server (thin wrapper)
│       ├── handlers.py                    # HandlerRegistry + all handlers
│       ├── utils.py                       # parse_params and helpers
│       └── hardware/
│           ├── __init__.py
│           ├── interface.py               # HardwareInterface abstract class
│           ├── dummy_hardware.py          # In-memory impl for dev & test
│           └── gpio_hardware.py           # Raspberry Pi GPIO impl
│
├── app/                                   # pywebview desktop application
│   ├── __init__.py
│   ├── app.py                             # Entry point: pywebview + Action Client
│   └── ui/
│       ├── index.html                     # Main UI with toolbar & workspace
│       ├── vendor/                        # Local Blockly JS files (no CDN)
│       │   ├── blockly.min.js
│       │   ├── blocks_compressed.js
│       │   ├── javascript_compressed.js
│       │   └── en.js
│       └── blockly/
│           ├── blocks.js                  # Visual definitions of custom blocks
│           └── executor.js                # Runtime behavior + debug engine
│
└── tests/                                 # Integration test suite
    ├── __init__.py
    ├── conftest.py                        # Shared fixtures: ros_context, exe_action
    ├── test_block_led_on.py
    ├── test_block_led_off.py
    └── test_block_delay.py
```

---

## 4. Installation

### 4.1 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **OS** | Ubuntu 22.04+ or Raspberry Pi OS (64-bit) | `linux-64` or `linux-aarch64` |
| **Pixi** | Latest | Package manager — [install guide](https://pixi.sh) |
| **Node.js** | ≥18 | Only needed once for `setup-ui` task |

**No system-level ROS2 installation is required.** Pixi installs ROS2 Jazzy from the RoboStack channel in an isolated environment.

### 4.2 Step-by-Step Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd blockly-ros2-controller

# 2. Install all dependencies (ROS2, Python, Qt, etc.)
pixi install

# 3. Build the ROS2 custom interfaces (required once)
pixi run build-interfaces

# 4. Verify ROS2 is working
pixi run python -c "import rclpy; print('rclpy OK')"
```

### 4.3 Building the Blockly Vendor Files

Blockly is loaded from local files (no CDN) to support offline operation on robots in the field:

```bash
# Download Blockly and copy to vendor/ (requires internet, run once)
pixi run setup-ui
```

This runs `npm install blockly` and copies the built files to [`app/ui/vendor/`](app/ui/vendor/).

---

## 5. Running the Project

### 5.1 Running the Desktop Application

Requires two terminals:

```bash
# Terminal 1: Start the Executor Node (Action Server)
pixi run executor

# Terminal 2: Start the desktop application (Action Client + UI)
pixi run app
```

The app window opens with the Blockly workspace. Drag blocks from the toolbox, connect them, and press **Run**.

### 5.2 Running the Executor Node Standalone

Useful for testing with `ros2 action send_goal` or custom clients:

```bash
pixi run executor
```

The executor logs all received goals and their results to the terminal.

### 5.3 Running the Test Suite

The executor must be running in a separate terminal before starting tests:

```bash
# Terminal 1: Start executor
pixi run executor

# Terminal 2: Run all tests
pixi run test

# Run a specific test file
pixi run test -- tests/test_block_led_on.py -v

# Run a single test function
pixi run test -- tests/test_block_led_on.py::test_block_led_on_returns_success -v
```

If the executor is not running, tests are **skipped** with an informative message rather than failing with a cryptic timeout error.

---

## 6. Detailed File Reference

### 6.1 Application Layer — `app/`

#### [`app/app.py`](app/app.py) — Application Entry Point

**Purpose:** Combines pywebview (desktop UI) with a ROS2 Action Client. This is the bridge between the JavaScript Blockly runtime and the ROS2 ecosystem.

**Key components:**

| Component | Description |
|---|---|
| [`_wait_for_future(future, timeout_sec)`](app/app.py:26) | Polls `future.done()` without calling `rclpy.spin()`. Used because the node is already being spun by a background thread. |
| [`BlocklyAPI`](app/app.py:46) | Python class exposed to JavaScript via pywebview. Its methods are callable as `window.pywebview.api.<method>()`. |
| [`BlocklyAPI.execute_action(command, param_keys, param_values)`](app/app.py:61) | Sends a ROS2 Action Goal and blocks until the result arrives. Returns `{success: bool, message: str}` to JavaScript. |
| [`main()`](app/app.py:145) | Initializes rclpy, creates the Action Client, starts the background spin thread with `MultiThreadedExecutor`, creates the pywebview window, and handles cleanup on exit. |

**Threading design:** The `main()` function starts `MultiThreadedExecutor.spin()` in a daemon thread. When JavaScript calls `execute_action()`, the method uses `_wait_for_future()` to poll for completion — it never calls `rclpy.spin_until_future_complete()`, which would conflict with the background spin.

#### [`app/ui/index.html`](app/ui/index.html) — Main UI

**Purpose:** The single HTML page that hosts the Blockly workspace, toolbar buttons, and console panel.

**Structure:**
- **Toolbar** (line 126–136): Run, Step Over, Step Into, Stop buttons, and Debug Mode toggle
- **Blockly Workspace** (line 138–141): The drag-and-drop canvas
- **Console Panel** (line 144): Scrollable log output showing execution progress
- **Toolbox** (line 147–174): XML definition of available block categories (Robot, Logic, Loops, Math, Variables)
- **Script loading** (line 177–184): Loads Blockly from local vendor files, then custom blocks and executor

#### [`app/ui/blockly/blocks.js`](app/ui/blockly/blocks.js) — Custom Block Definitions

**Purpose:** Defines the **visual appearance** of each custom robot block. No execution logic here.

**Blocks defined:**

| Block | Color | Fields | Description |
|---|---|---|---|
| `led_on` | `#4CAF50` (green) | `PIN` (FieldNumber, 0–40) | Turn on LED at GPIO pin |
| `led_off` | `#FF9800` (orange) | `PIN` (FieldNumber, 0–40) | Turn off LED at GPIO pin |
| `delay` | `#2196F3` (blue) | `DURATION_MS` (FieldNumber, 0–60000) | Wait for specified milliseconds |

**Breakpoint support:** The file also manages [`activeBreakpoints`](app/ui/blockly/blocks.js:13) (a `Set` of block IDs) and [`toggleBreakpoint(block)`](app/ui/blockly/blocks.js:28) which changes block color to red when debug mode is active.

#### [`app/ui/blockly/executor.js`](app/ui/blockly/executor.js) — Runtime Behavior & Debug Engine

**Purpose:** Defines what happens when each block is **executed** by Blockly's runtime, plus the debug engine for step-by-step execution.

**Key components:**

| Component | Line | Description |
|---|---|---|
| [`executeAction(command, params)`](app/ui/blockly/executor.js:29) | 29 | Calls `window.pywebview.api.execute_action()` or falls back to mock in browser dev mode |
| [`javascript.javascriptGenerator.forBlock['led_on']`](app/ui/blockly/executor.js:60) | 60 | Generates JS code: `highlightBlock(id); await executeAction('led_on', {pin: '...'});` |
| [`runProgram()`](app/ui/blockly/executor.js:97) | 97 | Non-debug execution: wraps generated code in async function and `eval()`s it |
| [`runDebug()`](app/ui/blockly/executor.js:146) | 146 | Debug execution: wraps `executeAction` to check breakpoints and add delays |
| [`stepOver()`](app/ui/blockly/executor.js:250) | 250 | Resumes from pause, executes current block, pauses at next block |
| [`stepInto()`](app/ui/blockly/executor.js:283) | 283 | Resumes from pause, pauses at very next `highlightBlock` call |
| [`stopExecution()`](app/ui/blockly/executor.js:307) | 307 | Sets `stopRequested` flag, resolves any pending pause Promise |
| [`setupWorkspaceListeners(ws)`](app/ui/blockly/executor.js:365) | 365 | Attaches click listener for breakpoint toggling |

### 6.2 Executor Layer — `executor/`

#### [`executor/executor/executor_node.py`](executor/executor/executor_node.py) — ROS2 Action Server

**Purpose:** Thin ROS2 wrapper that receives `BlocklyAction` goals, delegates to `HandlerRegistry`, and returns results.

**Key components:**

| Component | Description |
|---|---|
| [`ExecutorNode.__init__(hardware)`](executor/executor/executor_node.py:27) | Creates the Action Server on topic `execute_blockly_action`. Accepts optional `HardwareInterface`; defaults to `DummyHardware`. |
| [`_goal_callback()`](executor/executor/executor_node.py:47) | Always returns `GoalResponse.ACCEPT` |
| [`_execute_callback(goal_handle)`](executor/executor/executor_node.py:57) | Publishes "executing" feedback, calls `HandlerRegistry.execute()`, catches exceptions, always calls `goal_handle.succeed()` |
| [`main()`](executor/executor/executor_node.py:117) | Entry point: `rclpy.init()` → `ExecutorNode()` → `rclpy.spin(node)` |

**Important design decision:** The execute callback always calls `goal_handle.succeed()` regardless of whether the command succeeded or failed. The `result.success` and `result.message` fields communicate command-level outcome. Using `goal_handle.abort()` causes result delivery failures with `rmw_fastrtps_cpp`.

#### [`executor/executor/handlers.py`](executor/executor/handlers.py) — Command Handler Registry

**Purpose:** Maps command names to handler functions. This is the primary extension point for adding new robot commands.

| Method | Description |
|---|---|
| [`HandlerRegistry.__init__(hardware)`](executor/executor/handlers.py:17) | Stores hardware reference, registers default handlers |
| [`register(command, handler)`](executor/executor/handlers.py:28) | Adds a new command→handler mapping |
| [`execute(command, params)`](executor/executor/handlers.py:36) | Looks up handler by name, returns `(False, "Unknown command: ...")` if not found |
| [`_handle_led_on(params)`](executor/executor/handlers.py:55) | Reads `params["pin"]`, calls `hardware.set_led(pin, True)` |
| [`_handle_led_off(params)`](executor/executor/handlers.py:61) | Reads `params["pin"]`, calls `hardware.set_led(pin, False)` |
| [`_handle_delay(params)`](executor/executor/handlers.py:67) | Reads `params["duration_ms"]`, calls `time.sleep()` |

**Error handling:** If a required parameter is missing, Python raises `KeyError` which propagates to `executor_node.py` and is caught there, producing an error message like `"Missing required parameter: 'pin'"`.

#### [`executor/executor/utils.py`](executor/executor/utils.py) — Utility Functions

| Function | Description |
|---|---|
| [`parse_params(keys, values)`](executor/executor/utils.py:4) | Converts two parallel arrays into a `dict`. Raises `ValueError` if lengths differ. |

#### [`executor/executor/hardware/interface.py`](executor/executor/hardware/interface.py) — Hardware Abstract Class

| Method | Description |
|---|---|
| [`set_led(pin, state)`](executor/executor/hardware/interface.py:16) | Abstract. Set LED on/off at given GPIO pin. |
| [`is_ready()`](executor/executor/hardware/interface.py:27) | Abstract. Check if hardware is initialized. |

Instantiating `HardwareInterface` directly raises `TypeError`.

#### [`executor/executor/hardware/dummy_hardware.py`](executor/executor/hardware/dummy_hardware.py) — Test/Dev Hardware

| Attribute/Method | Description |
|---|---|
| [`led_states: dict[int, bool]`](executor/executor/hardware/dummy_hardware.py:15) | In-memory LED state storage |
| [`call_log: list[str]`](executor/executor/hardware/dummy_hardware.py:16) | Log of all method calls for test inspection |
| [`set_led(pin, state)`](executor/executor/hardware/dummy_hardware.py:18) | Updates `led_states` and appends to `call_log` |
| [`is_ready()`](executor/executor/hardware/dummy_hardware.py:22) | Always returns `True` |

### 6.3 ROS2 Interfaces — `interfaces/`

#### [`interfaces/action/BlocklyAction.action`](interfaces/action/BlocklyAction.action)

The single ROS2 action interface used for all commands. See [Section 2.3](#23-ros2-interface-contract) for the full definition.

Built by `pixi run build-interfaces` using colcon. The generated Python module is importable as:

```python
from interfaces.action import BlocklyAction
```

### 6.4 Test Suite — `tests/`

#### [`tests/conftest.py`](tests/conftest.py) — Shared Test Fixtures

See [Section 9.2](#92-conftestpy--shared-fixtures) for detailed explanation.

#### [`tests/test_block_led_on.py`](tests/test_block_led_on.py)

Tests for the `led_on` command: happy path (success with valid pin), feedback verification, missing parameter failure, and error message content.

#### [`tests/test_block_led_off.py`](tests/test_block_led_off.py)

Tests for the `led_off` command with equivalent coverage to `led_on`.

#### [`tests/test_block_delay.py`](tests/test_block_delay.py)

Tests for the `delay` command including timing verification (±100ms tolerance).

### 6.5 Configuration Files

#### [`pixi.toml`](pixi.toml) — Environment & Task Definitions

| Section | Purpose |
|---|---|
| `[workspace]` | Project name, version, channels (`conda-forge`, `robostack-jazzy`), platforms |
| `[dependencies]` | Shared deps: `python >=3.11`, `ros-jazzy-rclpy`, `pytest`, `colcon-common-extensions` |
| `[target.linux-64.dependencies]` | Desktop-only: `nodejs`, `pyqtwebengine`, `qtpy` |
| `[target.linux-64.pypi-dependencies]` | `pywebview` (PyPI only, not on conda-forge) |
| `[tasks]` | Shortcut commands — see [Section 5](#5-running-the-project) |

**Task definitions:**

| Task | Command | Depends On |
|---|---|---|
| `build-interfaces` | `colcon build --symlink-install --packages-select interfaces` | — |
| `executor` | `source install/setup.bash && python -m executor.executor.executor_node` | `build-interfaces` |
| `app` | `source install/setup.bash && python app/app.py` | `build-interfaces` |
| `test` | `source install/setup.bash && PYTHONPATH=$PYTHONPATH:. pytest tests/ -v` | `build-interfaces` |
| `setup-ui` | Downloads Blockly via npm and copies to `app/ui/vendor/` | — |

---

## 7. Creating Custom Blocks in Blockly

### 7.1 Overview: 4 Files, 3 Layers

Adding a new block always involves exactly four files:

```
Layer            File                           Responsibility
─────            ────                           ──────────────
Python Backend   executor/executor/handlers.py  Execution logic + parameter validation
JS Frontend      app/ui/blockly/blocks.js       Visual appearance in workspace
                 app/ui/blockly/executor.js     Runtime behavior when block executes
Test Suite       tests/test_block_<name>.py     End-to-end verification via ROS2
```

**Files that do NOT need changes:** [`conftest.py`](tests/conftest.py), [`executor_node.py`](executor/executor/executor_node.py), [`BlocklyAction.action`](interfaces/action/BlocklyAction.action). The ROS2 interface is generic by design.

### 7.2 Step 1 — Register Handler in Python

Open [`executor/executor/handlers.py`](executor/executor/handlers.py) and add a new handler method plus registration:

```python
# In HandlerRegistry._register_default_handlers():
self.register("move_forward", self._handle_move_forward)

# New handler method:
def _handle_move_forward(self, params: dict[str, str]) -> tuple[bool, str]:
    """Move robot forward with given speed and duration."""
    speed = int(params["speed"])           # KeyError if missing
    duration_ms = int(params["duration_ms"])

    if not (0 <= speed <= 100):
        raise ValueError(f"speed must be 0-100, got: {speed}")

    self._hardware.move(direction="forward", speed=speed, duration_ms=duration_ms)
    return (True, f"Moved forward at speed {speed} for {duration_ms}ms")
```

**Verify immediately** (no JS needed):

```bash
# Terminal 1
pixi run executor

# Terminal 2 — send goal manually
ros2 action send_goal /execute_blockly_action interfaces/action/BlocklyAction \
  "{command: 'move_forward', param_keys: ['speed', 'duration_ms'], param_values: ['50', '1000']}"
```

### 7.3 Step 2 — Define Visual Block in `blocks.js`

Add to [`app/ui/blockly/blocks.js`](app/ui/blockly/blocks.js):

```javascript
// Add color to BLOCK_COLORS map
const BLOCK_COLORS = {
  // ... existing ...
  move_forward: '#7B1FA2',  // purple for movement
};

// Define block appearance
Blockly.Blocks['move_forward'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("move forward")
        .appendField("speed")
        .appendField(new Blockly.FieldNumber(50, 0, 100, 1), "SPEED")
        .appendField("for")
        .appendField(new Blockly.FieldNumber(1000, 0), "DURATION_MS")
        .appendField("ms");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BLOCK_COLORS.move_forward);
    this.setTooltip("Move robot forward with given speed and duration");
  }
};
```

Register in toolbox in [`index.html`](app/ui/index.html):

```xml
<category name="Robot" colour="#5b80a5">
  <!-- existing blocks -->
  <block type="move_forward"></block>
</category>
```

### 7.4 Step 3 — Define Runtime Behavior in `executor.js`

Add to [`app/ui/blockly/executor.js`](app/ui/blockly/executor.js):

```javascript
javascript.javascriptGenerator.forBlock['move_forward'] = function(block) {
  const speed      = block.getFieldValue('SPEED');
  const durationMs = block.getFieldValue('DURATION_MS');
  const code =
    `highlightBlock('${block.id}');\n` +
    `await executeAction('move_forward', { speed: '${speed}', duration_ms: '${durationMs}' });\n`;
  return code;
};
```

**Field name consistency is critical:** `'SPEED'` in `getFieldValue('SPEED')` must match `"SPEED"` in `blocks.js`, and `'speed'` in the params object must match `params["speed"]` in `handlers.py`.

### 7.5 Step 4 — Write Integration Test

Create `tests/test_block_move_forward.py`:

```python
"""Integration test for Blockly instruction: move_forward"""
import time


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


def test_block_move_forward_missing_duration_returns_failure(exe_action):
    result = exe_action("move_forward", speed="50")
    assert result.result.success is False
    assert "duration_ms" in result.result.message.lower()
```

### 7.6 Name Consistency Reference Table

```
handlers.py              blocks.js                executor.js
───────────              ─────────                ───────────
"move_forward"      ==   'move_forward'       ==   'move_forward'
params["speed"]     ==   "SPEED"  (field)     ==   getFieldValue('SPEED')
params["duration_ms"] == "DURATION_MS"        ==   getFieldValue('DURATION_MS')
```

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
     await executeAction('led_on', { pin: '1' });
     highlightBlock('block_def456');
     await executeAction('delay', { duration_ms: '500' });
   })()
       │
       ▼
③ executeAction() calls Python via pywebview bridge
   window.pywebview.api.execute_action("led_on", ["pin"], ["1"])
       │
       ▼
④ BlocklyAPI.execute_action() builds ROS2 Action Goal
   goal.command = "led_on"
   goal.param_keys = ["pin"]
   goal.param_values = ["1"]
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
⑧ HandlerRegistry.execute("led_on", {"pin": "1"})
   → hardware.set_led(1, True)
   → returns (True, "LED on pin 1 turned ON")
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

Each custom block has a **code generator** in [`executor.js`](app/ui/blockly/executor.js) that produces JavaScript code. For example, the `led_on` block with pin=3 generates:

```javascript
highlightBlock('block_abc123');
await executeAction('led_on', { pin: '3' });
```

Native Blockly blocks (loops, conditionals, variables) use Blockly's built-in JavaScript generators. The generated code for a program like "repeat 3 times { led_on pin 1 }" would be:

```javascript
for (var count = 0; count < 3; count++) {
  highlightBlock('block_loop');
  highlightBlock('block_led');
  await executeAction('led_on', { pin: '1' });
}
```

### 8.3 pywebview Bridge Mechanism

pywebview exposes Python objects to JavaScript through `window.pywebview.api`. In [`app.py`](app/app.py:181-188):

```python
window = webview.create_window(..., js_api=api)
```

This makes all public methods of `BlocklyAPI` callable from JavaScript:

```javascript
// JavaScript side
const result = await window.pywebview.api.execute_action("led_on", ["pin"], ["3"]);
// result = { success: true, message: "LED on pin 3 turned ON" }
```

The call is **synchronous from JavaScript's perspective** — the `await` pauses Blockly's execution until Python returns.

### 8.4 Future Waiting Without Blocking

The [`_wait_for_future()`](app/app.py:26) function is the key to avoiding the "Executor is already spinning" error:

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

**Why `rclpy.spin_until_future_complete()` doesn't work:** It tries to create a new executor for the node, but the node is already attached to the `MultiThreadedExecutor` in the background thread. rclpy enforces single-executor-per-node.

### 8.5 Debug Mode Flow

When Debug Mode is enabled:

1. [`runDebug()`](app/ui/blockly/executor.js:146) wraps `executeAction` with breakpoint checking
2. Before each action, it checks if `debugState.currentBlockId` is in `activeBreakpoints`
3. If a breakpoint is hit, execution pauses via a `Promise` that only resolves when the user clicks Step Over/Step Into
4. A 300ms delay is added between blocks for visual feedback
5. Stop sets `stopRequested = true` and resolves any pending pause Promise, causing the next `executeAction` call to throw `'STOP_EXECUTION'`

---

## 9. Testing

### 9.1 Testing Philosophy

All tests are **integration tests** that communicate through the real ROS2 Action interface — not unit tests that call internal functions directly. This provides high confidence because the test exercises the exact same communication path as the real application.

**Key architectural decisions:**

- **Executor runs as a separate process** — eliminates race conditions from two threads competing for rclpy's global context
- **`DummyHardware`** isolates physical hardware — tests run on any laptop without a Raspberry Pi
- **Real ROS2 nodes** are used during tests — ROS2 code is verified, not just Python logic
- **One file per block** — all scenarios for `led_on` live in `test_block_led_on.py`

### 9.2 `conftest.py` — Shared Fixtures

[`tests/conftest.py`](tests/conftest.py) provides two fixtures:

#### `ros_context` (session-scoped)

```python
@pytest.fixture(scope="session")
def ros_context():
    rclpy.init()
    yield
    rclpy.shutdown()
```

Initializes ROS2 exactly once for the entire test session. `scope="session"` prevents repeated `init()`/`shutdown()` calls.

#### `exe_action` (function-scoped)

```python
@pytest.fixture
def exe_action(ros_context):
    # Creates a fresh client node per test
    # Skips if executor not running
    # Returns _send(command, **kwargs) → SimpleNamespace(feedbacks, result)
```

Each test gets a clean `Node("test_action_client")` to prevent state leakage. The fixture:

1. Creates an `ActionClient` on topic `execute_blockly_action`
2. Waits 5 seconds for the server — **skips** (not fails) if not found
3. Returns a `_send()` function that builds a Goal, sends it, collects feedback, and returns the result
4. Destroys the node after the test

### 9.3 Test File Structure

Every test file follows this pattern:

```python
# tests/test_block_<name>.py
"""Integration test for Blockly instruction: <name>"""

# -- HAPPY PATH --
def test_block_<name>_returns_success(exe_action):
    result = exe_action("<name>", param="value")
    assert result.result.success is True

def test_block_<name>_sends_executing_feedback(exe_action):
    result = exe_action("<name>", param="value")
    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"

# -- SAD PATH --
def test_block_<name>_missing_<param>_returns_failure(exe_action):
    result = exe_action("<name>")  # intentionally missing param
    assert result.result.success is False

def test_block_<name>_missing_<param>_message_mentions_<param>(exe_action):
    result = exe_action("<name>")
    assert "<param>" in result.result.message.lower()
```

### 9.4 Adding a New Test File

1. Create `tests/test_block_<name>.py`
2. Write test functions using `exe_action` fixture
3. No changes needed to `conftest.py` or any other test file
4. Run: `pixi run test`

### 9.5 Running Tests

```bash
# All tests
pixi run test

# Single file
pixi run test -- tests/test_block_led_on.py -v

# Single test
pixi run test -- tests/test_block_led_on.py::test_block_led_on_returns_success -v

# Exclude slow tests (if marked with @pytest.mark.slow)
pixi run test -- -m "not slow"
```

---

## 10. Troubleshooting & Known Issues

### "Executor is already spinning" in `app.py`

**Symptom:** `RuntimeError: Executor is already spinning` when Blockly calls `execute_action()`.

**Cause:** Code calls `rclpy.spin_until_future_complete()` while a background thread is already spinning the same node.

**Solution:** Use [`_wait_for_future()`](app/app.py:26) which polls `future.done()` instead of calling spin. The background thread's spin loop resolves the futures.

### "Ignoring unexpected goal response" warnings

**Symptom:** Warning messages like:
```
[WARN] Ignoring unexpected goal response. There may be more than one action server
for the action 'execute_blockly_action'
```

**Cause:** Two executor nodes are running simultaneously on the same action topic. Both respond to the goal, but the client only expects one response.

**Solution:** Ensure only one executor is running. Kill any stale processes:
```bash
pkill -f "executor_node"
pixi run executor
```

### Action result always `success=False, message=''`

**Symptom:** Executor logs show successful execution, but the client receives default-constructed results.

**Cause:** Using `MultiThreadedExecutor` with `ReentrantCallbackGroup` on the **server** side causes result delivery failures with `rmw_fastrtps_cpp`.

**Solution:** The executor node uses simple `rclpy.spin(node)` with the default single-threaded executor. Do not add `MultiThreadedExecutor` or `ReentrantCallbackGroup` to [`executor_node.py`](executor/executor/executor_node.py).

### `goal_handle.abort()` causes empty results

**Symptom:** When the executor calls `goal_handle.abort()` for failed commands, the client receives empty result fields.

**Solution:** Always call `goal_handle.succeed()`. The `result.success` field communicates command-level success/failure. The goal-level status should always be "succeeded" because the server did process the goal.

### Blockly error: "Extension already registered"

**Symptom:** JavaScript console shows:
```
Uncaught Error: Extension "contextMenu_variableDynamicSetterGetter" is already registered
```

**Cause:** Blockly's `blocks_compressed.js` registers extensions that conflict with the Variables category in the toolbox. This happens when Blockly is initialized with both `blocks_compressed.js` and a dynamic Variables category.

**Impact:** This is a **non-blocking warning** — the workspace still functions correctly. The Variables category works as expected.

**Workaround:** If the error is disruptive, remove the `custom="VARIABLE"` attribute from the Variables category in the toolbox XML and use static variable blocks instead.

### Tests skipped with "Executor Node tidak ditemukan"

**Symptom:** All tests show `SKIPPED` with message about executor not found.

**Cause:** The executor node is not running in a separate terminal.

**Solution:**
```bash
# Terminal 1
pixi run executor

# Terminal 2
pixi run test
```

### pywebview shows "GTK cannot be loaded"

**Symptom:** Warning about `ModuleNotFoundError: No module named 'gi'` followed by "Using Qt 5.15".

**Impact:** This is **informational only**. pywebview tries GTK first, falls back to Qt (which is installed via `pyqtwebengine`). The application works correctly with the Qt backend.

---

*This documentation was generated for the Blockly ROS2 Robot Controller project. For the project overview and task breakdown, see [`README.md`](README.md).*
