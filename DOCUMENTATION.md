# Blockly ROS2 Robot Controller — Documentation

Visual programming interface for controlling a ROS2 Jazzy Kiwi Wheel AMR.
See [readme.md](readme.md) for project overview and status.

---

## Documentation Index

| Topic | File |
|---|---|
| System architecture & Blockly–ROS2 integration flow | [docs/architecture.md](docs/architecture.md) |
| Installation, directory structure & running | [docs/installation.md](docs/installation.md) |
| Troubleshooting & known issues | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Guide: adding a new ROS2 package | [docs/ros2-package-guide.md](docs/ros2-package-guide.md) |
| `blockly_app` — file reference | [src/blockly_app/README.md](src/blockly_app/README.md) |
| `blockly_app` — creating custom blocks (full guide + reference) | [src/blockly_app/BLOCKS.md](src/blockly_app/BLOCKS.md) |
| `blockly_executor` — file reference, handlers & testing guide | [src/blockly_executor/README.md](src/blockly_executor/README.md) |
| `blockly_interfaces` — ROS2 action & message interfaces | [src/blockly_interfaces/README.md](src/blockly_interfaces/README.md) |
| `gpio_node` — Raspberry Pi GPIO node (C++, libgpiod) | [src/gpio_node/](src/gpio_node/) |
| `pca9685_node` — PCA9685 16-channel PWM controller (C++, I2C) | [src/pca9685_node/](src/pca9685_node/) |

---

## Quick Start

### Desktop (linux-64)

```bash
pixi install                  # first time only
pixi run build-interfaces     # must build interfaces first
pixi run build                # build all packages
pixi run setup-ui             # download Blockly JS vendor files (first time, needs internet)

pixi run executor             # Terminal 1 — start Action Server
pixi run app                  # Terminal 2 — start desktop GUI
```

### Raspberry Pi (linux-aarch64)

```bash
pixi install                  # install ROS2 + deps via conda
pixi run build-gpio           # installs system deps (apt) + builds gpio_node
pixi run build-pca9685        # installs system deps (apt) + builds pca9685_node

pixi run gpio-node            # start GPIO node
pixi run pca9685-node         # start PCA9685 PWM node
```

`build-gpio` and `build-pca9685` automatically run `setup-dep` which installs system libraries (`libgpiod-dev`, `liblttng-ust-dev`, `i2c-tools`) via `apt`.

See [docs/installation.md](docs/installation.md) for full setup and prerequisites.
