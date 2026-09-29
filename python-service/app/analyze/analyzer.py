import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional

MIN_SAMPLE_EVENTS = 100
MIN_DAYS_SPANNED = 7
Z_SCORE_THRESHOLD = 3.0
MIN_ABSOLUTE_EVENT_COUNT = 3

class AnomalyAnalyzer:
    """
    Statistical Anomaly Analyzer evaluating aggregated time windows against
    historical baselines with timezone awareness and human feedback exclusion.
    """

    def analyze(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        time_windows = payload.get("time_windows", [])
        current_window = payload.get("current_window", {})
        
        # Calculate total events and days spanned across historical windows
        total_events = sum(w.get("event_count", 0) for w in time_windows)
        
        unique_dates = set()
        for w in time_windows:
            ts = w.get("timestamp_utc")
            if ts:
                unique_dates.add(ts[:10])
        days_spanned = len(unique_dates)

        # 1. Check for sufficient historical baseline data
        if total_events < MIN_SAMPLE_EVENTS or days_spanned < MIN_DAYS_SPANNED:
            return {
                "status": "insufficient_data",
                "is_unusual": False,
                "anomaly_score": 0.0,
                "z_score": None,
                "baseline": {
                    "mean": 0.0,
                    "std": 0.0,
                    "sample_count": total_events,
                    "days_spanned": days_spanned
                },
                "reason": "Not enough historical data for reliable anomaly analysis."
            }

        # 2. Build baseline dataset filtering out user marked 'unexpected' windows
        records = []
        for w in time_windows:
            # Exclude flagged unexpected events from polluting normal baseline
            if w.get("user_feedback") == "unexpected":
                continue
            records.append({
                "weekday": w.get("weekday", 0),
                "hour": w.get("hour", 0),
                "category": w.get("category", "person"),
                "event_count": w.get("event_count", 0)
            })

        df = pd.DataFrame(records)
        curr_hour = current_window.get("hour", 0)
        curr_weekday = current_window.get("weekday", 0)
        curr_category = current_window.get("category", "person")
        curr_count = current_window.get("event_count", 0)
        curr_quiet = current_window.get("is_quiet_hours", False)

        # Filter baseline for identical weekday, hour, and category
        match_df = df[(df["weekday"] == curr_weekday) & (df["hour"] == curr_hour) & (df["category"] == curr_category)]
        
        if len(match_df) >= 3:
            counts = match_df["event_count"].values
            mean_val = float(np.mean(counts))
            std_val = float(np.std(counts))
        else:
            # Fallback to general hourly baseline across all days for this category
            hourly_df = df[(df["hour"] == curr_hour) & (df["category"] == curr_category)]
            counts = hourly_df["event_count"].values if len(hourly_df) > 0 else np.array([1])
            mean_val = float(np.mean(counts))
            std_val = float(np.std(counts))

        std_val = max(1.0, std_val) # Prevent division by zero
        z_score = round(float((curr_count - mean_val) / std_val), 2)

        # 3. Anomaly Evaluation
        # Flag if z-score > 3.0 AND absolute event count meets minimum threshold
        is_unusual = False
        reasons = []

        if z_score > Z_SCORE_THRESHOLD and curr_count >= MIN_ABSOLUTE_EVENT_COUNT:
            is_unusual = True
            reasons.append("Unusual activity detected based on historical activity patterns.")

        if curr_quiet and curr_count >= MIN_ABSOLUTE_EVENT_COUNT and mean_val < 0.5:
            is_unusual = True
            reasons.append("Activity exceeds historical quiet-hour baseline.")

        # Map z-score to normalized anomaly score [0.0 - 1.0]
        anomaly_score = min(1.0, max(0.0, z_score / 5.0)) if z_score > 0 else 0.0

        final_reason = " ".join(reasons) if is_unusual else "Activity is consistent with established historical baselines for this time period."

        return {
            "status": "analyzed",
            "is_unusual": is_unusual,
            "anomaly_score": round(anomaly_score, 2),
            "z_score": z_score,
            "baseline": {
                "mean": round(mean_val, 2),
                "std": round(std_val, 2),
                "sample_count": total_events,
                "days_spanned": days_spanned
            },
            "reason": final_reason
        }

analyzer = AnomalyAnalyzer()
