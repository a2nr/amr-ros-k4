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

### Blockly workspace tidak ikut resize saat panel di-drag

**Symptom:** Drag vertical/horizontal divider, Blockly canvas tidak resize — tetap ukuran lama.

**Cause:** `resizable-panels.js` hanya panggil `Blockly.svgResize()` tanpa update dimensi `#blockly-div` yang `position: absolute`.

**Solution:** Update `#blockly-div` width/height dari `#blockly-area` offsetWidth/Height sebelum `svgResize`. File: `core/resizable-panels.js` (mousemove handler).

### App freeze saat kedua program pakai `while(true)`

**Symptom:** App tidak responsif (freeze) saat `main_program` dan `main_hmi_program` keduanya punya `while(true)` loop.

**Cause:** User menulis `while(true)` di `main_hmi_program`. Auto-wrapper menambah outer while-loop, tapi inner `while(true)` dengan HMI calls (synchronous) tidak pernah yield ke event loop.

**Solution:** HMI shadowed `highlightBlock` diubah dari sync no-op ke `async function` dengan `stopRequested` check. Setiap `await highlightBlock()` di generated code yield ke event loop + bisa di-stop. File: `core/debug-engine.js` — `_runConcurrent()` dan `_runDebugConcurrent()`.

### Variabel tidak ter-share antara main dan HMI program

**Symptom:** Variable yang di-set di `main_program` tidak terlihat di `main_hmi_program` (tetap default value).

**Cause:** `definitions` (berisi `var led;`) di-eval di dua IIFE terpisah → dua scope terpisah.

**Solution:** Gabung kedua program dalam SATU eval — outer IIFE berisi `definitions`, dua inner IIFE (main + HMI) close over shared scope. File: `core/debug-engine.js` — `_runConcurrent()` dan `_runDebugConcurrent()`.

### Delete HMI block tidak menghapus preview widget; undo muncul blank widget

**Symptom:** Hapus HMI block → widget masih ada di HMI panel. Undo → widget muncul tapi kosong.

**Cause:** `_blockToWidget` Map di `hmi-preview.js` kehilangan sinkronisasi saat undo/redo. Blockly events pada undo tidak selalu re-add mapping.

**Solution:** Tambah `_reconcile()` dengan 100ms debounce setelah setiap workspace event. Fungsi ini compare HMI blocks di workspace vs `_blockToWidget` map, hapus widget orphan, tambah widget yang belum ter-track. File: `core/hmi-preview.js`.

### UI freeze pada `while(true)` loop di Main Program (polling HMI controls)

**Symptom:** Main Program dengan `while(true)` untuk polling `HMI.getButton()` → seluruh UI freeze, HMI panel tidak update, tombol Stop tidak responsif.

**Cause:** `highlightBlock` override hanya yield ke microtask queue. Microtask tidak memberi giliran ke macrotask queue (click events, setTimeout, requestAnimationFrame).

**Solution:** Tambahkan periodic yield ke macrotask queue (~60Hz) di `highlightBlock` override. Setiap 16ms, `setTimeout(r, 0)` memaksa browser memproses macrotask. Diterapkan di `_runConcurrent()` dan `_runSingle()`. File: `core/debug-engine.js`.

### HMI Button `getButton()` selalu return `false` meskipun sudah diklik

**Symptom:** `while(getButton()!= true) {delay(500);}` tidak pernah keluar dari loop.

**Cause:** HMI loop (~20Hz) memanggil `setButton()` → `_scheduleRender()` → `_render()` menghancurkan DOM button lama dan membuat baru setiap ~50ms. Event `click` butuh mousedown+mouseup pada elemen DOM yang sama — karena DOM diganti mid-click, `click` event tidak pernah fire.

**Solution:** Ganti `click` → `pointerdown` di `_renderButton()`. `pointerdown` fire langsung saat ditekan tanpa menunggu mouseup. File: `core/hmi-manager.js`.

### HMI Switch/Slider tidak bisa di-toggle/drag — selalu reset ke initial value

**Symptom:** `setSwitch('Switch1', Boolean(led))` dalam HMI loop menimpa user toggle setiap ~50ms. Slider juga reset ke 0 setelah user release.

**Cause:** HMI loop berjalan 10x lebih cepat dari Main Program. `setSwitch()` langsung overwrite `widget.state`, dan `setSlider()` overwrite `_userValue` segera setelah `_userInteracting = false` (mouseup).

**Solution:** User interaction tracking — state user disimpan terpisah dari programmatic state. Switch: `_userState` field, tidak ditimpa oleh `setSwitch()`. Slider: `_userHasInteracted` flag persist setelah release, mencegah `setSlider()` overwrite `_userValue`. File: `core/hmi-manager.js`.

### Dua HMI block dengan nama sama hanya membuat satu widget

**Symptom:** Drag dua block `HMI LED` dari toolbox → hanya satu widget muncul di panel (keduanya default ke `LED1`).

**Cause:** `_widgets` Map menggunakan nama sebagai key. Block kedua dengan nama sama hanya update widget yang ada, bukan membuat baru.

**Solution:** Auto-increment nama di `_handleCreate()` — jika `LED1` sudah dipakai, block baru otomatis menjadi `LED2`. Block field di-update via `setFieldValue()`. Juga fix `_handleDelete()` untuk tidak menghapus widget jika block lain masih menggunakan nama yang sama. File: `core/hmi-preview.js`.

---
