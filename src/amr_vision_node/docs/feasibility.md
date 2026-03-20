# Feasibility Study: Vision Sensor for AMR ROS2 K4

> **Date**: 2026-03-20
> **Scope**: Color/object recognition, object counting, Blockly integration
> **Platform**: Raspberry Pi 4/5 (linux-aarch64) + Desktop (linux-64)

---

## 1. Executive Summary

Implementasi vision sensor pada Kiwi Wheel AMR layak dilakukan menggunakan **OpenCV dengan HSV color thresholding** sebagai pendekatan utama. Pendekatan ini ringan secara komputasi (15-30 FPS pada Raspberry Pi 4 di resolusi 640x480), tidak memerlukan GPU atau model ML, dan dapat diintegrasikan langsung ke arsitektur Blockly yang sudah ada menggunakan pattern yang sama dengan odometry (fetch once, extract many).

**Rekomendasi**: Mulai dari Phase 1 (MVP) — OpenCV direct capture, HSV thresholding, 4 Blockly blocks, color profile JSON. Tidak perlu ROS2 image pipeline di awal.

---

## 2. Requirements Analysis

Berdasarkan brief di readme.md, terdapat 3 kebutuhan utama:

### R1: Pengenalan Warna dan Obyek + Prosedur Training Warna

- Deteksi obyek berdasarkan warna dalam frame kamera
- User dapat mendefinisikan (training) warna baru melalui prosedur yang user-friendly
- Return data obyek terdeteksi: label warna, posisi di frame, bounding box

### R2: Penghitungan Obyek (Urut Kiri ke Kanan)

- Hitung obyek yang tersusun secara sekuensial di pandangan kamera
- Urutan berdasarkan posisi horizontal (x-coordinate) dari kiri ke kanan
- Return: total count dan posisi individual tiap obyek

### R3: Integrasi Blockly App

- Vision blocks harus terintegrasi ke visual programming Blockly yang sudah ada
- Mengikuti pattern yang established: JS block registration, handler decorator, ROS2 action
- User dapat menggunakan vision blocks dalam program Blockly tanpa menulis code

---

## 3. Hardware Options — Kamera untuk Raspberry Pi

### Option A: Raspberry Pi Camera Module v2 / v3

| Aspek | Detail |
|-------|--------|
| Interface | CSI (MIPI) via ribbon cable |
| Resolusi | 8 MP (v2), 12 MP (v3), autofocus pada v3 |
| Kelebihan | Native Pi support, low latency, hardware-accelerated capture via `libcamera`/`picamera2` |
| Kekurangan | Kabel pendek, posisi mounting terbatas, CSI tidak tersedia pada semua konfigurasi Pi |
| Harga | ~$25 (v2), ~$35 (v3) |

### Option B: USB Webcam (Logitech C270, C920, atau sejenisnya)

| Aspek | Detail |
|-------|--------|
| Interface | USB (V4L2) |
| Resolusi | 720p - 1080p |
| Kelebihan | Plug and play, kabel USB panjang, mudah mounting, tersedia luas, langsung bekerja dengan OpenCV `VideoCapture` |
| Kekurangan | Latency lebih tinggi dari CSI, USB bandwidth contention di Pi, konsumsi daya USB |
| Harga | ~$20 (C270), ~$60 (C920) |

### Rekomendasi

**USB webcam untuk prototyping, CSI camera untuk production.**

Kedua jenis kamera muncul sebagai `/dev/video*` di Linux melalui V4L2. Node harus mengabstraksi akses kamera sehingga keduanya bisa digunakan — cukup ganti device path via ROS2 parameter.

```
Camera (CSI atau USB)
    ↓  V4L2 (/dev/video0)
OpenCV VideoCapture
    ↓
amr_vision_node
```

---

## 4. Software Stack

### 4.1 OpenCV — Library Utama (Rekomendasi)

- Tersedia di conda-forge sebagai `py-opencv`
- Berjalan di `linux-64` dan `linux-aarch64`
- Menyediakan semua fungsi yang dibutuhkan: color space conversion, thresholding, contour detection, morphological operations
- Ringan, well-supported di Raspberry Pi
- Tidak memerlukan GPU untuk color detection dasar

### 4.2 ROS2 Vision Packages (Optional, Phase 2)

