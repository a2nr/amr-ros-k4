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
  - [6.1 Application Layer — blockly_app](#61-application-layer--blockly_app)
  - [6.2 Executor Layer — blockly_executor](#62-executor-layer--blockly_executor)
  - [6.3 ROS2 Interfaces — blockly_interfaces](#63-ros2-interfaces--blockly_interfaces)
  - [6.4 Test Suite](#64-test-suite)
  - [6.5 Configuration Files](#65-configuration-files)
- [7. Creating Custom Blocks in Blockly](#7-creating-custom-blocks-in-blockly)
  - [7.1 Overview: 2 Steps with Auto-Discovery](#71-overview-2-steps-with-auto-discovery)
  - [7.2 Step 1 — Create Block File (JS)](#72-step-1--create-block-file-js)
  - [7.3 Step 2 — Register Handler in Python](#73-step-2--register-handler-in-python)
  - [7.4 Step 3 — Write Integration Test (Optional)](#74-step-3--write-integration-test-optional)
  - [7.5 Name Consistency Reference Table](#75-name-consistency-reference-table)
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
│  │  • led_on           │                                       │
│  │  • led_off          │                                       │
│  │  • delay            │                                       │
│  └──────────┬──────────┘                                       │
│  ┌──────────▼──────────┐                                       │
│  │  Hardware Interface │   Abstraction layer                   │
│  │  • DummyHardware    │   for dev & test                      │
│  │  • GpioHardware     │   for Raspberry Pi                    │
│  └─────────────────────┘                                       │
└────────────────────────────────────────────────────────────────┘
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

- **App (client side):** Uses [`MultiThreadedExecutor`](src/blockly_app/blockly_app/app.py:162) because the background spin thread must process action client callbacks while the main thread polls `future.done()`. A single-threaded executor would work too, but `MultiThreadedExecutor` ensures callbacks are processed promptly.

- **Executor Node (server side):** Uses simple [`rclpy.spin(node)`](src/blockly_executor/blockly_executor/executor_node.py:123) with the default single-threaded executor. Using `MultiThreadedExecutor` with `ReentrantCallbackGroup` on the server side causes action result delivery failures with `rmw_fastrtps_cpp` — the client receives default-constructed results (`success=False, message=''`) instead of the actual values.

### 2.3 ROS2 Interface Contract

Defined in [`BlocklyAction.action`](src/blockly_interfaces/action/BlocklyAction.action):

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
amr-ros-k4/                                    # ROS2 Workspace root
│
├── pixi.toml                                   # Environment & task definitions
├── pixi.lock                                   # Locked dependency versions
├── DOCUMENTATION.md                            # This file
├── PROJECT_MANAGEMENT.md                       # Project tracking & guides
│
└── src/                                        # All ROS2 packages
    ├── blockly_interfaces/                     # ROS2 custom interface package (ament_cmake)
    │   ├── package.xml
    │   ├── CMakeLists.txt
    │   └── action/
    │       └── BlocklyAction.action            # Single action for all instructions
    │
    ├── blockly_executor/                       # ROS2 Executor Node package (ament_python)
    │   ├── package.xml
    │   ├── setup.py
    │   ├── setup.cfg
    │   ├── resource/blockly_executor           # Ament index marker
    │   ├── blockly_executor/                   # Python module
    │   │   ├── __init__.py
    │   │   ├── executor_node.py                # ROS2 Action Server (thin wrapper)
    │   │   ├── handlers/                       # Modular command handler system
    │   │   │   ├── __init__.py                 # HandlerRegistry + auto-discovery
    │   │   │   ├── base.py                     # HandlerModule ABC — contract
    │   │   │   ├── gpio.py                     # GpioHandlers: led_on, led_off
    │   │   │   └── timing.py                   # TimingHandlers: delay
    │   │   ├── utils.py                        # parse_params and helpers
    │   │   └── hardware/
    │   │       ├── __init__.py
    │   │       ├── interface.py                # HardwareInterface abstract class
    │   │       ├── dummy_hardware.py           # In-memory impl for dev & test
    │   │       └── gpio_hardware.py            # Raspberry Pi GPIO impl
    │   └── test/                               # Integration test suite
    │       ├── __init__.py
    │       ├── conftest.py                     # Shared fixtures: ros_context, exe_action
    │       ├── test_block_led_on.py
    │       ├── test_block_led_off.py
    │       └── test_block_delay.py
    │
    └── blockly_app/                            # pywebview desktop application (ament_python)
        ├── package.xml
        ├── setup.py
        ├── setup.cfg
        ├── resource/blockly_app                # Ament index marker
        └── blockly_app/                        # Python module
            ├── __init__.py
            ├── app.py                          # Entry point: pywebview + Action Client
            └── ui/                             # Frontend assets
                ├── index.html                  # Main UI with toolbar & workspace
                ├── vendor/                     # Local Blockly JS files (no CDN)
                │   ├── blockly.min.js
                │   ├── blocks_compressed.js
                │   ├── javascript_compressed.js
                │   └── en.js
                └── blockly/                    # Modular block system
                    ├── core/                   # Shared infrastructure
                    │   ├── registry.js         # BlockRegistry — auto-register + toolbox
                    │   ├── breakpoints.js      # Debug breakpoint management
                    │   ├── bridge.js           # executeAction — pywebview bridge
                    │   ├── debug-engine.js     # Run, debug, step, stop logic
                    │   └── ui-controls.js      # Button states and callbacks
                    ├── blocks/                 # One file per block (auto-discovered)
                    │   ├── manifest.js         # BLOCK_FILES array
                    │   ├── led_on.js
                    │   ├── led_off.js
                    │   └── delay.js
                    ├── loader.js               # Dynamic script loader from manifest
                    └── workspace-init.js        # Auto-toolbox + workspace setup
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
cd amr-ros-k4

# 2. Install all dependencies (ROS2, Python, Qt, etc.)
pixi install

# 3. Build the ROS2 custom interfaces (required once)
pixi run build-interfaces

# 4. Build all packages
pixi run build

# 5. Verify ROS2 is working
pixi run python -c "import rclpy; print('rclpy OK')"
```

### 4.3 Building the Blockly Vendor Files

Blockly is loaded from local files (no CDN) to support offline operation on robots in the field:

```bash
# Download Blockly and copy to vendor/ (requires internet, run once)
pixi run setup-ui
```

This runs `npm install blockly` and copies the built files to `src/blockly_app/blockly_app/ui/vendor/`.

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
pixi run test -- src/blockly_executor/test/test_block_led_on.py -v

# Run a single test function
pixi run test -- src/blockly_executor/test/test_block_led_on.py::test_block_led_on_returns_success -v
```

If the executor is not running, tests are **skipped** with an informative message rather than failing with a cryptic timeout error.

---

## 6. Detailed File Reference

### 6.1 Application Layer — `blockly_app`

#### [`blockly_app/app.py`](src/blockly_app/blockly_app/app.py) — Application Entry Point

**Purpose:** Combines pywebview (desktop UI) with a ROS2 Action Client. This is the bridge between the JavaScript Blockly runtime and the ROS2 ecosystem.

**Key components:**

| Component | Description |
|---|---|
| [`_wait_for_future(future, timeout_sec)`](src/blockly_app/blockly_app/app.py:26) | Polls `future.done()` without calling `rclpy.spin()`. Used because the node is already being spun by a background thread. |
| [`BlocklyAPI`](src/blockly_app/blockly_app/app.py:46) | Python class exposed to JavaScript via pywebview. Its methods are callable as `window.pywebview.api.<method>()`. |
| [`BlocklyAPI.execute_action()`](src/blockly_app/blockly_app/app.py:61) | Sends a ROS2 Action Goal and blocks until the result arrives. Returns `{success: bool, message: str}` to JavaScript. |
| [`main()`](src/blockly_app/blockly_app/app.py:145) | Initializes rclpy, creates the Action Client, starts the background spin thread with `MultiThreadedExecutor`, creates the pywebview window, and handles cleanup on exit. |

**Threading design:** The `main()` function starts `MultiThreadedExecutor.spin()` in a daemon thread. When JavaScript calls `execute_action()`, the method uses `_wait_for_future()` to poll for completion — it never calls `rclpy.spin_until_future_complete()`, which would conflict with the background spin.

#### [`blockly_app/ui/index.html`](src/blockly_app/blockly_app/ui/index.html) — Main UI

**Purpose:** The single HTML page that hosts the Blockly workspace, toolbar buttons, and console panel.

**Structure:**
- **Toolbar**: Run, Step Over, Step Into, Stop buttons, and Debug Mode toggle
- **Blockly Workspace**: The drag-and-drop canvas
- **Console Panel**: Scrollable log output showing execution progress
- **Script loading**: Loads Blockly vendor files, then core infrastructure, then blocks via auto-loader

**Script loading order** (fixed — never needs changing when adding blocks):
1. `vendor/blockly.min.js` + other Blockly libs
2. `blockly/core/registry.js` → `breakpoints.js` → `bridge.js` → `debug-engine.js` → `ui-controls.js`
3. `blockly/blocks/manifest.js` + `blockly/loader.js`
4. `blockly/workspace-init.js`
5. Inline script: `loadAllBlocks().then(() => initWorkspace())`

#### [`blockly_app/ui/blockly/core/registry.js`](src/blockly_app/blockly_app/ui/blockly/core/registry.js) — Block Registry

**Purpose:** Central registration system for custom blocks. Each block file calls `BlockRegistry.register()` to self-register its visual definition, code generator, and toolbox metadata.

| Method | Description |
|---|---|
| `BlockRegistry.register(config)` | Register a block with name, category, color, definition, and generator |
| `BlockRegistry.getBlocks()` | Get all registered blocks |
| `BlockRegistry.getToolboxJSON()` | Build Blockly toolbox JSON from registered blocks + built-in categories |

#### [`blockly_app/ui/blockly/core/bridge.js`](src/blockly_app/blockly_app/ui/blockly/core/bridge.js) — pywebview Bridge

**Purpose:** Provides `executeAction(command, params)` which calls Python via the pywebview JS-to-Python bridge. Falls back to a mock when running outside pywebview (browser dev).

#### [`blockly_app/ui/blockly/core/debug-engine.js`](src/blockly_app/blockly_app/ui/blockly/core/debug-engine.js) — Debug Engine

**Purpose:** Implements Run, Debug, Step Over, Step Into, and Stop functionality.

| Function | Description |
|---|---|
| `runProgram()` | Non-debug execution: wraps generated code in async function and eval()s it |
| `runDebug()` | Debug execution: wraps executeAction to check breakpoints and add delays |
| `stepOver()` | Resumes from pause, executes current block, pauses at next block |
| `stepInto()` | Resumes from pause, pauses at very next highlightBlock call |
| `stopExecution()` | Sets stopRequested flag, resolves any pending pause Promise |
| `highlightBlock(blockId)` | Highlights the currently executing block in the workspace |

#### [`blockly_app/ui/blockly/blocks/manifest.js`](src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js) — Block Manifest

**Purpose:** Lists all block files to auto-load. This is the **only file you edit** when adding a new block (besides creating the block file itself).

```js
const BLOCK_FILES = ['led_on.js', 'led_off.js', 'delay.js'];
```

#### [`blockly_app/ui/blockly/blocks/led_on.js`](src/blockly_app/blockly_app/ui/blockly/blocks/led_on.js) — Example Block

**Purpose:** Self-contained block definition. Contains both the visual appearance AND the code generator.

Each block file calls `BlockRegistry.register()` with all metadata, so the toolbox is automatically generated.

### 6.2 Executor Layer — `blockly_executor`

#### [`blockly_executor/executor_node.py`](src/blockly_executor/blockly_executor/executor_node.py) — ROS2 Action Server

**Purpose:** Thin ROS2 wrapper that receives `BlocklyAction` goals, delegates to `HandlerRegistry`, and returns results.

| Component | Description |
|---|---|
| [`ExecutorNode.__init__(hardware)`](src/blockly_executor/blockly_executor/executor_node.py:27) | Creates the Action Server on topic `execute_blockly_action`. Accepts optional `HardwareInterface`; defaults to `DummyHardware`. |
| [`_goal_callback()`](src/blockly_executor/blockly_executor/executor_node.py:47) | Always returns `GoalResponse.ACCEPT` |
| [`_execute_callback(goal_handle)`](src/blockly_executor/blockly_executor/executor_node.py:57) | Publishes "executing" feedback, calls `HandlerRegistry.execute()`, catches exceptions, always calls `goal_handle.succeed()` |
| [`main()`](src/blockly_executor/blockly_executor/executor_node.py:117) | Entry point: `rclpy.init()` → `ExecutorNode()` → `rclpy.spin(node)` |

**Important design decision:** The execute callback always calls `goal_handle.succeed()` regardless of whether the command succeeded or failed. The `result.success` and `result.message` fields communicate command-level outcome. Using `goal_handle.abort()` causes result delivery failures with `rmw_fastrtps_cpp`.

#### [`blockly_executor/handlers/`](src/blockly_executor/blockly_executor/handlers/__init__.py) — Modular Command Handler System

**Purpose:** Maps command names to handler functions using a modular, auto-discovery pattern. Each handler category lives in its own module.

**Architecture** mirrors the JS frontend's per-block file structure:

```
handlers/
├── __init__.py     # HandlerRegistry + auto-imports HANDLER_MODULES
├── base.py         # HandlerModule ABC — contract for all handler modules
├── gpio.py         # GpioHandlers: led_on, led_off
└── timing.py       # TimingHandlers: delay
```

**HandlerRegistry** ([`handlers/__init__.py`](src/blockly_executor/blockly_executor/handlers/__init__.py)):

| Method | Description |
|---|---|
| `HandlerRegistry.__init__(hardware)` | Auto-registers all `HANDLER_MODULES` with the hardware interface |
| `register(command, handler)` | Adds a new command→handler mapping |
| `execute(command, params)` | Looks up handler by name, returns `(False, "Unknown command: ...")` if not found |

**HandlerModule** ([`handlers/base.py`](src/blockly_executor/blockly_executor/handlers/base.py)) — the contract:

| Method | Description |
|---|---|
| `register(registry, hardware)` | Abstract. Must register all commands this module provides. |

**GpioHandlers** ([`handlers/gpio.py`](src/blockly_executor/blockly_executor/handlers/gpio.py)):

| Command | Description |
|---|---|
| `led_on` | Reads `params["pin"]`, calls `hardware.set_led(pin, True)` |
| `led_off` | Reads `params["pin"]`, calls `hardware.set_led(pin, False)` |

**TimingHandlers** ([`handlers/timing.py`](src/blockly_executor/blockly_executor/handlers/timing.py)):

| Command | Description |
|---|---|
| `delay` | Reads `params["duration_ms"]`, calls `time.sleep()` |

**Adding a new handler category:**
1. Create `handlers/<category>.py` with a class extending `HandlerModule`
2. Import and add to `HANDLER_MODULES` list in `handlers/__init__.py`

#### [`blockly_executor/utils.py`](src/blockly_executor/blockly_executor/utils.py) — Utility Functions

| Function | Description |
|---|---|
| [`parse_params(keys, values)`](src/blockly_executor/blockly_executor/utils.py:4) | Converts two parallel arrays into a `dict`. Raises `ValueError` if lengths differ. |

#### [`blockly_executor/hardware/interface.py`](src/blockly_executor/blockly_executor/hardware/interface.py) — Hardware Abstract Class

| Method | Description |
|---|---|
| [`set_led(pin, state)`](src/blockly_executor/blockly_executor/hardware/interface.py:16) | Abstract. Set LED on/off at given GPIO pin. |
| [`is_ready()`](src/blockly_executor/blockly_executor/hardware/interface.py:27) | Abstract. Check if hardware is initialized. |

#### [`blockly_executor/hardware/dummy_hardware.py`](src/blockly_executor/blockly_executor/hardware/dummy_hardware.py) — Test/Dev Hardware

| Attribute/Method | Description |
|---|---|
| [`led_states: dict[int, bool]`](src/blockly_executor/blockly_executor/hardware/dummy_hardware.py:15) | In-memory LED state storage |
| [`call_log: list[str]`](src/blockly_executor/blockly_executor/hardware/dummy_hardware.py:16) | Log of all method calls for test inspection |

### 6.3 ROS2 Interfaces — `blockly_interfaces`

#### [`blockly_interfaces/action/BlocklyAction.action`](src/blockly_interfaces/action/BlocklyAction.action)

The single ROS2 action interface used for all commands. See [Section 2.3](#23-ros2-interface-contract) for the full definition.

Built by `pixi run build-interfaces` using colcon. The generated Python module is importable as:

```python
from blockly_interfaces.action import BlocklyAction
```

### 6.4 Test Suite

Tests are located at [`src/blockly_executor/test/`](src/blockly_executor/test/conftest.py).

#### [`test/conftest.py`](src/blockly_executor/test/conftest.py) — Shared Test Fixtures

See [Section 9.2](#92-conftestpy--shared-fixtures) for detailed explanation.

#### [`test/test_block_led_on.py`](src/blockly_executor/test/test_block_led_on.py)

Tests for the `led_on` command: happy path (success with valid pin), feedback verification, missing parameter failure, and error message content.

#### [`test/test_block_led_off.py`](src/blockly_executor/test/test_block_led_off.py)

Tests for the `led_off` command with equivalent coverage to `led_on`.

#### [`test/test_block_delay.py`](src/blockly_executor/test/test_block_delay.py)

Tests for the `delay` command including timing verification (±100ms tolerance).

### 6.5 Configuration Files

#### [`pixi.toml`](pixi.toml) — Environment & Task Definitions

| Section | Purpose |
|---|---|
| `[workspace]` | Project name, version, channels (`conda-forge`, `robostack-jazzy`), platforms |
| `[dependencies]` | Shared deps: `python >=3.11`, `ros-jazzy-base`, `ros-jazzy-rclpy`, `pytest`, `colcon-common-extensions` |
| `[target.linux-64.dependencies]` | Desktop-only: `nodejs`, `pyqtwebengine`, `qtpy` |
| `[target.linux-64.pypi-dependencies]` | `pywebview` (PyPI only, not on conda-forge) |
| `[tasks]` | Shortcut commands — see below |

**Task definitions:**

| Task | Command | Depends On |
|---|---|---|
| `build-interfaces` | `colcon build --symlink-install --packages-select blockly_interfaces` | — |
| `build-executor` | `colcon build --symlink-install --packages-select blockly_executor` | `build-interfaces` |
| `build-app` | `colcon build --symlink-install --packages-select blockly_app` | `build-interfaces` |
| `build` | `colcon build --symlink-install` | `build-interfaces` |
| `executor` | `source install/setup.bash && ros2 run blockly_executor executor_node` | `build-executor` |
| `app` | `source install/setup.bash && python -m blockly_app.app` | `build-app` |
| `test` | `source install/setup.bash && pytest src/blockly_executor/test/ -v` | `build-interfaces` |
| `setup-ui` | Downloads Blockly via npm and copies to `src/blockly_app/blockly_app/ui/vendor/` | — |

---

## 7. Creating Custom Blocks in Blockly

### 7.1 Overview: 2 Steps with Auto-Discovery

The project uses a **BlockRegistry** pattern with auto-discovery. Adding a new block requires only **2 files**:

```
Step     File                                                  Action
────     ────                                                  ──────
1. JS    src/blockly_app/blockly_app/ui/blockly/blocks/<name>.js   Create — block definition + code generator
         src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js  Edit — add filename to BLOCK_FILES array
2. Py    src/blockly_executor/blockly_executor/handlers.py          Edit — add Python handler
```

**Files that do NOT need changes:** [`index.html`](src/blockly_app/blockly_app/ui/index.html), [`conftest.py`](src/blockly_executor/test/conftest.py), [`executor_node.py`](src/blockly_executor/blockly_executor/executor_node.py), [`BlocklyAction.action`](src/blockly_interfaces/action/BlocklyAction.action). The toolbox is auto-generated from the registry.

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

Then add to [`manifest.js`](src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js):

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

Add the handler to an existing module (e.g., [`handlers/gpio.py`](src/blockly_executor/blockly_executor/handlers/gpio.py)), or create a new handler module under [`handlers/`](src/blockly_executor/blockly_executor/handlers/__init__.py). For a new category, create a file and add it to `HANDLER_MODULES` in `handlers/__init__.py`.

Example — adding to an existing module or creating a new one:

```python
# In HandlerRegistry._register_default_handlers():
self.register("move_forward", self._handle_move_forward)

# New handler method:
def _handle_move_forward(self, params: dict[str, str]) -> tuple[bool, str]:
    """Move robot forward with given speed and duration."""
    speed = int(params["speed"])
    duration_ms = int(params["duration_ms"])
    if not (0 <= speed <= 100):
        raise ValueError(f"speed must be 0-100, got: {speed}")
    self._hardware.move(direction="forward", speed=speed, duration_ms=duration_ms)
    return (True, f"Moved forward at speed {speed} for {duration_ms}ms")
```

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

Each custom block has a **code generator** defined in its block file (e.g., [`blocks/led_on.js`](src/blockly_app/blockly_app/ui/blockly/blocks/led_on.js)) that produces JavaScript code. For example, the `led_on` block with pin=3 generates:

```javascript
highlightBlock('block_abc123');
await executeAction('led_on', { pin: '3' });
```

Native Blockly blocks (loops, conditionals, variables) use Blockly's built-in JavaScript generators.

### 8.3 pywebview Bridge Mechanism

pywebview exposes Python objects to JavaScript through `window.pywebview.api`. In [`app.py`](src/blockly_app/blockly_app/app.py:181):

```python
window = webview.create_window(..., js_api=api)
```

This makes all public methods of `BlocklyAPI` callable from JavaScript:

```javascript
const result = await window.pywebview.api.execute_action("led_on", ["pin"], ["3"]);
// result = { success: true, message: "LED on pin 3 turned ON" }
```

The call is **synchronous from JavaScript's perspective** — the `await` pauses Blockly's execution until Python returns.

### 8.4 Future Waiting Without Blocking

The [`_wait_for_future()`](src/blockly_app/blockly_app/app.py:26) function is the key to avoiding the "Executor is already spinning" error:

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

1. [`runDebug()`](src/blockly_app/blockly_app/ui/blockly/core/debug-engine.js:87) wraps `executeAction` with breakpoint checking
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

[`test/conftest.py`](src/blockly_executor/test/conftest.py) provides two fixtures:

#### `ros_context` (session-scoped)

```python
@pytest.fixture(scope="session")
def ros_context():
    rclpy.init()
    yield
    rclpy.shutdown()
```

Initializes ROS2 exactly once for the entire test session.

#### `exe_action` (function-scoped)

Each test gets a clean `Node("test_action_client")` to prevent state leakage. The fixture:

1. Creates an `ActionClient` on topic `execute_blockly_action`
2. Waits 5 seconds for the server — **skips** (not fails) if not found
3. Returns a `_send()` function that builds a Goal, sends it, collects feedback, and returns the result
4. Destroys the node after the test

### 9.3 Test File Structure

Every test file follows this pattern:

```python
# src/blockly_executor/test/test_block_<name>.py
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
```

### 9.4 Adding a New Test File

1. Create `src/blockly_executor/test/test_block_<name>.py`
2. Write test functions using `exe_action` fixture
3. No changes needed to `conftest.py` or any other test file
4. Run: `pixi run test`

### 9.5 Running Tests

```bash
# All tests
pixi run test

# Single file
pixi run test -- src/blockly_executor/test/test_block_led_on.py -v

# Single test
pixi run test -- src/blockly_executor/test/test_block_led_on.py::test_block_led_on_returns_success -v
```

---

## 10. Troubleshooting & Known Issues

### "Executor is already spinning" in `app.py`

**Symptom:** `RuntimeError: Executor is already spinning` when Blockly calls `execute_action()`.

**Cause:** Code calls `rclpy.spin_until_future_complete()` while a background thread is already spinning the same node.

**Solution:** Use [`_wait_for_future()`](src/blockly_app/blockly_app/app.py:26) which polls `future.done()` instead of calling spin. The background thread's spin loop resolves the futures.

### "Ignoring unexpected goal response" warnings

**Symptom:** Warning messages about unexpected goal responses.

**Cause:** Two executor nodes are running simultaneously on the same action topic.

**Solution:** Ensure only one executor is running:
```bash
pkill -f "executor_node"
pixi run executor
```

### Action result always `success=False, message=''`

**Symptom:** Executor logs show successful execution, but the client receives default-constructed results.

**Cause:** Using `MultiThreadedExecutor` with `ReentrantCallbackGroup` on the **server** side causes result delivery failures with `rmw_fastrtps_cpp`.

**Solution:** The executor node uses simple `rclpy.spin(node)` with the default single-threaded executor. Do not add `MultiThreadedExecutor` or `ReentrantCallbackGroup` to [`executor_node.py`](src/blockly_executor/blockly_executor/executor_node.py).

### `goal_handle.abort()` causes empty results

**Symptom:** When the executor calls `goal_handle.abort()` for failed commands, the client receives empty result fields.

**Solution:** Always call `goal_handle.succeed()`. The `result.success` field communicates command-level success/failure.

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

*This documentation was generated for the Blockly ROS2 Robot Controller project. For project management and task tracking, see [`PROJECT_MANAGEMENT.md`](PROJECT_MANAGEMENT.md).*
