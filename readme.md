# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-16
> **Current Focus**: Task #5 — Unified Odometry Interface

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
- **add more block in HMI**: i like to add block button, slider, and switch
- **Feasibility Study to implement Controller**: mobile robot need controller to move flawlesly.
- **Launch files**: ROS2 launch files to start all nodes with one command includ node in raspberry pi
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories

# Feature Task

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
- [x] `pixi run build-pca9685` berhasil di Raspberry Pi (native build) tanpa error
- [ ] Node berjalan: `pixi run pca9685-node` — subscribe `/pwm/write`
- [ ] Parameter `i2c_device`, `frequency` berfungsi via `--ros-args -p`
- [x] Handler `pwm_write` berfungsi di dummy mode (test passes)
- [x] Blockly block `pwmWrite` muncul di toolbox, generate valid JS code
- [ ] End-to-end: Blockly block → executor (real) → `/pwm/write` → pca9685_node → I2C write

## 4 Enhancement: AS5600 — 12-bit Magnetic Rotary Encoder (I2C) : [ ]
AS5600 adalah 12-bit magnetic rotary position sensor via I2C. Kiwi wheel AMR menggunakan 3 encoder (satu per roda) untuk feedback posisi. AS5600 memiliki **fixed I2C address (0x36)** — untuk 3 module, setiap encoder menggunakan **I2C bus terpisah** (e.g., `/dev/i2c-1`, `/dev/i2c-3`, `/dev/i2c-4`).

> **Note**: Legacy `EncoderRead.msg`, `encoder.py` handler, dan `encoderRead.js` block telah dihapus dan diganti oleh **Task #5 (Unified Odometry Interface)**. `as5600_node` sekarang hanya publish `nav_msgs/Odometry` ke `odometry_encoder/odom`.

### Implementasi

#### A. Package Structure (C++, ament_cmake)
```
src/as5600_node/
├── CMakeLists.txt              # ament_cmake — depend: rclcpp, nav_msgs, geometry_msgs
├── package.xml
├── include/as5600_node/
│   └── as5600_node.hpp         # As5600Node class + kinematics + I2C helpers
└── src/
    ├── as5600_node.cpp          # I2C read + kiwi wheel kinematics + nav_msgs publish
    └── main.cpp                 # rclcpp::spin(node)
```

Hardware interface menggunakan Linux I2C (`/dev/i2c-X`) via `ioctl()` — tidak perlu external library, cukup `linux/i2c-dev.h` (kernel header).

#### B. ROS2 Interface

Menggunakan **`nav_msgs/Odometry`** (standar ROS2) — lihat Task #5 untuk detail fields dan kinematics.

**Topic**: `odometry_encoder/odom` (as5600_node → executor)

**ROS2 Parameters** (configurable via `--ros-args -p`):
| Parameter | Type | Default | Fungsi |
|---|---|---|---|
| `i2c_devices` | string[] | `["/dev/i2c-1"]` | List of I2C device paths, satu per encoder |
| `publish_rate` | double | 10.0 | Publish frequency Hz |
| `wheel_radius` | double | 5.0 | Radius roda (cm) — HARUS di-tune |
| `wheel_distance` | double | 15.0 | Jarak center-to-wheel (cm) — HARUS di-tune |
| `wheel_angles` | double[] | [0, 2π/3, 4π/3] | Sudut posisi roda (rad) |

#### C. pixi.toml
- `build-as5600`: `colcon build --packages-select as5600_node` (depends-on: setup-dep, build-interfaces)
- `as5600-node`: `ros2 run as5600_node as5600_node`

#### D. Penggunaan

```bash
# Default — /dev/i2c-1, 10 Hz, 1 encoder
pixi run as5600-node

# 3 encoder pada bus terpisah, 20 Hz, custom wheel geometry
source install/setup.bash
ros2 run as5600_node as5600_node --ros-args \
  -p i2c_devices:="['/dev/i2c-1', '/dev/i2c-3', '/dev/i2c-4']" \
  -p publish_rate:=20.0 \
  -p wheel_radius:=5.0 \
  -p wheel_distance:=15.0
```

### Definition Of Done
- [x] `src/as5600_node/` berisi `CMakeLists.txt`, `package.xml`, `include/`, `src/`
- [x] `pixi run build-as5600` berhasil di Raspberry Pi (native build) tanpa error
- [ ] Node berjalan: `pixi run as5600-node` — publish `odometry_encoder/odom`
- [ ] Parameter `i2c_devices`, `publish_rate`, `wheel_radius`, `wheel_distance` berfungsi via `--ros-args -p`
- [ ] End-to-end: as5600_node → `odometry_encoder/odom` → executor cache → Blockly

## 5 Enhancement: Unified Odometry Interface — nav_msgs/Odometry : [ ]
Interface odometry menggunakan standar ROS2 `nav_msgs/Odometry` agar kompatibel dengan ekosistem ROS2. Setiap jenis sensor odometry (encoder, IMU, optical) publish ke topic terpisah `odometry_<type>/odom` menggunakan message type yang sama.

**Motivasi**: Modularitas — tambah sensor baru cukup buat node yang publish `nav_msgs/Odometry` ke `odometry_<type>/odom`. Dari Blockly, user pilih source via dropdown.

**Arsitektur**:
```
as5600_node (encoder)     → odometry_encoder/odom  (nav_msgs/Odometry)
future: imu_node          → odometry_imu/odom      (nav_msgs/Odometry)
future: optical_node      → odometry_optical/odom   (nav_msgs/Odometry)
```

**Satuan**: Mengikuti REP-103 kecuali jarak menggunakan **centimeter (cm)** karena rentang pergerakan robot kecil. Angular menggunakan radian.

**Blocker**: Implementasi sensor baru (IMU, optical) menunggu desain mekanik final.

### Implementasi

#### A. Standard Interface — `nav_msgs/Odometry`
Tidak menggunakan custom message. `nav_msgs/Odometry` sudah tersedia di RoboStack. Message fields yang digunakan:
- `pose.pose.position.x/y` — posisi robot (cm)
- `pose.pose.orientation` — quaternion dari heading (2D: z=sin(θ/2), w=cos(θ/2))
- `twist.twist.linear.x/y` — kecepatan robot (cm/s)
- `twist.twist.angular.z` — kecepatan angular (rad/s)
- `header.frame_id` = `"odom"`, `child_frame_id` = `"base_link"`

#### B. AS5600 Node — Kiwi Wheel Kinematics
`as5600_node` menghitung robot-level odometry langsung dari 3 encoder menggunakan kiwi wheel forward kinematics, publish ke `odometry_encoder/odom` (`nav_msgs/Odometry`).

Legacy `EncoderRead.msg` dan `/encoder/state` topic telah dihapus — clean break, hanya `nav_msgs/Odometry`.

**Kiwi Wheel Forward Kinematics** (3 roda @ 120°):
```
Constraint: ωᵢ = (1/r)(-vx·sin(αᵢ) + vy·cos(αᵢ) + L·ωz)

Forward kinematics (3 roda → robot velocity):
vx  = (r/n) · Σ(-ωᵢ·sin(αᵢ))     [cm/s]
vy  = (r/n) · Σ( ωᵢ·cos(αᵢ))     [cm/s]
ωz  = r/(n·L) · Σ(ωᵢ)            [rad/s]

Pose integration (Euler):
x  += (vx·cos(θ) - vy·sin(θ))·dt   [cm]
y  += (vx·sin(θ) + vy·cos(θ))·dt   [cm]
θ  += ωz·dt                         [rad]
```

#### C. Handler — `odometry.py` (returns JSON)
```python
@handler("odometry_read")
def handle_odometry_read(params, hardware):
    source = params.get("source", "encoder")
    # Returns ALL fields as JSON: {"x":0.0, "y":0.0, "heading":0.0, "vx":0.0, "vy":0.0, "omega_z":0.0}
```
Lazy-create subscriber per source ke `odometry_<source>/odom`. Satu action call return semua data sekaligus — efisien, tidak perlu action call per-field.

#### D. Blockly Blocks — Fetch Once, Extract Many
Dua block terpisah untuk efisiensi (1 action call untuk semua field):

