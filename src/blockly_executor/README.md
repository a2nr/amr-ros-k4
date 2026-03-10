# blockly_executor — File Reference & Testing Guide

### 6.2 Executor Layer — `blockly_executor`

#### [`blockly_executor/executor_node.py`](blockly_executor/executor_node.py) — ROS2 Action Server

**Purpose:** Thin ROS2 wrapper that receives `BlocklyAction` goals, delegates to `HandlerRegistry`, and returns results.

| Component | Description |
|---|---|
| [`ExecutorNode.__init__()`](blockly_executor/executor_node.py:27) | Creates the Action Server on topic `execute_blockly_action`. Reads ROS2 parameter `use_real_hardware` (bool, default `False`) to select Hardware mode (dummy or real). |
| [`_goal_callback()`](blockly_executor/executor_node.py:47) | Always returns `GoalResponse.ACCEPT` |
| [`_execute_callback(goal_handle)`](blockly_executor/executor_node.py:57) | Publishes "executing" feedback, calls `HandlerRegistry.execute()`, catches exceptions, always calls `goal_handle.succeed()` |
| [`main()`](blockly_executor/executor_node.py:117) | Entry point: `rclpy.init()` → `ExecutorNode()` → `rclpy.spin(node)` |

**Important design decision:** The execute callback always calls `goal_handle.succeed()` regardless of whether the command succeeded or failed. The `result.success` and `result.message` fields communicate command-level outcome. Using `goal_handle.abort()` causes result delivery failures with `rmw_fastrtps_cpp`.

#### [`blockly_executor/handlers/`](blockly_executor/handlers/__init__.py) — Decorator-Based Command Handlers

**Purpose:** Maps command names to handler functions using `@handler` decorator and auto-discovery. Mirrors the JS frontend's `BlockRegistry.register()` pattern.

```
handlers/
├── __init__.py     # @handler decorator, auto-discovery, HandlerRegistry
├── hardware.py     # Hardware context class (dummy/real mode)
├── gpio.py         # @handler("digital_out"), @handler("digital_in")
└── timing.py       # @handler("delay")
```

**`@handler` decorator** — each handler is a plain function:

```python
from . import handler
from .hardware import Hardware

@handler("digital_out")
def handle_digital_out(params: dict[str, str], hardware: Hardware) -> tuple[bool, str]:
    gpio = int(params["gpio"])
    state_raw = str(params["state"]).lower()
    state = state_raw in ("true", "1", "high")
    hardware.log(f"set_digital_out(gpio={gpio}, state={state})")
    return (True, f"GPIO pin {gpio} set to {'HIGH' if state else 'LOW'}")
```

**Auto-discovery:** On `HandlerRegistry.__init__`, all `.py` files in `handlers/` are imported automatically. The `@handler` decorator collects `(command, function)` pairs, and the registry binds `hardware` to each function. No manual imports or module lists needed.

**HandlerRegistry** ([`handlers/__init__.py`](blockly_executor/handlers/__init__.py)):

| Method | Description |
|---|---|
| `HandlerRegistry.__init__(hardware)` | Auto-discovers handler modules, binds hardware to all `@handler` functions |
| `execute(command, params)` | Looks up handler by name, returns `(False, "Unknown command: ...")` if not found |

**Adding a new handler:** Create `handlers/<name>.py`, use `@handler("command")`. That's it — no other files to edit.

#### [`blockly_executor/utils.py`](blockly_executor/utils.py) — Utility Functions

| Function | Description |
|---|---|
| [`parse_params(keys, values)`](blockly_executor/utils.py:4) | Converts two parallel arrays into a `dict`. Raises `ValueError` if lengths differ. |

#### [`blockly_executor/handlers/hardware.py`](blockly_executor/handlers/hardware.py) — Hardware Context

Unified `Hardware` class that provides mode-aware context to all handlers. Handlers check `hardware.is_real()` to decide between dummy (logging) and real (ROS2 publish) behavior.

| Attribute/Method | Description |
|---|---|
| `mode: str` | `"dummy"` for testing/dev, `"real"` for actual hardware |
| `node: Node` | ROS2 Node instance (only available when `mode="real"`) |
| `call_log: list[str]` | Log of all hardware actions for testing/debugging |
| `is_real() -> bool` | Returns `True` if running in real hardware mode |
| `log(message: str)` | Appends message to `call_log` |

In real mode, handlers create ROS2 publishers/subscribers lazily on `hardware.node` to communicate with hardware nodes (e.g. `gpio_node`) running on the Raspberry Pi.

### 6.3 ROS2 Interfaces — `blockly_interfaces`

#### [`blockly_interfaces/action/BlocklyAction.action`](../blockly_interfaces/action/BlocklyAction.action)

The single ROS2 action interface used for all commands. See [Section 2.3](../../docs/architecture.md#23-ros2-interface-contract) for the full definition.

Built by `pixi run build-interfaces` using colcon. The generated Python module is importable as:

```python
from blockly_interfaces.action import BlocklyAction
```

---

### 6.4 Test Suite

Tests are located at [`src/blockly_executor/test/`](test/conftest.py).

#### [`test/conftest.py`](test/conftest.py) — Shared Test Fixtures

See [Section 9.2](#92-conftestpy--shared-fixtures) for detailed explanation.

#### [`test/test_block_gpio.py`](test/test_block_gpio.py)

Tests for `digital_out` and `digital_in` commands: happy path (HIGH/LOW), feedback verification, missing parameter failure, and numeric return value for digital_in.

#### [`test/test_block_delay.py`](test/test_block_delay.py)

Tests for the `delay` command including timing verification (±100ms tolerance).

### 6.5 Configuration Files

#### [`pixi.toml`](../../pixi.toml) — Environment & Task Definitions

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
| `build-gpio` | `colcon build --symlink-install --packages-select gpio_node` | `build-interfaces` |
| `gpio-node` | `source install/setup.bash && ros2 run gpio_node gpio_node` | `build-gpio` |
| `app` | `source install/setup.bash && python -m blockly_app.app` | `build-app` |
| `test` | `source install/setup.bash && pytest src/blockly_executor/test/ -v` | `build-interfaces` |
| `setup-ui` | Downloads Blockly via npm and copies to `src/blockly_app/blockly_app/ui/vendor/` | — |

---

---

## 9. Testing

### 9.1 Testing Philosophy

All tests are **integration tests** that communicate through the real ROS2 Action interface — not unit tests that call internal functions directly. This provides high confidence because the test exercises the exact same communication path as the real application.

**Key architectural decisions:**

- **Executor runs as a separate process** — eliminates race conditions from two threads competing for rclpy's global context
- **`Hardware(mode="dummy")`** isolates physical hardware — tests run on any laptop without a Raspberry Pi
- **Real ROS2 nodes** are used during tests — ROS2 code is verified, not just Python logic
- **One file per block group** — all GPIO scenarios live in `test_block_gpio.py`

### 9.2 `conftest.py` — Shared Fixtures

[`test/conftest.py`](test/conftest.py) provides two fixtures:

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
pixi run test -- src/blockly_executor/test/test_block_gpio.py -v

# Single test
pixi run test -- src/blockly_executor/test/test_block_gpio.py::test_digital_out_high -v
```

---
