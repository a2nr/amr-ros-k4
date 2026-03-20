# Blockly ROS2 Robot Controller — Documentation

Visual programming interface for controlling a ROS2 Jazzy Kiwi Wheel AMR.
See [readme.md](readme.md) for project overview and status.

---

## Documentation Index

| Topic | File |
|---|---|
| System architecture, HMI Panel & concurrent execution | [docs/architecture.md](docs/architecture.md) |
| Installation, directory structure & running | [docs/installation.md](docs/installation.md) |
| Troubleshooting & known issues | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Guide: adding a new ROS2 package | [docs/ros2-package-guide.md](docs/ros2-package-guide.md) |
| `blockly_app` — file reference (incl. HMI core modules) | [src/blockly_app/README.md](src/blockly_app/README.md) |
| `blockly_app` — creating blocks (ROS2 action + client-side + HMI) | [src/blockly_app/docs/BLOCKS.md](src/blockly_app/docs/BLOCKS.md) |
| `blockly_executor` — file reference, handlers & testing guide | [src/blockly_executor/README.md](src/blockly_executor/README.md) |
| `blockly_interfaces` — ROS2 action & message interfaces | [src/blockly_interfaces/README.md](src/blockly_interfaces/README.md) |
| `gpio_node` — Raspberry Pi GPIO node (C++, libgpiod) | [src/gpio_node/README.md](src/gpio_node/README.md) |
| `pca9685_node` — PCA9685 16-channel PWM controller (C++, I2C) | [src/pca9685_node/README.md](src/pca9685_node/README.md) |
| `as5600_node` — AS5600 12-bit magnetic encoder (C++, I2C) | [src/as5600_node/README.md](src/as5600_node/README.md) |
| `amr_bringup` — ROS2 launch files (desktop bringup) | [src/amr_bringup/launch/](src/amr_bringup/launch/) |

---

## Quick Start

### Desktop (linux-64)

```bash
pixi install                  # first time only
pixi run build-interfaces     # must build interfaces first
pixi run build                # build all packages
pixi run setup-ui             # download Blockly JS vendor files (first time, needs internet)

pixi run launch-blockly       # one command — executor (dummy) + app
# or separately:
pixi run executor             # Terminal 1 — start Action Server
pixi run app                  # Terminal 2 — start desktop GUI
```

### Raspberry Pi (linux-aarch64)

```bash
pixi install                  # install ROS2 + deps via conda
pixi run build-gpio           # installs system deps (apt) + builds gpio_node
pixi run build-pca9685        # installs system deps (apt) + builds pca9685_node
pixi run build-as5600         # installs system deps (apt) + builds as5600_node

pixi run gpio-node            # start GPIO node
pixi run pca9685-node         # start PCA9685 PWM node
pixi run as5600-node          # start AS5600 encoder node
```

`build-gpio`, `build-pca9685`, and `build-as5600` automatically run `setup-dep` which installs system libraries (`libgpiod-dev`, `liblttng-ust-dev`, `i2c-tools`) via `apt`.

See [docs/installation.md](docs/installation.md) for full setup and prerequisites.

---

## Raspberry Pi GPIO Pinout

Pin yang terpakai di project ini ditandai dengan `<<<`.

```
           Raspberry Pi 40-Pin Header (BCM)

  Pin#  NAME                         NAME                Pin#
  ──────────────────────────── ● ● ────────────────────────────
   01   3.3V Power             ○ ●  5V Power              02
   03   GPIO02 (SDA1)      <<< ○ ●  5V Power              04
   05   GPIO03 (SCL1)      <<< ○ ○  Ground                06
   07   GPIO04                 ○ ○  GPIO14                08
   09   Ground                 ○ ○  GPIO15                10
   11   GPIO17           ⚠ <<< ○ ○  GPIO18                12
   13   GPIO27           ⚠ <<< ○ ○  Ground                14
   15   GPIO22           ⚠ <<< ○ ○  GPIO23            <<< 16
   17   3.3V Power             ○ ○  GPIO24                18
   19   GPIO10                 ○ ○  Ground                20
   21   GPIO09                 ○ ○  GPIO25                22
   23   GPIO11                 ○ ○  GPIO08                24
   25   Ground                 ○ ○  GPIO07                26
   27   ID_SD                  ○ ○  ID_SC                 28
   29   GPIO05             <<< ○ ○  Ground                30
   31   GPIO06             <<< ○ ○  GPIO12                32
   33   GPIO13             <<< ○ ○  Ground                34
   35   GPIO19                 ○ ○  GPIO16                36
   37   GPIO26                 ○ ○  GPIO20                38
   39   Ground                 ○ ○  GPIO21                40
```

### Keterangan Pin Terpakai

| GPIO | Pin# | Fungsi | Node | File |
|------|------|--------|------|------|
| 2 | 03 | I2C SDA bus 1 | `pca9685_node` + `as5600_node` (encoder 0) | `src/pca9685_node/src/pca9685_node.cpp:17` / `src/as5600_node/src/as5600_node.cpp:19` |
| 3 | 05 | I2C SCL bus 1 | `pca9685_node` + `as5600_node` (encoder 0) | (sama) |
| 17 | 11 | Digital output / I2C SDA bus 3 | `gpio_node` output[0] / `as5600_node` (encoder 1) | `src/gpio_node/src/gpio_node.cpp:12` / `/boot/config.txt` |
| 27 | 13 | Digital output / I2C SCL bus 3 | `gpio_node` output[1] / `as5600_node` (encoder 1) | (sama) |
| 22 | 15 | Digital output / I2C SDA bus 4 | `gpio_node` output[2] / `as5600_node` (encoder 2) | (sama) |
| 23 | 16 | I2C SCL bus 4 | `as5600_node` (encoder 2) | `/boot/config.txt` |
| 5 | 29 | Digital input | `gpio_node` input[0] | `src/gpio_node/src/gpio_node.cpp:13` |
| 6 | 31 | Digital input | `gpio_node` input[1] | (sama) |
| 13 | 33 | Digital input | `gpio_node` input[2] | (sama) |

> **⚠ WARNING — GPIO 17, 27, 22 duplikasi:** Dipakai `gpio_node` (digital output) sekaligus `as5600_node` (I2C bit-bang bus 3 & 4). Kalau keduanya jalan bareng, ganti `output_pins` di `gpio_node` ke pin lain.
