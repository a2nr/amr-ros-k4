# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-16
> **Current Focus**: Task #4 — AS5600 Magnetic Encoder (I2C)

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
- **Blockly UI Enhancement**: Lets make Human Interface in same view to help me monitoring node that needed. it programaticaly using block is real good, you can take labview interface as refrence. you can separated program as main_program to handle human interface.
- **Feasibility Study to implement Controller**: mobile robot need controller to move flawlesly.
- **Launch files**: ROS2 launch files to start all nodes with one command includ node in raspberry pi
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

## 3 Enhancement: PCA9685 — 16-Channel PWM Controller (I2C) : [ ]
PCA9685 adalah 16-channel, 12-bit PWM controller via I2C. Motor DC kiwi wheel menggunakan 6 channel (3 motor × 2: PWM + direction), sehingga 10 channel tersedia untuk extensi (servo, LED, dll). Node ini general-purpose — mengontrol channel mana saja via Blockly block dengan parameter address, channel, dan PWM value.

### Implementasi

#### A. Package Structure (C++, ament_cmake)
```
src/pca9685_node/
├── CMakeLists.txt              # ament_cmake — NO external lib dependency
├── package.xml                 # depend: rclcpp, blockly_interfaces
├── include/pca9685_node/
│   └── pca9685_node.hpp        # Pca9685Node class + I2C helpers
└── src/
    ├── pca9685_node.cpp         # I2C init, write_callback, set_pwm()
    └── main.cpp                 # rclcpp::spin(node)
```

Hardware interface menggunakan Linux I2C (`/dev/i2c-X`) via `ioctl()` — tidak perlu external library, cukup `linux/i2c-dev.h` (kernel header).

#### B. ROS2 Interface

**New message** — `blockly_interfaces/msg/PwmWrite.msg`:
```
uint8 address       # I2C address (default 0x40, configurable via solder bridges: 0x40–0x7F)
uint8 channel       # PWM channel (0–15)
uint16 value        # Duty cycle (0–4095, 12-bit resolution)
```

**Topic**: `/pwm/write` (executor → pca9685_node)

**ROS2 Parameters** (configurable via `--ros-args -p`):
| Parameter | Type | Default | Fungsi |
|---|---|---|---|
| `i2c_device` | string | `/dev/i2c-1` | Linux I2C device path |
| `frequency` | int | 50 | PWM frequency Hz (semua channel) |

PCA9685 write-only — tidak perlu `PwmRead.msg`.

#### C. Node Behavior — `Pca9685Node`
1. **Constructor**: open `i2c_device`, configure prescaler berdasarkan `frequency` param
2. **Subscribe** `/pwm/write` (`PwmWrite`) — set duty cycle via I2C register write
3. **`set_pwm(address, channel, value)`**: select I2C slave address via `ioctl(I2C_SLAVE)`, write 4 bytes ke channel registers
4. **Multi-address support**: satu node bisa mengontrol multiple PCA9685 boards (address dikirim per-message, `ioctl(I2C_SLAVE)` di-set setiap write)
5. **Cleanup**: close file descriptor di destructor

PCA9685 register map:
| Register | Address | Fungsi |
|---|---|---|
| MODE1 | 0x00 | Sleep/restart, auto-increment |
| LED0_ON_L | 0x06 | Channel 0 ON timing (4 registers per channel) |
| PRE_SCALE | 0xFE | PWM frequency: `prescale = round(25MHz / (4096 × freq)) - 1` |

#### D. Handler — `blockly_executor/handlers/pwm.py`
```python
@handler("pwm_write")
def handle_pwm_write(params, hardware):
    address = int(params["address"], 16)  # hex string → int
    channel = int(params["channel"])
    value = int(params["value"])
    # Dummy: log only. Real: publish PwmWrite to /pwm/write
```
Lazy-create publisher di `hardware.node._pwm_write_pub`, sama dengan pola `gpio.py`.

