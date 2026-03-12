# Project Management — AMR ROS2 K4

> **Project**: Blockly ROS2 Robot Controller (Kiwi Wheel AMR)
> **ROS2 Distro**: Jazzy
> **Last Updated**: 2026-03-12
> **Current Focus**: 

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
- **low level node enhancement**: porting gpio_node to c++ and all low level node that run on raspberry pi using c++, if you use cross compile it using host PC, and send binnary to raspberry pi it gonna help me develop it faster.
- **Launch files**: `blockly_bringup` package with ROS2 launch files to start all nodes with one command
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
