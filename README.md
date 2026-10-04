# SafeHome AI — Local-First Intelligent Home Safety Platform

> **⚠️ Important Safety Notice:**  
> A phone camera is not a replacement for dedicated smoke, gas, fire, door or professional security sensors. AI results can be wrong.

SafeHome AI transforms everyday hardware — an Android smartphone acting as an edge camera node and a personal computer acting as the local AI hub — into a private, high-performance, and intelligent home safety and activity monitoring system.

---

## 📖 About the Project

Traditional smart home cameras routinely stream unencrypted or proprietary video feeds to third-party cloud servers, introducing recurring subscription fees, latency, vendor lock-in, and severe privacy risks.

**SafeHome AI solves this by operating 100% locally:**
* **Zero Cloud Video Ingestion**: Camera frames, snapshots, detection bounding boxes, and statistical baselines never leave your local area network (LAN).
* **Edge Computer Vision**: Real-time object detection (YOLOv8 Nano ONNX), face occlusion & mask analysis, and loitering tracking run directly on the host computer with optional GPU acceleration.
* **Neutral, Evidence-Based Intelligence**: Activity is described strictly using observable, mathematical facts (e.g., *"Person detected in entryway for 45s"*). No biased "suspicion" classifiers, no facial recognition, and no automatic emergency dispatch.
* **Open & Multi-Device**: Connect any smartphone browser to stream video via WebSockets or WebRTC with zero app installation required.

---

## 🌟 Key Features

### 1. 👁️ Real-Time Vision AI Pipeline
* **YOLOv8 Nano (ONNX Runtime)**: Sub-20ms per-frame detection of persons, pets, and vehicles via OpenCV DNN.
* **Face Occlusion & Mask Analytics**: Real-time detection of medical/cloth masks or partial facial coverings with confidence scoring without storing biometric facial identities.
* **Loitering & Continuous Presence Tracking**: Intelligent smoothing and debounce logic that tracks presence duration and suppresses duplicate alerts.

### 2. 📊 Statistical Anomaly Analysis (Data Science Engine)
* **Localized Historical Baselines**: Continuous rolling analysis comparing live events against historical hourly activity distributions.
* **Timezone-Aware Intelligence**: Precise quiet-hour evaluation ($1.5\times$ threshold multiplier) respecting the homeowner's configured home timezone.
* **Data Guard Safeguard**: Strict threshold enforcement requiring $\ge 100$ events across $\ge 7$ days before flagging statistical anomalies (otherwise reports: *"Not enough historical data for reliable anomaly analysis"*).
* **Human-in-the-Loop Feedback**: Mark events as *Expected* or *Unexpected* to dynamically calibrate future anomaly models.

### 3. 🛡️ Privacy, Security & Data Sovereignty
* **Strict Tenant Isolation**: Multi-home support with Row-Level Security (RLS) and parameterized query guarantees.
* **Local Disk Snapshot Storage**: High-resolution snapshots stored in private directories with configurable automated retention (default 7 days) and permanent erasure.
* **Tamper-Resistant Security Audit Logs**: Immutable logging of administrative actions, permission changes, and device pairing events.
* **GDPR Data Export & Erasure**: Instant machine-readable export of all user activity and one-click data deletion.

### 4. 📱 Zero-Install Phone Camera Node
* **Instant Browser Pairing**: Open `/monitor` on any Android or iOS browser on your local Wi-Fi to start streaming immediately.
* **Real-Time Bounding Box Feedback**: Computer vision bounding boxes, confidence tags, and network latency are rendered directly back on the phone's camera view.
* **Acoustic Spike Monitoring**: Optional, client-side microphone threshold detection running entirely within the phone's browser memory.

---

## 🏗️ System Architecture

```text
  ┌─────────────────────────────────────────────────────────┐
  │                 ANDROID SMARTPHONE                      │
  │  (Chrome / Safari Browser via local Wi-Fi)              │
  │  • Streams 1080p/720p Frames over WebSocket (/ws)       │
  │  • Displays HUD Overlays & Low-Latency AI Feedback      │
  └────────────────────────────┬────────────────────────────┘
                               │ Local LAN (ws://<ip>:5000/ws)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │               NODE.JS EXPRESS GATEWAY (:5000)           │
  │  • WebSocket Connection Pooling & Backpressure Control  │
  │  • Rule Engine (Deduplication, Cooldown, Severity)      │
  │  • REST API (Auth, Devices, Events, Alerts, Analytics)  │
  │  • Storage Manager & Snapshot Retention Purge           │
  └──────────────┬───────────────────────────┬──────────────┘
                 │ Local HTTP (:8000)        │ SQLite / Supabase
                 ▼                           ▼
  ┌──────────────────────────────┐ ┌─────────────────────────┐
  │   PYTHON AI SERVICE (:8000)  │ │   DATABASE & STORAGE    │
  │  • /detect (YOLOv8n ONNX)    │ │  • safehome.db (SQLite) │
  │  • /analyze (Stats Baseline) │ │  • PostgreSQL (Supabase)│
  │  • Face Occlusion Analyzer   │ │  • Local Snapshots Dir  │
  └──────────────────────────────┘ └─────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────┐
  │               REACT VITE DASHBOARD (:5173)              │
  │  • Live Video Stream & Real-Time Alert Ticker           │
  │  • Interactive Timeline with Category & Date Filters    │
  │  • Analytics Charts (24h Activity, Hourly Heatmaps)     │
  │  • Security Audit Log Viewer & System Settings          │
  └─────────────────────────────────────────────────────────┘
```