#### E. Blockly Block — `pwmWrite.js`
```
┌──────────────────────────────────────────────┐
│ PCA9685  addr: [0x40]                        │
│          channel: [0 ▾]    pwm: [■ value]    │
└──────────────────────────────────────────────┘
```
- **addr**: `FieldDropdown` — common addresses (0x40–0x47)
- **channel**: `FieldNumber` (0–15)
- **pwm**: `ValueInput` (0–4095) — accepts expression blocks, uses `String(expr)` pattern
- Category: `Robot`, Command: `pwm_write`

#### F. pixi.toml Changes
- `setup-dep`: tambah `i2c-tools` (optional, untuk debugging `i2cdetect`)
- `build-pca9685`: `colcon build --packages-select pca9685_node` (depends-on: setup-dep, build-interfaces)
- `pca9685-node`: `ros2 run pca9685_node pca9685_node`

Tidak perlu conda deps baru — Linux I2C headers sudah tersedia di kernel.

#### G. Penggunaan

```bash
# Default — /dev/i2c-1, 50 Hz
pixi run pca9685-node

# Ganti I2C device dan frequency via --ros-args
source install/setup.bash
ros2 run pca9685_node pca9685_node --ros-args -p i2c_device:=/dev/i2c-0 -p frequency:=1000

# Cek I2C bus yang tersedia di Pi
ls /dev/i2c-*           # list semua bus
i2cdetect -y 1          # scan device di bus 1 (perlu i2c-tools)
```

**Catatan**: `pixi run pca9685-node` menggunakan parameter default. Untuk override parameter, jalankan `ros2 run` langsung (setelah `source install/setup.bash`) karena pixi task tidak meneruskan `--ros-args` ke proses inner.

### Definition Of Done
- [x] `src/pca9685_node/` berisi `CMakeLists.txt`, `package.xml`, `include/`, `src/`
- [x] `blockly_interfaces/msg/PwmWrite.msg` terdaftar di `rosidl_generate_interfaces()`
- [x] `pixi run build-interfaces` berhasil — PwmWrite.msg ter-generate
- [ ] `pixi run build-pca9685` berhasil di Raspberry Pi (native build) tanpa error
- [ ] Node berjalan: `pixi run pca9685-node` — subscribe `/pwm/write`
- [ ] Parameter `i2c_device`, `frequency` berfungsi via `--ros-args -p`
- [x] Handler `pwm_write` berfungsi di dummy mode (test passes)
- [x] Blockly block `pwmWrite` muncul di toolbox, generate valid JS code
- [ ] End-to-end: Blockly block → executor (real) → `/pwm/write` → pca9685_node → I2C write

## 4 Enhancement: AS5600 — 12-bit Magnetic Rotary Encoder (I2C) : [ ]
AS5600 adalah 12-bit magnetic rotary position sensor via I2C. Kiwi wheel AMR menggunakan 3 encoder (satu per roda) untuk feedback posisi. AS5600 memiliki **fixed I2C address (0x36)** — untuk 3 module, setiap encoder menggunakan **I2C bus terpisah** (e.g., `/dev/i2c-1`, `/dev/i2c-3`, `/dev/i2c-4`). Node ini publisher — membaca angle secara periodik dan publish ke ROS2 topic.

### Implementasi

#### A. Package Structure (C++, ament_cmake)
```
src/as5600_node/
├── CMakeLists.txt              # ament_cmake — NO external lib dependency
├── package.xml                 # depend: rclcpp, blockly_interfaces
├── include/as5600_node/
│   └── as5600_node.hpp         # As5600Node class + I2C helpers
└── src/
    ├── as5600_node.cpp          # I2C init, timer_callback, read_raw_angle()
    └── main.cpp                 # rclcpp::spin(node)
```

Hardware interface menggunakan Linux I2C (`/dev/i2c-X`) via `ioctl()` — tidak perlu external library, cukup `linux/i2c-dev.h` (kernel header).

#### B. ROS2 Interface

**New message** — `blockly_interfaces/msg/EncoderRead.msg`:
```
uint8 encoder_id       # Encoder index (0, 1, 2, ...)
float32 angle          # Angle in degrees (0.0-360.0)
uint16 raw_angle       # Raw 12-bit value (0-4095)
```