| Package | Fungsi |
|---------|--------|
| `ros-jazzy-cv-bridge` | Konversi antara ROS2 `sensor_msgs/Image` dan OpenCV `cv::Mat` |
| `ros-jazzy-image-transport` | Publishing gambar efisien dengan kompresi |
| `ros-jazzy-camera-info-manager` | Manajemen kalibrasi kamera |

**Catatan**: Ketersediaan packages di atas dalam RoboStack `robostack-jazzy` channel untuk `linux-aarch64` perlu diverifikasi. Jika tidak tersedia, gunakan OpenCV `VideoCapture` langsung (Phase 1 approach).

### 4.3 Fallback: OpenCV Direct (Phase 1)

Untuk Phase 1, gunakan OpenCV `VideoCapture` langsung tanpa ROS2 image pipeline:

```python
import cv2

cap = cv2.VideoCapture("/dev/video0")  # atau device index 0
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

ret, frame = cap.read()  # BGR numpy array
```

Pendekatan ini memiliki **zero additional ROS2 dependencies** dan cukup untuk semua kebutuhan di Phase 1.

---

## 5. Color Recognition — HSV Thresholding

### 5.1 Pipeline

HSV (Hue-Saturation-Value) color space lebih robust terhadap variasi pencahayaan dibanding RGB karena memisahkan informasi warna (Hue) dari intensitas cahaya (Value).

```
Frame (BGR)
    ↓ cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
Frame (HSV)
    ↓ cv2.inRange(hsv, lower_bound, upper_bound)
Binary Mask (0/255)
    ↓ cv2.erode() + cv2.dilate()   ← morphological cleanup
Clean Mask
    ↓ cv2.findContours()
Contours
    ↓ filter by area (reject noise)
Detected Objects
```

### 5.2 Contoh Implementasi

```python
import cv2
import numpy as np

def detect_color(frame, lower_hsv, upper_hsv, min_area=500):
    """Detect objects of a specific color in a BGR frame.

    Args:
        frame: BGR image from camera
        lower_hsv: (H, S, V) lower bound, e.g. (0, 100, 100)
        upper_hsv: (H, S, V) upper bound, e.g. (10, 255, 255)
        min_area: minimum contour area in pixels to filter noise

    Returns:
        List of detected objects: [{x, y, w, h, area, cx, cy}, ...]
    """
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array(lower_hsv), np.array(upper_hsv))

    # Morphological cleanup — remove small noise, fill small holes
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.erode(mask, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    objects = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        cx, cy = x + w // 2, y + h // 2  # centroid
        objects.append({"x": x, "y": y, "w": w, "h": h, "area": int(area), "cx": cx, "cy": cy})

    return objects
```

### 5.3 Color Training Procedure

**Tujuan**: User dapat mendefinisikan warna baru tanpa menulis code. Prosedur dilakukan melalui Blockly block.

**Langkah-langkah**:

1. **Persiapan**: User menempatkan objek referensi warna di depan kamera, dengan pencahayaan yang konsisten
2. **Capture**: Node menangkap N frame (default: 10) dari kamera
3. **Sampling**: Dari tiap frame, ambil Region of Interest (ROI) di tengah frame (default: 50x50 pixel)
4. **Kalkulasi**: Hitung median HSV dari semua sample ROI, tentukan range sebagai `median ± tolerance`
5. **Simpan**: Color profile disimpan sebagai JSON file

**Format Color Profile** (`~/.amr_vision/colors.json`):

```json
{
  "colors": {
    "red": {
      "lower_hsv": [0, 100, 100],
      "upper_hsv": [10, 255, 255],
      "trained_at": "2026-03-20T10:30:00",
      "samples": 10,
      "tolerance": 15
    },
    "blue": {
      "lower_hsv": [100, 100, 100],
      "upper_hsv": [130, 255, 255],
      "trained_at": "2026-03-20T10:35:00",
      "samples": 10,
      "tolerance": 15
    }
  }
}
```

**Contoh Training Algorithm**:

