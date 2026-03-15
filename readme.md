# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-16
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

## 2 Enhancement: Port gpio_node to C++ : [x]
gpio_node di-port dari Python (`ament_python`, `rclpy`, `gpiod` Python binding) ke C++ (`ament_cmake`, `rclcpp`, `libgpiod` **C API**). Node ini hardware-only — hanya berjalan di Raspberry Pi dengan akses ke `/dev/gpiochipX`.

### Implementasi

#### A. Package Structure (C++, ament_cmake)
```
src/gpio_node/
├── CMakeLists.txt          # ament_cmake, pkg_check_modules(libgpiod), build executable
├── package.xml             # depend: rclcpp, blockly_interfaces
├── include/gpio_node/
│   └── gpio_node.hpp       # GpioNode class — rclcpp::Node + gpiod C API raw pointers
└── src/
    ├── gpio_node.cpp        # GpioNode implementation (setup_gpio, write_callback, read_callback)
    └── main.cpp             # main() — rclcpp::spin(node)
```

Dihapus: semua file Python (`gpio_node.py`, `__init__.py`, `setup.py`, `setup.cfg`, `resource/`)

#### B. C++ Node — Same ROS2 API Surface
- **Subscribe** `/gpio/write` (`GpioWrite`) — `gpiod_line_request_set_value()` untuk set pin output
- **Publish** `/gpio/state` (`GpioRead`) — `gpiod_line_request_get_value()` via polling timer (10 Hz default)
- **Parameters**: `output_pins` (int array), `input_pins` (int array), `input_publish_rate` (double), `gpio_chip` (string, default `/dev/gpiochip0`)
- Pin tidak terdaftar di `output_pins` → log warning, ignore write
- Cleanup: `gpiod_line_request_release()` di destructor (manual memory management, bukan C++ RAII)

#### C. Catatan: libgpiod C API, bukan C++ Bindings
conda-forge `libgpiod` **hanya menyertakan C library** (`gpiod.h`), bukan C++ bindings (`gpiod.hpp` / `libgpiodcxx`). Oleh karena itu implementasi menggunakan gpiod v2 **C API** langsung. Semua resource (`gpiod_line_request`, `gpiod_line_config`, dll.) di-manage manual via `gpiod_*_free()`.

#### D. Platform-Specific Tasks & System Dependencies
Cross-compilation ROS2 C++ tidak praktis (butuh full aarch64 sysroot). Build dilakukan **native di Raspberry Pi**.

pixi.toml menggunakan **platform-specific task sections**:
- `[target.linux-64.tasks]` — desktop tasks (build-app, executor, app, test)
- `[target.linux-aarch64.tasks]` — Pi tasks (setup-dep, build-gpio, gpio-node)

`setup-dep` task menginstall system libraries via `apt` yang tidak tersedia / tidak lengkap di conda-forge:
```bash
sudo apt install -y liblttng-ust-dev lttng-tools libgpiod-dev gpiod
```
- `libgpiod-dev` — header + `.so` untuk linking (conda package tidak menyertakan `.so` symlink untuk linker)
- `liblttng-ust-dev` + `lttng-tools` — dibutuhkan oleh `rclcpp` (RoboStack) yang di-build dengan LTTng tracing support

```bash
# Di Pi: clone repo + install deps + build + run
git clone <repo> ~/amr-ros-k4 && cd ~/amr-ros-k4
pixi install && pixi run build-gpio   # setup-dep runs automatically
pixi run gpio-node
```

### Definition Of Done
- [x] `src/gpio_node/` berisi `CMakeLists.txt`, `package.xml`, `include/`, `src/` — tidak ada file Python
- [x] `pixi.toml` menyertakan `ros-jazzy-rclcpp` di `linux-aarch64` dependencies
- [x] `pixi.toml` tidak lagi menyertakan `gpiod` di `linux-aarch64` pypi-dependencies
- [x] `setup-dep` task menginstall `libgpiod-dev`, `liblttng-ust-dev` via apt
- [x] `pixi run build-gpio` berhasil di Raspberry Pi (native build) tanpa error
- [x] Node berjalan: `pixi run gpio-node` — subscribe `/gpio/write`, publish `/gpio/state`
- [x] Parameter `output_pins`, `input_pins`, `input_publish_rate`, `gpio_chip` berfungsi via `--ros-args -p`
- [x] Executor (`blockly_executor`) tetap berfungsi tanpa perubahan — interface ROS2 identik
