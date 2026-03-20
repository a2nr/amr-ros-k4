# Feasibility Study: Vision Sensor for AMR ROS2 K4

> **Date**: 2026-03-20
> **Scope**: Color/object recognition, slot-based object counting, Blockly + HMI integration
> **Platform**: Raspberry Pi 4/5 (linux-aarch64) + Desktop (linux-64)

---

## 1. Executive Summary

Implementasi vision sensor pada Kiwi Wheel AMR layak dilakukan dengan arsitektur **split processing**: Raspberry Pi bertindak sebagai **camera server** (capture + publish snapshot saja), sementara semua pemrosesan OpenCV dilakukan di sisi **executor** (desktop). Hasil capture dapat dipantau melalui **HMI camera widget**, dan pengaturan ROI (Region of Interest) dilakukan secara interaktif di HMI.

Pendekatan HSV color thresholding ringan secara komputasi dan berjalan efisien di desktop. Object counting menggunakan model **slot-based** yang mendukung gap detection — posisi tertentu bisa kosong (misal: slot 1 ada, slot 2 kosong, slot 3 ada, slot 4 ada).

**Rekomendasi**: Phase 1 (MVP) — Pi sebagai camera server, OpenCV di executor, HMI camera widget + ROI config, 5 Blockly blocks.

---

## 2. Requirements Analysis

### R1: Pengenalan Warna dan Obyek + Prosedur Training Warna

- Deteksi obyek berdasarkan warna dalam frame kamera
- User dapat mendefinisikan (training) warna baru melalui prosedur yang user-friendly
- Return data obyek terdeteksi: label warna, posisi di frame, bounding box

### R2: Penghitungan Obyek (Urut Kiri ke Kanan) dengan Gap Detection

- Hitung obyek yang tersusun secara sekuensial di pandangan kamera
- Urutan berdasarkan posisi horizontal (x-coordinate) dari kiri ke kanan
- **Slot-based counting**: setiap slot bisa berisi obyek (present) atau kosong (absent)
- Return: total slots, present count, dan status individual tiap slot

### R3: Integrasi Blockly App + HMI

- Vision blocks terintegrasi ke Blockly visual programming
- **HMI camera widget** menampilkan live camera feed
- **ROI configuration** dilakukan secara interaktif di HMI (drag/resize)
- Mengikuti pattern established: JS block registration, handler decorator, ROS2 action

---

## 3. System Architecture — Split Processing

### 3.1 Overview

```
┌─── Raspberry Pi (aarch64) ───┐     ┌─── Desktop (x86_64) ────────────────────────┐
│                               │     │                                              │
│  amr_vision_node              │     │  blockly_executor                            │
│  ├── Camera capture           │     │  ├── handlers/vision.py                      │
│  ├── JPEG compress            │ ROS2│  │   ├── vision_snapshot → return base64     │
│  └── Publish /vision/snapshot ├────►│  │   ├── vision_detect  → OpenCV + results  │
│      (on-demand, low rate)    │topic│  │   └── vision_train   → sample ROI + save │
│                               │     │  └── OpenCV processing (all compute here)   │
│  gpio_node, pca9685_node,     │     │                                              │
│  as5600_node (unchanged)      │     │  blockly_app (HMI)                           │
│                               │     │  ├── Camera widget (displays base64 frame)   │
└───────────────────────────────┘     │  ├── ROI overlay (interactive drag/resize)   │
                                      │  ├── Slot dividers + detection overlays      │
                                      │  └── Color training UI                       │
                                      └──────────────────────────────────────────────┘
```

### 3.2 Kenapa Split Processing?

| Aspek | Processing di Pi (versi lama) | Processing di Executor (baru) |
|-------|-------------------------------|-------------------------------|
| Beban Pi | Berat (OpenCV + camera + motor control) | Ringan (camera capture saja) |
| Performa OpenCV | Terbatas (Pi 4: 15-30 FPS) | Cepat (desktop: 100+ FPS) |
| HMI integration | Sulit (image harus dikirim balik ke desktop) | Mudah (image sudah di desktop) |
| ROI interaktif | Tidak mungkin (no GUI di Pi) | Natural (HMI widget di desktop) |
| Debugging | Susah (headless Pi) | Mudah (bisa preview di HMI) |

### 3.3 Data Flow — On Demand

Pi tidak perlu publish terus-menerus. Snapshot dipublish hanya saat dibutuhkan (pada rate rendah, misalnya 2-5 Hz, atau trigger-based):

```
User clicks "Run" di Blockly
    ↓
HMI program loop (~20 Hz):
  1. executeAction('vision_snapshot', {}) → handler ambil frame cache → return base64
  2. HMI.setCamera('cam1', base64image)  → tampilkan di HMI widget
  3. executeAction('vision_detect', {color:'red', slots:4, roi:{...}}) → OpenCV → results
  4. HMI.setSlotStatus('slots1', results) → update slot indicator di HMI
```

---

## 4. Hardware — Kamera untuk Raspberry Pi

### Option A: Raspberry Pi Camera Module v2 / v3

| Aspek | Detail |
|-------|--------|
| Interface | CSI (MIPI) via ribbon cable |
| Resolusi | 8 MP (v2), 12 MP (v3), autofocus pada v3 |
| Kelebihan | Native Pi support, low latency, hardware-accelerated JPEG encode via `libcamera` |
| Kekurangan | Kabel pendek, posisi mounting terbatas |
| Harga | ~$25 (v2), ~$35 (v3) |

### Option B: USB Webcam (Logitech C270, C920)

| Aspek | Detail |
|-------|--------|
| Interface | USB (V4L2) |
| Resolusi | 720p - 1080p |
| Kelebihan | Plug and play, kabel panjang, mudah mounting |
| Kekurangan | Latency lebih tinggi, USB bandwidth |
| Harga | ~$20 (C270), ~$60 (C920) |