```python
def train_color(cap, color_name, roi_size=50, num_samples=10, tolerance=15):
    """Train a color by sampling the center of the camera frame.

    Args:
        cap: OpenCV VideoCapture object
        color_name: name for the trained color (e.g. "red")
        roi_size: size of the square ROI at frame center
        num_samples: number of frames to sample
        tolerance: HSV range tolerance (+/-)

    Returns:
        Color profile dict with lower_hsv and upper_hsv
    """
    hsv_samples = []

    for _ in range(num_samples):
        ret, frame = cap.read()
        if not ret:
            continue
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        h, w = hsv.shape[:2]
        cx, cy = w // 2, h // 2
        half = roi_size // 2
        roi = hsv[cy - half:cy + half, cx - half:cx + half]

        # Median HSV of the ROI
        median_hsv = np.median(roi.reshape(-1, 3), axis=0)
        hsv_samples.append(median_hsv)

    overall_median = np.median(hsv_samples, axis=0).astype(int)

    lower = np.clip(overall_median - tolerance, [0, 0, 0], [179, 255, 255]).tolist()
    upper = np.clip(overall_median + tolerance, [0, 0, 0], [179, 255, 255]).tolist()

    return {
        "lower_hsv": lower,
        "upper_hsv": upper,
        "samples": num_samples,
        "tolerance": tolerance,
    }
```

**Catatan tentang Hue wrapping**: Warna merah memiliki Hue di sekitar 0° dan 180° (wrapping). Untuk menangani ini, training procedure harus mendeteksi apakah Hue sample berada di kedua ujung range dan menghasilkan dua range terpisah yang digabung dengan bitwise OR.

---

## 6. Object Detection & Counting (Left-to-Right)

### 6.1 Algoritma

Setelah color detection menghasilkan daftar contour per warna:

1. **Hitung centroid** tiap obyek: `cx = x + w/2`
2. **Sort by x-coordinate** (ascending) → otomatis urut kiri ke kanan
3. **Assign index** sekuensial: 1, 2, 3, ...
4. **Minimum separation filter**: jika dua obyek terlalu dekat (< `min_distance` pixel), gabungkan sebagai satu obyek — menghindari double-counting dari fragmentasi mask

### 6.2 Output Format

```json
{
  "count": 3,
  "objects": [
    {"index": 1, "cx": 120, "cy": 240, "w": 60, "h": 55, "color": "red", "area": 2850},
    {"index": 2, "cx": 320, "cy": 235, "w": 58, "h": 52, "color": "red", "area": 2640},
    {"index": 3, "cx": 510, "cy": 242, "w": 62, "h": 57, "color": "red", "area": 3020}
  ]
}
```

### 6.3 Multi-Color Detection

Untuk mendeteksi multiple warna sekaligus:

```python
def detect_all_colors(frame, color_profiles, min_area=500):
    all_objects = []
    for name, profile in color_profiles.items():
        objects = detect_color(frame, profile["lower_hsv"], profile["upper_hsv"], min_area)
        for obj in objects:
            obj["color"] = name
        all_objects.extend(objects)

    # Sort all objects left-to-right regardless of color
    all_objects.sort(key=lambda o: o["cx"])
    for i, obj in enumerate(all_objects):
        obj["index"] = i + 1

    return {"count": len(all_objects), "objects": all_objects}
```

---

## 7. ROS2 Node Design — `amr_vision_node`

### 7.1 Package Type

**ament_python** — konsisten dengan `blockly_executor` karena semua logika adalah OpenCV/Python.

### 7.2 Package Structure

```
src/amr_vision_node/
├── docs/
│   └── feasibility.md          # dokumen ini
├── amr_vision_node/
│   ├── __init__.py
│   ├── vision_node.py           # Main ROS2 node
│   ├── color_detector.py        # HSV thresholding + contour detection
│   ├── color_trainer.py         # Color training / calibration logic
│   └── config/
│       └── default_colors.json  # Default color definitions
├── resource/
│   └── amr_vision_node          # ament resource marker
├── package.xml
├── setup.py
└── setup.cfg
```

### 7.3 Node Architecture