---

## ⚡ Performance Benchmarks

Measured on a standard laptop host (**Intel Core / AMD Ryzen, NVIDIA GeForce RTX 3050 Laptop GPU, 16 GB RAM**):

| Benchmark Metric | Measured Performance |
|---|---|
| **YOLOv8 Nano ONNX Inference (p50)** | **18.5 ms** |
| **YOLOv8 Nano ONNX Inference (p95)** | **34.2 ms** |
| **End-to-End WebSocket Frame RTT (Phone $\to$ Gateway $\to$ AI $\to$ HUD)** | **42.0 ms (p50)** / **68.5 ms (p95)** |
| **GPU VRAM Consumption** | ~815 MB / 4096 MB (~20% load) |
| **CPU Utilization during Live Streaming** | < 8% |
| **Memory Footprint (Gateway + AI Service)** | ~245 MB RSS |

---

## 🚀 Quickstart Guide

### 1. Prerequisites
* **Node.js**: v18.0.0+ (v20+ recommended)
* **Python**: 3.10+ (with virtual environment support)
* **Local Network**: Laptop and smartphone connected to the same Wi-Fi network.

### 2. Installation

Clone the repository and install all dependencies with one command:

```powershell
# 1. Clone repository
git clone https://github.com/your-username/safehome-ai.git
cd safehome-ai

# 2. Install Node.js backend & frontend dependencies
npm install

# 3. Setup Python Virtual Environment and dependencies
python -m venv .venv
.\.venv\Scripts\activate
pip install -r python-service/requirements.txt
```

### 3. Launch Development Environment

Run the entire monorepo (Gateway, Python AI Service, and React Frontend) with a single command:

```powershell
npm run dev
```

* **React Dashboard**: Open [http://localhost:5173](http://localhost:5173) in your browser.
* **Express Gateway API**: Running on `http://localhost:5000`.
* **Python AI Microservice**: Running on `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

### 4. Connect Your Smartphone
1. Check your computer's Wi-Fi IP address on the dashboard (e.g. `192.168.1.105`).
2. On your smartphone browser, navigate to:
   ```text
   http://192.168.1.105:5173/monitor
   ```
3. Tap **"Grant Permissions"** and click **"Start Monitoring"**.
4. The live stream and bounding box HUD will immediately activate on both phone and dashboard.

---

## 🔑 Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Homeowner** | `demo@safehome.local` | `SafeHome@2026` |

*(You can also click the **"Quick Demo"** button on the login screen to sign in instantly).*

---

## 📜 Legal & Licensing Registry

| Component | License | Permitted Use | Copyleft Status |
|---|---|---|---|
| **YOLOv8 Nano (`yolov8n.onnx`)** | **AGPL-3.0** | Personal / Open Source / Educational | ⚠️ AGPL-3.0 copyleft |
| **ByteTrack Tracking Algorithm** | **MIT** | Personal & Commercial | Permissive |
| **OpenCV (`opencv-python`)** | **Apache 2.0** | Personal & Commercial | Permissive |
| **Express / React / Vite / Tailwind** | **MIT** | Personal & Commercial | Permissive |

> See [docs/licenses.md](docs/licenses.md) for full compliance details and [docs/data-flows.md](docs/data-flows.md) for network telemetry registries.

---

## 🔒 Security & Ethical Principles

1. **No Biometrics or Identity Tracking**: SafeHome AI detects object categories (person, pet, car), not individual human identities. Face analysis is limited strictly to geometric occlusion (masks).
2. **Neutral Descriptions**: Alerts never categorize people as "intruders", "criminals", or "suspicious".
3. **No Automated External Dispatch**: SafeHome AI will never automatically contact 911, police, or emergency services.
4. **Local Hardware First**: Zero video feeds or biometric features are processed on external cloud infrastructures.
