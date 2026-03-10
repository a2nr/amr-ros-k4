# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-10
> **Current Focus**: `kiwi_controller` — Adaptive control for Kiwi Wheel drive

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
- **Implement function and main function block in blockly**: we need that.
- **ROS Feature in generated block blocky**: currently, block blocky only generate action client, and there is sub/pub and other ROS feature need to implement to get/set value to node.
- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
- **Sensor integration**: Subscriber nodes for sensor data feeding back into Blockly visual feedback
- **RealHardware implementation**: Fill in remaining ROS2 publishers/service clients for Pi hardware nodes (GPIO done via `gpio_node`, motor/servo TBD)
- **ROS2 lifecycle nodes**: Migrate executor and controller to lifecycle nodes for managed state transitions
- **Simulation**: Integrate with Gazebo/Isaac Sim for testing Kiwi Wheel kinematics before deploying to hardware
- **Block categories**: Future blocks grouped into Robot, Sensors, Navigation categories

# Feature Task

## 1 GPIO Node (digital out + digital in) : [x]
Membuat ROS2 node (`gpio_node`) yang berjalan di Raspberry Pi untuk mengontrol pin GPIO secara langsung melalui `gpiod`. Node ini menerima perintah digital output via topic `/gpio/write` dan mempublikasikan state digital input via topic `/gpio/state`. Executor handler di-wire-up untuk publish/subscribe ke topic-topic tersebut pada mode real hardware.

### Definition Of Done
- Package `gpio_node` dibuat dengan entry point `gpio_node = gpio_node.gpio_node:main`
- Custom message `GpioWrite.msg` dan `GpioRead.msg` didefinisikan di `blockly_interfaces`
- Handler `digital_out` mempublish `GpioWrite` ke `/gpio/write` pada mode real
- Handler `digital_in` subscribe ke `/gpio/state` dan membaca cache pin state
- Block `digitalIn.js` ditambahkan sebagai output block (return 0/1)
- Task `pixi run gpio-node` dan `pixi run build-gpio` tersedia
- Dependency `gpiod` ditambahkan untuk `linux-aarch64`
- Integration test `test_block_gpio.py` mencakup digital_out dan digital_in
- `pixi run build` berhasil tanpa error