```
amr_vision_node (Python, ROS2 Node)
│
├── Timer callback (configurable, default 10 Hz)
│   ├── Capture frame dari kamera (OpenCV VideoCapture)
│   ├── Untuk setiap trained color: detect objects, compute bounding boxes
│   └── Cache detection results (thread-safe)
│
├── Subscriber: /vision/train (std_msgs/String)
│   ├── Receive JSON: {"color_name": "red", "roi_size": 50, "samples": 10}
│   └── Execute training procedure → save ke colors.json
│
├── Publisher: /vision/detections (std_msgs/String)
│   └── Publish JSON detection results setiap cycle (untuk executor handler)
│
└── ROS2 Parameters:
    ├── camera_device: string = "/dev/video0"
    ├── frame_width: int = 640
    ├── frame_height: int = 480
    ├── publish_rate: double = 10.0
    ├── min_area: int = 500
    └── colors_file: string = "~/.amr_vision/colors.json"
```

### 7.4 Communication Pattern

Mengikuti 2 pattern yang sudah established di project ini:

**Read pattern** (seperti `as5600_node` → `odometry_read` handler):
```
amr_vision_node → publish /vision/detections (JSON string)
                                    ↑
executor handler (vision_detect) ← lazy-subscribe, cache latest value
```

**Write pattern** (seperti `gpio_node` write):
```
executor handler (vision_train_color) → publish /vision/train (JSON string)
                                                    ↓
                                        amr_vision_node ← subscribe, execute training
```

### 7.5 Custom Messages — Tidak Diperlukan untuk Phase 1

Hasil deteksi dikembalikan sebagai **JSON string melalui `BlocklyAction.action` yang sudah ada** — identik dengan pattern odometry handler. Ini menghindari kebutuhan custom message baru dan menjaga `blockly_interfaces` tetap minimal.

```python
# handlers/vision.py
@handler("vision_detect")
def handle_vision_detect(params, hardware):
    color = params.get("color", "all")
    # Read from cache (lazy-subscribed to /vision/detections)
    return (True, json.dumps({"count": 3, "objects": [...]}))
```

Jika di kemudian hari diperlukan typed messages (Phase 2+), custom messages bisa ditambahkan ke `blockly_interfaces`:

```
# msg/VisionDetection.msg
string color_name
uint16 x
uint16 y
uint16 width
uint16 height
uint32 area
```

### 7.6 pixi.toml Dependencies

```toml
# Tambah ke [dependencies] atau [target.linux-aarch64.dependencies]
py-opencv = "*"

# Build & run tasks
[tasks.build-vision]
cmd = "colcon build --packages-select amr_vision_node"
depends-on = ["build-interfaces"]

[tasks.vision-node]
cmd = "ros2 run amr_vision_node vision_node"
depends-on = ["build-vision"]
```

Jika `ros-jazzy-cv-bridge` dan `ros-jazzy-image-transport` tersedia di RoboStack, tambahkan untuk Phase 2. Jika tidak, OpenCV `VideoCapture` langsung (zero extra deps) sudah cukup.

---

## 8. Blockly Integration Proposal

### 8.1 Overview — 4 Blocks, Mengikuti Pattern Odometry

| Block | Tipe | Pattern | Deskripsi |
|-------|------|---------|-----------|
| `visionDetect` | ROS2 value block | mirrors `odometryRead.js` | Fetch semua deteksi dari kamera |
| `visionGetCount` | Client-side | mirrors `odometryGet.js` | Extract jumlah obyek |
| `visionGetObject` | Client-side | mirrors `odometryGet.js` | Extract field obyek ke-N |
| `visionTrainColor` | ROS2 statement | mirrors `digitalOut.js` | Trigger training warna |

### 8.2 Block 1: `visionDetect` — Fetch Detections

```
┌────────────────────────────────────────────┐
│ getVision  color: [All ▾]                  │ → output: Object (JSON)
└────────────────────────────────────────────┘
```

- **Dropdown**: `All`, atau nama warna yang sudah di-training
- **Category**: `Robot`
- **Command**: `vision_detect`

**Generator** (mengikuti pattern `odometryRead.js`):

```javascript
// blocks/visionDetect.js
BlockRegistry.register({
  name: 'visionDetect',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#8E24AA',
  tooltip: 'Fetch vision detection data — use with "set variable" block',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('getVision')
        .appendField(new Blockly.FieldDropdown([
          ['All', 'all'],
          ['Red', 'red'],
          ['Blue', 'blue'],
          ['Green', 'green']
        ]), 'COLOR');
      this.setOutput(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Fetch all vision detections (count, objects[]) from camera');
    }
  },

  generator: function (block) {
    var color = block.getFieldValue('COLOR');
    var code =
      'JSON.parse((await executeAction(\'vision_detect\', { color: \'' + color + '\' })).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
```