**Block 1: `getOdometry`** (`odometryRead.js`) — Value block, fetch all data:
```
┌─────────────────────────────────┐
│ getOdometry [Encoder ▾]         │ → output: Object
└─────────────────────────────────┘
```
Digunakan dengan Blockly built-in "set variable to" block:
```
set [odom ▾] to [getOdometry [Encoder ▾]]    ← 1 action call
```

**Block 2: `getValueOdometry`** (`odometryGet.js`) — Value block, extract field (no action call):
```
┌───────────────────────────────────────────────┐
│ getValueOdometry [X (cm) ▾] from [odom ▾]     │ → output: Number
└───────────────────────────────────────────────┘
```
Fields: `X (cm)`, `Y (cm)`, `Heading (rad)`, `Vel X (cm/s)`, `Vel Y (cm/s)`, `Angular Vel (rad/s)`

#### E. Future Phases (blocked on mekanik)
- Sensor nodes baru (`imu_node`, `optical_node`) publish `nav_msgs/Odometry` ke `odometry_<type>/odom`
- Update `odometryRead.js` dropdown source untuk sensor baru
- Handler `odometry.py` auto-subscribe ke topic baru via `_SOURCE_TOPICS` dict

### Definition Of Done
- [x] Interface menggunakan `nav_msgs/Odometry` (bukan custom message)
- [x] `as5600_node` publish ke `odometry_encoder/odom` dengan kiwi wheel kinematics
- [x] Legacy `EncoderRead.msg`, `encoder.py`, `encoderRead.js` dihapus — clean break
- [x] Handler `odometry_read` return JSON semua fields (bukan per-field)
- [x] Blockly: `getOdometry` (fetch) + `getValueOdometry` (extract) — 1 action call
- [x] `pixi run build-as5600` berhasil — as5600_node compile dengan nav_msgs dependency
- [x] Handler `odometry_read` berfungsi di dummy mode (test passes)
- [ ] End-to-end: Blockly → executor (real) → cache `odometry_encoder/odom` → return JSON
- [x] Integration test `test_block_odometry.py` passes di dummy mode

## 6 Enhancement: Blockly UI — HMI Panel, Print Console & Concurrent Execution : [x]

LabVIEW punya 2 view: **Front Panel** (HMI — controls & indicators) dan **Block Diagram** (visual programming). Di project ini, Blockly sudah jadi "Block Diagram". Enhancement ini menambahkan **"Front Panel"** — HMI panel dengan grid layout, resizable panels, design-time widget preview, concurrent HMI loop, plus **print console** dan **string blocks** untuk debugging.

**Key Architecture Decisions**:
- Print block dan HMI blocks **tidak membutuhkan ROS2 action** — murni client-side JavaScript. Zero latency, no network round-trip.
- **Concurrent execution**: `main_program` + `main_hmi_program` berjalan bersamaan via `Promise.all()`. HMI loop auto-wrapped dalam `while` loop ~20Hz.
- **Design-time preview**: Widget muncul di HMI panel saat block diletakkan (workspace change listener), bukan hanya saat runtime.
- **Grid layout**: gridstack.js untuk drag-reposition dan drag-resize widget. Layout disimpan bersama workspace.

### Implementasi

#### Phase 1: Print Block & Text Category

**A. Print Statement Block** — `print.js`
- Category: `Program`, statement block: `Print [value input]`
- Generator: `consoleLog(String(VALUE), 'print');` — no `executeAction`, purely client-side
- Works with any expression via `String(expr)` pattern

**B. Text Category** — built-in Blockly blocks: `text`, `text_join`, `text_length`

#### Phase 2: HMI Panel Infrastructure

**A. Resizable Split View** — Blockly on left, HMI panel on right
- Drag dividers (`resizable-panels.js`): vertical (Blockly↔HMI) dan horizontal (workspace↔console)
- Clamps: HMI 200px–50% viewport; console 80px–40% viewport
- `Blockly.svgResize(workspace)` dipanggil setiap move

