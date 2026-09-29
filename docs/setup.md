# SafeHome AI - Local Development & Setup Guide

This guide describes running SafeHome AI locally on Windows using one laptop and one Android smartphone.

---

## 1. Prerequisites

* **Node.js**: v18+ (tested on Node v24)
* **Python**: 3.10+ (tested on Python 3.11)
* **Wi-Fi Network**: Laptop and phone connected to the same Wi-Fi router / hotspot.

---

## 2. Directory Structure

```text
safehome-ai/
├── frontend/       # React + Vite web dashboard & phone camera UI
├── backend/        # Express Node.js REST API & WebSocket server
├── ai-service/     # FastAPI Python computer vision service
├── data-science/   # FastAPI Python Isolation Forest anomaly detector
├── database/       # PostgreSQL / Supabase schema.sql & seed.sql
├── docs/           # Architecture, API, and setup documentation
└── .env.example    # Environment variable templates
```

---

## 3. Python Services Setup

From the project root:

```powershell
# Create and activate virtual environment (if not already existing)
python -m venv ..\venv
..\venv\Scripts\activate

# Install requirements for AI service
pip install -r ai-service/requirements.txt

# Install requirements for Data Science service
pip install -r data-science/requirements.txt
```

---

## 4. Backend (Node.js) Setup

```powershell
cd backend
npm install
```

### Environment Configuration
The backend comes pre-configured with a zero-friction SQLite fallback:
* `DATABASE_URL=sqlite:./safehome.sqlite`
* If you have a PostgreSQL or Supabase instance, change `DATABASE_URL` in `backend/.env`:
  `DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`

---

## 5. Frontend (React + Vite) Setup

```powershell
cd ../frontend
npm install
```

---

## 6. Running the System (4 Terminal Windows)

Open 4 separate PowerShell terminals:

### Terminal 1: AI Service (Port 8000)
```powershell
cd safehome-ai/ai-service
..\..\venv\Scripts\python.exe main.py
```

### Terminal 2: Data Science Service (Port 8001)
```powershell
cd safehome-ai/data-science
..\..\venv\Scripts\python.exe main.py
```

### Terminal 3: Express Backend (Port 5000)
```powershell
cd safehome-ai/backend
npm start
```

### Terminal 4: React Dashboard (Port 5173)
```powershell
cd safehome-ai/frontend
npm run dev
```

---

## 7. Connecting the Android Phone

1. Verify your phone and laptop are connected to the same Wi-Fi.
2. In the laptop terminal or on the dashboard, look at the discovered Wi-Fi IP (e.g. `192.168.1.10` or `10.31.145.231`).
3. On your Android phone, open Chrome and navigate to:
   ```text
   http://<YOUR_LAPTOP_IP>:5173/monitor
   ```
4. Tap **"Grant Camera Permission"** when prompted.
5. Tap **"Start Monitoring"**.
6. Real-time camera frames stream directly to your laptop AI service, which detects objects, evaluates statistical anomalies, stores events in the database, and renders bounding boxes live on both the phone and laptop screens.

---

## 8. Demo Credentials

* **Email:** `demo@safehome.local`
* **Password:** `SafeHome@2026`
*(Or click "Quick Demo" on the login screen to auto-fill)*
