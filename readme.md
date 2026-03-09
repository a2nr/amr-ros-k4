# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-09
> **Current Focus**: `kiwi_controller` — Adaptive control for Kiwi Wheel drive

Dokumentasi lengkap dapat dilihat di [DOCUMENTATION.md](DOCUMENTATION.md).

# Aturan pengggunaan dokumen

bab pada dokumen merepresentasikan alur rencana pengembangan. 
Potential Enhancements  :   Feasibility Study
Planned Feature         :   Backlog 
Feature Task            :   Penjabaran Pekerjaan yang ready untuk dikerjakan. Task harus dijelaskan apa yang akan dikerjakan dan terdapat definition of done nya

---

# Potential Enhancements
this list is short by priority
- **Potensial inefective development**: in handlers/hardware use interface.py to all hardware (dummy, ros2, and hardware) class that posibly haavily change.
- ** UI bug **: stop button not actualy stop execution. tried with long delay with loop and press stop button, program still continue
- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
- **Sensor integration**: Subscriber nodes for sensor data feeding back into Blockly visual feedback
- **RealHardware implementation**: Fill in ROS2 publishers/service clients for actual Pi hardware nodes (topics TBD)
- **ROS2 lifecycle nodes**: Migrate executor and controller to lifecycle nodes for managed state transitions
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories

# Planned Feature

| Package | Purpose | Status |
|---------|---------|--------|
| `blockly_app` | Desktop Blockly GUI + Action Client | ✅ Done |
| `blockly_executor` | Action Server — command handler registry | ✅ Done |
| `blockly_interfaces` | Custom ROS2 action definitions | ✅ Done |
| `kiwi_controller` | Adaptive control for Kiwi Wheel drive | 📋 Planned |
| **Enhance UI** | Tab Code preview, Export/Import, dark toolbox | ✅ Done |


# Feature Task

## Enhance UI

| # | Task | Status |
|---|------|--------|
| 1 | Fix toolbox text color (dark theme via `Blockly.Theme.defineTheme`) | ✅ Done |
| 2 | Add "Code" tab — realtime generated JS preview | ✅ Done |
| 3 | Export/Import workspace (.json) via toolbar buttons | ✅ Done |

**Files changed:**
- `src/blockly_app/blockly_app/ui/blockly/workspace-init.js` — dark theme definition + code panel change listener
- `src/blockly_app/blockly_app/ui/blockly/core/ui-tabs.js` *(new)* — `switchTab()`, `refreshCodePanel()`
- `src/blockly_app/blockly_app/ui/blockly/core/workspace-io.js` *(new)* — `exportWorkspace()`, `importWorkspace()` via `await window.pywebview.api`
- `src/blockly_app/blockly_app/ui/index.html` — CSS, HTML tab bar, code panel, toolbar buttons
- `src/blockly_app/blockly_app/app.py` — `save_workspace()`, `load_workspace()` via zenity subprocess

**Note — Export/Import implementation:**
`pywebview.create_file_dialog` dan `QFileDialog` via `QTimer.singleShot` keduanya gagal dari background thread (deadlock / no event loop).
Solusi final: `tkinter.filedialog` — interpreter Tcl/Tk terpisah dari Qt, tidak ada konflik thread, sudah tersedia di pixi environment tanpa dependency tambahan.