### Rekomendasi

Kedua jenis muncul sebagai `/dev/video*` via V4L2. Node mengabstraksi akses — cukup ganti device path via ROS2 parameter. **USB webcam untuk prototyping** (mudah dipasang, panjang kabel fleksibel).

---

## 5. Software Stack

### 5.1 Pi Side — Minimal Dependencies

Pi hanya butuh OpenCV untuk capture dan JPEG compress. Tidak perlu full OpenCV — bahkan bisa pakai `picamera2` untuk Pi Camera atau `v4l2` langsung.

```python
# Minimal capture di Pi
import cv2
cap = cv2.VideoCapture("/dev/video0")
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
ret, frame = cap.read()
_, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
```

### 5.2 Executor Side — Full OpenCV Processing

Desktop menjalankan semua vision processing:
- `py-opencv` dari conda-forge
- Color space conversion (BGR → HSV)
- `cv2.inRange()`, morphological operations, contour detection
- Image annotation (bounding boxes, slot overlays)
- Base64 encoding untuk HMI display

### 5.3 ROS2 Image Transport

Untuk transport gambar dari Pi ke executor:

| Option | Format | Size (640x480) | Pros | Cons |
|--------|--------|-----------------|------|------|
| `sensor_msgs/CompressedImage` | JPEG bytes | ~30-50 KB | Standard ROS2, efficient | Butuh `cv_bridge` di kedua sisi |
| `std_msgs/String` (base64) | Base64 JPEG | ~40-70 KB | Zero extra deps | 33% overhead, tidak standard |
| Custom `VisionSnapshot.msg` | bytes + metadata | ~30-50 KB | Typed, bisa tambah metadata | Perlu define message baru |

**Rekomendasi Phase 1**: `sensor_msgs/CompressedImage` jika tersedia di RoboStack. Fallback: `std_msgs/String` dengan base64 encoding.

---

## 6. Color Recognition — HSV Thresholding

### 6.1 Pipeline (dijalankan di Executor)

```
Snapshot JPEG dari Pi
    ↓ cv2.imdecode()
Frame (BGR)
    ↓ cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
Frame (HSV)
    ↓ Crop ke ROI (dari HMI config)
ROI (HSV)
    ↓ cv2.inRange(roi, lower_bound, upper_bound)
Binary Mask (0/255)
    ↓ cv2.erode() + cv2.dilate()
Clean Mask
    ↓ cv2.findContours()
Contours
    ↓ filter by area
Detected Objects
```

### 6.2 Color Training Procedure (via HMI)

Training warna dilakukan secara visual melalui HMI — **bukan** dengan input angka di Blockly block.

**Flow**:

1. User melihat camera feed di HMI widget
2. User **mengatur ROI** (drag rectangle di HMI) ke area objek referensi
3. User menjalankan block `trainColor` — executor mengambil snapshot, sampling HSV dari ROI
4. Hasil training (HSV range) disimpan sebagai JSON profile
5. User bisa langsung melihat detection result di HMI (bounding boxes overlay)

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

**Training Algorithm** (dijalankan di executor):

```python
def train_color(frame_jpeg, roi, color_name, num_samples=10, tolerance=15):
    """Train a color from a ROI on the camera frame.

    Args:
        frame_jpeg: JPEG bytes from Pi snapshot
        roi: dict {x, y, w, h} from HMI widget
        color_name: label for the trained color
        num_samples: frames to average (executor requests multiple snapshots)
        tolerance: HSV tolerance (+/-)

    Returns:
        Color profile with lower_hsv and upper_hsv
    """
    frame = cv2.imdecode(np.frombuffer(frame_jpeg, np.uint8), cv2.IMREAD_COLOR)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Crop to ROI defined by user in HMI
    roi_hsv = hsv[roi['y']:roi['y']+roi['h'], roi['x']:roi['x']+roi['w']]
    median_hsv = np.median(roi_hsv.reshape(-1, 3), axis=0).astype(int)

    lower = np.clip(median_hsv - tolerance, [0, 0, 0], [179, 255, 255]).tolist()
    upper = np.clip(median_hsv + tolerance, [0, 0, 0], [179, 255, 255]).tolist()

    return {"lower_hsv": lower, "upper_hsv": upper, "tolerance": tolerance}
```

**Catatan Hue wrapping**: Warna merah memiliki Hue di sekitar 0° dan 180°. Training procedure harus mendeteksi bimodal distribution dan menghasilkan dua range yang digabung dengan `cv2.bitwise_or()`.

---

## 7. Slot-Based Object Counting with Gap Detection

### 7.1 Konsep

Berbeda dengan simple counting (hitung semua obyek), slot-based counting membagi area pandang kamera menjadi **N slot** (zona vertikal dari kiri ke kanan). Setiap slot di-inspect: ada obyek (present) atau kosong (absent).

```
Camera frame (ROI area):
┌──────────┬──────────┬──────────┬──────────┐
│  Slot 1  │  Slot 2  │  Slot 3  │  Slot 4  │
│          │          │          │          │
│  [RED]   │  (empty) │  [BLUE]  │  [RED]   │
│          │          │          │          │
└──────────┴──────────┴──────────┴──────────┘
    ✓ ada     ✗ kosong    ✓ ada     ✓ ada
```

### 7.2 Algoritma

