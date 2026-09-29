"""
SafeHome AI - Synthetic Data Generator
DEV ONLY: Allowed strictly under tests/ and executed solely via 'npm run seed:synthetic'.
Generates realistic benchmark events for testing anomaly analysis baselines.
"""

import json
import sqlite3
import os
import uuid
from datetime import datetime, timedelta
import random

def generate_synthetic_history(days: int = 14) -> list:
    events = []
    base_time = datetime.utcnow() - timedelta(days=days)
    categories = ["person", "animal", "vehicle", "other"]

    for d in range(days):
        day_date = base_time + timedelta(days=d)
        weekday = day_date.weekday()

        for hour in range(24):
            is_quiet = hour < 7 or hour >= 23
            # Quiet hours: 0-1 events; active hours: 1-5 events
            count = random.randint(0, 1) if is_quiet else random.randint(1, 5)

            for _ in range(count):
                cat = "person" if random.random() < 0.70 else random.choice(categories)
                events.append({
                    "timestamp_utc": (day_date + timedelta(hours=hour, minutes=random.randint(0, 59))).isoformat() + "Z",
                    "hour": hour,
                    "weekday": weekday,
                    "category": cat,
                    "event_count": 1,
                    "user_feedback": None
                })
    return events

def seed_sqlite_database(events: list):
    # Path to backend SQLite database
    db_paths = [
        "../backend/safehome.sqlite",
        "backend/safehome.sqlite"
    ]
    db_path = None
    for p in db_paths:
        if os.path.exists(p):
            db_path = p
            break

    if not db_path:
        print("[Synthetic Generator] No local SQLite database file found to seed directly. JSON sample will be saved.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # Check demo user
        demo_user_id = "00000000-0000-0000-0000-000000000001"
        cur.execute("SELECT id FROM profiles WHERE id = ?", (demo_user_id,))
        demo = cur.fetchone()

        if not demo:
            cur.execute(
                "INSERT INTO profiles (id, email, full_name, role) VALUES (?, ?, ?, ?)",
                (demo_user_id, "demo@safehome.local", "Demo Homeowner", "homeowner")
            )
            cur.execute(
                "INSERT INTO homes (id, user_id, name, timezone) VALUES (?, ?, ?, ?)",
                ("00000000-0000-0000-0000-000000000002", demo_user_id, "Main Home", "UTC")
            )
            cur.execute(
                "INSERT INTO user_settings (user_id) VALUES (?)",
                (demo_user_id,)
            )

        # Clear existing synthetic events for demo user to keep dataset clean
        cur.execute("DELETE FROM events WHERE user_id = ? AND metadata LIKE '%synthetic_generator%'", (demo_user_id,))

        inserted = 0
        for ev in events:
            ev_id = str(uuid.uuid4())
            cat = ev["category"]
            obj_class = "person" if cat == "person" else ("dog" if cat == "animal" else ("car" if cat == "vehicle" else "backpack"))
            conf = round(random.uniform(0.70, 0.98), 2)
            meta = json.dumps({"detected_via": "synthetic_generator", "benchmark_day": ev["weekday"]})

            cur.execute(
                """INSERT INTO events (
                    id, user_id, home_id, device_id, event_type, object_class, category,
                    confidence, started_at, last_seen, frame_count, metadata, is_unusual, anomaly_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0.0)""",
                (
                    ev_id,
                    demo_user_id,
                    "00000000-0000-0000-0000-000000000002",
                    None,
                    f"{obj_class}_detected",
                    obj_class,
                    cat,
                    conf,
                    ev["timestamp_utc"],
                    ev["timestamp_utc"],
                    meta
                )
            )
            inserted += 1

        conn.commit()
        conn.close()
        print(f"[Synthetic Generator] Successfully seeded {inserted} historical benchmark events into {db_path} for demo user.")
    except Exception as e:
        print(f"[Synthetic Generator] Database seed notice: {e}")

if __name__ == "__main__":
    print("Generating synthetic benchmark dataset (14 days)...")
    dataset = generate_synthetic_history(14)
    print(f"Generated {len(dataset)} synthetic baseline event records.")

    out_file = "tests/synthetic_sample.json"
    with open(out_file, "w") as f:
        json.dump(dataset, f, indent=2)
    print(f"Saved to {out_file} for test harness use.")

    seed_sqlite_database(dataset)
