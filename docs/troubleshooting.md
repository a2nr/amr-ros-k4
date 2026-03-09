# Troubleshooting & Known Issues

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