**Topic**: `/encoder/state` (as5600_node → executor)

**ROS2 Parameters** (configurable via `--ros-args -p`):
| Parameter | Type | Default | Fungsi |
|---|---|---|---|
| `i2c_devices` | string[] | `["/dev/i2c-1"]` | List of I2C device paths, satu per encoder |
| `publish_rate` | double | 10.0 | Publish frequency Hz |

#### C. Node Behavior — `As5600Node`
1. **Constructor**: open setiap I2C bus, set slave address 0x36 via `ioctl(I2C_SLAVE)`, create publisher dan timer
2. **Timer callback**: iterate semua I2C fds → read 2-byte RAW_ANGLE register → compute `angle = raw * 360.0 / 4096.0` → publish EncoderRead
3. **`read_raw_angle(fd)`**: write register address 0x0C, read 2 bytes → `((buf[0] & 0x0F) << 8) | buf[1]` (12-bit)
4. **Multi-bus support**: satu node mengontrol semua encoder — setiap fd dedicated ke satu bus/encoder
5. **Cleanup**: close semua file descriptors di destructor

AS5600 register map:
| Register | Address | Fungsi |
|---|---|---|
| RAW_ANGLE | 0x0C-0x0D | 12-bit raw angle (0-4095) |
| STATUS | 0x0B | Magnet detect status |
| AGC | 0x1A | Automatic gain control |

#### D. Handler — `blockly_executor/handlers/encoder.py`
```python
@handler("encoder_read")
def handle_encoder_read(params, hardware):
    encoder_id = int(params["encoder_id"])
    # Dummy: return "0.0". Real: subscribe /encoder/state, return cached angle
```
Lazy-create subscriber dengan cache `{encoder_id: {angle, raw_angle}}`, sama dengan pola `digital_in` di `gpio.py`.

#### E. Blockly Block — `encoderRead.js`
```
┌──────────────────────────────────────┐
│ Encoder Read  id: [0]                │
└──────────────────────────────────────┘
```
- **id**: `FieldNumber` (0–2)
- Returns: `Number` (angle 0-360)
- Category: `Robot`, Command: `encoder_read`
- Output block (can be used in expressions, e.g., `set variable to [Encoder Read id: 0]`)

#### F. pixi.toml Changes
- `build-as5600`: `colcon build --packages-select as5600_node` (depends-on: setup-dep, build-interfaces)
- `as5600-node`: `ros2 run as5600_node as5600_node`

Tidak perlu conda deps baru — Linux I2C headers sudah tersedia di kernel.

#### G. Penggunaan

```bash
# Default — /dev/i2c-1, 10 Hz, 1 encoder
pixi run as5600-node

# 3 encoder pada bus terpisah, 20 Hz
source install/setup.bash
ros2 run as5600_node as5600_node --ros-args \
  -p i2c_devices:="['/dev/i2c-1', '/dev/i2c-3', '/dev/i2c-4']" \
  -p publish_rate:=20.0

# Raspberry Pi: enable extra I2C buses via config.txt
# dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=17,i2c_gpio_scl=27
# dtoverlay=i2c-gpio,bus=4,i2c_gpio_sda=22,i2c_gpio_scl=23
```

### Definition Of Done
- [x] `src/as5600_node/` berisi `CMakeLists.txt`, `package.xml`, `include/`, `src/`
- [x] `blockly_interfaces/msg/EncoderRead.msg` terdaftar di `rosidl_generate_interfaces()`
- [ ] `pixi run build-interfaces` berhasil — EncoderRead.msg ter-generate
- [ ] `pixi run build-as5600` berhasil di Raspberry Pi (native build) tanpa error
- [ ] Node berjalan: `pixi run as5600-node` — publish `/encoder/state`
- [ ] Parameter `i2c_devices`, `publish_rate` berfungsi via `--ros-args -p`
- [x] Handler `encoder_read` berfungsi di dummy mode (test passes)
- [x] Blockly block `encoderRead` muncul di toolbox, generate valid JS code
- [ ] End-to-end: Blockly block → executor (real) → cache `/encoder/state` → return angle