```python
def detect_slots(frame_jpeg, roi, num_slots, color_profiles, min_area=500):
    """Detect objects in each slot of the ROI.

    Args:
        frame_jpeg: JPEG bytes from Pi
        roi: {x, y, w, h} from HMI
        num_slots: number of left-to-right slots
        color_profiles: trained color HSV ranges
        min_area: minimum contour area

    Returns:
        Slot detection results with gap info
    """
    frame = cv2.imdecode(np.frombuffer(frame_jpeg, np.uint8), cv2.IMREAD_COLOR)
    roi_frame = frame[roi['y']:roi['y']+roi['h'], roi['x']:roi['x']+roi['w']]
    hsv = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2HSV)

    # Detect all colored objects
    all_objects = []
    for name, profile in color_profiles.items():
        mask = cv2.inRange(hsv, np.array(profile["lower_hsv"]), np.array(profile["upper_hsv"]))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.erode(mask, kernel, iterations=1)
        mask = cv2.dilate(mask, kernel, iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            cx = x + w // 2
            all_objects.append({"cx": cx, "color": name, "area": int(area),
                                "x": x, "y": y, "w": w, "h": h})

    # Assign objects to slots
    slot_width = roi['w'] / num_slots
    slots = []
    for i in range(num_slots):
        slot_left = i * slot_width
        slot_right = (i + 1) * slot_width

        # Find objects whose centroid falls within this slot
        slot_objects = [o for o in all_objects if slot_left <= o["cx"] < slot_right]

        if slot_objects:
            # Take the largest object in the slot
            best = max(slot_objects, key=lambda o: o["area"])
            slots.append({
                "slot": i + 1,
                "present": True,
                "color": best["color"],
                "cx": best["cx"],
                "cy": best["y"] + best["h"] // 2,
                "area": best["area"],
            })
        else:
            slots.append({
                "slot": i + 1,
                "present": False,
            })

    present_count = sum(1 for s in slots if s["present"])

    return {
        "total_slots": num_slots,
        "present_count": present_count,
        "absent_count": num_slots - present_count,
        "slots": slots,
    }
```

### 7.3 Output Format

```json
{
  "total_slots": 4,
  "present_count": 3,
  "absent_count": 1,
  "slots": [
    {"slot": 1, "present": true, "color": "red", "cx": 80, "cy": 120, "area": 2850},
    {"slot": 2, "present": false},
    {"slot": 3, "present": true, "color": "blue", "cx": 320, "cy": 115, "area": 2640},
    {"slot": 4, "present": true, "color": "red", "cx": 480, "cy": 122, "area": 3020}
  ]
}
```

### 7.4 Use Cases

| Skenario | Slots | Hasil |
|----------|-------|-------|
| Assembly check: semua posisi terisi | 4 | `present_count: 4, absent_count: 0` |
| Quality control: ada yang kosong | 4 | `present_count: 3, absent_count: 1` → alert |
| Color sorting: urutan warna benar? | 3 | Check `slots[0].color == "red"`, `slots[1].color == "blue"`, ... |
| Counting: berapa total? | N | `present_count` langsung |

---

## 8. ROS2 Node Design — `amr_vision_node` (Pi Camera Server)

### 8.1 Prinsip

Node ini **hanya menangkap gambar dan mengirimkan snapshot**. Tidak ada pemrosesan OpenCV. Ringan, sederhana, reliable.

### 8.2 Package Structure

```
src/amr_vision_node/
├── docs/
│   └── feasibility.md              # dokumen ini
├── amr_vision_node/
│   ├── __init__.py
│   └── vision_node.py              # Camera capture + publish (SATU file saja)
├── resource/
│   └── amr_vision_node             # ament resource marker
├── package.xml
├── setup.py
└── setup.cfg
```

**Package type**: ament_python — hanya satu file Python, minimal dependencies.

### 8.3 Node Architecture

```
amr_vision_node (Python, ROS2 Node — berjalan di Pi)
│
├── Timer callback (configurable, default 2 Hz)
│   ├── Capture frame dari kamera (OpenCV VideoCapture)
│   ├── Encode ke JPEG (cv2.imencode, quality 80)
│   └── Publish ke /vision/snapshot
│
└── ROS2 Parameters:
    ├── camera_device: string = "/dev/video0"
    ├── frame_width: int = 640
    ├── frame_height: int = 480
    ├── jpeg_quality: int = 80
    └── publish_rate: double = 2.0   ← rendah, hemat bandwidth
```

### 8.4 Contoh Implementasi Node

```python
"""amr_vision_node — Camera server for Pi. Capture + publish snapshots only."""

import cv2
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage


class VisionNode(Node):
    def __init__(self):
        super().__init__('amr_vision_node')

        # Parameters
        self.declare_parameter('camera_device', '/dev/video0')
        self.declare_parameter('frame_width', 640)
        self.declare_parameter('frame_height', 480)
        self.declare_parameter('jpeg_quality', 80)
        self.declare_parameter('publish_rate', 2.0)

        device = self.get_parameter('camera_device').value
        width = self.get_parameter('frame_width').value
        height = self.get_parameter('frame_height').value
        self._jpeg_quality = self.get_parameter('jpeg_quality').value
        rate = self.get_parameter('publish_rate').value

        # Camera
        self._cap = cv2.VideoCapture(device)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        if not self._cap.isOpened():
            self.get_logger().error(f'Cannot open camera: {device}')
            return

        # Publisher
        self._pub = self.create_publisher(CompressedImage, '/vision/snapshot', 1)

        # Timer
        self.create_timer(1.0 / rate, self._timer_cb)
        self.get_logger().info(f'Vision camera started: {device} @ {width}x{height}, {rate} Hz')

    def _timer_cb(self):
        ret, frame = self._cap.read()
        if not ret:
            return

        _, jpeg = cv2.imencode('.jpg', frame,
                               [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality])

        msg = CompressedImage()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.format = 'jpeg'
        msg.data = jpeg.tobytes()
        self._pub.publish(msg)

    def destroy_node(self):
        if self._cap:
            self._cap.release()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = VisionNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
```

### 8.5 Bandwidth Estimate

