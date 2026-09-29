# SafeHome AI - System Architecture

## 1. Overview

SafeHome AI turns one Android smartphone and one laptop into an AI-assisted home safety and surveillance platform.
The smartphone acts as a mobile sensing and streaming node, while the laptop acts as the local edge hub hosting:
1. **Frontend**: React 19 (Vite, Tailwind CSS, Recharts, Lucide Icons) with strict TypeScript types and relative API proxying
2. **Backend Gateway**: Node.js & Express (TypeScript) with WebSocket server (`ws`), Zod validation, and rate limiting
3. **AI Vision & Data Science Service**: ONE unified Python FastAPI service (:8000) hosting `/detect` (OpenCV + YOLOv8n) and `/analyze` (Pandas, NumPy, and statistical baseline anomaly modeling)
4. **Database & Auth**: Supabase Postgres + Supabase Auth (`public.profiles` referencing `auth.users`), with automatic local SQLite fallback for standalone offline development
5. **Local Snapshot Storage**: Privacy-preserving edge storage under `backend/data/snapshots/` with automatic retention enforcement

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
                  │ Frame JPEG Packets via WebSocket (/ws)
                  ▼
          [ LAPTOP GATEWAY ]
         (Express :5000 /ws)
                  │
                  ▼
      [ UNIFIED PYTHON SERVICE ]
           (FastAPI :8000)
        ├── /detect  (YOLOv8n / OpenCV)
        └── /analyze (Statistical Frequency & Baselines)
                  │
                  ▼
        [ PERSISTENCE & TELEMETRY ]
         - Supabase Postgres / SQLite
         - Local Disk Snapshots (data/snapshots/)
         - Live WS Broadcast to Owner's Dashboard
         - Real-time Alert Dispatch & Cooldown
                  │
                  ▼
         [ REACT DASHBOARD ]
         (http://localhost:5173)
```

---

## 3. Communication Protocols

| Link | Protocol | Description |
|---|---|---|
| Phone $\to$ Laptop | WebSocket (`ws://<laptop-ip>:5000/ws`) | 2 FPS JPEG frame streaming from phone camera |
| Laptop $\to$ Phone | WebSocket (`ws://<laptop-ip>:5000/ws`) | Returns bounding box overlays and processing latencies to phone screen |
| Laptop $\to$ Python Service | HTTP REST (`POST :8000/detect`) | Passes base64 frame; receives structured detections & bounding boxes |
| Laptop $\to$ Python Service | HTTP REST (`POST :8000/analyze`) | Evaluates current time-window against historical baseline for statistical deviation |
| Dashboard $\to$ Backend | REST + WebSocket | Authenticated queries via Bearer token; real-time push for live camera, events, alerts |

---

## 4. WebRTC Upgrade Path (Architecture Roadmap)

In the current implementation, JPEG frames are transmitted over WebSocket at 2 FPS. This design decision offers:
- Zero dependency on external STUN/TURN infrastructure.
- Resilience across varying local subnets and firewall boundaries.
- Direct frame-by-frame access for computer vision inference.

### Upgrade Path to Full WebRTC PeerConnection:

To transition to low-latency 30 FPS WebRTC streaming:

1. **Signaling Server**:
   - The existing Express WebSocket server (`/ws`) will serve as the WebRTC Signaling Channel.
   - Phones and Dashboards exchange SDP Offers, SDP Answers, and ICE candidates via message types: `webrtc_offer`, `webrtc_answer`, and `webrtc_ice_candidate`.

2. **STUN/TURN Infrastructure**:
   - For local LAN connections: WebRTC connects via local host candidates without relay.
   - For cross-NAT connections: Integrate a lightweight coturn server or managed STUN/TURN credentials.

3. **Server-Side Media Termination / GStreamer Pipeline**:
   - To feed frames into YOLOv8n without overloading the laptop, integrate a WebRTC media sink in Node.js (via `node-webrtc` / `wrtc` or a Python `aiortc` endpoint).
   - Alternatively, sample 2–5 keyframes per second directly in the Android browser via `MediaStreamTrackProcessor` / canvas, transmitting only keyframes to Python for detection while streaming the full 30 FPS video track peer-to-peer to the dashboard.

4. **Backward Compatibility**:
   - Retain the WebSocket JPEG fallback mode automatically if WebRTC ICE connection fails or times out after 5 seconds.

---

## 5. Anomaly Detection Philosophy

SafeHome AI strictly uses neutral, mathematical, and evidence-based descriptions. It does **not** claim to identify whether a person is dangerous, malicious, or a criminal. It evaluates:
* **Time of day**: Daytime baseline vs. quiet-hours sensitivity ($1.5\times$ threshold multiplier).
* **Frequency spikes**: Activity exceeding rolling mean $+ 2.0$ standard deviations ($z > 2.0$).
* **Quiet hours context**: Expected activity during configured hours is not classified as an anomaly unless statistically unusual.
* **Limited data guard**: If $<100$ events or $<7$ days of baseline data exist, it returns the exact string:
  > *"Not enough historical data for reliable anomaly analysis."*
* **Human Feedback Loop**: Excludes events marked as `expected` by the homeowner from future baseline distortion.

---

## 6. Privacy & Data Retention Guarantees

* **Strict Edge Storage**: Snapshot images are saved locally on the laptop edge hub disk; never uploaded to public clouds.
* **Automated Expiry**:
  - Snapshot image files older than $N$ days (default 7 days) are unlinked and permanently deleted.
  - Event records older than $M$ days (default 90 days) are purged along with linked alerts.
* **Right to Erasure**: Deleting an event immediately unlinks and removes its corresponding snapshot file from disk.
* **GDPR Portability**: `GET /api/settings/export` generates a comprehensive, machine-readable JSON archive of all personal data.
