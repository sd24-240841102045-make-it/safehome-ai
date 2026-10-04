import os
import time
from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from app.detect.detector import detector_engine
from app.analyze.analyzer import analyzer
from app.detect.hardware import hardware_manager

AI_SERVICE_SECRET = os.getenv("AI_SERVICE_SECRET", "safehome_super_internal_ai_secret_key_2026")

app = FastAPI(
    title="SafeHome AI - Unified Vision & Data Science Service",
    description="Unified microservice exposing OpenCV/YOLO object detection, hardware GPU acceleration, and statistical anomaly analysis.",
    version="2.1.0"
)

# Restrict CORS to internal backend / localhost callers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

def verify_internal_secret(x_internal_secret: Optional[str] = Header(None)):
    """Verifies that requests originate strictly from the authorized backend service."""
    if not x_internal_secret or x_internal_secret != AI_SERVICE_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal service authorization secret."
        )
    return True

class DetectPayload(BaseModel):
    image: str = Field(..., description="Base64 encoded JPEG or PNG image")
    min_confidence: Optional[float] = 0.50
    motion_gate: Optional[bool] = False

class AnalyzePayload(BaseModel):
    home_id: Optional[str] = None
    timezone: Optional[str] = "UTC"
    time_windows: List[Dict[str, Any]] = Field(default_factory=list)
    current_window: Dict[str, Any]

@app.get("/health")
def health_check():
    hw = hardware_manager.get_hardware_telemetry()
    return {
        "status": "online",
        "service": "SafeHome AI Unified Python Engine",
        "modules": {
            "detect": "online",
            "model": detector_engine.model_path,
            "analyze": "online"
        },
        "hardware": {
            "accelerator": hw.get("accelerator"),
            "gpu_available": hw.get("gpu_available"),
            "device": hw.get("device_name"),
            "target_device": hw.get("target_device")
        },
        "timestamp": time.time()
    }

@app.get("/hardware", dependencies=[Depends(verify_internal_secret)])
def get_hardware():
    """Returns GPU metrics, VRAM usage, temperature, and active compute device."""
    return {
        "success": True,
        "hardware": hardware_manager.get_hardware_telemetry()
    }

@app.post("/detect", dependencies=[Depends(verify_internal_secret)])
def detect_objects(payload: DetectPayload):
    try:
        img = detector_engine.decode_image(payload.image)
        res = detector_engine.detect(
            img,
            min_confidence=payload.min_confidence or 0.50,
            motion_gate=payload.motion_gate or False
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Inference error: {str(e)}")

@app.post("/analyze", dependencies=[Depends(verify_internal_secret)])
def analyze_anomaly(payload: AnalyzePayload):
    try:
        res = analyzer.analyze(payload.model_dump())
        return res
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