| Resolusi | JPEG Quality | Size per frame | Rate | Bandwidth |
|----------|-------------|----------------|------|-----------|
| 640x480 | 80 | ~30-50 KB | 2 Hz | ~60-100 KB/s |
| 640x480 | 80 | ~30-50 KB | 5 Hz | ~150-250 KB/s |
| 320x240 | 70 | ~10-15 KB | 5 Hz | ~50-75 KB/s |

Pada 2 Hz dengan 640x480, bandwidth ~100 KB/s — sangat terjangkau untuk WiFi atau ethernet Pi.

---

## 9. Executor Handler Design — `handlers/vision.py`

### 9.1 Prinsip

**Semua pemrosesan OpenCV terjadi di sini** — di sisi executor (desktop). Handler menerima snapshot dari Pi via ROS2 subscription, menjalankan deteksi, dan mengembalikan hasil.

### 9.2 Handler Architecture

```
handlers/vision.py
│
├── _get_snapshot_subscriber()    ← Lazy-subscribe ke /vision/snapshot
│   └── Cache latest JPEG bytes (thread-safe)
│
├── @handler("vision_snapshot")   ← Return base64 image untuk HMI display
│   └── Decode cached JPEG → annotate (optional) → base64 → JSON
│
├── @handler("vision_detect")     ← Full detection pipeline
│   └── Decode → crop ROI → HSV threshold → contour → slot assignment → JSON
│
└── @handler("vision_train_color") ← Train color from ROI
    └── Decode → crop ROI → sample HSV → compute range → save profile
```

### 9.3 Contoh Implementasi

```python
"""Vision handlers — all OpenCV processing happens here (executor side)."""

import base64
import json
import os
import threading

import cv2
import numpy as np

from . import handler
from .hardware import Hardware

_COLORS_FILE = os.path.expanduser("~/.amr_vision/colors.json")


def _load_color_profiles():
    """Load trained color profiles from disk."""
    if os.path.exists(_COLORS_FILE):
        with open(_COLORS_FILE) as f:
            return json.load(f).get("colors", {})
    return {}


def _save_color_profiles(profiles):
    """Save trained color profiles to disk."""
    os.makedirs(os.path.dirname(_COLORS_FILE), exist_ok=True)
    with open(_COLORS_FILE, "w") as f:
        json.dump({"colors": profiles}, f, indent=2)


def _get_snapshot_subscriber(hardware: Hardware):
    """Lazy-create subscriber for /vision/snapshot from Pi."""
    if not hasattr(hardware.node, "_vision_snapshot_cache"):
        hardware.node._vision_snapshot_cache = None  # raw JPEG bytes
        hardware.node._vision_snapshot_lock = threading.Lock()
        hardware.node._vision_snapshot_sub = None

    if hardware.node._vision_snapshot_sub is None:
        from sensor_msgs.msg import CompressedImage

        def _snapshot_cb(msg: CompressedImage):
            with hardware.node._vision_snapshot_lock:
                hardware.node._vision_snapshot_cache = bytes(msg.data)

        hardware.node._vision_snapshot_sub = hardware.node.create_subscription(
            CompressedImage, "/vision/snapshot", _snapshot_cb, 1
        )

    return hardware.node


def _get_cached_frame(hardware: Hardware):
    """Get the latest cached JPEG bytes from Pi."""
    node = _get_snapshot_subscriber(hardware)
    with node._vision_snapshot_lock:
        return node._vision_snapshot_cache


def _decode_frame(jpeg_bytes):
    """Decode JPEG bytes to OpenCV BGR frame."""
    return cv2.imdecode(np.frombuffer(jpeg_bytes, np.uint8), cv2.IMREAD_COLOR)


@handler("vision_snapshot")
def handle_vision_snapshot(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    """Return latest camera frame as base64 for HMI display."""
    hardware.log("vision_snapshot()")

    if hardware.is_real():
        jpeg_bytes = _get_cached_frame(hardware)
        if jpeg_bytes is None:
            return (True, json.dumps({"image": None, "error": "no frame"}))

        b64 = base64.b64encode(jpeg_bytes).decode("ascii")
        return (True, json.dumps({
            "image": "data:image/jpeg;base64," + b64,
        }))

    # Dummy mode — return placeholder
    return (True, json.dumps({"image": None, "dummy": True}))


@handler("vision_detect")
def handle_vision_detect(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    """Detect objects in slots using HSV thresholding."""
    color = params.get("color", "all")
    num_slots = int(params.get("slots", "1"))
    roi_json = params.get("roi", "{}")
    hardware.log(f"vision_detect(color={color}, slots={num_slots})")

    data = {"total_slots": num_slots, "present_count": 0,
            "absent_count": num_slots, "slots": []}

    if hardware.is_real():
        jpeg_bytes = _get_cached_frame(hardware)
        if jpeg_bytes is None:
            return (True, json.dumps(data))

        frame = _decode_frame(jpeg_bytes)
        h, w = frame.shape[:2]
        roi = json.loads(roi_json) if roi_json != "{}" else {"x": 0, "y": 0, "w": w, "h": h}

        profiles = _load_color_profiles()
        if color != "all":
            profiles = {k: v for k, v in profiles.items() if k == color}

        # Crop to ROI
        rx, ry, rw, rh = roi["x"], roi["y"], roi["w"], roi["h"]
        roi_frame = frame[ry:ry+rh, rx:rx+rw]
        hsv = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2HSV)

        # Detect all colored objects
        all_objects = []
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        min_area = int(params.get("min_area", "500"))

        for name, profile in profiles.items():
            lower = np.array(profile["lower_hsv"])
            upper = np.array(profile["upper_hsv"])
            mask = cv2.inRange(hsv, lower, upper)
            mask = cv2.erode(mask, kernel, iterations=1)
            mask = cv2.dilate(mask, kernel, iterations=2)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < min_area:
                    continue
                bx, by, bw, bh = cv2.boundingRect(cnt)
                cx = bx + bw // 2
                all_objects.append({"cx": cx, "color": name, "area": int(area)})

        # Assign to slots
        slot_width = rw / num_slots if num_slots > 0 else rw
        slots = []
        for i in range(num_slots):
            slot_left = i * slot_width
            slot_right = (i + 1) * slot_width
            slot_objs = [o for o in all_objects if slot_left <= o["cx"] < slot_right]

            if slot_objs:
                best = max(slot_objs, key=lambda o: o["area"])
                slots.append({"slot": i + 1, "present": True,
                              "color": best["color"], "area": best["area"]})
            else:
                slots.append({"slot": i + 1, "present": False})

        present = sum(1 for s in slots if s["present"])
        data = {"total_slots": num_slots, "present_count": present,
                "absent_count": num_slots - present, "slots": slots}

    return (True, json.dumps(data))


@handler("vision_train_color")
def handle_vision_train_color(
    params: dict[str, str], hardware: Hardware
) -> tuple[bool, str]:
    """Train a color by sampling ROI from the current frame."""
    name = params.get("name", "unknown")
    roi_json = params.get("roi", "{}")
    tolerance = int(params.get("tolerance", "15"))
    hardware.log(f"vision_train_color(name={name}, tolerance={tolerance})")

    if hardware.is_real():
        jpeg_bytes = _get_cached_frame(hardware)
        if jpeg_bytes is None:
            return (True, "No camera frame available")

        frame = _decode_frame(jpeg_bytes)
        h, w = frame.shape[:2]
        roi = json.loads(roi_json) if roi_json != "{}" else {
            "x": w // 4, "y": h // 4, "w": w // 2, "h": h // 2
        }

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        roi_hsv = hsv[roi["y"]:roi["y"]+roi["h"], roi["x"]:roi["x"]+roi["w"]]
        median_hsv = np.median(roi_hsv.reshape(-1, 3), axis=0).astype(int)

        lower = np.clip(median_hsv - tolerance, [0, 0, 0], [179, 255, 255]).tolist()
        upper = np.clip(median_hsv + tolerance, [0, 0, 0], [179, 255, 255]).tolist()

        profiles = _load_color_profiles()
        profiles[name] = {"lower_hsv": lower, "upper_hsv": upper, "tolerance": tolerance}
        _save_color_profiles(profiles)

        return (True, json.dumps({"name": name, "lower_hsv": lower, "upper_hsv": upper}))

    return (True, f"Training color '{name}' (dummy mode)")
```

