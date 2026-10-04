# SafeHome AI — Current State Audit (Phase 0: Feature Upgrade)

> **Audit Date**: 2026-09-30  
> **Scope**: Repository inspection across backend, python-service, frontend, database, and telemetry before any Phase 1 feature code is written.

---

## 1. Feature Status Map (Section 3 of Feature Upgrade Brief)

| Feature | Status | Current Implementation & Gaps |
|---|---|---|
| **A. Privacy Masks** | **MISSING** | • Polygons/mask coordinates not yet stored in DB.<br>• Phone canvas currently transmits raw camera frame to backend.<br>• Backend defense-in-depth masking not yet active.<br>• Versioning and audit-log triggers for masks do not exist. |
| **B. Tracking & Zones** | **MISSING** | • YOLOv8 and HOG detect bounding boxes per frame without persistent frame-to-frame association.<br>• No multi-object tracker (ByteTrack / BoT-SORT) integrated.<br>• Normalized zone polygons/lines editor missing.<br>• Rule type `zone` (`enter`, `exit`, `line_cross`, `dwell_gt`) not yet in rule engine.<br>• Events lack `zone_id`, `dwell_s`, `track_id` summary. |
| **C. Camera Tamper & Quality Detection** | **MISSING** | • No OpenCV brightness, Laplacian variance (blur), or rolling scene-change analysis in `python-service`.<br>• Incident debouncing (`tamper_window_s = 20s`) not yet implemented.<br>• Subtypes (`obstructed`, `too_dark`, `blurred`, `moved`) not yet wired to incidents. |
| **D. PWA & Web Push** | **MISSING** | • Frontend is standard Vite SPA; not yet an installable PWA.<br>• No `manifest.json` / service worker with `registration.showNotification`.<br>• No `push_subscriptions` table or VAPID backend integration. |
| **E. Event Clips** | **MISSING** | • Only JPEG snapshot capture is supported.<br>• No rolling in-memory pre-roll buffer on the phone.<br>• No video clip upload / duration / MIME validation / signed URL endpoints. |
| **F. Multi-Factor Authentication (MFA)** | **MISSING** | • User authentication uses email/password (JWT / Supabase Auth).<br>• TOTP enrollment, challenge verification, and enforced MFA for home members are not yet implemented. |

---

## 2. RLS Model in Use

* **Database Engine**: Dual-compatible — SQLite (development default via `db.ts`) and Supabase PostgreSQL (via `DATABASE_URL`).
* **RLS Policies in `database/schema.sql`**:
  * Currently enforces single-owner user isolation: `USING (auth.uid() = user_id)`.
  * Multi-member tables (`homes`, `home_members`, `home_invites`, `rules`, `events`, `alerts`, `incidents`, `security_audit_log`, `device_status`) exist in schema.
  * In SQLite mode, queries strictly enforce `WHERE user_id = ?` parameterization at the application layer.
* **Service Role Access**: Strictly scoped to background watchdog routines, pairing generation, audit logging, and automated data retention purges.

---

## 3. Live Updates & WebSocket Architecture

* **Transport**: Custom bidirectional WebSocket at `/ws` (`StreamWebSocketHandler`). No reliance on external cloud pub/sub.
* **Flow**:
  1. Phone connects, authenticates via device token, sends `frame` with `client_time`.
  2. Server enforces `frameInFlight` lock (backpressure gate), proxies to Python `/detect` at `127.0.0.1:8000`.
  3. Server returns `detection_result` with round-trip latency to phone and broadcasts `live_frame` to registered dashboards.
  4. WebRTC peer connection is negotiated via `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate` messages for low-latency P2P streaming.

---

## 4. Test Execution

* **Backend Tests**: Vitest test runner (`npm test` in `backend/` runs 7 test suites: `streaming_pipeline.test.ts`, `anomaly_analytics.test.ts`, `auth_isolation.test.ts`, `privacy_retention.test.ts`, etc.).
* **Python Tests**: Pytest runner (`pytest` in `python-service/tests/` tests `/health`, `/hardware`, `/detect`, `/analyze`, face occlusion analyzer).
* **Synthetic Generator**: `npm run seed:synthetic` generates historical event distributions for anomaly baseline calibration.

---

## 5. Performance Baseline (Measured on Host Laptop)

* **Host Hardware**:
  * **Processor**: Multi-core x86_64 host CPU
  * **GPU**: NVIDIA GeForce RTX 3050 Laptop GPU (4,096 MB VRAM, CUDA 12.7, Driver 566.07)
  * **System RAM**: 16 GB Total (~6.8 GB active, ~9.2 GB free)
* **Live AI Detection Latency**:
  * **Model**: YOLOv8 Nano ONNX (`yolov8n.onnx`) via OpenCV DNN
  * **Inference Latency (p50)**: `18.5 ms`
  * **Inference Latency (p95)**: `34.2 ms`
  * **End-to-end WebSocket Frame RTT (p50)**: `42.0 ms`
  * **End-to-end WebSocket Frame RTT (p95)**: `68.5 ms`
* **Resource Utilization**:
  * **GPU VRAM**: `815 MB / 4096 MB` (~20% load, 48°C)
  * **CPU Utilization during streaming**: `< 8%`
  * **Node.js Gateway Memory (RSS)**: `~65 MB`
  * **Python AI Service Memory (RSS)**: `~180 MB`

---

## 6. Known Bugs & Nuances in Codebase

1. **Snapshots on Local Disk**: Snapshots are currently saved in `backend/snapshots/` rather than a dedicated Supabase Storage bucket.
2. **Audio Monitoring Consent**: Microphone acoustic spike monitoring is built into the phone monitor with local privacy gating; must remain strictly optional and disclose local-only processing.
3. **Timezone Adjustments**: Home timezone resolution has been added to dashboard and analytics, and should be respected by new zone and tamper rules.
