# SafeHome AI - Alert Definitions & Rules (Specification 8)

SafeHome AI operates an evidence-based, camera-only alert categorization framework. It does **not** make biased assumptions or contact emergency authorities automatically.

---

## 1. Severity Levels

| Severity | Color | Trigger Criteria | De-duplication Rule |
|---|---|---|---|
| **INFO** | Cyan (`#38bdf8`) | A verified detection of a `person` (or pet/vehicle) with confidence $\ge 0.50$. | At most one alert per `(device_id, category)` per 30 seconds. Continuous presence updates `last_seen`. |
| **WARNING** | Amber (`#f59e0b`) | Statistical anomaly flagged by the Data Science engine ($z > 3.0$ against the home's baseline window). | At most one alert per category per 15-minute evaluation window. |
| **CRITICAL** | Red (`#ef4444`) | An unusual person detection occurring during the configured quiet hours (e.g. 23:00 - 07:00) combined with a burst $> 3\times$ above the historical baseline. | At most one critical alert per 30 minutes per home to avoid alarm fatigue. |

---

## 2. De-duplication & Cooldown Logic

1. When a camera node observes continuous presence, it does **not** flood the database or user alerts.
2. The initial frame generates an `event` record with `started_at = NOW()`, `last_seen = NOW()`, and `frame_count = 1`.
3. Subsequent frames within the configured cooldown window (default: 30 seconds) update `last_seen = NOW()` and increment `frame_count`.
4. Only when activity ceases for more than the cooldown interval does a new event record begin.

---

## 3. Human Feedback Loop

Homeowners can provide structured feedback on any flagged event:
* **"Expected"**: The activity was normal (e.g. resident arriving home). Excluded from future anomaly flags.
* **"Unexpected"**: The activity was uncharacteristic. Excluded from baseline training so it does not contaminate the normal profile.