---

## 10. HMI Integration — Camera Widget

### 10.1 New Widget Type: `camera`

Widget `camera` menampilkan frame kamera dari Pi sebagai `<img>` element, dengan overlay canvas untuk ROI dan detection results.

**Default grid size**: [4, 3] (lebih besar dari widget biasa karena menampilkan gambar).

### 10.2 HMI Manager Addition — `hmi-manager.js`

```javascript
// ─── Camera widget ──────────────────────────────────────────────
// Default size for camera widget
// _defaultSizes.camera = [4, 3];

function _renderCamera(body, widget) {
  // Image element
  var img = document.createElement('img');
  img.className = 'hmi-camera-image';
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.objectFit = 'contain';

  if (widget.image) {
    img.src = widget.image;  // data:image/jpeg;base64,...
  } else {
    img.alt = 'No camera feed';
    img.style.background = '#333';
    img.style.minHeight = '120px';
  }
  body.appendChild(img);

  // Overlay for detection results
  if (widget.detections && widget.detections.slots) {
    var overlay = document.createElement('div');
    overlay.className = 'hmi-camera-overlay';
    overlay.style.position = 'relative';
    overlay.style.fontSize = '11px';
    overlay.style.marginTop = '4px';
    overlay.style.display = 'flex';
    overlay.style.gap = '2px';

    widget.detections.slots.forEach(function (slot) {
      var indicator = document.createElement('div');
      indicator.className = 'hmi-slot-indicator';
      indicator.style.flex = '1';
      indicator.style.textAlign = 'center';
      indicator.style.padding = '2px 4px';
      indicator.style.borderRadius = '3px';

      if (slot.present) {
        indicator.style.background = '#4caf50';
        indicator.style.color = '#fff';
        indicator.textContent = slot.slot + ': ' + (slot.color || '✓');
      } else {
        indicator.style.background = '#f44336';
        indicator.style.color = '#fff';
        indicator.textContent = slot.slot + ': ✗';
      }
      overlay.appendChild(indicator);
    });
    body.appendChild(overlay);
  }
}

function setCamera(name, image, detections) {
  var existing = _widgets.get(name);
  if (existing) {
    existing.image = image;
    existing.detections = detections || null;
    _scheduleRender(name);
  } else {
    addWidget(name, 'camera', { image: image, detections: detections || null });
  }
}
```

### 10.3 ROI Configuration via HMI

ROI disimpan di widget state dan bisa dikonfigurasi via Blockly block parameter:

```javascript
// Blockly block: hmiSetCameraROI
// Sets the ROI for vision processing — visual feedback in HMI
function setCameraROI(name, x, y, w, h) {
  var existing = _widgets.get(name);
  if (existing) {
    existing.roi = { x: x, y: y, w: w, h: h };
    _scheduleRender(name);
  }
}

// getCameraROI — read current ROI from HMI widget state
function getCameraROI(name) {
  var widget = _widgets.get(name);
  if (!widget || !widget.roi) return { x: 0, y: 0, w: 640, h: 480 };
  return widget.roi;
}
```

