# blockly_app — File Reference

### 6.1 Application Layer — `blockly_app`

#### [`blockly_app/app.py`](blockly_app/app.py) — Application Entry Point

**Purpose:** Combines pywebview (desktop UI) with a ROS2 Action Client. This is the bridge between the JavaScript Blockly runtime and the ROS2 ecosystem.

**Key components:**

| Component | Description |
|---|---|
| [`_native_save_dialog()` / `_native_open_dialog()`](blockly_app/app.py:29) | Opens native OS file dialogs via `tkinter.filedialog`. Uses Tcl/Tk interpreter separate from Qt — no thread conflict. Available in pixi environment without extra dependencies. |
| [`_wait_for_future(future, timeout_sec)`](blockly_app/app.py:63) | Polls `future.done()` without calling `rclpy.spin()`. Used because the node is already being spun by a background thread. |
| [`BlocklyAPI`](blockly_app/app.py:80) | Python class exposed to JavaScript via pywebview. Its methods are callable as `window.pywebview.api.<method>()`. |
| [`BlocklyAPI.execute_action()`](blockly_app/app.py:95) | Sends a ROS2 Action Goal and blocks until the result arrives. Returns `{success: bool, message: str}` to JavaScript. |
| [`BlocklyAPI.save_workspace(json_string)`](blockly_app/app.py:145) | Opens native "Save As" dialog via tkinter, writes workspace JSON to chosen file. Returns `{success, path}` directly to JS. |
| [`BlocklyAPI.load_workspace()`](blockly_app/app.py:168) | Opens native "Open" dialog via tkinter, reads and validates JSON, returns `{success, data, path}` to JS. |
| [`main()`](blockly_app/app.py:190) | Initializes rclpy, creates the Action Client, starts the background spin thread with `MultiThreadedExecutor`, creates the pywebview window, and handles cleanup on exit. |

**Threading design:** The `main()` function starts `MultiThreadedExecutor.spin()` in a daemon thread. When JavaScript calls `execute_action()`, the method uses `_wait_for_future()` to poll for completion — it never calls `rclpy.spin_until_future_complete()`, which would conflict with the background spin.

#### [`blockly_app/ui/index.html`](blockly_app/ui/index.html) — Main UI

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

#### [`blockly_app/ui/blockly/core/registry.js`](blockly_app/ui/blockly/core/registry.js) — Block Registry

**Purpose:** Central registration system for custom blocks. Each block file calls `BlockRegistry.register()` to self-register its visual definition, code generator, and toolbox metadata.

| Method | Description |
|---|---|
| `BlockRegistry.register(config)` | Register a block with name, category, color, definition, and generator |
| `BlockRegistry.getBlocks()` | Get all registered blocks |
| `BlockRegistry.getToolboxJSON()` | Build Blockly toolbox JSON from registered blocks + built-in categories |

#### [`blockly_app/ui/blockly/core/ui-tabs.js`](blockly_app/ui/blockly/core/ui-tabs.js) — Tab Switching

**Purpose:** Manages switching between the **Blocks** editor tab and the **Code** preview tab.

| Function | Description |
|---|---|
| `switchTab(tab)` | Shows/hides `#blockly-area` and `#code-panel`. Calls `Blockly.svgResize()` when returning to Blocks tab (canvas dimensions are zeroed while hidden). |
| `refreshCodePanel()` | Regenerates JS code from workspace via `javascript.javascriptGenerator.workspaceToCode()` and displays in `#code-output`. |

The Code tab updates automatically on every workspace change (via a change listener in `workspace-init.js`).

#### [`blockly_app/ui/blockly/core/workspace-io.js`](blockly_app/ui/blockly/core/workspace-io.js) — Workspace Export/Import

**Purpose:** Exports workspace to JSON (Save As dialog) and imports from JSON (Open dialog) via the Python bridge.

| Function | Description |
|---|---|
| `exportWorkspace()` | Serializes workspace with `Blockly.serialization.workspaces.save()`, calls `window.pywebview.api.save_workspace(json)`, logs result path. |
| `importWorkspace()` | Calls `window.pywebview.api.load_workspace()`, clears workspace, loads returned JSON with `Blockly.serialization.workspaces.load()`. |

Both functions use `async/await` — they return after the file dialog closes and the file has been read/written.

#### [`blockly_app/ui/blockly/core/bridge.js`](blockly_app/ui/blockly/core/bridge.js) — pywebview Bridge

**Purpose:** Provides `executeAction(command, params)` which calls Python via the pywebview JS-to-Python bridge. Falls back to a mock when running outside pywebview (browser dev).

#### [`blockly_app/ui/blockly/core/debug-engine.js`](blockly_app/ui/blockly/core/debug-engine.js) — Debug Engine

**Purpose:** Implements Run, Debug, Step Over, Step Into, and Stop functionality.

| Function | Description |
|---|---|
| `runProgram()` | Non-debug execution: wraps generated code in async function and eval()s it |
| `runDebug()` | Debug execution: wraps executeAction to check breakpoints and add delays |
| `stepOver()` | Resumes from pause, executes current block, pauses at next block |
| `stepInto()` | Resumes from pause, pauses at very next highlightBlock call |
| `stopExecution()` | Sets stopRequested flag, resolves any pending pause Promise |
| `highlightBlock(blockId)` | Highlights the currently executing block in the workspace |

#### [`blockly_app/ui/blockly/blocks/manifest.js`](blockly_app/ui/blockly/blocks/manifest.js) — Block Manifest

**Purpose:** Lists all block files to auto-load. This is the **only file you edit** when adding a new block (besides creating the block file itself).

```js
const BLOCK_FILES = ['led_on.js', 'led_off.js', 'delay.js'];
```

#### [`blockly_app/ui/blockly/blocks/led_on.js`](blockly_app/ui/blockly/blocks/led_on.js) — Example Block

**Purpose:** Self-contained block definition. Contains both the visual appearance AND the code generator.

Each block file calls `BlockRegistry.register()` with all metadata, so the toolbox is automatically generated.
