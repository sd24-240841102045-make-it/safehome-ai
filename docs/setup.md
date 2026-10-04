# SafeHome AI — Local Setup & Development Guide

This guide provides instructions for setting up and running SafeHome AI locally on Windows, macOS, or Linux using a computer (acting as the edge AI hub) and a smartphone (acting as the edge camera).

---

## 1. System Requirements

* **Node.js**: v18.18.0 or newer (Node v20/v24 recommended)
* **Python**: 3.10 or 3.11 with `venv` support
* **Network**: Laptop and smartphone connected to the **same Wi-Fi router** or local mobile hotspot.

---

## 2. Quickstart Installation (Single Command Dev)

### Step 1: Clone Repository
```powershell
git clone https://github.com/your-username/safehome-ai.git
cd safehome-ai
```

### Step 2: Install Node Dependencies
From the repository root:
```powershell
npm install
```

### Step 3: Configure Python Virtual Environment
```powershell
# Create virtual environment in root directory
python -m venv .venv

# Activate on Windows PowerShell:
.\.venv\Scripts\activate

# Install Python requirements (FastAPI, OpenCV, NumPy, ONNX Runtime)
pip install -r python-service/requirements.txt
```

---

## 3. Running All Services

Start the Backend Gateway (`:5000`), Python AI Service (`:8000`), and React Vite Dashboard (`:5173`) simultaneously:

```powershell
npm run dev
```

### Active Service Ports:
* **Frontend Web App**: `http://localhost:5173`
* **Backend Express REST & WS**: `http://localhost:5000`
* **Python AI Computer Vision Service**: `http://localhost:8000` (API Docs at `http://localhost:8000/docs`)

---

## 4. Connecting Your Phone as a Camera Node

1. Make sure your smartphone and laptop are connected to the same Wi-Fi.
2. In your computer browser, open `http://localhost:5173` and log in with the demo account:
   * **Email**: `demo@safehome.local`
   * **Password**: `SafeHome@2026`
3. Check your computer's local Wi-Fi IP address on the dashboard (e.g. `192.168.1.105`).
4. On your smartphone's browser (Chrome on Android or Safari on iOS), open:
   ```text
   http://<YOUR_LAPTOP_IP>:5173/monitor
   ```
5. Tap **"Grant Permissions"** for camera access.
6. Tap **"Start Monitoring"**.
7. The phone's camera feed will stream to the laptop AI engine at ~15-20 FPS, with AI bounding boxes and latency telemetry rendered live on both screens.

---

## 5. Running Automated Tests

```powershell
# Run all backend unit & integration tests (Vitest)
npm run test

# Run Python AI service tests (Pytest)
pytest python-service/tests
```

---

## 6. Generating Synthetic Data (Testing Anomaly Detection)

To test the statistical baseline anomaly models with 14 days of realistic activity data:

```powershell
npm run seed:synthetic
```
This populates the database with historical patterns so the statistical baseline model can immediately evaluate live events against calibrated distributions.