### 8.3 Block 2: `visionGetCount` — Extract Count

```
┌───────────────────────────────────────────────┐
│ getVisionCount from [detection ▾]             │ → output: Number
└───────────────────────────────────────────────┘
```

**Generator** (mengikuti pattern `odometryGet.js`):

```javascript
// blocks/visionGetCount.js
BlockRegistry.register({
  name: 'visionGetCount',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#8E24AA',
  tooltip: 'Get the number of detected objects from vision data',

  definition: {
    init: function () {
      this.appendValueInput('VAR')
        .appendField('getVisionCount')
        .appendField('from');
      this.setOutput(true, 'Number');
      this.setColour('#8E24AA');
      this.setTooltip('Extract object count from vision data');
    }
  },

  generator: function (block) {
    var varCode = Blockly.JavaScript.valueToCode(
      block, 'VAR', Blockly.JavaScript.ORDER_MEMBER) || '{}';
    var code = '(' + varCode + '.count)';
    return [code, Blockly.JavaScript.ORDER_MEMBER];
  }
});
```

### 8.4 Block 3: `visionGetObject` — Extract Object Field

```
┌───────────────────────────────────────────────────────────┐
│ getVisionObject [■ index] [X ▾] from [detection ▾]       │ → output: Number
└───────────────────────────────────────────────────────────┘
```

**Generator**:

```javascript
// blocks/visionGetObject.js
BlockRegistry.register({
  name: 'visionGetObject',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#8E24AA',
  tooltip: 'Get a field from a detected object by index (0-based, left to right)',

  definition: {
    init: function () {
      this.appendValueInput('INDEX')
        .appendField('getVisionObject');
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['Center X', 'cx'],
          ['Center Y', 'cy'],
          ['Width', 'w'],
          ['Height', 'h'],
          ['Area', 'area'],
          ['Color', 'color']
        ]), 'FIELD')
        .appendField('from');
      this.appendValueInput('VAR');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Extract a field from detected object at index');
    }
  },

  generator: function (block) {
    var indexCode = Blockly.JavaScript.valueToCode(
      block, 'INDEX', Blockly.JavaScript.ORDER_MEMBER) || '0';
    var field = block.getFieldValue('FIELD');
    var varCode = Blockly.JavaScript.valueToCode(
      block, 'VAR', Blockly.JavaScript.ORDER_MEMBER) || '{}';
    var code = '(' + varCode + '.objects[' + indexCode + '].' + field + ')';
    return [code, Blockly.JavaScript.ORDER_MEMBER];
  }
});
```

### 8.5 Block 4: `visionTrainColor` — Train New Color

```
┌──────────────────────────────────────────────┐
│ Vision Train Color  name: [input]            │
│   ROI size: [50]   samples: [10]             │
└──────────────────────────────────────────────┘
```

**Generator**:

```javascript
// blocks/visionTrainColor.js
BlockRegistry.register({
  name: 'visionTrainColor',
  category: 'Robot',
  categoryColor: '#5b80a5',
  color: '#8E24AA',
  tooltip: 'Train a new color — place reference object in front of camera before running',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('trainColor')
        .appendField('name:')
        .appendField(new Blockly.FieldTextInput('red'), 'NAME');
      this.appendDummyInput()
        .appendField('ROI size:')
        .appendField(new Blockly.FieldNumber(50, 10, 200), 'ROI_SIZE')
        .appendField('samples:')
        .appendField(new Blockly.FieldNumber(10, 1, 50), 'SAMPLES');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Train a color by sampling the camera ROI');
    }
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var roiSize = block.getFieldValue('ROI_SIZE');
    var samples = block.getFieldValue('SAMPLES');
    var code = 'await executeAction(\'vision_train_color\', ' +
      '{ name: \'' + name + '\', roi_size: \'' + roiSize + '\', samples: \'' + samples + '\' });\n';
    return code;
  }
});
```

### 8.6 Contoh Penggunaan di Blockly

