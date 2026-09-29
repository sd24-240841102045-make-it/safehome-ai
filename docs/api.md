# SafeHome AI - API Reference Documentation

All endpoints return standard JSON responses with HTTP status codes and a `success` boolean.

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Creates a homeowner user account, initial home profile, and default security settings.
* **Body:** `{ "email": "...", "password": "...", "full_name": "..." }`
* **Response 201:** `{ "success": true, "user": {...}, "token": "JWT..." }`

### `POST /api/auth/login`
Validates credentials via bcrypt and returns a JWT token.
* **Body:** `{ "email": "...", "password": "..." }`
* **Response 200:** `{ "success": true, "user": {...}, "token": "JWT..." }`

### `GET /api/auth/me`
Fetches authenticated user profile, home settings, and permissions. Requires `Authorization: Bearer <token>`.

---

## 2. Health & Network Diagnostics

### `GET /api/health`
Returns multi-service status check across:
```json
{
  "status": "healthy",
  "backend": "online",
  "database": "online",
  "database_type": "SQLite",
  "ai_service": "online",
  "data_science": "online",
  "timestamp": "2026-09-29T14:00:00.000Z"
}
```

### `GET /api/network-interfaces`
Discovers local IPv4 addresses (Wi-Fi, Ethernet, Hotspot) to generate clickable links and QR codes for the Android phone.

---

## 3. Devices (`/api/devices`)

* `GET /api/devices`: List all registered sensor nodes.
* `POST /api/devices`: Register new device (`phone_camera`, `laptop_webcam`).
* `PATCH /api/devices/:id/status`: Update status (`online`, `streaming`, `offline`).

---

## 4. Events (`/api/events`)

* `GET /api/events`: Query historical detection events with filters:
  * `page` (default: 1), `limit` (default: 15)
  * `object_class` (`person`, `dog`, `cat`, `car`, etc.)
  * `is_unusual` (`true` or `false`)
  * `min_confidence` (`0.70`, `0.85`, etc.)
  * `search` (keyword text search)
* `GET /api/events/:id`: Retrieve single event details, bounding box coordinates, and metadata.
* `POST /api/events`: Persist a new detection event and invoke Data Science anomaly evaluation.

---

## 5. Alerts (`/api/alerts`)

* `GET /api/alerts`: List safety notifications. Filters: `unread_only=true`, `severity=WARNING|INFO|CRITICAL`.
* `PATCH /api/alerts/:id`: Mark alert as read.
* `POST /api/alerts/mark-all-read`: Mark all alerts as read for the user.
* `DELETE /api/alerts/:id`: Delete an alert.

---

## 6. Analytics (`/api/analytics`)

* `GET /api/analytics/dashboard`: Summary cards for Today's Total Events, Person Detections, Other Detections, and Unusual Events.
* `GET /api/analytics`: Aggregated statistical metrics:
  * `events_by_hour`: 24-hour distribution
  * `events_by_type`: Category proportions (Person, Animal, Vehicle, Other)
  * `daily_activity`: 14-day chronological volume
  * `confidence_distribution`: Confidence interval histogram
  * `unusual_percentage`: Anomaly rate

---

## 7. AI Computer Vision Service (`:8000`)

### `GET /health`
Returns detector readiness and supported classes.

### `POST /detect`
* **Body:** `{ "image": "data:image/jpeg;base64,...", "min_confidence": 0.50 }`
* **Response:**
```json
{
  "detections": [
    {
      "class": "person",
      "confidence": 0.92,
      "bounding_box": { "x": 120, "y": 80, "width": 200, "height": 400 }
    }
  ],
  "processing_time_ms": 45,
  "model": "opencv-hog-svm-v1"
}
```

---

## 8. Data Science Anomaly Service (`:8001`)

### `POST /analyze`
* **Body:**
```json
{
  "current_event": { "object_class": "person", "confidence": 0.92, "timestamp": "2026-09-29T02:18:00Z" },
  "historical_events": [...]
}
```
* **Response (Sufficient Data $\ge$ 10 samples):**
```json
{
  "is_unusual": true,
  "anomaly_score": 0.81,
  "status": "analyzed",
  "reason": "Activity at 02:00 is unusual compared with historical quiet-hour baseline."
}
```
* **Response (Limited Data $<$ 10 samples):**
```json
{
  "is_unusual": false,
  "anomaly_score": 0.0,
  "status": "insufficient_data",
  "reason": "Not enough historical data for reliable anomaly analysis."
}
```
