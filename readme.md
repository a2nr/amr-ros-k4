# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-12
> **Current Focus**: 

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
- **low level node enhancement**: porting gpio_node to c++ and all low level node that run on raspberry pi using c++, if you use cross compile it using host PC, and send binnary to raspberry pi it gonna help me develop it faster.
- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories

# Feature Task

## 1 Bug Fix: Blockly Debug Mode — Step Into for Function Blocks : [x]
Debug mode tidak bisa step into ke function blocks karena `highlightBlock()` bersifat synchronous — tidak bisa pause execution. Hanya `executeAction()` yang bisa pause, sehingga blocks tanpa `executeAction()` (function calls, variables, math) tidak bisa di-debug. Fix ini mengubah arsitektur debug engine:

1. **Async `highlightBlock()`** — menjadi universal pause point. Semua block generators menggunakan `await highlightBlock()` sehingga setiap block bisa di-breakpoint dan di-step.
2. **Call depth tracking** — `enterFunction()/exitFunction()` di-inject ke generated code di procedure calls. Step Over menggunakan `callDepth` untuk skip function bodies.
3. **Step modes** — `stepMode` state machine ('into'|'over'|'continue') menggantikan monkey-patching `highlightBlock` di setiap step function.
4. **Auto-pause at first block** — debug mode langsung pause di block pertama (tidak perlu breakpoint untuk mulai stepping).
5. **Run = Continue** — Run button saat paused berfungsi sebagai Continue (resume sampai breakpoint berikutnya).

### Definition Of Done
- `debug-engine.js` di-rewrite: async `highlightBlock()` override di `runDebug()`, `callDepth` tracking, `stepMode` state machine
- `enterFunction()`/`exitFunction()` global helpers tersedia untuk generated code
- `async-procedures.js`: `procedures_callreturn` wrapped dengan async IIFE + `highlightBlock()` + depth tracking
- `async-procedures.js`: `procedures_callnoreturn` menggunakan `await highlightBlock()` + `enterFunction()/exitFunction()` dengan try/finally
- Block generators (`digitalOut.js`, `delay.js`, `mainProgram.js`) menggunakan `await highlightBlock()`
- `ui-controls.js`: Run button enabled saat paused (Continue behavior), `onRunClick()` memanggil `continueExecution()`
- Step Into pada function call block → pause di block pertama dalam function body
- Step Over pada function call block → skip function body, pause di block berikutnya
- Debug mode pause di block pertama tanpa perlu breakpoint
- Non-debug mode (`runProgram()`) tidak terpengaruh — `await` pada synchronous `highlightBlock()` adalah no-op
- `pixi run build-app` berhasil tanpa error

## 2 Enhancement: Port gpio_node to C++ : [ ]
gpio_node saat ini ditulis dalam Python (`ament_python`) menggunakan `rclpy` dan `gpiod` (Python binding). Untuk performa dan deployment yang lebih baik di Raspberry Pi, port ke C++ menggunakan `rclcpp` dan `libgpiod` C++ API (`libgpiodcxx`). Node ini **hardware-only** — tidak ada simulation fallback, hanya berjalan di Raspberry Pi dengan akses ke `/dev/gpiochipX`.

### Scope
1. **C++ port** — Rewrite `gpio_node.py` → `gpio_node.cpp` menggunakan `rclcpp`, `libgpiod` C++ bindings
2. **ament_cmake** — Ubah package structure dari `ament_python` ke `ament_cmake` (`CMakeLists.txt` + `package.xml`)
3. **Pixi dependency management** — Tambahkan `ros-jazzy-rclcpp`, `libgpiod` (C++ library) sebagai dependency di `pixi.toml` untuk `linux-aarch64`
4. **Native build on Pi** — Build langsung di Raspberry Pi via `pixi run build-gpio` (cross-compilation ROS2 C++ terlalu kompleks — butuh full aarch64 sysroot dengan semua ROS2 libs)

### Perubahan yang Dibutuhkan

#### A. Package Structure (hapus Python, buat C++)
```
src/gpio_node/
├── CMakeLists.txt          # ament_cmake, find libgpiod, build gpio_node executable
├── package.xml             # ament_cmake, depend: rclcpp, blockly_interfaces, libgpiod
├── include/gpio_node/
│   └── gpio_node.hpp       # GpioNode class declaration
└── src/
    ├── gpio_node.cpp        # GpioNode class implementation
    └── main.cpp             # main() entry point — rclcpp::spin(node)
```

Hapus: `gpio_node/gpio_node.py`, `gpio_node/__init__.py`, `setup.py`, `setup.cfg`, `resource/gpio_node`

#### B. C++ Node — Same API Surface
- **Subscribe** `/gpio/write` (`blockly_interfaces::msg::GpioWrite`) — set pin output via `gpiod::line_request::set_value()`
- **Publish** `/gpio/state` (`blockly_interfaces::msg::GpioRead`) — poll input pins via timer (10 Hz default)
- **Parameters**: `output_pins` (int array), `input_pins` (int array), `input_publish_rate` (double), `gpio_chip` (string, default `/dev/gpiochip0`)
- Hanya pin yang ada di `output_pins` yang bisa di-write; pin tidak terdaftar → log warning
- Cleanup: `gpiod::line_request::release()` di destructor

#### C. pixi.toml — Dependency Updates
```toml
[target.linux-aarch64.dependencies]
ros-jazzy-ros-base  = "*"
ros-jazzy-rclcpp    = "*"     # C++ ROS2 client library
libgpiod            = "*"     # C/C++ libgpiod (gpiodcxx)
```
Hapus `gpiod` dari `[target.linux-aarch64.pypi-dependencies]`

#### D. Build on Pi
Build dilakukan **natively di Raspberry Pi** (cross-compilation ROS2 C++ tidak praktis — butuh full aarch64 sysroot dengan semua ROS2 shared libraries).

```bash
# Di Pi: clone repo + install deps + build + run
git clone <repo> ~/amr-ros-k4 && cd ~/amr-ros-k4
pixi install && pixi run build-gpio
pixi run gpio-node
```

### Definition Of Done
- `src/gpio_node/` berisi `CMakeLists.txt`, `package.xml`, `include/`, `src/` — tidak ada file Python
- `pixi.toml` menyertakan `ros-jazzy-rclcpp` dan `libgpiod` di `linux-aarch64` dependencies
- `pixi.toml` tidak lagi menyertakan `gpiod` di `linux-aarch64` pypi-dependencies
- `pixi run build-gpio` berhasil di Raspberry Pi (native build) tanpa error
- Node berjalan: `pixi run gpio-node` — subscribe `/gpio/write`, publish `/gpio/state`
- Parameter `output_pins`, `input_pins`, `input_publish_rate`, `gpio_chip` berfungsi via `--ros-args -p`
- Executor (`blockly_executor`) tetap berfungsi tanpa perubahan — interface ROS2 identik
- `pixi run build-gpio` di Pi (native build) berhasil tanpa error
