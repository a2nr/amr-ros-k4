# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-08

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Workspace Restructuring Plan](#2-workspace-restructuring-plan)
  - [2.1 Current Structure — Issues](#21-current-structure--issues)
  - [2.2 Target Structure — ROS2 Standard](#22-target-structure--ros2-standard)
  - [2.3 Package Mapping — Old to New](#23-package-mapping--old-to-new)
  - [2.4 File-Level Migration Map](#24-file-level-migration-map)
- [3. Task Progress](#3-task-progress)
  - [3.1 Phase 1 — Restructure Workspace Layout](#31-phase-1--restructure-workspace-layout)
  - [3.2 Phase 2 — Add Missing ROS2 Scaffolding](#32-phase-2--add-missing-ros2-scaffolding)
  - [3.3 Phase 3 — Update Imports and References](#33-phase-3--update-imports-and-references)
  - [3.4 Phase 4 — Verification](#34-phase-4--verification)
- [4. Guide: Adding a New ROS2 Package](#4-guide-adding-a-new-ros2-package)
  - [4.1 Python Package Template](#41-python-package-template)
  - [4.2 Steps to Add a New Package](#42-steps-to-add-a-new-package)
  - [4.3 Example: Adding a Controller Package](#43-example-adding-a-controller-package)
- [5. Development Potential — Future Roadmap](#5-development-potential--future-roadmap)

---

## 1. Project Overview

This workspace implements a **Blockly-based visual programming interface** for controlling a ROS2-powered robot. The system architecture has three layers:

- **blockly_app** — Desktop GUI with Blockly editor, connected to ROS2 via pywebview bridge
- **blockly_executor** — ROS2 Action Server that receives commands and executes them through a handler registry
- **blockly_interfaces** — Custom ROS2 action message definitions

The robot platform target is a **Kiwi Wheel drive AMR** (Autonomous Mobile Robot) with plans for adaptive control.

---

## 2. Workspace Restructuring Plan

### 2.1 Current Structure — Issues

```
amr-ros-k4/                     # CURRENT — NOT ROS2 standard
├── app/                         # ⚠ Not a ROS2 package, no package.xml
│   ├── __init__.py
│   ├── app.py
│   └── ui/
├── executor/                    # ⚠ Missing setup.cfg, resource/
│   ├── __init__.py              # ⚠ Misleading root-level __init__.py
│   ├── package.xml
│   ├── setup.py
│   └── executor/
├── interfaces/                  # ⚠ Generic name, no project prefix
│   ├── CMakeLists.txt
│   ├── package.xml
│   └── action/
├── tests/                       # ⚠ Outside any package
├── pixi.toml
└── DOCUMENTATION.md
```

| # | Issue | Impact |
|---|-------|--------|
| 1 | No `src/` directory | colcon cannot cleanly isolate source from build artifacts |
| 2 | Missing `setup.cfg` in executor | ament_python install destinations not configured |
| 3 | Missing `resource/` marker in executor | ament index cannot discover the package |
| 4 | Generic package names `executor`, `interfaces` | Name collision risk, not descriptive |
| 5 | Misleading `executor/__init__.py` at root | Confuses Python import resolution |
| 6 | `app/` lacks ROS2 package structure | Not managed by colcon, manual path handling |
| 7 | `tests/` at workspace root | Not associated with any package, not run by colcon test |

### 2.2 Target Structure — ROS2 Standard

```
amr-ros-k4/                              # Workspace root
├── .gitignore
├── DOCUMENTATION.md
├── PROJECT_MANAGEMENT.md
├── pixi.toml
├── pixi.lock
│
└── src/                                  # All ROS2 packages
    ├── blockly_app/                      # Desktop GUI — ament_python
    │   ├── package.xml
    │   ├── setup.py
    │   ├── setup.cfg
    │   ├── resource/
    │   │   └── blockly_app               # Empty ament index marker
    │   ├── blockly_app/                  # Python module
    │   │   ├── __init__.py
    │   │   ├── app.py
    │   │   └── ui/                       # Frontend assets (inside module for build inclusion)
    │   │       ├── index.html
    │   │       └── blockly/
    │   │           ├── core/
    │   │           │   ├── registry.js       # BlockRegistry + toolbox builder
    │   │           │   ├── breakpoints.js    # Breakpoint state and toggle logic
    │   │           │   ├── bridge.js         # executeAction — pywebview bridge
    │   │           │   ├── debug-engine.js   # Run, debug, step, stop logic
    │   │           │   └── ui-controls.js    # Button states, highlight, callbacks
    │   │           ├── blocks/
    │   │           │   ├── manifest.js       # BLOCK_FILES array — only file to edit
    │   │           │   ├── led_on.js         # Self-contained block: definition + generator
    │   │           │   ├── led_off.js
    │   │           │   └── delay.js
    │   │           ├── loader.js             # Dynamic script loader from manifest
    │   │           └── workspace-init.js     # Builds toolbox from registry, injects workspace
    │
    ├── blockly_executor/                 # Action Server — ament_python
    │   ├── package.xml
    │   ├── setup.py
    │   ├── setup.cfg
    │   ├── resource/
    │   │   └── blockly_executor          # Empty ament index marker
    │   ├── blockly_executor/             # Python module
    │   │   ├── __init__.py
    │   │   ├── executor_node.py
    │   │   ├── handlers.py
    │   │   ├── utils.py
    │   │   └── hardware/
    │   │       ├── __init__.py
    │   │       ├── dummy_hardware.py
    │   │       ├── gpio_hardware.py
    │   │       └── interface.py
    │   └── test/                         # Package tests
    │       ├── __init__.py
    │       ├── conftest.py
    │       ├── test_block_delay.py
    │       ├── test_block_led_off.py
    │       └── test_block_led_on.py
    │
    └── blockly_interfaces/               # Custom messages — ament_cmake
        ├── CMakeLists.txt
        ├── package.xml
        └── action/
            └── BlocklyAction.action
```

### 2.3 Package Mapping — Old to New

| Old Name | New Name | Type | Notes |
|----------|----------|------|-------|
| `app/` | `src/blockly_app/` | ament_python | New ROS2 package with full scaffolding |
| `executor/` | `src/blockly_executor/` | ament_python | Renamed + added setup.cfg, resource/ |
| `interfaces/` | `src/blockly_interfaces/` | ament_cmake | Renamed, update CMakeLists project name |
| `tests/` | `src/blockly_executor/test/` | — | Moved into executor package |

### 2.4 Blockly JS Restructuring — Auto-Discovery Architecture

The monolithic `blocks.js` and `executor.js` will be split into per-block files with auto-loading and auto-generated toolbox.

**Current** — 2 monolithic files, each block split across both:
```
ui/blockly/
├── blocks.js          # All block visual definitions + breakpoint logic
└── executor.js        # All code generators + debug engine + UI controls
```

**Target** — modular, auto-discovered:
```
ui/blockly/
├── core/                       # Shared infrastructure — rarely touched
│   ├── registry.js             # BlockRegistry — register + auto-toolbox builder
│   ├── breakpoints.js          # Breakpoint state, colors, toggle
│   ├── bridge.js               # executeAction — pywebview bridge
│   ├── debug-engine.js         # debugState, runProgram, runDebug, step*, stop
│   └── ui-controls.js          # Button states, onRunClick, onDebugToggle
│
├── blocks/                     # One file per block — self-contained
│   ├── manifest.js             # BLOCK_FILES array — the ONLY file to edit
│   ├── led_on.js               # BlockRegistry.register — definition + generator
│   ├── led_off.js
│   └── delay.js
│
├── loader.js                   # Dynamic script loader — reads manifest
└── workspace-init.js           # Builds toolbox from registry, injects workspace
```

**BlockRegistry pattern** — each block file calls:
```js
BlockRegistry.register({
  name: 'led_on',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#4CAF50',
  tooltip: 'Turn on LED at the specified GPIO pin',
  definition: { init: function() { /* Blockly visual definition */ } },
  generator: function(block) { /* code generator */ }
});
```

**Auto-toolbox flow**:
1. Each block file calls `BlockRegistry.register()` with `name`, `category`, `color`, `definition`, `generator`
2. `workspace-init.js` calls `BlockRegistry.getToolboxJSON()` to build the toolbox config
3. Built-in Blockly categories — Logic, Loops, Math, Variables — are appended as static config
4. Workspace is injected with the combined toolbox — no XML in `index.html`

**Script loading order** in `index.html` — fixed, never needs changing:
```
1. Blockly vendor libs
2. core/registry.js → core/breakpoints.js → core/bridge.js → core/debug-engine.js → core/ui-controls.js
3. blocks/manifest.js
4. loader.js
5. <script> loadAllBlocks().then(() => initWorkspace()) </script>
```

**Adding a new block — 2 steps only**:
1. Create `blocks/<name>.js` — call `BlockRegistry.register({...})`
2. Add `'<name>.js'` to `blocks/manifest.js`

No `index.html` changes. No core file changes. No toolbox XML editing.

### 2.5 File-Level Migration Map

| Old Path | New Path | Action |
|----------|----------|--------|
| `app/__init__.py` | `src/blockly_app/blockly_app/__init__.py` | Move |
| `app/app.py` | `src/blockly_app/blockly_app/app.py` | Move + update imports |
| `app/ui/index.html` | `src/blockly_app/ui/index.html` | Move + rewrite script tags |
| `app/ui/blockly/blocks.js` | Split → `ui/blockly/core/*.js` + `ui/blockly/blocks/*.js` | Split + rewrite |
| `app/ui/blockly/executor.js` | Split → `ui/blockly/core/*.js` + `ui/blockly/blocks/*.js` | Split + rewrite |
| — | `src/blockly_app/ui/blockly/core/registry.js` | Create new |
| — | `src/blockly_app/ui/blockly/core/breakpoints.js` | Create new |
| — | `src/blockly_app/ui/blockly/core/bridge.js` | Create new |
| — | `src/blockly_app/ui/blockly/core/debug-engine.js` | Create new |
| — | `src/blockly_app/ui/blockly/core/ui-controls.js` | Create new |
| — | `src/blockly_app/ui/blockly/blocks/manifest.js` | Create new |
| — | `src/blockly_app/ui/blockly/blocks/led_on.js` | Create new |
| — | `src/blockly_app/ui/blockly/blocks/led_off.js` | Create new |
| — | `src/blockly_app/ui/blockly/blocks/delay.js` | Create new |
| — | `src/blockly_app/ui/blockly/loader.js` | Create new |
| — | `src/blockly_app/ui/blockly/workspace-init.js` | Create new |
| — | `src/blockly_app/package.xml` | Create new |
| — | `src/blockly_app/setup.py` | Create new |
| — | `src/blockly_app/setup.cfg` | Create new |
| — | `src/blockly_app/resource/blockly_app` | Create new empty file |
| `executor/executor/**` | `src/blockly_executor/blockly_executor/**` | Move + update imports |
| `executor/package.xml` | `src/blockly_executor/package.xml` | Move + update name |
| `executor/setup.py` | `src/blockly_executor/setup.py` | Move + update name/entry_points |
| — | `src/blockly_executor/setup.cfg` | Create new |
| — | `src/blockly_executor/resource/blockly_executor` | Create new empty file |
| `executor/__init__.py` | — | **Delete** — no longer needed |
| `interfaces/CMakeLists.txt` | `src/blockly_interfaces/CMakeLists.txt` | Move + update project name |
| `interfaces/package.xml` | `src/blockly_interfaces/package.xml` | Move + update name |
| `interfaces/action/**` | `src/blockly_interfaces/action/**` | Move |
| `tests/**` | `src/blockly_executor/test/**` | Move + update imports |

---

## 3. Task Progress

### 3.1 Phase 1 — Restructure Workspace Layout ✅

- [x] Create `src/` directory
- [x] Create `src/blockly_app/`, `src/blockly_executor/`, `src/blockly_interfaces/` directories
- [x] Move `app/` contents → `src/blockly_app/`
- [x] Move `executor/executor/` contents → `src/blockly_executor/blockly_executor/`
- [x] Move `interfaces/` contents → `src/blockly_interfaces/`
- [x] Move `tests/` → `src/blockly_executor/test/`
- [x] Delete old empty directories: `app/`, `executor/`, `interfaces/`, `tests/`

### 3.2 Phase 2 — Add Missing ROS2 Scaffolding ✅

- [x] Create `src/blockly_app/package.xml`
- [x] Create `src/blockly_app/setup.py`
- [x] Create `src/blockly_app/setup.cfg`
- [x] Create `src/blockly_app/resource/blockly_app` (empty marker)
- [x] Create `src/blockly_executor/setup.cfg`
- [x] Create `src/blockly_executor/resource/blockly_executor` (empty marker)
- [x] Update `src/blockly_executor/package.xml` — change name to `blockly_executor`
- [x] Update `src/blockly_executor/setup.py` — change package name, entry_points, find_packages
- [x] Update `src/blockly_interfaces/CMakeLists.txt` — change project name to `blockly_interfaces`
- [x] Update `src/blockly_interfaces/package.xml` — change name to `blockly_interfaces`

### 3.3 Phase 3 — Blockly JS Modularization ✅

- [x] Create `core/registry.js` — BlockRegistry with register(), getToolboxJSON()
- [x] Create `core/breakpoints.js` — extract from blocks.js
- [x] Create `core/bridge.js` — extract executeAction() from executor.js
- [x] Create `core/debug-engine.js` — extract debug logic from executor.js
- [x] Create `core/ui-controls.js` — extract UI control functions from executor.js
- [x] Create `blocks/manifest.js` — BLOCK_FILES array
- [x] Create `blocks/led_on.js` — self-contained block with BlockRegistry.register()
- [x] Create `blocks/led_off.js` — self-contained block with BlockRegistry.register()
- [x] Create `blocks/delay.js` — self-contained block with BlockRegistry.register()
- [x] Create `loader.js` — dynamic script loader
- [x] Create `workspace-init.js` — workspace initialization with auto-toolbox
- [x] Rewrite `index.html` — remove toolbox XML, update script tags, use loadAllBlocks()
- [x] Delete old `blocks.js` and `executor.js`

### 3.4 Phase 4 — Update Imports and References ✅

- [x] Update `blockly_executor/executor_node.py` — `from interfaces.action` → `from blockly_interfaces.action`
- [x] Update `blockly_app/app.py` — `from interfaces.action` → `from blockly_interfaces.action`
- [x] Update `blockly_app/app.py` — UI path resolution for new directory layout
- [x] Update `blockly_executor/handlers.py` — internal imports (unchanged, relative imports still work)
- [x] Update `blockly_executor/hardware/__init__.py` — internal imports (unchanged, relative imports still work)
- [x] Update test files — `from interfaces.action` → `from blockly_interfaces.action`
- [x] Update `pixi.toml` — all task commands to use new paths and package names
- [x] Update `.gitignore` — added `.pytest_cache/`

### 3.5 Phase 5 — Verification ✅

- [x] Run `colcon build` — all three packages build successfully (blockly_interfaces, blockly_executor, blockly_app)
- [x] Verify Python imports work — `from blockly_interfaces.action import BlocklyAction` ✓
- [x] Verify Python imports work — `from blockly_executor.executor_node import ExecutorNode` ✓
- [x] `ros2 pkg list` — all 3 packages discovered: blockly_app, blockly_executor, blockly_interfaces ✓
- [x] `ros2 interface show blockly_interfaces/action/BlocklyAction` — action definition correct ✓
- [x] `ros2 pkg executables blockly_executor` → executor_node ✓
- [x] `ros2 pkg executables blockly_app` → blockly_app ✓
- [x] Run `pixi run setup-ui` to install Blockly vendor files into new location
- [x] Verify Blockly UI loads correctly — blocks appear in toolbox, run/debug works
- [ ] Update `DOCUMENTATION.md` — reflect new directory structure, package names, and block auto-discovery

---

## 4. Guide: Adding a New ROS2 Package

This section documents the standard process for adding new packages to this workspace, ensuring consistency and ROS2 compliance.

### 4.1 Python Package Template

Every new `ament_python` package under `src/` must have this minimal structure:

```
src/<package_name>/
├── package.xml                 # ROS2 package manifest
├── setup.py                    # Python package setup
├── setup.cfg                   # ament install config
├── resource/
│   └── <package_name>          # Empty file — ament index marker
├── <package_name>/             # Python module — same name as package
│   ├── __init__.py
│   └── <your_node>.py
└── test/                       # Package tests
    ├── __init__.py
    └── test_<feature>.py
```

**setup.cfg template:**
```ini
[develop]
script_dir=$base/lib/<package_name>
[install]
install_scripts=$base/lib/<package_name>
```

**package.xml template:**
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
  <!-- Add other dependencies here -->

  <test_depend>pytest</test_depend>

  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
```

**setup.py template:**
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

### 4.2 Steps to Add a New Package

1. **Create directory**: `mkdir -p src/<package_name>/<package_name>`
2. **Copy templates**: Create `package.xml`, `setup.py`, `setup.cfg` from templates above
3. **Create ament marker**: `mkdir -p src/<package_name>/resource && touch src/<package_name>/resource/<package_name>`
4. **Create Python module**: Add `__init__.py` and node files under `src/<package_name>/<package_name>/`
5. **Add dependencies**: Update `package.xml` with `<depend>` tags for any packages this node needs
6. **Register in pixi.toml**: Add build/run tasks for the new package
7. **Build**: `colcon build --symlink-install --packages-select <package_name>`
8. **Test**: `colcon test --packages-select <package_name>`

### 4.3 Example: Adding a Controller Package

When the time comes to add the Kiwi Wheel controller, the structure would be:

```
src/kiwi_controller/
├── package.xml                 # depends on rclpy, geometry_msgs, etc.
├── setup.py
├── setup.cfg
├── resource/
│   └── kiwi_controller
├── kiwi_controller/
│   ├── __init__.py
│   ├── controller_node.py      # Adaptive controller logic
│   ├── kinematics.py           # Kiwi wheel inverse/forward kinematics
│   └── hardware/
│       └── motor_driver.py     # Motor communication
└── test/
    ├── __init__.py
    └── test_kinematics.py
```

And a corresponding `pixi.toml` task:

```toml
[tasks]
controller = { cmd = "bash -c 'source install/setup.bash && ros2 run kiwi_controller controller_node'", depends-on = ["build-interfaces"] }
```

---

## 5. Guide: Adding a New Blockly Block

After the restructuring, adding a new robot command block follows a streamlined 3-file pattern.

### 5.1 Overview — 3 Files to Touch

| # | File | Purpose |
|---|------|---------|
| 1 | `ui/blockly/blocks/<name>.js` | **Create** — block visual definition + code generator |
| 2 | `ui/blockly/blocks/manifest.js` | **Edit** — add filename to BLOCK_FILES array |
| 3 | `blockly_executor/handlers.py` | **Edit** — add Python handler for the command |

Optionally:
- Add a test file in `blockly_executor/test/test_block_<name>.py`

### 5.2 Block Types and Templates

There are 3 main block patterns for different use cases:

| Pattern | Shape | Use Case | Example |
|---------|-------|----------|---------|
| **Statement block** | Flat with top/bottom connectors | Perform an action/command | `led_on`, `delay`, `motor_stop` |
| **Output block** | Left plug, no top/bottom | Return a value from sensor | `read_distance`, `read_temperature` |
| **Input block** | Has sockets for other blocks | Accept dynamic values | `move_to(x, y)` where x/y come from sensors |

#### Template A — Statement Block (action command)

Use for blocks that **do something** and don't return a value.
Shape: connects vertically, top-to-bottom.

Create `ui/blockly/blocks/<name>.js`:

```js
BlockRegistry.register({
  // ─── Identity ────────────────────────────────────────────
  name: 'led_on',              // Unique ID — must match Python handler name

  // ─── Toolbox Placement ───────────────────────────────────
  category: 'Robot',           // Toolbox category — same name = same group
  categoryColor: '#5b80a5',    // Sidebar color of the category tab

  // ─── Appearance ──────────────────────────────────────────
  color: '#4CAF50',            // Block body color
  tooltip: 'Turn on LED at the specified GPIO pin',

  // ─── Visual Definition ───────────────────────────────────
  // Defines how the block looks in the Blockly editor.
  definition: {
    init: function () {
      // appendDummyInput: adds a row with NO pluggable input socket.
      // Good for blocks where all values are inline fields.
      this.appendDummyInput()
        .appendField('LED ON  pin')     // Static text label

        // FieldNumber(default, min, max, step) — editable number.
        // 'PIN' is the key used by generator to read the value.
        //
        // Other field types:
        //   new Blockly.FieldTextInput('hello')                — free text
        //   new Blockly.FieldDropdown([['High','1'],['Low','0']]) — dropdown
        //   new Blockly.FieldCheckbox('TRUE')                  — checkbox
        //   new Blockly.FieldColour('#ff0000')                 — color picker
        //   new Blockly.FieldAngle(90)                         — angle dial
        .appendField(new Blockly.FieldNumber(1, 0, 40, 1), 'PIN');

      // setPreviousStatement(true): allows blocks to connect ABOVE this one.
      // setNextStatement(true): allows blocks to connect BELOW this one.
      // Together: this block chains vertically like LEGO bricks.
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);

      this.setColour('#4CAF50');
      this.setTooltip('Turn on LED at the specified GPIO pin');
    }
  },

  // ─── Code Generator ──────────────────────────────────────
  // Returns a STRING of JavaScript code.
  // This code runs inside an async eval() at runtime.
  generator: function (block) {
    const pin = block.getFieldValue('PIN');  // Read value from editor

    // highlightBlock — visually highlights current block during execution
    // executeAction — sends ROS2 action goal via pywebview bridge, awaits result
    //   arg1 = command name (must match Python handler)
    //   arg2 = params dict (keys must match what handler expects)
    return (
      'highlightBlock(\'' + block.id + '\');\n' +
      'await executeAction(\'led_on\', { pin: \'' + pin + '\' });\n'
    );
  }
});
```

#### Template B — Output Block (sensor value)

Use for blocks that **return a value** — e.g., reading a sensor.
Shape: has a left plug (output connector), no top/bottom connectors.
Can be plugged into other blocks' input sockets.

```js
BlockRegistry.register({
  name: 'read_distance',
  category: 'Sensors',
  categoryColor: '#a5745b',
  color: '#E91E63',
  tooltip: 'Read distance from ultrasonic sensor in cm',

  // ─── outputType tells the registry what type this block produces.
  // This is used by Blockly to validate connections.
  // Common types: 'Number', 'String', 'Boolean', null (any type)
  outputType: 'Number',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('Distance sensor')
        .appendField(new Blockly.FieldDropdown([
          ['Front', 'front'],
          ['Left', 'left'],
          ['Right', 'right'],
        ]), 'SENSOR_ID');

      // setOutput(true, type) — makes this block produce a VALUE.
      // The block gets a left-side plug instead of top/bottom connectors.
      // 'Number' means it can only connect to inputs expecting a number.
      // Use null to allow connecting to any input type.
      this.setOutput(true, 'Number');

      // NOTE: Do NOT set setPreviousStatement/setNextStatement
      // on output blocks — they are value producers, not action steps.

      this.setColour('#E91E63');
      this.setTooltip('Read distance from ultrasonic sensor in cm');
    }
  },

  // ─── Code Generator for Output Blocks ────────────────────
  // IMPORTANT: Returns an ARRAY [code, order] instead of a string.
  //   code  — JavaScript expression that evaluates to a value
  //   order — operator precedence (prevents incorrect parenthesization)
  //
  // Common ORDER values:
  //   javascript.Order.ATOMIC       — tightest binding (literals, function calls)
  //   javascript.Order.FUNCTION_CALL — function call
  //   javascript.Order.NONE         — loosest binding
  generator: function (block) {
    const sensorId = block.getFieldValue('SENSOR_ID');

    // The generated code is an EXPRESSION, not a statement.
    // It will be inserted wherever this block is plugged in.
    // executeAction returns {success, message} — we parse the numeric value.
    const code =
      '(await executeAction(\'read_distance\', { sensor_id: \'' + sensorId + '\' })).message';

    // Return [code, ORDER] — ARRAY, not just a string.
    return [code, javascript.Order.AWAIT];
  }
});
```

#### Template C — Block with Value Inputs (accepts other blocks)

Use when a block's parameter should come from **another block's output**
— e.g., `move_to(x, y)` where x/y come from sensor blocks or math blocks.
Shape: has input sockets where output blocks can plug in.

```js
BlockRegistry.register({
  name: 'move_to',
  category: 'Navigation',
  categoryColor: '#5ba55b',
  color: '#00BCD4',
  tooltip: 'Move robot to target X and Y coordinates',

  definition: {
    init: function () {
      // appendValueInput('X') — creates an INPUT SOCKET named 'X'.
      // Other blocks with setOutput() can plug into this socket.
      // .setCheck('Number') restricts to number-type blocks only.
      this.appendValueInput('X')
        .setCheck('Number')                    // Only accept Number blocks
        .appendField('Move to X');

      this.appendValueInput('Y')
        .setCheck('Number')
        .appendField('Y');

      // setInputsInline(true) — makes inputs appear side-by-side
      // instead of stacked vertically. Better for short inputs.
      this.setInputsInline(true);

      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Move robot to target X and Y coordinates');
    }
  },

  generator: function (block) {
    // valueToCode() reads the code generated by the block plugged into
    // the 'X' input socket. If nothing is plugged in, returns '0'.
    // The third argument is the operator precedence for parenthesization.
    const x = javascript.javascriptGenerator.valueToCode(
      block, 'X', javascript.Order.ATOMIC
    ) || '0';
    const y = javascript.javascriptGenerator.valueToCode(
      block, 'Y', javascript.Order.ATOMIC
    ) || '0';

    return (
      'highlightBlock(\'' + block.id + '\');\n' +
      'await executeAction(\'move_to\', { x: \'' + x + '\', y: \'' + y + '\' });\n'
    );
  }
});
```

#### Quick Reference: Blockly Field Types

| Field Type | Code | Use Case |
|------------|------|----------|
| Number | `new Blockly.FieldNumber(default, min, max, step)` | Pin number, duration, speed |
| Text | `new Blockly.FieldTextInput('default')` | Custom labels, names |
| Dropdown | `new Blockly.FieldDropdown([['Label','value'], ...])` | Sensor selection, direction |
| Checkbox | `new Blockly.FieldCheckbox('TRUE')` | On/off toggle |
| Color | `new Blockly.FieldColour('#ff0000')` | LED color picker |
| Angle | `new Blockly.FieldAngle(90)` | Rotation angle with dial |
| Image | `new Blockly.FieldImage('url', width, height)` | Icon on block |

#### Quick Reference: Block Connection Types

| Method | Effect | When to use |
|--------|--------|-------------|
| `setPreviousStatement(true)` + `setNextStatement(true)` | Stackable block — chains vertically | Action/command blocks |
| `setOutput(true, type)` | Output plug — returns a value | Sensor/calculation blocks |
| `appendDummyInput()` | Row with only inline fields | Simple blocks with fixed fields |
| `appendValueInput('NAME')` | Input socket — accepts output blocks | Blocks that take dynamic values |
| `appendStatementInput('DO')` | Statement socket — accepts block stack | Container blocks like loops, if-then |

### 5.3 Register in Manifest

Add to `ui/blockly/blocks/manifest.js`:
```js
const BLOCK_FILES = [
  'led_on.js',
  'led_off.js',
  'delay.js',
  'NEW_BLOCK.js',    // ← add here
];
```

### 5.4 Add Python Handler

In `blockly_executor/handlers.py`, register the handler:
```python
def _register_default_handlers(self) -> None:
    # ... existing handlers ...
    self.register('BLOCK_NAME', self._handle_block_name)

def _handle_block_name(self, params: dict[str, str]) -> tuple[bool, str]:
    value = params['param_key']
    # Implement hardware interaction
    return (True, f'Block executed with {value}')
```

---

## 6. Development Potential — Future Roadmap

### Planned Packages

| Package | Purpose | Status |
|---------|---------|--------|
| `blockly_app` | Desktop Blockly GUI + Action Client | ✅ Exists — restructuring |
| `blockly_executor` | Action Server — command handler registry | ✅ Exists — restructuring |
| `blockly_interfaces` | Custom ROS2 action definitions | ✅ Exists — restructuring |
| `kiwi_controller` | Adaptive control for Kiwi Wheel drive | 📋 Planned |

### Potential Enhancements

- **New Blockly blocks**: With auto-discovery architecture, each new block = 1 JS file + 1 manifest entry + 1 Python handler. No core file changes needed.
- **Launch files**: Create a `blockly_bringup` package with ROS2 launch files to start all nodes with a single command
- **Parameter server**: Use ROS2 parameters for configurable values like GPIO pin mappings, control loop rates
- **Sensor integration**: Add subscriber nodes for sensor data that can feed back into Blockly's visual feedback
- **Web-based UI**: Replace pywebview with a web server mode for remote access from any browser
- **ROS2 lifecycle nodes**: Migrate executor and controller to lifecycle nodes for managed state transitions
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: The auto-toolbox supports multiple categories — future blocks can be grouped into Robot, Sensors, Navigation, etc.

---

*This document is maintained as part of the project management process. Update task checkboxes as work progresses.*
