import time
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from app.detect.detector import detector_engine
from app.analyze.analyzer import analyzer

app = FastAPI(
    title="SafeHome AI - Unified Vision & Data Science Service",
    description="Unified microservice exposing OpenCV/YOLO object detection and statistical anomaly analysis.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    return {
        "status": "online",
        "service": "SafeHome AI Unified Python Engine",
        "modules": {
            "detect": "online",
            "model": detector_engine.model_path,
            "analyze": "online"
        },
        "timestamp": time.time()
    }

@app.post("/detect")
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

@app.post("/analyze")
def analyze_anomaly(payload: AnalyzePayload):
    try:
        res = analyzer.analyze(payload.model_dump())
        return res
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