**Program sederhana — hitung obyek merah**:
```
┌─ Main Program ──────────────────────────────┐
│                                              │
│  set [det] to [getVision color: Red]         │
│  set [count] to [getVisionCount from [det]]  │
│  print ["Jumlah obyek: " + count]            │
│                                              │
│  repeat [count] times with [i]:              │
│    set [x] to [getVisionObject [i]           │
│                 [Center X] from [det]]       │
│    print ["Obyek " + (i+1) + " di x=" + x]  │
│                                              │
└──────────────────────────────────────────────┘
```

**Program training warna baru**:
```
┌─ Main Program ─────────────────────────────────┐
│                                                  │
│  print ["Taruh obyek KUNING di depan kamera"]    │
│  delay [3] seconds                               │
│  trainColor  name: "kuning"                      │
│              ROI size: 50  samples: 10           │
│  print ["Training selesai!"]                     │
│                                                  │
│  set [det] to [getVision color: kuning]          │
│  print ["Terdeteksi: " + getVisionCount [det]]   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 8.7 Handler Python — `handlers/vision.py`

```python
# handlers/vision.py — auto-discovered, no imports to update
import json
import threading

from . import handler
from .hardware import Hardware


def _get_vision_subscriber(hardware: Hardware):
    """Lazy-create subscriber for /vision/detections."""
    if not hasattr(hardware.node, "_vision_cache"):
        hardware.node._vision_cache = {}
        hardware.node._vision_lock = threading.Lock()
        hardware.node._vision_sub = None

    if hardware.node._vision_sub is None:
        from std_msgs.msg import String

        def _vision_cb(msg: String):
            with hardware.node._vision_lock:
                hardware.node._vision_cache = json.loads(msg.data)

        hardware.node._vision_sub = hardware.node.create_subscription(
            String, "/vision/detections", _vision_cb, 10
        )

    return hardware.node._vision_cache


def _get_vision_publisher(hardware: Hardware):
    """Lazy-create publisher for /vision/train."""
    if not hasattr(hardware.node, "_vision_train_pub"):
        from std_msgs.msg import String

        hardware.node._vision_train_pub = hardware.node.create_publisher(
            String, "/vision/train", 10
        )
    return hardware.node._vision_train_pub


