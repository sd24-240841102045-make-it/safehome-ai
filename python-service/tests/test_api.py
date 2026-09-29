import pytest
import io
import base64
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def create_test_jpeg_base64():
    img = Image.new("RGB", (320, 240), color=(73, 109, 137))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["modules"]["detect"] == "online"
    assert data["modules"]["analyze"] == "online"

def test_detect_valid_image():
    b64 = create_test_jpeg_base64()
    res = client.post("/detect", json={"image": b64, "min_confidence": 0.50})
    assert res.status_code == 200
    data = res.json()
    assert "detections" in data
    assert isinstance(data["detections"], list)
    assert "processing_time_ms" in data

def test_detect_invalid_image():
    res = client.post("/detect", json={"image": "invalid_base64_string!!!"})
    assert res.status_code == 400

def test_analyze_insufficient_data():
    res = client.post("/analyze", json={
        "time_windows": [],
        "current_window": {
            "timestamp_utc": "2026-09-29T14:00:00Z",
            "hour": 14,
            "weekday": 1,
            "category": "person",
            "event_count": 2
        }
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "insufficient_data"
    assert data["is_unusual"] is False
    assert "Not enough historical data for reliable anomaly analysis." in data["reason"]
