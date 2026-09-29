"""
SafeHome AI - Synthetic Data Generator
DEV ONLY: Allowed strictly under tests/ and executed solely via 'npm run seed:synthetic'.
Generates realistic benchmark events for testing anomaly analysis baselines.
"""

import json
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
            # Normal distribution: quiet hours have ~0-1 events, active hours have 1-5 events
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

if __name__ == "__main__":
    print(f"Generating synthetic benchmark dataset (14 days)...")
    dataset = generate_synthetic_history(14)
    print(f"Generated {len(dataset)} synthetic baseline event records.")
    with open("tests/synthetic_sample.json", "w") as f:
        json.dump(dataset, f, indent=2)
    print("Saved to tests/synthetic_sample.json for test harness use.")
