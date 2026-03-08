# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-08

---

## Planned Packages

| Package | Purpose | Status |
|---------|---------|--------|
| `blockly_app` | Desktop Blockly GUI + Action Client | ✅ Done |
| `blockly_executor` | Action Server — command handler registry | ✅ Done |
| `blockly_interfaces` | Custom ROS2 action definitions | ✅ Done |
| `kiwi_controller` | Adaptive control for Kiwi Wheel drive | 📋 Planned |

## Future Tasks

<!-- Add new phases / features here -->

### Potential Enhancements

- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
- **Sensor integration**: Subscriber nodes for sensor data feeding back into Blockly visual feedback
- **RealHardware implementation**: Fill in ROS2 publishers/service clients for actual Pi hardware nodes (topics TBD)
- **Web-based UI**: Replace pywebview with a web server mode for remote access from any browser
- **ROS2 lifecycle nodes**: Migrate executor and controller to lifecycle nodes for managed state transitions
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories
