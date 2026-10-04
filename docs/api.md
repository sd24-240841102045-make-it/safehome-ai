# SafeHome AI — Complete API Reference

SafeHome AI operates a local REST API and bidirectional WebSocket server on port `5000`, with the Python AI service running on port `8000`.

---

## 1. Authentication & Session Management (`/api/auth`)

### `POST /api/auth/register`
Registers a new homeowner, initial home container, and default detection rules.
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "full_name": "Jane Doe"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "success": true,
    "user": { "id": "uuid-...", "email": "user@example.com", "full_name": "Jane Doe" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```

### `POST /api/auth/login`
Authenticates existing credentials against bcrypt hash and issues a signed JWT token.
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": { "id": "uuid-...", "email": "user@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```

### `GET /api/auth/me`
Retrieves currently authenticated user profile, associated home ID, and permissions. Requires `Authorization: Bearer <token>`.

---

## 2. Health & Hardware Telemetry (`/api/health`)

### `GET /api/health`
Performs an active health check across all sub-services.
* **Response (200 OK)**:
  ```json
  {
    "status": "healthy",
    "backend": "online",
    "database": "online",
    "database_type": "SQLite",
    "ai_service": "online",
    "timestamp": "2026-09-30T15:30:00.000Z"
  }
  ```

### `GET /api/network-interfaces`
Scans local network interfaces (Wi-Fi, Ethernet) to return IP addresses and QR codes for edge device pairing.

---

## 3. Devices & Edge Nodes (`/api/devices`)

* `GET /api/devices`: List all registered phone/laptop camera nodes.
* `POST /api/devices`: Register a new camera node (`phone_camera`, `laptop_webcam`).
* `PATCH /api/devices/:id/status`: Update node heartbeat (`online`, `streaming`, `offline`).
* `POST /api/devices/:id/pairing-token`: Generate a secure, single-use pairing token for the `/monitor` page.

---

## 4. Events & Detection Timeline (`/api/events`)

* `GET /api/events`: Query paginated detection records.
  * **Query Parameters**:
    * `page`: Integer (default: 1)
    * `limit`: Integer (default: 15)
    * `object_class`: String (`person`, `cat`, `dog`, `car`, etc.)
    * `is_unusual`: Boolean (`true` | `false`)
    * `min_confidence`: Float (e.g. `0.75`)
    * `start_date`: ISO Timestamp
    * `end_date`: ISO Timestamp
* `GET /api/events/:id`: Fetch complete metadata, bounding box coordinates, duration, and snapshot URI for a specific event.
* `DELETE /api/events/:id`: Permanently deletes the event record and unlinks its associated local snapshot file.
* `POST /api/events/:id/feedback`: Submits human feedback (`expected` | `unexpected`) to calibrate baseline models.

---

## 5. Alerts & Incidents (`/api/alerts`)

* `GET /api/alerts`: List generated safety alerts (`INFO`, `WARNING`, `CRITICAL`).
* `PATCH /api/alerts/:id`: Mark alert as read/acknowledged.
* `POST /api/alerts/mark-all-read`: Mark all pending alerts as read.
* `DELETE /api/alerts/:id`: Dismiss/delete an alert record.

---

## 6. Analytics & Baselines (`/api/analytics`)

* `GET /api/analytics/dashboard`: Summary statistics for Today's Event Count, Person Detections, Object Detections, and Unusual Anomalies.
* `GET /api/analytics`: Aggregated analytical distributions:
  * `events_by_hour`: 24-hour distribution respecting home timezone.
  * `events_by_type`: Category proportions (Person, Pet, Vehicle, Other).
  * `daily_activity`: 14-day chronological trendline.
  * `confidence_distribution`: Binned histogram of detection confidence scores.
  * `unusual_percentage`: Calculated anomaly rate.

---

## 7. Home Settings, Timezone & Data Retention (`/api/settings`)

* `GET /api/settings`: Fetch current home configuration (quiet hours, home timezone, detection sensitivity, snapshot retention days).
* `PUT /api/settings`: Update settings with instant persistence.
* `GET /api/settings/export`: Generates a complete GDPR machine-readable JSON archive of all events, alerts, and audit logs.
* `POST /api/settings/purge`: Triggers immediate automated retention cleanup.

---

## 8. Audit Logs (`/api/audit-logs`)

* `GET /api/audit-logs`: Retrieves immutable security audit logs (logins, rule changes, setting updates, snapshot deletions).

---

## 9. Python AI Microservice (`http://localhost:8000`)

### `POST /detect`
Processes an incoming base64 frame through the YOLOv8n ONNX pipeline and Face Occlusion Analyzer.
* **Request Body**:
  ```json
  {
    "image": "data:image/jpeg;base64,...",
    "min_confidence": 0.50
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "detections": [
      {
        "class": "person",
        "confidence": 0.94,
        "bounding_box": { "x": 120, "y": 80, "width": 200, "height": 400 },
        "face_analysis": {
          "face_detected": true,
          "has_mask": false,
          "half_face_visible": false,
          "occlusion_confidence": 0.05
        }
      }
    ],
    "processing_time_ms": 18.2,
    "model": "yolov8n-onnx"
  }
  ```

### `POST /analyze`
Evaluates a detection event against rolling historical baseline distributions.
* **Response (Sufficient Data $\ge$ 100 events / 7 days)**:
  ```json
  {
    "is_unusual": true,
    "anomaly_score": 0.84,
    "status": "analyzed",
    "reason": "Activity at 03:15 is statistically anomalous compared to historical quiet-hour baseline."
  }
  ```
* **Response (Insufficient Data)**:
  ```json
  {
    "is_unusual": false,
    "anomaly_score": 0.0,
    "status": "insufficient_data",
    "reason": "Not enough historical data for reliable anomaly analysis."
  }
  ```

---

## 10. WebSocket Streaming Protocol (`ws://localhost:5000/ws`)

### Client $\to$ Server Messages
* `auth`: Authenticates the socket connection with a device token or JWT.
* `frame`: Transmits a JPEG frame with client timestamp:
  ```json
  {
    "type": "frame",
    "device_id": "phone-01",
    "client_time": 1727710200123,
    "image": "data:image/jpeg;base64,..."
  }
  ```
* `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`: P2P video stream signaling.

### Server $\to$ Client Messages
* `detection_result`: Bounding boxes, latency telemetry, and face occlusion status returned to the phone HUD.
* `live_frame`: Real-time frame broadcast to open dashboard sessions.
* `alert`: Instant notification push for high-severity events.