**Phase 2 enhancement**: Interactive ROI — user bisa drag/resize rectangle langsung di atas camera feed (pointer events on overlay canvas).

---

## 11. Blockly Integration Proposal

### 11.1 Overview — 5 Blocks

| Block | Tipe | Category | Deskripsi |
|-------|------|----------|-----------|
| `visionSnapshot` | ROS2 value (HMI) | Vision | Ambil snapshot + tampilkan di HMI camera widget |
| `visionDetect` | ROS2 value | Vision | Deteksi obyek dalam slots → return JSON |
| `visionGetSlot` | Client-side | Vision | Extract status slot ke-N (present/absent/color) |
| `visionTrainColor` | ROS2 statement | Vision | Training warna dari ROI saat ini |
| `hmiSetCamera` | Client-side (HMI) | HMI | Update HMI camera widget dengan frame + detections |

### 11.2 Block: `visionSnapshot`

Ambil snapshot kamera dari Pi melalui executor dan return base64 image.

```
┌────────────────────────────────────┐
│ getSnapshot                        │ → output: Object {image, ...}
└────────────────────────────────────┘
```

```javascript
BlockRegistry.register({
  name: 'visionSnapshot',
  category: 'Vision',
  categoryColor: '#8E24AA',
  color: '#8E24AA',
  tooltip: 'Fetch camera snapshot from Pi — returns image data for HMI display',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('getSnapshot');
      this.setOutput(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Fetch latest camera frame as base64 image');
    }
  },

  generator: function (block) {
    var code =
      'JSON.parse((await executeAction(\'vision_snapshot\', {})).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
```

### 11.3 Block: `visionDetect`

Deteksi obyek dalam frame dengan slot-based counting.

```
┌───────────────────────────────────────────────┐
│ detectVision  color: [All ▾]  slots: [■ 4]   │
│   ROI: x [■] y [■] w [■] h [■]               │ → output: Object (JSON)
└───────────────────────────────────────────────┘
```

```javascript
BlockRegistry.register({
  name: 'visionDetect',
  category: 'Vision',
  categoryColor: '#8E24AA',
  color: '#8E24AA',
  tooltip: 'Detect objects in slots — supports gap detection (empty slots)',

  definition: {
    init: function () {
      this.appendValueInput('SLOTS')
        .appendField('detectVision')
        .appendField(new Blockly.FieldDropdown([
          ['All colors', 'all'],
          ['Red', 'red'],
          ['Blue', 'blue'],
          ['Green', 'green']
        ]), 'COLOR')
        .appendField('slots:');
      this.appendValueInput('ROI_X').appendField('ROI x:').setCheck('Number');
      this.appendValueInput('ROI_Y').appendField('y:').setCheck('Number');
      this.appendValueInput('ROI_W').appendField('w:').setCheck('Number');
      this.appendValueInput('ROI_H').appendField('h:').setCheck('Number');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Detect objects in N slots — returns {total_slots, present_count, absent_count, slots[]}');
    }
  },

  generator: function (block) {
    var color = block.getFieldValue('COLOR');
    var slots = Blockly.JavaScript.valueToCode(
      block, 'SLOTS', Blockly.JavaScript.ORDER_ATOMIC) || '1';
    var roiX = Blockly.JavaScript.valueToCode(
      block, 'ROI_X', Blockly.JavaScript.ORDER_ATOMIC) || '0';
    var roiY = Blockly.JavaScript.valueToCode(
      block, 'ROI_Y', Blockly.JavaScript.ORDER_ATOMIC) || '0';
    var roiW = Blockly.JavaScript.valueToCode(
      block, 'ROI_W', Blockly.JavaScript.ORDER_ATOMIC) || '640';
    var roiH = Blockly.JavaScript.valueToCode(
      block, 'ROI_H', Blockly.JavaScript.ORDER_ATOMIC) || '480';

    var code = 'JSON.parse((await executeAction(\'vision_detect\', ' +
      '{ color: \'' + color + '\', slots: String(' + slots + '), ' +
      'roi: JSON.stringify({x: ' + roiX + ', y: ' + roiY +
      ', w: ' + roiW + ', h: ' + roiH + '}) })).message)';
    return [code, Blockly.JavaScript.ORDER_AWAIT];
  }
});
```

### 11.4 Block: `visionGetSlot`

Extract status dari slot tertentu (client-side, no ROS2).

```
┌──────────────────────────────────────────────────────────┐
│ getSlot [■ index] [Present? ▾] from [detection ▾]        │ → output: value
└──────────────────────────────────────────────────────────┘
```

```javascript
BlockRegistry.register({
  name: 'visionGetSlot',
  category: 'Vision',
  categoryColor: '#8E24AA',
  color: '#8E24AA',
  tooltip: 'Get slot status from detection result (present/absent/color/count)',

  definition: {
    init: function () {
      this.appendValueInput('INDEX')
        .appendField('getSlot');
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['Present?', 'present'],
          ['Color', 'color'],
          ['Present Count', 'present_count'],
          ['Absent Count', 'absent_count'],
          ['Total Slots', 'total_slots'],
        ]), 'FIELD')
        .appendField('from');
      this.appendValueInput('VAR');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Extract slot info — index for per-slot, or overall counts');
    }
  },

  generator: function (block) {
    var indexCode = Blockly.JavaScript.valueToCode(
      block, 'INDEX', Blockly.JavaScript.ORDER_MEMBER) || '0';
    var field = block.getFieldValue('FIELD');
    var varCode = Blockly.JavaScript.valueToCode(
      block, 'VAR', Blockly.JavaScript.ORDER_MEMBER) || '{}';

    var code;
    // Overall fields don't need index
    if (field === 'present_count' || field === 'absent_count' || field === 'total_slots') {
      code = '(' + varCode + '.' + field + ')';
    } else {
      // Per-slot fields need index (slot array is 0-based in JS)
      code = '(' + varCode + '.slots[' + indexCode + '].' + field + ')';
    }
    return [code, Blockly.JavaScript.ORDER_MEMBER];
  }
});
```

