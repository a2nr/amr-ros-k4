# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-09
> **Current Focus**: `kiwi_controller` — Adaptive control for Kiwi Wheel drive

Dokumentasi lengkap dapat dilihat di [DOCUMENTATION.md](DOCUMENTATION.md).

# Aturan pengggunaan dokumen

bab pada dokumen merepresentasikan alur rencana pengembangan. 
## Potential Enhancements

bab ini digunakan untuk Feasibility Study

## Planned Feature

Backlog. Setelah kita pelajari untuk di kerjakan maka kita pindah ke backlog

## Feature Task

penjabaran Pekerjaan yang ready untuk dikerjakan. Task harus dijelaskan apa yang akan dikerjakan dan terdapat definition of done nya
Berikut ini adalah template untuk pembuatan task :

```

## <nomor task> <judul task> : <state: [ ] >
jelaskan permasalah di bab ini
### Definition Of Done
jelaskan apa yang dimaksut untuk menyelesaikan task

```

---

# Potential Enhancements
this list is short by priority
- **ROS Feature in generated block blocky**: currently, block blocky only generate action client, and there is sub/pub and other ROS feature need to implement to get/set value to node.
- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
- **Sensor integration**: Subscriber nodes for sensor data feeding back into Blockly visual feedback
- **RealHardware implementation**: Fill in ROS2 publishers/service clients for actual Pi hardware nodes (topics TBD)
- **ROS2 lifecycle nodes**: Migrate executor and controller to lifecycle nodes for managed state transitions
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories

# Feature Task

## 1 Hardware Interface Consolidation [✅]

Menambah block baru sebelumnya butuh edit 4 file (interface, dummy, real, handler). Sekarang refactored agar handler menjadi single source of truth — satu file handler berisi logika dummy dan real hardware.

Perubahan:
- Hapus `interface.py`, `dummy_hardware.py`, `real_hardware.py` (ABC + 3 implementasi)
- Buat `hardware.py` — class `Hardware` generic (mode, node, call_log) yang tidak pernah perlu diubah
- Handler berisi logika dummy (log) dan real (ROS2 publish) — cek via `hardware.is_real()`
- Dependency real hardware di-import lazy (di dalam `if`) untuk menghindari import error di dev machine

### Definition Of Done
- Menambah block baru hanya perlu 1 file handler (+ JS block + manifest)
- `pixi run executor` dan `pixi run executor-hw` tetap berfungsi
- `hardware.call_log` tetap bisa dipakai untuk testing
- Semua test pass (`pixi run test`)

## 2 Fix Stop Button — Client-Side Cancellation [✅]

Stop button tidak benar-benar menghentikan eksekusi. Root cause: saat `await executeAction()` blocking (misal delay 10 detik), flag `stopRequested` tidak dicek. Di Python, `_wait_for_future()` tidak punya mekanisme cancel. Di executor, `_cancel_callback()` tidak bisa jalan karena single-threaded `rclpy.spin()`.

Solusi: client-side cancellation — cancel di sisi JS dan Python, executor handler tetap jalan sampai selesai tapi hasilnya di-discard.

Perubahan yang diperlukan:
- `bridge.js`: tambah `cancelCurrentAction()` + `Promise.race` di `executeAction()` agar bisa di-cancel segera
- `debug-engine.js`: wire `stopExecution()` → `cancelCurrentAction()`
- `app.py`: tambah `cancel_action()` bridge method + cancel-aware `_wait_for_future()` dengan `threading.Event`

### Definition Of Done
- Klik Stop saat delay 10 detik → UI respond dalam < 500ms
- Console tampilkan "Program stopped by user"
- Block highlighting di-clear setelah stop
- Tombol Run/Stop state benar setelah stop
- Stop berfungsi di mode Run dan Debug
- Stop saat block instan (misal led_on) tidak crash
- Semua test existing pass (`pixi run test`)