**B. HMI Manager** — `hmi-manager.js`
- Global `HMI` object: `setLED()`, `setNumber()`, `setText()`, `setGauge()`, `clearAll()`
- Two modes: `design` (grid unlocked, preview values) / `runtime` (grid locked, live values)
- gridstack.js integration: `init()`, `addWidget()`, `removeWidget()`, `getLayout()`, `loadLayout()`
- Pure DOM API rendering (no innerHTML) — XSS safe

**C. Design-time Preview** — `hmi-preview.js`
- Workspace change listener (`BLOCK_CREATE`, `BLOCK_DELETE`, `BLOCK_CHANGE`)
- Widgets appear/disappear as blocks are placed/deleted
- `_hmiPreviewScan` for workspace-io.js to call after import

#### Phase 3: HMI Blocks

| Block | Type | Category | Fungsi |
|-------|------|----------|--------|
| `hmiSetLed` | Statement | HMI | Set LED indicator on/off with color |
| `hmiSetNumber` | Statement | HMI | Display numeric value with unit label |
| `hmiSetText` | Statement | HMI | Display text string |
| `hmiSetGauge` | Statement | HMI | Display gauge bar with min/max range |

Semua HMI blocks: purely client-side (call `HMI.*()` functions), Field `NAME` untuk widget identifier, Value input untuk dynamic value.

#### Phase 4: Concurrent Execution — `main_hmi_program`

**A. `mainHmiProgram.js`** — Hat block, category "Program", color `#00BCD4`
- Generator does NOT emit `highlightBlock()` — HMI runs full speed
- Enforced: max 1 `main_hmi_program` per workspace (same as `main_program`)

**B. `generateCode(ws)`** returns `{ definitions, mainCode, hmiCode }` when HMI block present

**C. `debug-engine.js`** — `runProgram()` / `runDebug()` dispatch to single or concurrent mode:
- `_runSingle()` / `_runDebugSingle()` — original behavior (no HMI block)
- `_runConcurrent()` / `_runDebugConcurrent()` — `Promise.all()` with HMI while-loop
- HMI eval scope shadows `highlightBlock` to no-op (full speed)
- Main program drives completion → `stopRequested` signals HMI loop exit
- Debug mode: only main program has stepping/breakpoints; HMI uninterrupted

**D. Save/Load** — `workspace-io.js` saves `{ workspace, hmiLayout }`, backward-compatible

**Use Case Example** — Concurrent odometry monitoring:
```
main_program:                          main_hmi_program:
  forever:                               HMI Set Number "X" = getVal [X] from [odom]
    set [odom] to getOdometry [Encoder]  HMI Set Number "Y" = getVal [Y] from [odom]
    digital_out(17, true)                HMI Set Gauge "Heading" = getVal [θ] from [odom]
    delay(1000)                          HMI Set LED "Running" = true, color: green
    digital_out(17, false)
```

### Files Changed

**New files (11)**:
1. `blocks/print.js` — Print block
2. `blocks/mainHmiProgram.js` — HMI program hat block
3. `blocks/hmiSetLed.js` — LED indicator block
4. `blocks/hmiSetNumber.js` — Numeric display block
5. `blocks/hmiSetText.js` — Text display block
6. `blocks/hmiSetGauge.js` — Gauge bar block
7. `core/hmi-manager.js` — HMI state manager + gridstack integration
8. `core/hmi-preview.js` — Design-time widget preview
9. `core/resizable-panels.js` — Drag-to-resize panels
10. `vendor/gridstack-all.js` — gridstack.js vendor file
11. `vendor/gridstack.min.css` — gridstack CSS

**Modified files (7)**:
1. `index.html` — Layout restructure, drag dividers, gridstack CSS/JS, dark theme overrides
2. `blocks/manifest.js` — Add all new block files
3. `core/registry.js` — Add Text built-in category
4. `core/async-procedures.js` — Return structured `{ definitions, mainCode, hmiCode }`
5. `core/debug-engine.js` — Concurrent run/debug, HMI.setMode() lifecycle
6. `core/ui-tabs.js` — Display structured code in Code tab
7. `workspace-init.js` — HMI.init(), initHMIPreview(), initResizablePanels(), enforce single main_hmi_program