### 11.5 Block: `visionTrainColor`

Training warna dari ROI area pada frame kamera saat ini.

```
┌──────────────────────────────────────────────┐
│ trainColor  name: [input]                    │
│   ROI: x [■] y [■] w [■] h [■]              │
│   tolerance: [15]                            │
└──────────────────────────────────────────────┘
```

```javascript
BlockRegistry.register({
  name: 'visionTrainColor',
  category: 'Vision',
  categoryColor: '#8E24AA',
  color: '#8E24AA',
  tooltip: 'Train a new color from ROI area — place colored object in view first',

  definition: {
    init: function () {
      this.appendDummyInput()
        .appendField('trainColor')
        .appendField('name:')
        .appendField(new Blockly.FieldTextInput('red'), 'NAME');
      this.appendValueInput('ROI_X').appendField('ROI x:').setCheck('Number');
      this.appendValueInput('ROI_Y').appendField('y:').setCheck('Number');
      this.appendValueInput('ROI_W').appendField('w:').setCheck('Number');
      this.appendValueInput('ROI_H').appendField('h:').setCheck('Number');
      this.appendDummyInput()
        .appendField('tolerance:')
        .appendField(new Blockly.FieldNumber(15, 5, 50), 'TOLERANCE');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#8E24AA');
      this.setTooltip('Train a color by sampling the ROI area');
    }
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var tolerance = block.getFieldValue('TOLERANCE');
    var roiX = Blockly.JavaScript.valueToCode(
      block, 'ROI_X', Blockly.JavaScript.ORDER_ATOMIC) || '0';
    var roiY = Blockly.JavaScript.valueToCode(
      block, 'ROI_Y', Blockly.JavaScript.ORDER_ATOMIC) || '0';
    var roiW = Blockly.JavaScript.valueToCode(
      block, 'ROI_W', Blockly.JavaScript.ORDER_ATOMIC) || '640';
    var roiH = Blockly.JavaScript.valueToCode(
      block, 'ROI_H', Blockly.JavaScript.ORDER_ATOMIC) || '480';

    var code = 'await executeAction(\'vision_train_color\', ' +
      '{ name: \'' + name + '\', tolerance: \'' + tolerance + '\', ' +
      'roi: JSON.stringify({x: ' + roiX + ', y: ' + roiY +
      ', w: ' + roiW + ', h: ' + roiH + '}) });\n';
    return code;
  }
});
```

### 11.6 Block: `hmiSetCamera`

Update HMI camera widget — menampilkan frame dan detection results.

```
┌───────────────────────────────────────────────────────┐
│ HMI Camera [cam1]  frame: [■ snapshot]                │
│   detections: [■ detection_result] (optional)         │
└───────────────────────────────────────────────────────┘
```

```javascript
BlockRegistry.register({
  name: 'hmiSetCamera',
  category: 'HMI',
  categoryColor: '#00BCD4',
  color: '#00BCD4',
  tooltip: 'Display camera feed with detection overlay on HMI panel',

  definition: {
    init: function () {
      this.appendValueInput('FRAME')
        .appendField('HMI Camera')
        .appendField(new Blockly.FieldTextInput('cam1'), 'NAME')
        .appendField('frame:');
      this.appendValueInput('DETECTIONS')
        .appendField('detections:');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Display camera image with slot detection overlay in HMI panel');
    }
  },

  generator: function (block) {
    var name = block.getFieldValue('NAME');
    var frame = Blockly.JavaScript.valueToCode(
      block, 'FRAME', Blockly.JavaScript.ORDER_ATOMIC) || 'null';
    var detections = Blockly.JavaScript.valueToCode(
      block, 'DETECTIONS', Blockly.JavaScript.ORDER_ATOMIC) || 'null';

    return (
      "await highlightBlock('" + block.id + "');\n" +
      "HMI.setCamera('" + name + "', (" + frame + ").image, " + detections + ");\n"
    );
  }
});
```

### 11.7 Contoh Program Blockly Lengkap

**Main Program** — Deteksi dan cek slot:
```
┌─ Main Program ──────────────────────────────────────┐
│                                                      │
│  set [det] to [detectVision All slots: 4             │
│                 ROI x:50 y:50 w:540 h:380]           │
│                                                      │
│  set [present] to [getSlot [0] Present Count [det]]  │
│  set [absent]  to [getSlot [0] Absent Count [det]]   │
│  print ["Ada: " + present + ", Kosong: " + absent]   │
│                                                      │
│  repeat 4 times with [i]:                            │
│    if [getSlot [i] Present? from [det]] then:        │
│      set [color] to [getSlot [i] Color from [det]]   │
│      print ["Slot " + (i+1) + ": " + color]          │
│    else:                                             │
│      print ["Slot " + (i+1) + ": KOSONG"]            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**HMI Program** — Live camera feed + detection overlay:
```
┌─ HMI Program ───────────────────────────────────────┐
│                                                      │
│  set [snap] to [getSnapshot]                         │
│  set [det] to [detectVision All slots: 4             │
│                 ROI x:50 y:50 w:540 h:380]           │
│  HMI Camera [cam1] frame: [snap] detections: [det]   │
│                                                      │
│  HMI Number [present_count] = [getSlot [] Present    │
│              Count from [det]]  unit: "pcs"          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Training Program** — Train warna baru:
```
┌─ Main Program ──────────────────────────────────────┐
│                                                      │
│  print ["Taruh obyek MERAH di area ROI"]             │
│  delay [3] seconds                                   │
│  trainColor name: "merah"                            │
│    ROI x: 200 y: 150 w: 240 h: 180                  │
│    tolerance: 15                                     │
│  print ["Training merah selesai!"]                   │
│                                                      │
│  print ["Taruh obyek BIRU di area ROI"]              │
│  delay [3] seconds                                   │
│  trainColor name: "biru"                             │
│    ROI x: 200 y: 150 w: 240 h: 180                  │
│    tolerance: 15                                     │
│  print ["Training biru selesai!"]                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 12. Implementation Phases

### Phase 1 — MVP

| Komponen | Detail |
|----------|--------|
| Pi Node | `amr_vision_node` — capture + publish JPEG only, ament_python |
| Executor | `handlers/vision.py` — OpenCV processing, 3 handlers |
| HMI | `setCamera()` widget — display base64 image + slot indicators |
| Blockly | 5 blocks: `visionSnapshot`, `visionDetect`, `visionGetSlot`, `visionTrainColor`, `hmiSetCamera` |
| Counting | Slot-based with gap detection |
| Color Training | HSV sampling dari ROI, simpan JSON |
| Image Transport | `sensor_msgs/CompressedImage` (fallback: `std_msgs/String` base64) |

**Dependencies baru**:
```toml
# pixi.toml — Desktop
py-opencv = "*"

