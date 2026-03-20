# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-18
> **Current Focus**: Task #6 — HMI Interactive Widgets

Dokumentasi lengkap dapat dilihat di [DOCUMENTATION.md](DOCUMENTATION.md).

**Aturan pengggunaan dokumen**

bab pada dokumen merepresentasikan alur rencana pengembangan. 

> **Potential Enhancements**
> 
> bab ini digunakan untuk Feasibility Study
> 
> **Planned Feature**
> 
> Backlog. Setelah kita pelajari untuk di kerjakan maka kita pindah ke backlog
> 
> **Feature Task**
> 
> penjabaran Pekerjaan yang ready untuk dikerjakan. Task harus dijelaskan apa yang akan dikerjakan dan terdapat definition of done nya
> Berikut ini adalah template untuk pembuatan task :
> 
> ```
> ## <nomor task> <judul task> : <state: [ ] >
> jelaskan permasalah di bab ini
> ### Bug 1 [ ] : Keterangan bug untuk rekap permasalahan
> **Symtomp**    : jelaskan masalahnya!
> **Root Couse** : masalah ini dikarenakan apa?
> **Fix**        : bagaimana cara fix nya?
> ### Definition Of Done
> [ ] DoD 1
> [ ] DoD 2
> [ ] Bug 1 ... 
> 
> ```

---

# Potential Enhancements

this sub title list is short by priority

## **Feasibility Study to implement Vision Sensor**

coba kamu lakukan penelitian literatur untuk penerapan vision sensor dengan kemampuan berikut ini 
1. Melakukan pengenalan warna dan obyek beserta prosedur untuk training warna
2. Melakukan penghitungan obyek yang tersusun secara urut dari kiri ke kanan.

berikan proposal mu untuk mencakup penerapannya juga di blockly app.

berikut ini adalah path yang aku sarankan untuk menampung hasil penelitianmu
```
src/amr_vision_node
├── docs/
│   └── feasibility.md     
```
## **Feasibility Study to implement Controller**

do some research about to make my mobile robot move flawlesly. the scope is controller, kenematics, identification system. kamu bisa rekap hasil feasibility study mu di path berikut ini dan folder amt_controller_node sekaligus sebagai workspace node kusus controller robot tapi tetap rekap task di amr-ros-k4/readme.md
```
src/amr_controller_node
├── docs/            
│   └── feasibility.md     
```

## **Simulation**

 Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware

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


## 6 Enhancement: Split BLOCKS.md Documentation : [x]
BLOCKS.md (1225 baris) dipecah menjadi 4 file terpisah + index di `src/blockly_app/docs/` agar lebih mudah dinavigasi.

### Definition Of Done
- [x] `docs/BLOCKS.md` — index / table of contents (~40 baris)
- [x] `docs/01-quickstart.md` — walkthrough end-to-end menambah block baru
- [x] `docs/02-block-api-ref.md` — API reference `BlockRegistry.register()`, `definition.init`
- [x] `docs/03-templates.md` — 6 template copy-paste (A–F)
- [x] `docs/04-examples.md` — contoh real (`digitalOut`, `digitalIn`, `delay`) + tabel kategori
- [x] Semua referensi ke BLOCKS.md di-update (README.md, DOCUMENTATION.md, blockly_interfaces/README.md, readme.md)
- [x] Original `BLOCKS.md` dihapus

## 8 Enhancement: Launch Files — Desktop Bringup : [ ]
ROS2 launch files untuk menjalankan executor + blockly_app dengan satu command. Package `amr_bringup` (ament_python, launch-only).

### Implementasi

#### A. Package Structure
```
src/amr_bringup/
├── package.xml
├── setup.py / setup.cfg
├── resource/amr_bringup
├── amr_bringup/__init__.py
├── launch/
│   ├── blockly.launch.py        # executor (dummy) + blockly_app
│   └── blockly_hw.launch.py     # executor (real)  + blockly_app
└── config/                      # reserved untuk Pi nodes YAML nanti
```

#### B. Pixi Tasks
```bash
pixi run launch-blockly      # executor dummy + app (development)
pixi run launch-blockly-hw   # executor real + app (Pi nodes harus sudah jalan)
```

#### C. Catatan
- `blockly_app` diluncurkan via `ExecuteProcess` (bukan `Node()`) karena pywebview memerlukan main thread ownership
- Pi nodes (gpio, pca9685, as5600) akan dibahas terpisah — kemungkinan menggunakan C++ composition (`rclcpp_components`) untuk optimasi resource di Raspberry Pi
- Ctrl+C menghentikan semua node sekaligus

### Definition Of Done
- [x] `src/amr_bringup/` package scaffolding (package.xml, setup.py, setup.cfg, resource)
- [x] `launch/blockly.launch.py` — executor dummy + app
- [x] `launch/blockly_hw.launch.py` — executor real + app
- [x] Pixi tasks: `build-bringup`, `launch-blockly`, `launch-blockly-hw`
- [x] `pixi run launch-blockly` berhasil menjalankan executor + app
- [x] `pixi run launch-blockly-hw` berhasil menjalankan executor (real) + app
- [x] Ctrl+C menghentikan semua proses

