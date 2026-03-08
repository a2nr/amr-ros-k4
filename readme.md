# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-08

Dokumentasi lengkap dapat dilihat di [DOCUMENTATION.md](DOCUMENTATION.md).

# Aturan pengggunaan dokumen

bab pada dokumen merepresentasikan alur rencana pengembangan. 
Potential Enhancements  :   Feasibility Study
Planned Feature         :   Backlog 
Feature Task            :   Penjabaran Pekerjaan yang ready untuk dikerjakan

---

# Potential Enhancements
this list is short by priority
- **Enhance UI**: add tab to get generate version of block blocky, export/import from/to block blocky generated file, fixing visibelity text color in left colom view (curently it greyed with white text). 
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


# Future Tasks

<!-- Add new phases / features here -->