# pixi.toml — Pi (minimal, hanya untuk capture)
py-opencv = "*"  # atau picamera2 jika CSI camera
```

### Phase 2 — Interactive HMI

| Komponen | Detail |
|----------|--------|
| ROI drag/resize | Pointer events pada canvas overlay di camera widget |
| Slot divider visual | Vertical lines pada camera feed menunjukkan batas slot |
| Detection overlay | Bounding boxes + color labels digambar di canvas |
| Color picker | Training warna via click pada area di camera feed |
| Dynamic color dropdown | Blockly dropdown diisi dari trained colors file |

### Phase 3 — Advanced

| Komponen | Detail |
|----------|--------|
| YOLO Detection | YOLOv8-nano via ONNX Runtime di executor |
| Object Tracking | Persistent ID across frames |
| Camera calibration | Distortion correction, pixel-to-cm mapping |
| Multi-camera | Support beberapa kamera Pi |

---

## 13. Performance Estimates

### Pi Side (Camera Server Only)

| Operasi | Waktu | Bandwidth (2 Hz) |
|---------|-------|-------------------|
| Camera capture (640x480) | ~5-10 ms | — |
| JPEG encode (quality 80) | ~3-5 ms | — |
| ROS2 publish | ~1 ms | ~60-100 KB/s |
| **Total per frame** | **~10-15 ms** | — |

Pi hanya butuh ~3% CPU untuk camera server pada 2 Hz. Sisa resources untuk motor control, encoder, GPIO.

### Executor Side (Desktop Processing)

| Operasi | Waktu |
|---------|-------|
| JPEG decode | ~2-5 ms |
| HSV convert + threshold (640x480) | ~3-5 ms |
| Contour detection | ~1-2 ms |
| Slot assignment | ~0.1 ms |
| Base64 encode untuk HMI | ~2-3 ms |
| **Total per frame** | **~10-15 ms** |

Desktop bisa memproses 60-100 FPS. Bottleneck adalah Pi publish rate (2-5 Hz), bukan processing.

### HMI Display

| Operasi | Waktu |
|---------|-------|
| Set img src (base64, ~50 KB) | ~5-10 ms |
| Render slot indicators | ~1 ms |
| **Effective HMI camera rate** | **2-5 FPS** |

2-5 FPS cukup untuk monitoring — ini bukan video streaming, tapi inspection snapshot.

---

## 14. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `sensor_msgs/CompressedImage` tidak ada di RoboStack aarch64 | Tidak bisa transport image standar | Medium | Fallback ke `std_msgs/String` base64 |
| Sensitivitas pencahayaan HSV | Deteksi tidak akurat | High | Training procedure, adjustable tolerance, HMI live preview untuk verifikasi |
| Base64 image terlalu besar untuk action result | Slow response | Low | JPEG quality tuning, resolusi lebih kecil, atau pisahkan image transport dari detection |
| WiFi latency Pi → Desktop | Frame delay | Medium | Ethernet, atau reduce frame resolution |
| Slot assignment ambigu (obyek di batas slot) | Obyek masuk ke 2 slot | Medium | Gunakan centroid untuk assignment, tambah tolerance zone |
| `py-opencv` tidak tersedia di RoboStack aarch64 | Pi tidak bisa capture | Low | Gunakan `picamera2` untuk Pi Camera, atau `v4l2` raw capture |

---

## 15. Conclusion & Recommendation

### Kelayakan

Implementasi vision sensor dengan arsitektur split processing **layak dilakukan**:

1. **Pi tetap ringan** — hanya camera capture + JPEG publish, ~3% CPU usage
2. **Processing di desktop** — OpenCV berjalan cepat (~10-15 ms/frame), tidak membebani Pi
3. **HMI integration natural** — camera widget + slot indicators menggunakan pattern HMI yang sudah ada
4. **Slot-based counting** — mendukung gap detection (slot kosong), lebih realistis dari simple counting
5. **ROI via HMI** — user-friendly, visual, tidak perlu input angka manual
6. **Inkremental** — Phase 1 bisa dimulai segera, interactive features di Phase 2

### Langkah Selanjutnya

1. **Verifikasi** `py-opencv` dan `sensor_msgs` tersedia di RoboStack untuk kedua platform
2. **Implementasi Phase 1** — Pi camera node, executor handlers, HMI camera widget, 5 Blockly blocks
3. **Testing** — dummy mode tests + manual test dengan USB webcam
4. **Iterate** — tune HSV, test berbagai pencahayaan, tambah default color profiles