@handler("vision_detect")
def handle_vision_detect(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    color = params.get("color", "all")
    hardware.log(f"vision_detect(color={color})")

    data = {"count": 0, "objects": []}

    if hardware.is_real():
        cache = _get_vision_subscriber(hardware)
        with hardware.node._vision_lock:
            if cache:
                if color == "all":
                    data = cache
                else:
                    # Filter by color
                    filtered = [o for o in cache.get("objects", []) if o.get("color") == color]
                    data = {"count": len(filtered), "objects": filtered}

    return (True, json.dumps(data))


@handler("vision_train_color")
def handle_vision_train_color(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    name = params.get("name", "unknown")
    roi_size = params.get("roi_size", "50")
    samples = params.get("samples", "10")
    hardware.log(f"vision_train_color(name={name}, roi_size={roi_size}, samples={samples})")

    if hardware.is_real():
        from std_msgs.msg import String

        pub = _get_vision_publisher(hardware)
        msg = String()
        msg.data = json.dumps({"color_name": name, "roi_size": int(roi_size), "samples": int(samples)})
        pub.publish(msg)

    return (True, f"Training color '{name}' initiated")
```

---

## 9. Implementation Phases

### Phase 1 — Minimum Viable Product (Rekomendasi untuk memulai)

| Komponen | Detail |
|----------|--------|
| Camera | OpenCV `VideoCapture` langsung (no ROS2 image pipeline) |
| Detection | HSV thresholding + contour detection |
| Training | Capture ROI samples → compute HSV range → save JSON |
| Blockly | 4 blocks: `visionDetect`, `visionGetCount`, `visionGetObject`, `visionTrainColor` |
| Handler | `vision_detect`, `vision_train_color` (pattern identik odometry) |
| Message | Tidak perlu custom message — JSON via `BlocklyAction.action` |
| Platform | Berjalan di Pi 4/5 dan Desktop |

**Deliverables**:
- `src/amr_vision_node/` — ROS2 Python package lengkap
- 4 Blockly block files di `src/blockly_app/.../blocks/`
- 2 handler functions di `src/blockly_executor/.../handlers/vision.py`
- Update `manifest.js` dan `pixi.toml`
- Integration tests

### Phase 2 — Enhanced (setelah Phase 1 stabil)

| Komponen | Detail |
|----------|--------|
| ROS2 Image Pipeline | `cv_bridge`, `image_transport`, `sensor_msgs/Image` |
| HMI Camera Feed | Widget menampilkan live camera thumbnail di HMI panel |
| ML Color Classifier | k-Nearest Neighbors (KNN) trained on HSV samples |
| Multi-Color | Deteksi beberapa warna secara simultan |
| Custom Messages | `VisionDetection.msg`, `VisionDetections.msg` |

### Phase 3 — Advanced (future enhancement)

| Komponen | Detail |
|----------|--------|
| YOLO Detection | YOLOv8-nano via ONNX Runtime (~5 FPS on Pi 5) |
| Object Tracking | Track objects across frames (persistent ID) |
| Shape Recognition | Deteksi bentuk selain warna (lingkaran, persegi, dll) |

---

## 10. Performance Estimates pada Raspberry Pi

Berdasarkan benchmark OpenCV pada Raspberry Pi 4/5 yang dipublikasikan:

| Operasi | Pi 4 | Pi 5 |
|---------|------|------|
| HSV threshold + contour (640x480) | 15-30 FPS | 30+ FPS |
| Single color detection pipeline | ~10-20 ms/frame | ~5-10 ms/frame |
| 3 colors simultaneously | ~30-50 ms/frame | ~15-25 ms/frame |
| Memory usage (OpenCV + camera buffer) | ~50-100 MB | ~50-100 MB |
| YOLO v8-nano (ONNX Runtime) | ~2-3 FPS | ~5-7 FPS |

**Handler round-trip** (Blockly → executor → vision_node cache → result): menambah ~10-100 ms, sehingga effective detection rate dari Blockly adalah 5-15 Hz. Cukup memadai untuk sequential object counting yang tidak memerlukan real-time tracking.

---

## 11. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RoboStack tidak punya `cv_bridge`/`image_transport` untuk aarch64 | Tidak bisa pakai ROS2 image pipeline | Medium | Phase 1 pakai OpenCV `VideoCapture` langsung — zero ROS2 image deps |
| Sensitivitas pencahayaan HSV | Deteksi tidak akurat saat cahaya berubah | High | Training procedure, tolerance parameter adjustable, auto white balance kamera |
| Pi overheat saat continuous vision | Throttling, FPS drop | Medium | Kurangi frame rate, gunakan heatsink/fan, configurable `publish_rate` |
| USB bandwidth contention | Frame drops | Low | Gunakan CSI camera, atau kurangi resolusi |
| Obyek overlapping/occlusion | Count salah | Medium | Minimum separation filter, morphological operations, area filter |
| Hue wrapping untuk warna merah | Training merah gagal | Medium | Deteksi Hue bimodal, gunakan 2 range + bitwise OR |

---

## 12. Conclusion & Recommendation

### Kelayakan

Implementasi vision sensor pada AMR ROS2 K4 **layak dilakukan** dengan pendekatan HSV color thresholding menggunakan OpenCV. Pendekatan ini:

1. **Ringan secara komputasi** — berjalan 15-30 FPS pada Raspberry Pi 4 tanpa GPU
2. **Memenuhi semua requirements** — color recognition, color training, object counting left-to-right
3. **Terintegrasi natural** ke arsitektur Blockly yang sudah ada — mengikuti pattern odometry yang terbukti (fetch once, extract many via JSON)
4. **Tidak memerlukan custom message baru** — JSON via `BlocklyAction.action` cukup untuk Phase 1
5. **Inkremental** — Phase 1 bisa dimulai segera, Phase 2/3 bisa ditambahkan saat dibutuhkan

### Rekomendasi Langkah Selanjutnya

1. **Verifikasi** ketersediaan `py-opencv` di RoboStack `linux-aarch64` channel
2. **Implementasi Phase 1** — `amr_vision_node`, 4 Blockly blocks, 2 handlers
3. **Testing** — integration tests di dummy mode + manual test dengan kamera USB di Pi
4. **Iterasi** — tune HSV parameters, tambah default color profiles, uji berbagai kondisi pencahayaan
