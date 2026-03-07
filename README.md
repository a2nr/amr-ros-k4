# Blockly ROS2 Robot Controller

Sistem visual programming berbasis Blockly untuk mengendalikan pergerakan robot melalui ROS2 Action. User menyusun program dengan drag-and-drop blok di antarmuka desktop — termasuk menggunakan konstruksi pemrograman seperti loop, kondisional, dan variabel yang disediakan Blockly secara native. Ketika program dijalankan, Blockly bertindak sebagai executor program itu sendiri: setiap kali menemui blok action robot, Blockly mengirim ROS2 Action Goal, menunggu feedback dan result, lalu melanjutkan alur program berdasarkan hasilnya.

---

## Daftar Isi

- [Arsitektur Sistem](#arsitektur-sistem)
- [Cara Kerja](#cara-kerja)
- [ROS2 Interface](#ros2-interface)
- [Struktur Folder](#struktur-folder)
- [Setup Environment](#setup-environment)
- [Task Breakdown](#task-breakdown)
- [Panduan Membuat Blok Baru](#panduan-membuat-blok-baru)
- [Panduan Membuat Test Script untuk Blok Baru](#panduan-membuat-test-script-untuk-blok-baru)
- [Strategi Testing](#strategi-testing)

---

## Arsitektur Sistem

Sistem ini terdiri dari tiga komponen utama yang dipisahkan secara bersih berdasarkan tanggung jawabnya masing-masing.

```
+------------------------------------------------------+
|                 Aplikasi Desktop                     |
|                  (pywebview)                         |
|                                                      |
|   +----------------------+                          |
|   |     Blockly UI       |  HTML/JS                 |
|   |                      |                          |
|   |  * user susun blok   |  Blockly adalah          |
|   |  * if/else, loop,    |  EXECUTOR program —      |
|   |    variable (native) |  bukan hanya editor.     |
|   |  * highlight otomatis|                          |
|   |    saat blok berjalan|  Ketika menemui blok     |
|   |                      |  action robot, Blockly   |
|   |  [Run] [Stop]        |  memanggil Python dan    |
|   |                      |  menunggu hasilnya       |
|   +----------+-----------+  sebelum lanjut.         |
|              |  JS <-> Python bridge (pywebview API)   |
|              |  * execute_action(command, params)    |
|              |  <- return: {success, message}         |
|   +----------v-----------+                          |
|   |   ROS2 Action Client |  Python/rclpy            |
|   |                      |  berjalan di thread      |
|   |  * terima perintah   |  terpisah, tapi          |
|   |    dari Blockly      |  dipanggil secara        |
|   |  * kirim Action Goal |  synchronous dari        |
|   |  * tunggu Result     |  perspektif Blockly.     |
|   |  * kembalikan result |                          |
|   |    ke Blockly        |                          |
|   +----------+-----------+                          |
+--------------+---------------------------------------+
               |  ROS2 Action — BlocklyAction.action
               |  (satu action per panggilan)
+--------------v---------------------------------------+
|              Executor Node                           |
|              (Action Server)                         |
|                                                      |
|  Executor Node hanya menangani SATU action dalam     |
|  satu waktu. Dia tidak tahu soal urutan program —    |
|  urutan dikendalikan sepenuhnya oleh Blockly.        |
|                                                      |
|   +----------------------+                          |
|   |   Handler Registry   |  extensible command map  |
|   |  * led_on            |                          |
|   |  * led_off           |                          |
|   |  * delay             |                          |
|   +----------+-----------+                          |
|              |                                       |
|   +----------v-----------+                          |
|   |  Hardware Interface  |  abstraksi hardware      |
|   |  * DummyHardware     |  untuk dev & test        |
|   |  * GpioHardware      |  untuk Raspberry Pi      |
|   +----------------------+                          |
+------------------------------------------------------+
```

### Pergeseran Paradigma: Blockly sebagai Executor

Poin terpenting dalam arsitektur ini adalah bahwa **Blockly bukan hanya editor visual** — dia adalah runtime program yang sesungguhnya. Blockly menjalankan program menggunakan interpreter JavaScript-nya sendiri, yang berarti seluruh ekspresi pemrograman yang Blockly sediakan secara native — loop `repeat`, kondisional `if/else`, variabel, dan lain-lain — bekerja secara alami tanpa perlu diimplementasikan ulang di sisi ROS2.

Konsekuensi dari desain ini ada dua hal yang saling berkaitan. Pertama, Executor Node menjadi jauh lebih sederhana: dia tidak perlu memahami konsep "program" sama sekali. Tugasnya hanya menerima satu action pada satu waktu, mengeksekusinya, dan melaporkan hasilnya. Kedua, debug mode dan highlighting menjadi lebih natural: Blockly sudah memiliki API bawaan untuk meng-highlight blok yang sedang berjalan, dan karena Blockly sendiri yang mengendalikan alur eksekusi, dia selalu tahu blok mana yang aktif.

---

## Cara Kerja

### Alur Eksekusi Satu Action

Bayangkan user menyusun program seperti ini di Blockly:

```
[nyalakan LED pin 1]
[tunggu 500ms]
[nyalakan LED pin 2]
```

Ketika user menekan Run, Blockly mulai mengeksekusi program dari atas ke bawah — persis seperti interpreter bahasa pemrograman pada umumnya. Saat Blockly tiba di blok `[nyalakan LED pin 1]`, alur berikut terjadi secara berurutan dan sinkron dari perspektif program Blockly.

Pertama, Blockly meng-highlight blok tersebut menggunakan API-nya sendiri. Kedua, Blockly memanggil fungsi Python `execute_action("led_on", {pin: 1})` lewat pywebview bridge — dan di sini Blockly *menunggu*, program tidak melanjutkan ke blok berikutnya. Ketiga, Python menerima perintah ini dan mengirimkan ROS2 Action Goal ke Executor Node. Keempat, Executor Node mengeksekusi action, mengirim feedback selama proses berlangsung, lalu mengirim result ketika selesai. Kelima, Python menerima result dan mengembalikannya ke JavaScript. Keenam, baru setelah return value diterima, Blockly melanjutkan eksekusi ke blok berikutnya.

Inilah mengapa loop dan kondisional bekerja secara natural — Blockly bisa menggunakan result dari setiap action sebagai kondisi untuk keputusan selanjutnya, misalnya `if led_on(pin=1) berhasil, maka nyalakan pin 2`.

### Mengapa Bukan "Generate Steps"

Alternatif yang tidak kita pakai adalah Blockly men-generate daftar instruksi dulu, mengirimnya semua ke ROS2, lalu ROS2 yang mengeksekusi satu per satu. Pendekatan itu punya masalah fundamental — bagaimana cara merepresentasikan `if/else` sebagai daftar flat instruksi? Bagaimana cara mengirim `repeat 10 times` ke ROS2 tanpa ROS2 perlu memahami semantik looping? Dengan membiarkan Blockly yang mengeksekusi programnya sendiri, masalah-masalah itu tidak pernah muncul. ROS2 hanya perlu mengerti satu hal: jalankan action ini sekarang dan beri tahu saya hasilnya.

---

## ROS2 Interface

Karena Executor Node hanya menangani satu action dalam satu waktu, interface-nya menjadi sangat sederhana dan generik. Satu file `.action` ini berlaku untuk semua instruksi yang ada sekarang maupun yang akan ditambahkan di masa depan.

### `BlocklyAction.action`

```
# GOAL — satu instruksi untuk dieksekusi
string command         # nama instruksi: "led_on", "delay", "move_forward"
string[] param_keys    # nama-nama parameter, contoh: ["pin"]
string[] param_values  # nilai-nilai parameter, contoh: ["3"]

---

# RESULT — dikirim setelah action selesai atau gagal
bool success
string message         # pesan sukses atau deskripsi error yang informatif

---

# FEEDBACK — dikirim selama eksekusi berlangsung
string status          # "executing" | "done" | "error"
```

Perhatikan bahwa tidak ada field `start_step` atau `debug_mode` di interface ini. Kedua fitur tersebut sepenuhnya dikelola oleh Blockly di sisi JavaScript — Executor Node tidak perlu mengerti konsep-konsep tersebut.

---

## Struktur Folder

```
blockly_ros2/
|
+-- pixi.toml                        # environment & task definitions
|
+-- interfaces/                      # ROS2 custom interface package
|   +-- package.xml
|   +-- CMakeLists.txt
|   +-- action/
|       +-- BlocklyAction.action     # satu file untuk semua instruksi
|
+-- executor/                        # ROS2 Executor Node package
|   +-- package.xml
|   +-- setup.py
|   +-- executor/
|       +-- __init__.py
|       +-- executor_node.py         # ROS2 Action Server (wrapper tipis)
|       +-- handlers.py              # HandlerRegistry + semua handler
|       +-- utils.py                 # parse_params dan helper lainnya
|       +-- hardware/
|           +-- __init__.py
|           +-- interface.py         # HardwareInterface abstract class
|           +-- dummy_hardware.py    # implementasi untuk dev & test
|           +-- gpio_hardware.py    # implementasi untuk Raspberry Pi
|
+-- app/                             # pywebview desktop application
|   +-- app.py                       # entry point: pywebview + Action Client
|   +-- ui/
|       +-- index.html               # main UI
|       +-- blockly/
|           +-- blocks.js            # definisi visual custom blocks
|           +-- executor.js          # perilaku runtime setiap blok action
|
+-- tests/                           # integration test suite
    +-- conftest.py                  # shared fixtures: ros context, exe_action
    +-- test_block_led_on.py
    +-- test_block_led_off.py
    +-- test_block_delay.py
```

Perhatikan bahwa di folder `app/ui/blockly/` tidak ada `generator.js` — melainkan `executor.js`. Namanya mencerminkan perannya: file ini bukan menghasilkan representasi teks dari blok, melainkan mendefinisikan *perilaku runtime* setiap blok action saat dieksekusi oleh interpreter Blockly.

---

## Setup Environment

Project ini menggunakan **Pixi** dengan channel **RoboStack Jazzy** untuk mengelola dependency ROS2 secara terisolasi, sehingga tidak memerlukan instalasi ROS2 di level sistem. Setup yang sama berlaku di Ubuntu x86_64 maupun Raspberry Pi aarch64.

```toml
# pixi.toml
[project]
name     = "blockly-ros2-controller"
version  = "0.1.0"
channels = ["conda-forge", "robostack-jazzy"]
platforms = ["linux-64", "linux-aarch64"]

[dependencies]
python                               = ">=3.11"
ros-jazzy-rclpy                      = "*"
ros-jazzy-rosidl-default-runtime     = "*"
ros-jazzy-rosidl-default-generators  = "*"
pywebview                            = "*"
pytest                               = "*"

[tasks]
build-interfaces = "cd interfaces && colcon build --symlink-install"
executor         = "python executor/executor/executor_node.py"
app              = "python app/app.py"
test             = "pytest tests/ -v"
```

### Perintah Harian

```bash
# Install semua dependency
pixi install

# Build ROS2 custom interfaces (wajib dijalankan sekali di awal)
pixi run build-interfaces

# Jalankan Executor Node (terminal 1)
pixi run executor

# Jalankan aplikasi desktop (terminal 2)
pixi run app

# Jalankan semua test (executor harus sudah berjalan di terminal lain)
pixi run test
```

---

## Task Breakdown

### Fase 0 — Setup Environment & Struktur Project

Tujuan fase ini adalah memastikan seluruh fondasi project berdiri kokoh sebelum satu baris kode fungsional ditulis. Setiap developer — termasuk dirimu sendiri di Raspberry Pi enam bulan kemudian — harus bisa menjalankan project ini dari nol hanya dengan `pixi install`.

---

**Task 0.1 — Inisialisasi Pixi Project**

Membuat `pixi.toml` dengan channel `conda-forge` dan `robostack-jazzy`, mendefinisikan semua dependency, dan menetapkan platform target `linux-64` serta `linux-aarch64`.

*Definition of Done:* `pixi install` selesai tanpa error di mesin Ubuntu. Semua package terinstal di environment terisolasi tanpa menyentuh sistem ROS2 yang mungkin sudah ada. Perintah `pixi run python -c "import rclpy"` berhasil tanpa `ImportError`.

---

**Task 0.2 — Definisi Task Shortcuts**

Menambahkan task `build-interfaces`, `executor`, `app`, dan `test` ke dalam `pixi.toml` sehingga workflow sehari-hari cukup dengan satu perintah `pixi run <task>`.

*Definition of Done:* Setiap `pixi run <task>` menghasilkan output yang sesuai atau error yang informatif, bukan "command not found". Tidak ada task yang membutuhkan aktivasi manual environment terlebih dahulu.

---

**Task 0.3 — Inisialisasi Struktur Folder**

Membuat seluruh struktur folder sesuai dengan yang terdefinisi di bagian [Struktur Folder](#struktur-folder), termasuk file `__init__.py` dan placeholder kosong untuk file yang belum diisi.

*Definition of Done:* Struktur folder sesuai dengan dokumentasi. Setiap direktori package Python memiliki `__init__.py`. Project bisa di-commit ke git tanpa file yang hilang.

---

### Fase 1 — Definisi Custom ROS2 Interface

Interface adalah kontrak yang mengikat seluruh sistem. Semua node bergantung pada file ini, sehingga Fase 1 harus selesai sebelum Fase 2 dan Fase 4 bisa dimulai.

---

**Task 1.1 — Menulis `BlocklyAction.action`**

Membuat file `interfaces/action/BlocklyAction.action` dengan struktur Goal, Result, dan Feedback sesuai desain di bagian [ROS2 Interface](#ros2-interface).

*Definition of Done:* File `.action` valid secara sintaks ROS2 dan memiliki dua separator `---` yang memisahkan ketiga section dengan benar.

---

**Task 1.2 — Setup `CMakeLists.txt` dan `package.xml`**

Menulis konfigurasi build yang diperlukan `colcon` untuk menemukan dan meng-compile file interface menjadi Python module.

*Definition of Done:* `pixi run build-interfaces` selesai tanpa error dan menghasilkan direktori `install/` yang berisi module Python hasil compile.

---

**Task 1.3 — Verifikasi Import Interface**

*Definition of Done:* Potongan kode berikut berhasil dijalankan tanpa error:
```python
from interfaces.action import BlocklyAction
goal = BlocklyAction.Goal()
goal.command = "led_on"
goal.param_keys = ["pin"]
goal.param_values = ["3"]
```

---

### Fase 2 — Executor Node (Action Server)

Arsitekturnya dibangun dari lapisan paling dalam ke luar — hardware abstraction dulu, lalu handler, lalu ROS2 wrapper. Fase 2 dan Fase 3 bisa dikerjakan secara paralel.

---

**Task 2.1 — `HardwareInterface` Abstract Class**

Membuat `executor/hardware/interface.py` yang mendefinisikan abstract base class dengan method `set_led(pin, state)` dan `is_ready()`.

*Definition of Done:* Menginstansiasi `HardwareInterface()` secara langsung menghasilkan `TypeError`. Subclass yang tidak mengimplementasikan semua abstract method juga menghasilkan `TypeError` saat diinstansiasi.

---

**Task 2.2 — `DummyHardware` Implementation**

Membuat `executor/hardware/dummy_hardware.py` yang mengimplementasikan `HardwareInterface`. State LED disimpan dalam `led_states: dict[int, bool]` dan setiap perintah yang masuk dicatat ke `call_log: list[str]`.

*Definition of Done:* `DummyHardware()` bisa diinstansiasi. `set_led(3, True)` menghasilkan `led_states[3] == True` dan entri `"set_led(pin=3, state=True)"` di `call_log`. Tidak ada import eksternal selain Python stdlib.

---

**Task 2.3 — `parse_params` Utility**

Membuat fungsi `parse_params(keys, values) -> dict` di `executor/utils.py` yang mengubah dua array paralel menjadi dictionary dan raise `ValueError` jika panjang kedua array tidak sama.

*Definition of Done:* `parse_params(["pin"], ["3"])` mengembalikan `{"pin": "3"}`. `parse_params([], [])` mengembalikan `{}`. `parse_params(["pin", "x"], ["3"])` raise `ValueError` yang pesannya menyebutkan panjang aktual kedua array.

---

**Task 2.4 — `HandlerRegistry` dan Handler Awal**

Membuat `executor/handlers.py` dengan class `HandlerRegistry` yang menerima `HardwareInterface` sebagai dependency injection. Handler tersedia untuk `led_on`, `led_off`, dan `delay`.

*Definition of Done:* `registry.execute("led_on", {"pin": "3"})` mengembalikan `True` dan mengubah state di `DummyHardware`. `registry.execute("unknown_cmd", {})` mengembalikan `False` tanpa raise exception. `registry.execute("led_on", {})` raise `KeyError` yang pesannya menyebutkan `"pin"`.

---

**Task 2.5 — `ExecutorNode` ROS2 Action Server**

Membuat `executor/executor_node.py` sebagai Action Server yang menerima `BlocklyAction.Goal`, meneruskannya ke `HandlerRegistry`, dan mengirim Feedback serta Result sesuai hasilnya. Node menerima `HardwareInterface` sebagai parameter konstruktor.

*Definition of Done:* Node bisa dijalankan dengan `pixi run executor` tanpa error. Perintah berikut dari terminal menghasilkan Feedback status `"executing"` dan Result `success: true`:
```bash
ros2 action send_goal /execute_blockly_action interfaces/action/BlocklyAction \
  "{command: 'led_on', param_keys: ['pin'], param_values: ['3']}"
```

---

### Fase 3 — Blockly UI

Fase ini dikerjakan sepenuhnya di browser biasa tanpa ROS2. Tidak ada automated test — verifikasi dilakukan secara visual dan via browser console selama pembuatan.

---

**Task 3.1 — Setup HTML dan Blockly Canvas (Local Bundle)**

Membuat `app/ui/index.html` yang mengload Blockly dari file lokal dan menyiapkan workspace canvas.

Perlu dipahami bahwa **CDN tidak bisa digunakan** untuk project ini. CDN adalah server eksternal di internet — artinya tag seperti `<script src="https://unpkg.com/blockly/...">` akan gagal total jika laptop atau Raspberry Pi tidak terhubung ke jaringan, yang merupakan kondisi umum saat mengoperasikan robot di lapangan atau lab terisolasi. Oleh karena itu Blockly dan `@blockly/interpreter` harus disimpan sebagai file lokal di dalam project.

Cara mendapatkan file-file tersebut adalah dengan menjalankan `npm install blockly @blockly/interpreter` sekali saja di mesin yang terhubung internet, lalu menyalin file hasil build ke direktori `app/ui/vendor/`. Direktori ini kemudian di-commit ke git sehingga tidak ada dependency internet saat runtime. Task ini juga menambahkan task `setup-ui` di `pixi.toml` yang menjalankan proses ini secara otomatis.

Struktur folder `app/ui/` yang bertambah:

```
app/ui/
+-- index.html
+-- vendor/                    <- file JS lokal, tidak butuh internet saat runtime
|   +-- blockly.min.js
|   +-- interpreter.min.js     <- untuk fitur step-by-step debug (Task 3.4)
+-- blockly/
    +-- blocks.js
    +-- executor.js
```

*Definition of Done:* File `index.html` bisa dibuka dan Blockly workspace muncul sepenuhnya **tanpa koneksi internet aktif** — diverifikasi dengan mematikan WiFi sebelum membuka file. Tidak ada request ke domain eksternal yang terlihat di tab Network pada browser DevTools.

---

**Task 3.2 — Custom Block Definitions**

Membuat `app/ui/blockly/blocks.js` yang mendefinisikan tampilan visual untuk blok `led_on`, `led_off`, dan `delay` dengan field input yang sesuai dan warna yang membedakan kategori.

Karena Task 3.4 memperkenalkan fitur breakpoint, task ini juga perlu menyiapkan mekanisme visual untuk itu. Setiap blok harus punya event listener klik yang men-toggle status breakpoint pada blok tersebut — ditandai dengan perubahan warna atau ikon pada blok. Blockly menyediakan `block.setColour()` dan custom icon melalui `block.appendDummyInput()` yang bisa dimanfaatkan untuk ini. Daftar blok yang sedang aktif sebagai breakpoint disimpan dalam sebuah `Set` JavaScript bernama `activeBreakpoints` yang bisa diakses oleh debug engine di `executor.js`.

*Definition of Done:* Ketiga blok muncul di toolbox dan bisa disambungkan satu sama lain maupun diletakkan di dalam blok `repeat` atau `if/else` bawaan Blockly. Mengklik sebuah blok sambil mode debug aktif akan mengubah warnanya menjadi merah sebagai tanda breakpoint, dan klik kedua menghapus tanda tersebut. `activeBreakpoints` berisi `block.id` yang benar setelah operasi toggle.

---

**Task 3.3 — Block Runtime Executor**

Membuat `app/ui/blockly/executor.js` yang mendefinisikan perilaku runtime setiap custom block saat dieksekusi oleh interpreter Blockly. Setiap blok action menghasilkan kode JavaScript yang memanggil `execute_action()` dan menunggu hasilnya sebelum lanjut.

```javascript
// executor.js

// Fungsi helper yang dipanggil oleh setiap blok action.
// Memanggil Python via pywebview bridge dan mengembalikan
// result sebagai Promise — sehingga bisa di-await oleh interpreter.
async function executeAction(command, params) {
  const keys   = Object.keys(params);
  const values = Object.values(params).map(String);
  return await window.pywebview.api.execute_action(command, keys, values);
  // return: { success: bool, message: string }
}

// Mendefinisikan apa yang terjadi saat Blockly mengeksekusi blok led_on.
// Kode yang di-generate di sini dijalankan oleh interpreter Blockly,
// bukan dikirim ke ROS2 sebagai teks.
javascript.javascriptGenerator.forBlock['led_on'] = function(block) {
  const pin  = block.getFieldValue('PIN');
  // Kode ini di-await oleh interpreter — Blockly tidak lanjut
  // ke blok berikutnya sampai executeAction selesai.
  return `await executeAction('led_on', { pin: '${pin}' });\n`;
};

javascript.javascriptGenerator.forBlock['led_off'] = function(block) {
  const pin = block.getFieldValue('PIN');
  return `await executeAction('led_off', { pin: '${pin}' });\n`;
};

javascript.javascriptGenerator.forBlock['delay'] = function(block) {
  const ms = block.getFieldValue('DURATION_MS');
  return `await executeAction('delay', { duration_ms: '${ms}' });\n`;
};
```

*Definition of Done:* Program Blockly yang berisi blok `led_on` di dalam `repeat 3 times` menghasilkan tiga pemanggilan `executeAction` yang terlihat di console browser. Interpreter Blockly tidak melanjutkan ke blok berikutnya sebelum pemanggilan sebelumnya selesai.

---

**Task 3.4 — UI Controls dan Debug Engine**

Membuat tombol kontrol program dan mengimplementasikan debug engine berbasis `@blockly/interpreter` (JS-Interpreter). Ini adalah task yang paling kompleks di Fase 3 karena melibatkan perubahan fundamental pada cara program Blockly dijalankan — dari eksekusi penuh sekali jalan, menjadi eksekusi yang bisa dihentikan, dilanjutkan, dan diperiksa kapanpun.

**Konsep dasar debug engine:** Ketika mode debug tidak aktif, Blockly menjalankan program dengan `eval()` biasa — cepat tapi tidak bisa di-pause. Ketika mode debug aktif, program dijalankan melalui JS-Interpreter yang meng-evaluasi kode satu *step* JavaScript per panggilan. Satu "step" di level interpreter bisa lebih kecil dari satu blok Blockly (misalnya evaluasi satu sisi expression), sehingga kita perlu melacak kapan `block_id` aktif berubah untuk menentukan kapan kita sudah berpindah ke blok berikutnya.

**Tombol-tombol yang perlu ada beserta perilakunya:**

Tombol **Run** menjalankan seluruh program. Jika mode debug aktif, eksekusi berjalan step per step secara otomatis dengan jeda kecil antar blok sehingga user bisa mengikuti highlight yang bergerak. Jika mode debug tidak aktif, eksekusi berjalan secepat mungkin.

Tombol **Step Over** tersedia hanya saat program sedang pause di mode debug. Menekannya mengeksekusi blok saat ini secara penuh dan pause di blok berikutnya pada level yang sama. Jika blok saat ini adalah blok `repeat`, seluruh isi loop dieksekusi sekaligus sebelum pause — user tidak masuk ke dalam loop.

Tombol **Step Into** juga tersedia hanya saat pause. Bedanya dengan Step Over, jika blok saat ini adalah blok `repeat` atau `if/else`, Step Into akan masuk ke blok pertama di dalam struktur tersebut dan pause di sana. Ini memungkinkan user memeriksa setiap iterasi loop satu per satu.

Tombol **Stop** menghentikan eksekusi kapanpun, baik saat berjalan maupun saat pause.

**Implementasi breakpoint:** Breakpoint bekerja dengan cara interpreter memeriksa setiap kali `block_id` aktif berubah, lalu mengecek apakah ID tersebut ada di `activeBreakpoints`. Jika ya, eksekusi otomatis pause meskipun program sedang berjalan dalam mode Run biasa — ini adalah perilaku breakpoint yang sesungguhnya, bukan sekadar manual stepping.

Gambaran implementasi debug engine di `executor.js`:

```javascript
// executor.js — Debug Engine menggunakan JS-Interpreter

const debugState = {
  interpreter: null,       // instance JS-Interpreter saat ini
  isRunning: false,        // apakah program sedang berjalan
  isPaused: false,         // apakah sedang pause (debug mode)
  currentBlockId: null,    // block_id yang sedang aktif
};

// activeBreakpoints diisi oleh klik blok di blocks.js
const activeBreakpoints = new Set();

/**
 * Menjalankan program dalam mode debug menggunakan JS-Interpreter.
 * Interpreter di-tick satu step per frame menggunakan requestAnimationFrame,
 * sehingga UI tidak terblokir dan tombol tetap responsif.
 */
function runDebug() {
  const code = javascript.javascriptGenerator.workspaceToCode(
    Blockly.getMainWorkspace()
  );

  // JS-Interpreter membutuhkan initFunc untuk mengekspos API
  // yang bisa dipanggil oleh kode yang sedang dieksekusi
  debugState.interpreter = new Interpreter(code, (interpreter, scope) => {
    // Ekspos executeAction agar blok action bisa memanggil Python
    interpreter.setProperty(scope, 'executeAction',
      interpreter.createAsyncFunction(async (command, paramsObj, callback) => {
        const result = await window.pywebview.api.execute_action(
          command,
          Object.keys(paramsObj),
          Object.values(paramsObj).map(String)
        );
        callback(result);
      })
    );

    // Ekspos highlightBlock agar interpreter bisa melacak blok aktif
    interpreter.setProperty(scope, 'highlightBlock',
      interpreter.createNativeFunction((id) => {
        debugState.currentBlockId = id;
        Blockly.getMainWorkspace().highlightBlock(id);
      })
    );
  });

  debugState.isRunning = true;
  debugState.isPaused  = false;
  tickInterpreter();
}

/**
 * Satu siklus tick interpreter — dipanggil berulang via requestAnimationFrame.
 * Di sinilah breakpoint diperiksa: setiap kali block_id berubah,
 * kita cek apakah blok baru tersebut punya breakpoint aktif.
 */
function tickInterpreter() {
  if (!debugState.isRunning) return;
  if (debugState.isPaused)   return;

  const prevBlockId = debugState.currentBlockId;

  // Jalankan satu step interpreter
  const hasMore = debugState.interpreter.step();

  // Cek apakah kita baru pindah ke blok baru
  const movedToNewBlock = debugState.currentBlockId !== prevBlockId;

  if (movedToNewBlock && activeBreakpoints.has(debugState.currentBlockId)) {
    // Breakpoint tercapai — pause otomatis
    debugState.isPaused = true;
    updateButtonStates();  // aktifkan tombol Step Over dan Step Into
    return;
  }

  if (hasMore) {
    requestAnimationFrame(tickInterpreter);
  } else {
    // Program selesai
    debugState.isRunning = false;
    Blockly.getMainWorkspace().highlightBlock(null);
    updateButtonStates();
  }
}

/**
 * Step Over: eksekusi sampai block_id berubah ke level yang sama atau lebih tinggi.
 * Implementasi sederhana: terus step() sampai currentBlockId berubah satu kali.
 */
function stepOver() {
  if (!debugState.isPaused) return;

  const startBlockId = debugState.currentBlockId;
  let hasMore = true;

  // Terus step sampai pindah ke blok yang berbeda
  while (hasMore && debugState.currentBlockId === startBlockId) {
    hasMore = debugState.interpreter.step();
  }

  if (!hasMore) {
    debugState.isRunning = false;
  }
  updateButtonStates();
}

/**
 * Step Into: eksekusi tepat satu step interpreter, apapun yang terjadi.
 * Jika blok saat ini adalah loop/kondisional, ini akan masuk ke dalamnya.
 */
function stepInto() {
  if (!debugState.isPaused) return;

  const hasMore = debugState.interpreter.step();
  if (!hasMore) {
    debugState.isRunning = false;
    Blockly.getMainWorkspace().highlightBlock(null);
  }
  updateButtonStates();
}

function stopExecution() {
  debugState.isRunning = false;
  debugState.isPaused  = false;
  debugState.interpreter = null;
  Blockly.getMainWorkspace().highlightBlock(null);
  updateButtonStates();
}
```

*Definition of Done:* Tombol Run menjalankan program dengan highlight yang bergerak antar blok. Tombol Step Over saat pause mengeksekusi satu blok dan pause di blok berikutnya pada level yang sama, tanpa masuk ke dalam loop. Tombol Step Into saat pause pada blok `repeat` akan masuk ke blok pertama di dalam loop. Mengklik blok saat mode debug aktif men-toggle breakpoint visual (perubahan warna blok), dan ketika program berjalan lalu menyentuh blok tersebut, eksekusi otomatis pause. Tombol Stop menghentikan eksekusi dari kondisi apapun.

---

### Fase 4 — Desktop App (pywebview + Action Client)

Fase ini merakit semua komponen. Baru bisa dimulai setelah Fase 2 dan Fase 3 selesai.

---

**Task 4.1 — `BlocklyAPI` JS Bridge Class**

Membuat Python class `BlocklyAPI` di `app/app.py` dengan method `execute_action(command, param_keys, param_values)` yang dapat dipanggil langsung dari JavaScript dan bersifat synchronous — tidak return sampai ROS2 Action benar-benar selesai.

*Definition of Done:* Memanggil `await window.pywebview.api.execute_action("led_on", ["pin"], ["3"])` dari console di dalam window pywebview berhasil dieksekusi di Python (terlihat dari log terminal) dan mengembalikan objek `{success, message}` ke JavaScript.

---

**Task 4.2 — ROS2 Action Client**

Mengintegrasikan `rclpy` Action Client ke dalam `app.py`. Client berjalan di thread terpisah agar tidak memblokir pywebview UI thread, namun hasil dari setiap `execute_action` harus di-await hingga ROS2 Action selesai sebelum dikembalikan ke JavaScript.

*Definition of Done:* UI tetap responsif saat Action Client menunggu response dari Executor Node. Nilai yang dikembalikan ke JavaScript akurat mencerminkan result dari ROS2 — bukan nilai hardcoded atau default.

---

**Task 4.3 — Verifikasi End-to-End Manual**

*Definition of Done:* Menjalankan `pixi run executor` dan `pixi run app` secara bersamaan, menyusun program `repeat 3 times { led_on pin 1 }` di Blockly, dan menekan Run menghasilkan tiga eksekusi berurutan di terminal Executor Node. Highlight di Blockly berpindah sesuai eksekusi.

---

### Fase 5 — Testing

Semua test adalah integration test yang mengirim ROS2 Action Goal sungguhan ke Executor Node yang berjalan dengan `DummyHardware`. Test tidak menyentuh implementasi internal sama sekali — assertion hanya berdasarkan Feedback dan Result yang diterima dari Action, persis seperti yang dilakukan aplikasi nyata. Menambahkan instruksi baru cukup dengan membuat satu file `test_block_<nama>.py` baru tanpa mengubah file apapun yang sudah ada.

---

**Task 5.1 — Setup `conftest.py`**

Membuat shared fixtures yang digunakan oleh semua file test. `ros_context` menginisialisasi ROS2 satu kali untuk seluruh sesi. `exe_action` adalah fungsi helper yang menerima nama command dan parameter, mengirimnya sebagai Action Goal, dan mengembalikan bundle `feedbacks` + `result` untuk digunakan sebagai assertion.

> **Catatan arsitektur penting:** `conftest.py` **tidak** menjalankan Executor Node. Executor harus sudah berjalan sebagai proses eksternal sebelum test dimulai (`pixi run executor` di terminal terpisah). Keputusan ini menghilangkan race condition yang timbul ketika executor di-spin di background thread di dalam proses yang sama dengan test runner — dua thread yang bersaing mengakses satu rclpy context global menghasilkan perilaku yang tidak deterministik. Dengan executor berjalan di proses terpisah, di dalam proses test hanya ada satu node yang perlu di-spin, dan dia di-spin secara sinkron langsung dari test thread.

```python
# tests/conftest.py
import pytest
import rclpy
from types import SimpleNamespace
from rclpy.action import ActionClient
from rclpy.node import Node
from interfaces.action import BlocklyAction


@pytest.fixture(scope="session")
def ros_context():
    """
    Inisialisasi ROS2 tepat satu kali untuk seluruh sesi test.

    scope="session" mencegah rclpy.init() / rclpy.shutdown() dipanggil
    berkali-kali, yang akan menyebabkan error "already initialized" dan
    membuat state context menjadi tidak bersih.
    """
    rclpy.init()
    yield
    rclpy.shutdown()


@pytest.fixture
def exe_action(ros_context):
    """
    Fixture utama yang disuntikkan ke setiap fungsi test.

    Mengembalikan fungsi _send yang menerima nama command dan parameter
    opsional sebagai keyword arguments, mengirimnya sebagai ROS2 Action Goal,
    mengumpulkan semua feedback yang datang, dan mengembalikan bundle untuk
    digunakan sebagai assertion.

    Setiap test mendapat client_node yang bersih untuk menghindari state
    yang bocor antar test. Tidak ada background thread di sini — spinning
    client_node dilakukan secara sinkron di test thread itu sendiri.

    Contoh penggunaan di test:
        result = exe_action("led_on", pin="3")
        result = exe_action("delay", duration_ms="500")
        result = exe_action("led_on")   # tanpa pin — untuk sad path
    """
    client_node = Node("test_action_client")
    client = ActionClient(client_node, BlocklyAction, "execute_blockly_action")

    # Pastikan executor sudah siap sebelum test berjalan.
    # Jika dalam 5 detik server tidak ditemukan, test di-skip dengan pesan
    # yang jelas daripada gagal dengan error timeout yang kriptikal.
    server_ready = client.wait_for_server(timeout_sec=5.0)
    if not server_ready:
        client_node.destroy_node()
        pytest.skip(
            "Executor Node tidak ditemukan. "
            "Jalankan `pixi run executor` di terminal terpisah terlebih dahulu."
        )

    def _send(command: str, **kwargs) -> SimpleNamespace:
        goal = BlocklyAction.Goal()
        goal.command      = command
        goal.param_keys   = list(kwargs.keys())
        goal.param_values = [str(v) for v in kwargs.values()]

        feedbacks = []

        # Kirim goal dan tunggu goal_handle (konfirmasi server menerima goal).
        send_future = client.send_goal_async(
            goal,
            feedback_callback=lambda fb: feedbacks.append(fb.feedback)
        )
        rclpy.spin_until_future_complete(client_node, send_future)
        goal_handle = send_future.result()

        # Tunggu result akhir dari server.
        # Feedback akan terus di-collect selama spin ini berlangsung
        # karena feedback_callback sudah terdaftar di atas.
        result_future = goal_handle.get_result_async()
        rclpy.spin_until_future_complete(client_node, result_future)
        result = result_future.result().result

        return SimpleNamespace(feedbacks=feedbacks, result=result)

    yield _send

    # Cleanup: hancurkan node setelah test selesai agar tidak ada node
    # yang "tercecer" dan menyebabkan name conflict di test berikutnya.
    client_node.destroy_node()
```

*Definition of Done:* `pixi run test` dengan satu test kosong tidak menghasilkan error pada setup fixture. ROS2 context hanya diinisialisasi satu kali per sesi, terlihat dari tidak adanya warning "already initialized". Fixture `exe_action` bisa menerima command dengan dan tanpa keyword argument. Jika executor belum dijalankan, test menampilkan pesan skip yang informatif alih-alih error yang kriptikal.

---

**Task 5.2 — `test_block_led_on.py`**

Menulis test untuk instruksi `led_on` mencakup happy path dan sad path. Setiap nama fungsi test mendeskripsikan skenario yang diuji secara self-documenting sehingga tidak perlu komentar tambahan untuk memahami tujuannya.

```python
# tests/test_block_led_on.py
"""
Integration test untuk instruksi Blockly: led_on

Setiap test mengirim BlocklyAction Goal ke Executor Node yang berjalan
dengan DummyHardware, lalu mengassert berdasarkan Feedback dan Result
yang diterima. Test tidak menyentuh implementasi internal sama sekali.
"""


def test_block_led_on_returns_success(exe_action):
    """Happy path: led_on dengan parameter lengkap harus berhasil."""
    result = exe_action("led_on", pin="3")

    assert result.result.success is True


def test_block_led_on_sends_executing_feedback(exe_action):
    """
    Executor harus mengirim feedback dengan status 'executing'
    sebelum action selesai. Feedback ini yang digunakan Blockly
    untuk menampilkan indikator bahwa action sedang berlangsung.
    """
    result = exe_action("led_on", pin="3")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_led_on_missing_pin_returns_failure(exe_action):
    """
    Sad path: led_on tanpa parameter pin harus gagal secara graceful.
    Sistem tidak boleh crash — harus mengembalikan success=False
    dengan pesan error yang informatif.
    """
    result = exe_action("led_on")  # sengaja tidak memberikan pin

    assert result.result.success is False


def test_block_led_on_missing_pin_message_mentions_pin(exe_action):
    """
    Pesan error harus menyebutkan nama parameter yang bermasalah
    agar mudah di-debug oleh user yang melihat pesan ini di Blockly UI.
    """
    result = exe_action("led_on")

    assert "pin" in result.result.message.lower()
```

*Definition of Done:* Semua test pass dengan `pixi run test`. Setiap test bisa dijalankan secara isolated: `pytest tests/test_block_led_on.py::test_block_led_on_returns_success`. Tidak ada test yang bergantung pada urutan eksekusi test lain.

---

**Task 5.3 — `test_block_led_off.py`**

Menulis test untuk instruksi `led_off` dengan cakupan yang setara dengan `test_block_led_on.py`.

```python
# tests/test_block_led_off.py


def test_block_led_off_returns_success(exe_action):
    result = exe_action("led_off", pin="3")

    assert result.result.success is True


def test_block_led_off_sends_executing_feedback(exe_action):
    result = exe_action("led_off", pin="3")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_led_off_missing_pin_returns_failure(exe_action):
    result = exe_action("led_off")  # sengaja tanpa pin

    assert result.result.success is False
    assert "pin" in result.result.message.lower()
```

*Definition of Done:* Setara dengan DoD Task 5.2.

---

**Task 5.4 — `test_block_delay.py`**

Menulis test untuk instruksi `delay`. Selain happy path dan sad path, test ini secara khusus memverifikasi bahwa durasi yang dieksekusi sesuai dengan yang diminta — menggunakan pengukuran waktu aktual dengan toleransi ±100ms untuk mengakomodasi overhead ROS2 dan jitter OS.

```python
# tests/test_block_delay.py
import time


def test_block_delay_returns_success(exe_action):
    result = exe_action("delay", duration_ms="100")

    assert result.result.success is True


def test_block_delay_sends_executing_feedback(exe_action):
    result = exe_action("delay", duration_ms="100")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


def test_block_delay_duration_is_respected(exe_action):
    """
    Memverifikasi bahwa durasi yang dieksekusi mendekati nilai yang diminta.
    Toleransi ±100ms diberikan untuk mengakomodasi overhead ROS2 dan jitter OS.
    """
    requested_ms = 500
    tolerance_ms = 100

    start      = time.monotonic()
    exe_action("delay", duration_ms=str(requested_ms))
    elapsed_ms = (time.monotonic() - start) * 1000

    assert elapsed_ms >= (requested_ms - tolerance_ms), \
        f"Delay terlalu singkat: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"
    assert elapsed_ms <= (requested_ms + tolerance_ms), \
        f"Delay terlalu lama: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"


def test_block_delay_missing_duration_returns_failure(exe_action):
    result = exe_action("delay")  # sengaja tanpa duration_ms

    assert result.result.success is False
    assert "duration_ms" in result.result.message.lower()
```

*Definition of Done:* Setara dengan DoD Task 5.2. Test `test_block_delay_duration_is_respected` boleh diberi marker `@pytest.mark.slow` dan di-skip di lingkungan CI yang resource-constrained.

---

### Fase 6 — Verifikasi End-to-End

---

**Task 6.1 — Skenario Normal Run**

Menyusun tiga blok `led_on` berurutan dan menekan Run.

*Definition of Done:* Highlight berpindah dari blok pertama ke ketiga secara berurutan tanpa melompat. Terminal Executor Node menampilkan tiga eksekusi. Program berhenti sendiri setelah blok terakhir selesai.

---

**Task 6.2 — Skenario Loop Native Blockly**

Menyusun `repeat 3 times { led_on pin 1 }` dan menekan Run.

*Definition of Done:* Terminal Executor Node menerima tepat tiga Action Goal. Highlight di Blockly menunjukkan blok di dalam loop ter-highlight tiga kali. Ini membuktikan bahwa konstruksi pemrograman Blockly bekerja tanpa ROS2 perlu memahami konsep looping.

---

**Task 6.3 — Skenario Stop di Tengah Eksekusi**

Menyusun program dengan beberapa blok `delay` yang panjang dan menekan Stop di tengah eksekusi.

*Definition of Done:* Eksekusi berhenti dalam waktu kurang dari 500ms setelah Stop ditekan. Tidak ada Action Goal baru yang dikirim setelah Stop.

---

**Task 6.4 — Skenario Error Handling**

Membuat program dengan blok yang memiliki parameter tidak valid lalu menjalankannya.

*Definition of Done:* Blok yang menghasilkan error mendapat feedback status `"error"`. Aplikasi tidak crash. Blok-blok setelah blok error tidak dieksekusi karena Blockly menggunakan `result.success == False` untuk menghentikan program.

---

## Panduan Membuat Blok Baru

Menambahkan blok baru ke sistem selalu melibatkan empat file yang berbeda di tiga lapisan berbeda — backend Python, frontend JavaScript, dan test suite. Keempat file ini harus konsisten satu sama lain: nama command yang kamu daftarkan di Python harus sama persis dengan nama yang kamu pakai di JavaScript dan di test. Panduan ini memandu kamu melalui keempat lapisan tersebut secara berurutan, menggunakan blok `move_forward` sebagai contoh konkret di setiap langkah.

### Gambaran: 4 File, 3 Lapisan

```
Lapisan          File yang disentuh                Tanggung jawab
-------          ------------------                ----------------
Python Backend   executor/handlers.py              logika eksekusi + validasi parameter
                 |
JS Frontend      app/ui/blockly/blocks.js          tampilan visual blok di workspace
                 app/ui/blockly/executor.js         perilaku runtime saat blok dieksekusi
                 |
Test Suite       tests/test_block_<nama>.py         verifikasi end-to-end via ROS2
```

Perhatikan bahwa `conftest.py`, `executor_node.py`, dan `BlocklyAction.action` **tidak perlu disentuh sama sekali**. Interface ROS2 sudah dirancang generik dari awal — dia hanya meneruskan `command` dan pasangan `key/value` tanpa perlu tahu ada blok baru. Ini adalah keuntungan nyata dari arsitektur ini.

---

### Langkah 1 — Daftarkan Handler di `executor/handlers.py`

Ini adalah langkah pertama yang harus selesai sebelum langkah lain bisa diverifikasi, karena seluruh rantai komunikasi bermula dari sini.

Buka `executor/handlers.py` dan tambahkan handler baru ke dalam `HandlerRegistry`. Sebuah handler adalah fungsi yang menerima `params: dict` dan `hardware: HardwareInterface`, mengeksekusi perintah fisiknya, lalu mengembalikan `True` jika berhasil atau melempar exception jika ada yang salah.

Pola validasi parameter selalu sama: ambil nilai dari `params` dengan `params["nama_param"]`, tangkap `KeyError` jika tidak ada, dan kembalikan pesan error yang menyebut nama parameter yang hilang. Ini penting karena pesan error ini yang akan muncul di Blockly UI ketika user lupa mengisi field.

```python
# executor/handlers.py

class HandlerRegistry:
    def __init__(self, hardware: HardwareInterface):
        self.hardware = hardware
        # Daftarkan handler baru di sini — cukup tambah satu baris
        self._handlers = {
            "led_on":        self._handle_led_on,
            "led_off":       self._handle_led_off,
            "delay":         self._handle_delay,
            "move_forward":  self._handle_move_forward,   # <-- tambahan baru
        }

    # ... handler yang sudah ada ...

    def _handle_move_forward(self, params: dict) -> bool:
        """
        Menggerakkan robot maju dengan kecepatan dan durasi tertentu.

        Parameter wajib:
          speed       -- kecepatan motor, nilai string "0"–"100"
          duration_ms -- durasi dalam milidetik, nilai string
        """
        # Validasi parameter: KeyError otomatis jika kunci tidak ada.
        # Pesan error menyebut nama parameter agar mudah di-debug dari UI.
        try:
            speed = int(params["speed"])
        except KeyError:
            raise KeyError("parameter 'speed' tidak ditemukan")

        try:
            duration_ms = int(params["duration_ms"])
        except KeyError:
            raise KeyError("parameter 'duration_ms' tidak ditemukan")

        # Validasi rentang nilai — hanya jika relevan untuk hardware-mu
        if not (0 <= speed <= 100):
            raise ValueError(f"speed harus 0-100, diterima: {speed}")

        # Eksekusi via hardware interface
        self.hardware.move(direction="forward", speed=speed, duration_ms=duration_ms)
        return True
```

Setelah langkah ini selesai, kamu bisa langsung memverifikasinya dari terminal tanpa perlu menyentuh JavaScript sama sekali:

```bash
# Terminal 1: jalankan executor
pixi run executor

# Terminal 2: kirim goal manual
ros2 action send_goal /execute_blockly_action interfaces/action/BlocklyAction \
  "{command: 'move_forward', param_keys: ['speed', 'duration_ms'], param_values: ['50', '1000']}"
```

Jika executor merespons dengan `success: true`, handler sudah berfungsi dengan benar dan kamu bisa lanjut ke langkah berikutnya.

---

### Langkah 2 — Definisikan Tampilan Visual di `app/ui/blockly/blocks.js`

File ini bertanggung jawab atas **tampilan** blok di workspace Blockly — bentuknya, warnanya, field input apa saja yang tersedia, dan apakah blok bisa disambungkan ke blok lain. Tidak ada logika eksekusi di sini.

Setiap blok didefinisikan dengan dua bagian: `Blockly.Blocks['nama_blok']` yang mendefinisikan tampilan, dan pendaftaran ke toolbox. Nama yang kamu pakai di sini (`'move_forward'`) harus sama persis dengan nama command yang kamu daftarkan di `handlers.py`.

```javascript
// app/ui/blockly/blocks.js

Blockly.Blocks['move_forward'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("maju")
        .appendField("kecepatan")
        // FieldNumber(default, min, max, presisi)
        .appendField(new Blockly.FieldNumber(50, 0, 100, 1), "SPEED")
        .appendField("selama")
        .appendField(new Blockly.FieldNumber(1000, 0), "DURATION_MS")
        .appendField("ms");

    // setPreviousStatement dan setNextStatement(true) membuat blok ini
    // bisa disambungkan ke blok di atas dan di bawahnya — ini yang membuat
    // blok bisa disusun secara berurutan di workspace
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);

    // Warna blok dalam format HSV hue (0–360).
    // Gunakan hue yang sama untuk semua blok dalam kategori yang sama
    // agar ada konsistensi visual. Misalnya: LED = 160, Gerak = 230.
    this.setColour(230);

    this.setTooltip("Gerakkan robot maju dengan kecepatan dan durasi tertentu.");
  }
};
```

Setelah mendefinisikan blok, daftarkan ke toolbox di `index.html` agar blok muncul di panel kiri:

```xml
<!-- app/ui/index.html — di dalam elemen <xml id="toolbox"> -->
<category name="Gerak" colour="230">
  <block type="move_forward"></block>
</category>
```

Kamu bisa memverifikasi langkah ini langsung di browser: buka `index.html`, pastikan blok `maju` muncul di toolbox dan bisa di-drag ke workspace.

---

### Langkah 3 — Definisikan Perilaku Runtime di `app/ui/blockly/executor.js`

File ini mendefinisikan **apa yang terjadi saat blok dieksekusi** oleh interpreter Blockly. Ini bukan tampilan — ini adalah kode JavaScript yang di-generate ketika Blockly menjalankan blok tersebut.

Satu aturan penting: nama field yang kamu baca dengan `block.getFieldValue('NAMA')` harus sama persis dengan nama yang kamu definisikan di `blocks.js` — perhatikan `"SPEED"` dan `"DURATION_MS"` di bawah ini harus cocok dengan yang ada di langkah 2.

```javascript
// app/ui/blockly/executor.js

javascript.javascriptGenerator.forBlock['move_forward'] = function(block) {
  // Ambil nilai dari field yang sudah diisi user di workspace.
  // Nama field ("SPEED", "DURATION_MS") harus cocok dengan yang ada di blocks.js.
  const speed      = block.getFieldValue('SPEED');
  const durationMs = block.getFieldValue('DURATION_MS');

  // String yang di-return ini adalah kode JavaScript yang akan dieksekusi
  // oleh interpreter Blockly. `await` memastikan Blockly tidak lanjut ke
  // blok berikutnya sampai ROS2 action selesai.
  return `await executeAction('move_forward', { speed: '${speed}', duration_ms: '${durationMs}' });\n`;
};
```

Setelah langkah ini, coba jalankan program di Blockly dengan `pixi run executor` aktif. Di console browser kamu seharusnya melihat pemanggilan `executeAction('move_forward', ...)` dan di terminal executor terlihat action diterima dan dieksekusi.

---

### Langkah 4 — Tulis Test di `tests/test_block_move_forward.py`

Langkah terakhir adalah memverifikasi seluruh rantai komunikasi melalui test otomatis. Lihat bagian **Panduan Membuat Test Script untuk Blok Baru** di bawah untuk panduan lengkapnya.

---

### Checklist Penyelesaian

Berikut adalah cara cepat memverifikasi bahwa semua lapisan sudah terhubung dengan benar sebelum membuat pull request:

```
[ ] ros2 action send_goal manual menghasilkan success: true           (Langkah 1)
[ ] Blok muncul di toolbox dan bisa di-drag ke workspace              (Langkah 2)
[ ] console browser menampilkan executeAction saat blok dijalankan    (Langkah 3)
[ ] pixi run test menampilkan semua test PASSED                       (Langkah 4)
```

---

### Referensi Cepat: Tabel Nama yang Harus Konsisten

Satu sumber bug yang paling umum adalah ketidakcocokan nama antar file. Tabel ini membantu kamu memastikan semua lapisan berbicara dengan nama yang sama:

```
handlers.py              blocks.js                executor.js
-----------              ---------                -----------
"move_forward"      ==   'move_forward'       ==   'move_forward'
params["speed"]     ==   "SPEED"  (field)     ==   getFieldValue('SPEED')
params["duration_ms"] == "DURATION_MS"        ==   getFieldValue('DURATION_MS')
```

Jika ada ketidakcocokan di baris manapun, salah satu dari ini akan terjadi: handler gagal menemukan parameter (KeyError di Python), blok tidak ter-generate dengan benar (silent failure di JavaScript), atau test gagal dengan pesan yang tidak informatif.

---

## Panduan Membuat Test Script untuk Blok Baru

Setiap kali kamu menambahkan blok baru ke Blockly, kamu perlu membuat satu file test untuk blok tersebut. Bagian ini adalah panduan lengkap yang bisa kamu ikuti dari awal sampai selesai tanpa perlu membaca kode yang sudah ada.

### Prinsip Dasar: Satu Blok, Satu File

Aturan pertama yang paling penting: **semua skenario test untuk satu blok dikumpulkan dalam satu file**. Jika kamu membuat blok `move_forward`, semua test-nya — happy path, sad path, edge case, timing test — semuanya ada di `test_block_move_forward.py`. Tidak ada `test_move_forward_happy.py`, `test_move_forward_errors.py`, dan seterusnya.

Alasannya sederhana: ketika kamu ingin memahami perilaku blok `move_forward`, kamu hanya perlu membuka satu file. Ketika blok itu berubah, kamu hanya perlu memperbarui satu file. Ketika kamu ingin menghapus blok itu, kamu menghapus satu file beserta seluruh test-nya sekaligus. Proliferasi file test adalah masalah nyata yang memperlambat navigasi dan membuat hubungan antara "blok ini" dan "test-nya" menjadi tidak jelas.

### Checklist Sebelum Mulai

Sebelum menulis satu baris test, pastikan dua hal sudah selesai. Pertama, handler untuk blok baru sudah terdaftar di `executor/handlers.py` — ini adalah syarat mutlak, karena test mengirim Goal langsung ke executor melalui ROS2, bukan memanggil handler secara langsung. Kedua, executor sudah berjalan dengan `pixi run executor` di terminal terpisah.

### Anatomi File Test

Setiap file test mengikuti struktur yang sama. Berikut adalah template lengkap yang bisa kamu salin dan sesuaikan:

```python
# tests/test_block_<nama_blok>.py
"""
Integration test untuk instruksi Blockly: <nama_blok>

Setiap test mengirim BlocklyAction Goal ke Executor Node yang berjalan
dengan DummyHardware, lalu mengassert berdasarkan Feedback dan Result
yang diterima. Test tidak menyentuh implementasi internal sama sekali.
"""
# tambahkan import tambahan di sini jika diperlukan, misalnya: import time


# -- HAPPY PATH ----------------------------------------------------------------

def test_block_<nama_blok>_returns_success(exe_action):
    """Blok dengan parameter lengkap dan valid harus mengembalikan success=True."""
    result = exe_action("<nama_blok>", param_satu="nilai", param_dua="nilai")

    assert result.result.success is True


def test_block_<nama_blok>_sends_executing_feedback(exe_action):
    """
    Executor harus mengirim setidaknya satu feedback dengan status 'executing'
    sebelum action selesai. Feedback ini digunakan Blockly untuk menampilkan
    indikator bahwa action sedang berlangsung.
    """
    result = exe_action("<nama_blok>", param_satu="nilai")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


# -- SAD PATH ------------------------------------------------------------------

def test_block_<nama_blok>_missing_<param>_returns_failure(exe_action):
    """
    Blok tanpa parameter wajib harus gagal secara graceful — success=False
    tanpa crash. Ini mensimulasikan user yang lupa mengisi field di Blockly UI.
    """
    result = exe_action("<nama_blok>")  # sengaja tanpa parameter apapun

    assert result.result.success is False


def test_block_<nama_blok>_missing_<param>_message_mentions_<param>(exe_action):
    """
    Pesan error harus menyebutkan nama parameter yang bermasalah sehingga
    user bisa langsung tahu field mana yang perlu diperbaiki di Blockly UI.
    """
    result = exe_action("<nama_blok>")

    assert "<param>" in result.result.message.lower()
```

### Jenis Skenario dan Kapan Menggunakannya

Setiap blok memiliki karakteristik yang berbeda, sehingga skenario test yang relevan pun berbeda. Berikut adalah panduan untuk memutuskan skenario mana yang perlu ditulis.

**Happy path** adalah skenario wajib untuk semua blok tanpa terkecuali. Kirim goal dengan semua parameter yang benar dan assert bahwa `result.success is True`. Ini membuktikan bahwa blok berfungsi di kondisi normal.

**Feedback verification** juga wajib untuk semua blok. Assert bahwa setidaknya satu feedback diterima dengan `status == "executing"`. Ini penting karena Blockly UI mengandalkan feedback ini untuk menampilkan indikator progress — jika feedback tidak terkirim, user tidak mendapat tanda bahwa blok sedang berjalan.

**Missing parameter** adalah sad path yang perlu ditulis untuk setiap parameter wajib yang dimiliki blok. Jika blok `move_forward` punya parameter `speed` dan `distance`, tulis dua test: satu tanpa `speed`, satu tanpa `distance`. Assert bahwa `success is False` dan nama parameter yang hilang muncul di `result.message`. Test ini mensimulasikan kondisi nyata ketika user lupa mengisi field di Blockly UI.

**Timing verification** hanya relevan untuk blok yang memiliki durasi eksplisit, seperti `delay` atau blok gerak yang memiliki parameter waktu. Gunakan `time.monotonic()` untuk mengukur durasi aktual dan beri toleransi ±100ms untuk mengakomodasi overhead ROS2 dan jitter OS. Beri marker `@pytest.mark.slow` jika durasinya lebih dari 1 detik.

**Invalid value** adalah skenario opsional yang hanya perlu ditulis jika handler-mu memvalidasi tipe atau rentang nilai. Misalnya jika `pin` harus berupa angka dan handler bisa menerima string `"abc"`, tulis test untuk memastikan hasilnya `success is False` dengan pesan yang informatif. Jika handler tidak melakukan validasi tipe dan membiarkan Python crash, ini adalah sinyal bahwa validasi perlu ditambahkan ke handler sebelum test bisa ditulis.

### Contoh Nyata: Blok `move_forward`

Misalkan kamu baru saja membuat blok `move_forward` dengan parameter `speed` (0–100) dan `duration_ms`. Berikut adalah file test yang lengkap dan sesuai dengan panduan ini:

```python
# tests/test_block_move_forward.py
"""
Integration test untuk instruksi Blockly: move_forward

Parameter:
  speed       — kecepatan motor, nilai 0–100
  duration_ms — durasi bergerak dalam milidetik
"""
import time


# -- HAPPY PATH ----------------------------------------------------------------

def test_block_move_forward_returns_success(exe_action):
    result = exe_action("move_forward", speed="50", duration_ms="200")

    assert result.result.success is True


def test_block_move_forward_sends_executing_feedback(exe_action):
    result = exe_action("move_forward", speed="50", duration_ms="200")

    assert len(result.feedbacks) > 0
    assert result.feedbacks[0].status == "executing"


# -- SAD PATH: parameter hilang ------------------------------------------------

def test_block_move_forward_missing_speed_returns_failure(exe_action):
    # duration_ms ada, tapi speed tidak diberikan
    result = exe_action("move_forward", duration_ms="200")

    assert result.result.success is False


def test_block_move_forward_missing_speed_message_mentions_speed(exe_action):
    result = exe_action("move_forward", duration_ms="200")

    assert "speed" in result.result.message.lower()


def test_block_move_forward_missing_duration_returns_failure(exe_action):
    # speed ada, tapi duration_ms tidak diberikan
    result = exe_action("move_forward", speed="50")

    assert result.result.success is False


def test_block_move_forward_missing_duration_message_mentions_duration(exe_action):
    result = exe_action("move_forward", speed="50")

    assert "duration_ms" in result.result.message.lower()


# -- TIMING VERIFICATION -------------------------------------------------------

@pytest.mark.slow
def test_block_move_forward_duration_is_respected(exe_action):
    """
    Robot harus bergerak selama durasi yang diminta, tidak lebih singkat
    (robot berhenti prematur) maupun terlalu lama (robot overshoot).
    Toleransi ±100ms mengakomodasi overhead ROS2 dan jitter OS.
    """
    requested_ms = 500
    tolerance_ms = 100

    start      = time.monotonic()
    exe_action("move_forward", speed="30", duration_ms=str(requested_ms))
    elapsed_ms = (time.monotonic() - start) * 1000

    assert elapsed_ms >= (requested_ms - tolerance_ms), \
        f"Gerakan terlalu singkat: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"
    assert elapsed_ms <= (requested_ms + tolerance_ms), \
        f"Gerakan terlalu lama: {elapsed_ms:.0f}ms, diminta {requested_ms}ms"
```

### Cara Menjalankan

```bash
# Jalankan semua test (executor harus sudah berjalan di terminal lain)
pixi run test

# Jalankan hanya test untuk satu blok
pytest tests/test_block_move_forward.py -v

# Jalankan satu test spesifik
pytest tests/test_block_move_forward.py::test_block_move_forward_returns_success -v

# Jalankan semua test kecuali yang diberi marker @pytest.mark.slow
pytest tests/ -v -m "not slow"
```

---

## Strategi Testing

Semua test dalam project ini adalah **integration test yang berbicara lewat interface ROS2**, bukan unit test murni yang menembus ke implementasi internal. Filosofi ini dipilih karena test yang menggunakan jalur komunikasi yang sama dengan aplikasi nyata memberikan kepercayaan diri yang jauh lebih tinggi — yang diuji adalah sistem yang persis sama dengan yang berjalan di robot, bukan simulasi tiruan lapisan demi lapisan.

Hardware fisik diisolasi menggunakan `DummyHardware` sehingga semua test bisa berjalan di laptop manapun tanpa Raspberry Pi. ROS2 Node yang sesungguhnya tetap dijalankan selama test — bukan di-mock — sehingga kode ROS2 juga terverifikasi, bukan hanya logic Python internalnya saja.

Executor Node dijalankan sebagai proses eksternal yang terpisah dari test runner. Ini bukan sekadar preferensi — ini adalah keputusan arsitektur yang menghilangkan race condition. Ketika executor dan test runner berjalan dalam proses yang sama, dua thread akan bersaing mengakses rclpy context yang bersifat global, menghasilkan perilaku yang tidak deterministik. Dengan executor di proses terpisah, di dalam test runner hanya ada satu node yang perlu di-spin, dan dia di-spin secara sinkron langsung dari test thread.

Menambahkan instruksi baru ke sistem cukup dengan membuat satu file `test_block_<nama>.py` baru. Tidak perlu mengubah `conftest.py` maupun file test yang sudah ada karena fixture `exe_action` sudah dirancang generik dari awal. Semua skenario test untuk satu blok dikumpulkan dalam satu file yang sama — ini menjaga hubungan antara "blok ini" dan "test-nya" tetap eksplisit, dan memudahkan navigasi maupun penghapusan ketika blok dihapus dari sistem.
