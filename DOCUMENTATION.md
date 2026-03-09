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
| `blockly_interfaces` — ROS2 action interface | [src/blockly_interfaces/README.md](src/blockly_interfaces/README.md) |

---

## Quick Start

```bash
pixi install                  # first time only
pixi run build-interfaces     # must build interfaces first
pixi run build                # build all packages
pixi run setup-ui             # download Blockly JS vendor files (first time, needs internet)

pixi run executor             # Terminal 1 — start Action Server
pixi run app                  # Terminal 2 — start desktop GUI
```

See [docs/installation.md](docs/installation.md) for full setup and prerequisites.
