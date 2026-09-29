# SafeHome AI - System Architecture

## 1. Overview

SafeHome AI turns one Android smartphone and one laptop into an AI-assisted home safety and surveillance platform.
The smartphone acts as a mobile sensing and streaming node, while the laptop acts as the local edge hub hosting:
1. **Frontend**: React (Vite, Tailwind CSS, Recharts, Lucide Icons)
2. **Backend Gateway**: Node.js & Express with WebSocket server (`ws`)
3. **AI Vision Service**: Python FastAPI + OpenCV object detection (HOG + SVM / Cascade / DNN)
4. **Data Science Service**: Python FastAPI + Scikit-learn (Isolation Forest) & Pandas statistical frequency baselines
5. **Database**: PostgreSQL (Supabase compatible) with automatic zero-configuration SQLite fallback for local development

---

## 2. High-Level Flow Diagram

```text
       [ ANDROID SMARTPHONE ]
                  │
        (Web Camera / Sensors)
                  │
                  ▼
         /monitor Web Page
                  │
                  │ Frame JPEG Packets via WebSocket
                  ▼
          [ LAPTOP GATEWAY ]
         (Express :5000 /ws)
          │                │
          ▼                ▼
   [ AI SERVICE ]     [ DATA SCIENCE ]
 (FastAPI :8000)      (FastAPI :8001)
   OpenCV Vision      Isolation Forest
          │                │
          ▼                ▼
   Structured Detections   Anomaly Classification
          │                │
          └───────┬────────┘
                  ▼
     [ PERSISTENCE & TELEMETRY ]
      - SQLite / PostgreSQL
      - Live WS Broadcast to Dashboard
      - Real-time Alert Dispatch
                  │
                  ▼
         [ REACT DASHBOARD ]
         (http://localhost:5173)
```

---

## 3. Communication Protocols

| Link | Protocol | Description |
|---|---|---|
| Phone $\to$ Laptop | WebSocket (`ws://<laptop-ip>:5000/ws`) | Real-time transmission of camera frame packets and telemetry |
| Laptop $\to$ Phone | WebSocket (`ws://<laptop-ip>:5000/ws`) | Returns real-time bounding box coordinates to draw overlay on phone |
| Laptop $\to$ AI Service | HTTP REST (`POST :8000/detect`) | Receives base64 image; returns detected classes, coordinates, and inference latency |
| Laptop $\to$ Data Science | HTTP REST (`POST :8001/analyze`) | Passes current event with recent historical window for statistical anomaly scoring |
| Dashboard $\to$ Backend | REST + WebSocket | REST for authenticated CRUD queries; WebSocket for live video and real-time alerts |

---

## 4. Anomaly Detection Philosophy

SafeHome AI strictly uses neutral, mathematical, and evidence-based descriptions. It does **not** claim to identify whether a person is dangerous, malicious, or a criminal. It evaluates:
* Time of day (e.g. night-time activity vs. daytime baseline)
* Frequency spikes (e.g. 12 events in an hour where historical baseline is 1–2)
* Multi-feature deviation via Isolation Forest (`sklearn.ensemble.IsolationForest`)
* Limited data handling: if $<10$ events exist, it displays: *"Not enough historical data for reliable anomaly analysis."*