**No Python changes** — semua murni client-side JavaScript. No build step needed.

### Definition Of Done
- [x] Print block generate `consoleLog(String(...), 'print')`, output tampil di console
- [x] Text category: `text`, `text_join`, `text_length` blocks di toolbox
- [x] Resizable panels: drag dividers between Blockly↔HMI and workspace↔console
- [x] HMI panel dengan gridstack grid layout (drag-reposition, drag-resize widgets)
- [x] Design-time preview: widgets appear when blocks placed, disappear when deleted
- [x] HMI LED/Number/Text/Gauge blocks create/update widgets via `HMI.set*()`
- [x] HMI widgets persist across loop iterations (update in place)
- [x] `main_hmi_program` block runs concurrently with `main_program` via Promise.all()
- [x] HMI loop auto-wrapped at ~20Hz, runs at full speed (no highlightBlock)
- [x] Debug mode: main program has stepping/breakpoints, HMI runs uninterrupted
- [x] Code tab displays both main and HMI code sections
- [x] Save/load preserves workspace + HMI grid layout (backward-compatible)
- [x] All blocks work in debug mode (highlightBlock + step through)

### Known Bugs (ditemukan saat testing manual, fix sudah ditulis tapi belum diverifikasi)

**Bug 1 — Blockly workspace tidak ikut resize saat panel di-drag**
- **Root cause**: `resizable-panels.js` hanya panggil `Blockly.svgResize()` tanpa update dimensi `#blockly-div` yang `position: absolute`
- **Fix**: Update `#blockly-div` width/height dari `#blockly-area` offsetWidth/Height sebelum svgResize
- **File**: `core/resizable-panels.js` (mousemove handler)
- **Verifikasi**: Drag vertical divider → Blockly canvas resize smoothly. Drag horizontal divider → sama

**Bug 2 — App freeze saat kedua program pakai `while(true)`**
- **Root cause**: User menulis `while(true)` di `main_hmi_program`. Auto-wrapper menambah outer while-loop, tapi inner `while(true)` dengan HMI calls (synchronous) tidak pernah yield ke event loop
- **Fix**: HMI shadowed `highlightBlock` diubah dari sync no-op ke `async function` dengan `stopRequested` check. Setiap `await highlightBlock()` di generated code yield ke event loop + bisa di-stop. Juga override `window.highlightBlock` di non-debug `_runConcurrent` untuk main program
- **File**: `core/debug-engine.js` — `_runConcurrent()` dan `_runDebugConcurrent()`
- **Verifikasi**: `while(true)` di kedua program → app responsif. Klik Stop → keduanya berhenti

**Bug 3 — Variabel tidak ter-share antara main dan HMI program**
- **Root cause**: `definitions` (berisi `var led;`) di-eval di dua IIFE terpisah → dua scope terpisah. Main set `led = 1`, HMI baca `led` dari scope sendiri (tetap 0)
- **Fix**: Gabung kedua program dalam SATU eval — outer IIFE berisi `definitions`, dua inner IIFE (main + HMI) close over shared scope. Variabel yang diubah di main langsung terlihat di HMI via closure
- **File**: `core/debug-engine.js` — `_runConcurrent()` dan `_runDebugConcurrent()`
- **Verifikasi**: Set `led = 1` di main, baca `led` di HMI → LED update. Test dengan delay loop toggle variable

**Bug 4 — Delete HMI block tidak menghapus preview widget; undo muncul blank widget**
- **Root cause**: `_blockToWidget` Map di `hmi-preview.js` kehilangan sinkronisasi saat undo/redo. Blockly events pada undo tidak selalu re-add mapping, sehingga widget jadi orphan
- **Fix**: Tambah `_reconcile()` dengan 100ms debounce setelah setiap workspace event. Fungsi ini compare HMI blocks di workspace vs `_blockToWidget` map, hapus widget orphan, tambah widget yang belum ter-track
- **File**: `core/hmi-preview.js`
- **Verifikasi**: Place HMI block → widget muncul. Delete → widget hilang. Undo → widget kembali. Redo → widget hilang lagi
