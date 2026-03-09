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
  - [6.1 Application Layer — `blockly_app`](#61-application-layer-blockly_app)
  - [6.2 Executor Layer — `blockly_executor`](#62-executor-layer-blockly_executor)
  - [6.3 ROS2 Interfaces — `blockly_interfaces`](#63-ros2-interfaces-blockly_interfaces)
  - [6.4 Test Suite](#64-test-suite)
  - [6.5 Configuration Files](#65-configuration-files)
- [7. Creating Custom Blocks in Blockly](#7-creating-custom-blocks-in-blockly)
  - [7.1 Overview: Auto-Discovery on Both Sides](#71-overview-auto-discovery-on-both-sides)
  - [7.2 Step 1 — Create Block File (JS)](#72-step-1-create-block-file-js)
  - [7.3 Step 2 — Register Handler in Python](#73-step-2-register-handler-in-python)
  - [7.4 Step 3 — Write Integration Test (Optional)](#74-step-3-write-integration-test-optional)
  - [7.5 Name Consistency Reference Table](#75-name-consistency-reference-table)
  - [7.6 Block Type Overview](#76-block-type-overview)
  - [7.7 `BlockRegistry.register()` — All Fields](#77-blockregistryregister-all-fields)
  - [7.8 `definition.init` — Complete Reference](#78-definitioninit-complete-reference)
  - [7.9 Data Flow: JS Block → Python Handler → Hardware](#79-data-flow-js-block-python-handler-hardware)
  - [7.10 Real Block Examples from This Project](#710-real-block-examples-from-this-project)
  - [7.11 Template A — Statement Block (action command)](#711-template-a-statement-block-action-command)
  - [7.12 Template B — Output Block (sensor / computed value)](#712-template-b-output-block-sensor-computed-value)
  - [7.13 Template C — Block with Value Input Sockets (accepts other blocks)](#713-template-c-block-with-value-input-sockets-accepts-other-blocks)
  - [7.14 Template D — Container Block (statement input socket)](#714-template-d-container-block-statement-input-socket)
  - [7.15 `executeAction()` and `highlightBlock()` Reference](#715-executeaction-and-highlightblock-reference)
  - [7.16 Quick Reference: Blockly Field Types](#716-quick-reference-blockly-field-types)
  - [7.17 Quick Reference: Input and Connection Types](#717-quick-reference-input-and-connection-types)
  - [7.18 Naming Conventions](#718-naming-conventions)
  - [7.19 Step-by-Step Checklist — Adding a New Block](#719-step-by-step-checklist-adding-a-new-block)
- [8. Blockly–ROS2 Integration Flow](#8-blocklyros2-integration-flow)
  - [8.1 End-to-End Execution Flow](#81-end-to-end-execution-flow)
  - [8.2 Code Generation Pipeline](#82-code-generation-pipeline)
  - [8.3 pywebview Bridge Mechanism](#83-pywebview-bridge-mechanism)
  - [8.4 Future Waiting Without Blocking](#84-future-waiting-without-blocking)
  - [8.5 Debug Mode Flow](#85-debug-mode-flow)
- [9. Testing](#9-testing)
  - [9.1 Testing Philosophy](#91-testing-philosophy)
  - [9.2 `conftest.py` — Shared Fixtures](#92-conftestpy-shared-fixtures)
  - [9.3 Test File Structure](#93-test-file-structure)
  - [9.4 Adding a New Test File](#94-adding-a-new-test-file)
  - [9.5 Running Tests](#95-running-tests)
- [10. Guide: Adding a New ROS2 Package](#10-guide-adding-a-new-ros2-package)
- [11. Troubleshooting & Known Issues](#11-troubleshooting-known-issues)

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
    │   │   ├── handlers/                       # @handler decorator + auto-discovery
    │   │   │   ├── __init__.py                 # HandlerRegistry, @handler, auto-discover
    │   │   │   ├── gpio.py                     # @handler("led_on"), @handler("led_off")
    │   │   │   └── timing.py                   # @handler("delay")
    │   │   ├── utils.py                        # parse_params and helpers
    │   │   └── hardware/
    │   │       ├── __init__.py
    │   │       ├── interface.py                # HardwareInterface abstract class
    │   │       ├── dummy_hardware.py           # In-memory impl for dev & test
    │   │       ├── real_hardware.py            # ROS2 topics/services to Pi nodes
    │   │       └── gpio_hardware.py            # Direct RPi.GPIO (legacy)
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
                    │   ├── ui-controls.js      # Button states and callbacks
                    │   ├── ui-tabs.js          # switchTab(), refreshCodePanel()
                    │   └── workspace-io.js     # exportWorkspace(), importWorkspace()
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

The executor has two hardware modes controlled by the ROS2 parameter `use_real_hardware`:

```bash
# Dummy mode (default) — in-memory hardware, no real GPIO/motor access
pixi run executor

# Real hardware mode — communicates with hardware nodes on Raspberry Pi via ROS2 topics/services
pixi run executor-hw
```

The executor does NOT run on the Raspberry Pi directly. In real hardware mode, `RealHardware` creates ROS2 publishers/service clients that talk to hardware nodes running on the Pi.

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
| [`_native_save_dialog()` / `_native_open_dialog()`](src/blockly_app/blockly_app/app.py:29) | Opens native OS file dialogs via `tkinter.filedialog`. Uses Tcl/Tk interpreter separate from Qt — no thread conflict. Available in pixi environment without extra dependencies. |
| [`_wait_for_future(future, timeout_sec)`](src/blockly_app/blockly_app/app.py:63) | Polls `future.done()` without calling `rclpy.spin()`. Used because the node is already being spun by a background thread. |
| [`BlocklyAPI`](src/blockly_app/blockly_app/app.py:80) | Python class exposed to JavaScript via pywebview. Its methods are callable as `window.pywebview.api.<method>()`. |
| [`BlocklyAPI.execute_action()`](src/blockly_app/blockly_app/app.py:95) | Sends a ROS2 Action Goal and blocks until the result arrives. Returns `{success: bool, message: str}` to JavaScript. |
| [`BlocklyAPI.save_workspace(json_string)`](src/blockly_app/blockly_app/app.py:145) | Opens native "Save As" dialog via tkinter, writes workspace JSON to chosen file. Returns `{success, path}` directly to JS. |
| [`BlocklyAPI.load_workspace()`](src/blockly_app/blockly_app/app.py:168) | Opens native "Open" dialog via tkinter, reads and validates JSON, returns `{success, data, path}` to JS. |
| [`main()`](src/blockly_app/blockly_app/app.py:190) | Initializes rclpy, creates the Action Client, starts the background spin thread with `MultiThreadedExecutor`, creates the pywebview window, and handles cleanup on exit. |

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
2. `blockly/core/registry.js` → `breakpoints.js` → `bridge.js` → `debug-engine.js` → `ui-controls.js` → `ui-tabs.js` → `workspace-io.js`
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

#### [`blockly_app/ui/blockly/core/ui-tabs.js`](src/blockly_app/blockly_app/ui/blockly/core/ui-tabs.js) — Tab Switching

**Purpose:** Manages switching between the **Blocks** editor tab and the **Code** preview tab.

| Function | Description |
|---|---|
| `switchTab(tab)` | Shows/hides `#blockly-area` and `#code-panel`. Calls `Blockly.svgResize()` when returning to Blocks tab (canvas dimensions are zeroed while hidden). |
| `refreshCodePanel()` | Regenerates JS code from workspace via `javascript.javascriptGenerator.workspaceToCode()` and displays in `#code-output`. |

The Code tab updates automatically on every workspace change (via a change listener in `workspace-init.js`).

#### [`blockly_app/ui/blockly/core/workspace-io.js`](src/blockly_app/blockly_app/ui/blockly/core/workspace-io.js) — Workspace Export/Import

**Purpose:** Exports workspace to JSON (Save As dialog) and imports from JSON (Open dialog) via the Python bridge.

| Function | Description |
|---|---|
| `exportWorkspace()` | Serializes workspace with `Blockly.serialization.workspaces.save()`, calls `window.pywebview.api.save_workspace(json)`, logs result path. |
| `importWorkspace()` | Calls `window.pywebview.api.load_workspace()`, clears workspace, loads returned JSON with `Blockly.serialization.workspaces.load()`. |

Both functions use `async/await` — they return after the file dialog closes and the file has been read/written.

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
| [`ExecutorNode.__init__()`](src/blockly_executor/blockly_executor/executor_node.py:27) | Creates the Action Server on topic `execute_blockly_action`. Reads ROS2 parameter `use_real_hardware` (bool, default `False`) to select `DummyHardware` or `RealHardware`. |
| [`_goal_callback()`](src/blockly_executor/blockly_executor/executor_node.py:47) | Always returns `GoalResponse.ACCEPT` |
| [`_execute_callback(goal_handle)`](src/blockly_executor/blockly_executor/executor_node.py:57) | Publishes "executing" feedback, calls `HandlerRegistry.execute()`, catches exceptions, always calls `goal_handle.succeed()` |
| [`main()`](src/blockly_executor/blockly_executor/executor_node.py:117) | Entry point: `rclpy.init()` → `ExecutorNode()` → `rclpy.spin(node)` |

**Important design decision:** The execute callback always calls `goal_handle.succeed()` regardless of whether the command succeeded or failed. The `result.success` and `result.message` fields communicate command-level outcome. Using `goal_handle.abort()` causes result delivery failures with `rmw_fastrtps_cpp`.

#### [`blockly_executor/handlers/`](src/blockly_executor/blockly_executor/handlers/__init__.py) — Decorator-Based Command Handlers

**Purpose:** Maps command names to handler functions using `@handler` decorator and auto-discovery. Mirrors the JS frontend's `BlockRegistry.register()` pattern.

```
handlers/
├── __init__.py     # @handler decorator, auto-discovery, HandlerRegistry
├── gpio.py         # @handler("led_on"), @handler("led_off")
└── timing.py       # @handler("delay")
```

**`@handler` decorator** — each handler is a plain function:

```python
from . import handler

@handler("led_on")
def handle_led_on(params: dict[str, str], hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.set_led(pin, True)
    return (True, f"LED on pin {pin} turned ON")
```

**Auto-discovery:** On `HandlerRegistry.__init__`, all `.py` files in `handlers/` are imported automatically. The `@handler` decorator collects `(command, function)` pairs, and the registry binds `hardware` to each function. No manual imports or module lists needed.

**HandlerRegistry** ([`handlers/__init__.py`](src/blockly_executor/blockly_executor/handlers/__init__.py)):

| Method | Description |
|---|---|
| `HandlerRegistry.__init__(hardware)` | Auto-discovers handler modules, binds hardware to all `@handler` functions |
| `execute(command, params)` | Looks up handler by name, returns `(False, "Unknown command: ...")` if not found |

**Adding a new handler:** Create `handlers/<name>.py`, use `@handler("command")`. That's it — no other files to edit.

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

In-memory implementation for development and testing. No ROS2 communication, no real hardware.

| Attribute/Method | Description |
|---|---|
| `led_states: dict[int, bool]` | In-memory LED state storage |
| `call_log: list[str]` | Log of all method calls for test inspection |

#### [`blockly_executor/hardware/real_hardware.py`](src/blockly_executor/blockly_executor/hardware/real_hardware.py) — Real Hardware via ROS2

Communicates with hardware nodes running on the Raspberry Pi via ROS2 topics/services. Requires a `Node` reference to create publishers and service clients. The executor does NOT run on the Pi — it sends commands over the ROS2 network.

| Parameter | Description |
|---|---|
| `node: Node` | ROS2 node used to create publishers/clients for Pi hardware nodes |

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
| `executor-hw` | `... executor_node --ros-args -p use_real_hardware:=true` | `build-executor` |
| `app` | `source install/setup.bash && python -m blockly_app.app` | `build-app` |
| `test` | `source install/setup.bash && pytest src/blockly_executor/test/ -v` | `build-interfaces` |
| `setup-ui` | Downloads Blockly via npm and copies to `src/blockly_app/blockly_app/ui/vendor/` | — |

---

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

**Files that do NOT need changes:** [`index.html`](src/blockly_app/blockly_app/ui/index.html), [`conftest.py`](src/blockly_executor/test/conftest.py), [`executor_node.py`](src/blockly_executor/blockly_executor/executor_node.py), [`BlocklyAction.action`](src/blockly_interfaces/action/BlocklyAction.action), [`handlers/__init__.py`](src/blockly_executor/blockly_executor/handlers/__init__.py). Both toolbox and handler registry are auto-generated.

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

Create a new file in `handlers/` or add to an existing one. Use the `@handler` decorator — auto-discovery handles the rest.

```python
# src/blockly_executor/blockly_executor/handlers/movement.py
from . import handler

@handler("move_forward")
def handle_move_forward(params: dict[str, str], hardware) -> tuple[bool, str]:
    speed = int(params["speed"])
    duration_ms = int(params["duration_ms"])
    if not (0 <= speed <= 100):
        raise ValueError(f"speed must be 0-100, got: {speed}")
    hardware.move(direction="forward", speed=speed, duration_ms=duration_ms)
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
  → hardware.set_led(pin, True)   ← DummyHardware or RealHardware
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

**JS** ([blocks/led_on.js](src/blockly_app/blockly_app/ui/blockly/blocks/led_on.js)):
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

**Python** ([handlers/gpio.py](src/blockly_executor/blockly_executor/handlers/gpio.py)):
```python
from . import handler

@handler("led_on")                                      # ← must match JS name
def handle_led_on(params: dict[str, str], hardware) -> tuple[bool, str]:
    pin = int(params["pin"])                            # params values are always strings — cast as needed
    hardware.set_led(pin, True)
    return (True, f"LED on pin {pin} turned ON")        # (success: bool, message: str)
```

---

#### `led_off` — Statement block (same pattern, different color)

**JS** ([blocks/led_off.js](src/blockly_app/blockly_app/ui/blockly/blocks/led_off.js)):
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

**Python** ([handlers/gpio.py](src/blockly_executor/blockly_executor/handlers/gpio.py)):
```python
@handler("led_off")
def handle_led_off(params: dict[str, str], hardware) -> tuple[bool, str]:
    pin = int(params["pin"])
    hardware.set_led(pin, False)
    return (True, f"LED on pin {pin} turned OFF")
```

> Multiple handlers can live in the same `.py` file — they are auto-discovered by `pkgutil.iter_modules`.

---

#### `delay` — Statement block with multiple field decorators

**JS** ([blocks/delay.js](src/blockly_app/blockly_app/ui/blockly/blocks/delay.js)):
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

**Python** ([handlers/timing.py](src/blockly_executor/blockly_executor/handlers/timing.py)):
```python
import time
from . import handler

@handler("delay")
def handle_delay(params: dict[str, str], hardware) -> tuple[bool, str]:
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

@handler("MY_COMMAND")
def handle_my_command(params: dict[str, str], hardware) -> tuple[bool, str]:
    param1 = params["param1"]          # always str — cast as needed (int, float, etc.)
    # ... do something with hardware ...
    return (True, f"Done: {param1}")
```

After creating both files, add the JS filename to [manifest.js](src/blockly_app/blockly_app/ui/blockly/blocks/manifest.js):
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
def handle_read_distance(params: dict[str, str], hardware) -> tuple[bool, str]:
    sensor_id = params["sensor_id"]
    distance = hardware.read_distance(sensor_id)    # returns float in cm
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
def handle_move_to(params: dict[str, str], hardware) -> tuple[bool, str]:
    x = float(params["x"])
    y = float(params["y"])
    hardware.move_to(x, y)
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

Both functions are provided by [bridge.js](src/blockly_app/blockly_app/ui/blockly/core/bridge.js) and injected into the eval context by [debug-engine.js](src/blockly_app/blockly_app/ui/blockly/core/debug-engine.js).

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
           └─ @handler("name")
           └─ def handle_name(params, hardware): ...  →  return (bool, str)

4. Test    pixi run executor   (Terminal 1)
           pixi run app        (Terminal 2) — drag block, click Run
           pixi run test -- src/blockly_executor/test/test_block_<name>.py -v
```

No changes needed to `index.html`, `executor_node.py`, `handlers/__init__.py`, or `BlocklyAction.action`.


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

## 10. Guide: Adding a New ROS2 Package

Every new `ament_python` package under `src/` must follow this structure:

```
src/<package_name>/
├── package.xml
├── setup.py
├── setup.cfg
├── resource/
│   └── <package_name>          # Empty file — ament index marker
├── <package_name>/             # Python module — same name as package
│   ├── __init__.py
│   └── <your_node>.py
└── test/
    ├── __init__.py
    └── test_<feature>.py
```

**setup.cfg:**
```ini
[develop]
script_dir=$base/lib/<package_name>
[install]
install_scripts=$base/lib/<package_name>
```

**package.xml:**
```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd"
            schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>PACKAGE_NAME</name>
  <version>0.1.0</version>
  <description>DESCRIPTION</description>
  <maintainer email="dev@example.com">developer</maintainer>
  <license>MIT</license>
  <depend>rclpy</depend>
  <test_depend>pytest</test_depend>
  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
```

**setup.py:**
```python
from setuptools import setup, find_packages

package_name = "PACKAGE_NAME"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
    ],
    install_requires=["setuptools"],
    entry_points={
        "console_scripts": [
            "node_name = PACKAGE_NAME.module:main",
        ],
    },
)
```

**Steps:**
1. `mkdir -p src/<package_name>/<package_name>`
2. Create `package.xml`, `setup.py`, `setup.cfg` from templates above
3. `touch src/<package_name>/resource/<package_name>`
4. Add `__init__.py` and node files
5. Add build/run tasks to `pixi.toml`
6. `colcon build --symlink-install --packages-select <package_name>`

---

## 11. Troubleshooting & Known Issues

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

### Export/Import button has no effect (force close or nothing happens)

**Symptom:** Clicking Export or Import either force-closes the app or does nothing.

**Cause:** Qt file dialogs (`QFileDialog`, `pywebview.create_file_dialog`) must run on the Qt main thread. pywebview calls Python API methods from a background thread. Attempting to open a Qt dialog from there causes:
- `pywebview.create_file_dialog` → deadlock via `BlockingQueuedConnection` → force close
- `QFileDialog` via `QTimer.singleShot` → no effect, because non-QThread background threads have no Qt event loop

**Solution:** Use `tkinter.filedialog` — tkinter uses its own Tcl/Tk interpreter, completely separate from Qt. `filedialog.asksaveasfilename()` blocks the calling background thread until the user responds. Already available in the pixi environment (no extra dependency needed).
See [`_native_save_dialog()`](src/blockly_app/blockly_app/app.py:29) in `app.py`.

### pywebview shows "GTK cannot be loaded"

**Symptom:** Warning about `ModuleNotFoundError: No module named 'gi'` followed by "Using Qt 5.15".

**Impact:** This is **informational only**. pywebview tries GTK first, falls back to Qt (which is installed via `pyqtwebengine`). The application works correctly with the Qt backend.

---
