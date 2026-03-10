# Installation & Running the Project

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
    │   ├── action/
    │   │   └── BlocklyAction.action            # Single action for all instructions
    │   └── msg/
    │       ├── GpioWrite.msg                   # Digital output command (pin + state)
    │       └── GpioRead.msg                    # Digital input state (pin + state)
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
    │   │   │   ├── hardware.py                 # Hardware context (dummy/real mode)
    │   │   │   ├── gpio.py                     # @handler("digital_out"), @handler("digital_in")
    │   │   │   └── timing.py                   # @handler("delay")
    │   │   └── utils.py                        # parse_params and helpers
    │   └── test/                               # Integration test suite
    │       ├── __init__.py
    │       ├── conftest.py                     # Shared fixtures: ros_context, exe_action
    │       ├── test_block_gpio.py              # digital_out + digital_in tests
    │       └── test_block_delay.py
    │
    ├── gpio_node/                              # ROS2 GPIO node for Raspberry Pi (ament_python)
    │   ├── package.xml
    │   ├── setup.py
    │   ├── setup.cfg
    │   ├── resource/gpio_node                  # Ament index marker
    │   └── gpio_node/                          # Python module
    │       ├── __init__.py
    │       └── gpio_node.py                    # ROS2 node: gpiod digital I/O
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
                    │   ├── digitalOut.js       # Digital output (GPIO HIGH/LOW)
                    │   ├── digitalIn.js        # Digital input (read pin state)
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

The executor does NOT run on the Raspberry Pi directly. In real hardware mode, handlers create ROS2 publishers/subscribers that communicate with hardware nodes (e.g. `gpio_node`) running on the Pi.

### 5.3 Running the GPIO Node (Raspberry Pi)

```bash
# On Raspberry Pi: start GPIO node with default pin configuration
pixi run gpio-node

# Custom pins via ROS2 parameters
pixi run gpio-node -- --ros-args -p output_pins:=[17,27] -p input_pins:=[5,6]
```

The GPIO node requires `gpiod` (auto-installed on `linux-aarch64`). On x86 dev machines it runs in simulation mode (log only).

The executor logs all received goals and their results to the terminal.

### 5.3 Running the Test Suite

The executor must be running in a separate terminal before starting tests:

```bash
# Terminal 1: Start executor
pixi run executor

# Terminal 2: Run all tests
pixi run test

# Run a specific test file
pixi run test -- src/blockly_executor/test/test_block_gpio.py -v

# Run a single test function
pixi run test -- src/blockly_executor/test/test_block_gpio.py::test_digital_out_high -v
```

If the executor is not running, tests are **skipped** with an informative message rather than failing with a cryptic timeout error.

---
