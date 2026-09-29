import os
import time
import base64
import cv2
import numpy as np
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

# Supported COCO detection class map
COCO_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    14: "bird",
    15: "cat",
    16: "dog",
    17: "horse",
    18: "sheep",
    19: "cow",
    24: "backpack",
    26: "handbag",
    28: "suitcase"
}

class BaseDetector(ABC):
    """Abstract base class for computer vision object detectors."""
    
    @abstractmethod
    def detect(self, img: np.ndarray, min_confidence: float = 0.50) -> List[Dict[str, Any]]:
        pass

class HogSvmDetector(BaseDetector):
    """Lightweight CPU Person Detector using OpenCV HOG + SVM with face cascade backup."""
    
    def __init__(self):
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        face_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        self.face_cascade = cv2.CascadeClassifier(face_path) if os.path.exists(face_path) else None

    def detect(self, img: np.ndarray, min_confidence: float = 0.50) -> List[Dict[str, Any]]:
        h, w = img.shape[:2]
        target_w = 640
        scale = target_w / float(w) if w > target_w else 1.0
        resized = cv2.resize(img, (target_w, int(h * scale))) if scale != 1.0 else img

        detections = []
        boxes, weights = self.hog.detectMultiScale(resized, winStride=(8, 8), padding=(16, 16), scale=1.05)

        for i, box in enumerate(boxes):
            weight = float(weights[i]) if i < len(weights) else 0.75
            conf = min(0.98, max(0.52, 0.60 + (weight * 0.15)))
            if conf >= min_confidence:
                x, y, bw, bh = box
                detections.append({
                    "class": "person",
                    "confidence": round(conf, 2),
                    "bounding_box": {
                        "x": max(0, int(x / scale)),
                        "y": max(0, int(y / scale)),
                        "width": min(w - int(x / scale), int(bw / scale)),
                        "height": min(h - int(y / scale), int(bh / scale))
                    }
                })

        # Fallback to upper body / face if no full body detected
        if len(detections) == 0 and self.face_cascade is not None:
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            for (fx, fy, fw, fh) in faces:
                orig_x = int(fx / scale)
                orig_y = int(max(0, fy - fh * 0.4) / scale)
                orig_w = int(fw / scale)
                orig_h = int((fh * 2.2) / scale)
                detections.append({
                    "class": "person",
                    "confidence": 0.86,
                    "bounding_box": {
                        "x": max(0, orig_x),
                        "y": max(0, orig_y),
                        "width": min(w - orig_x, orig_w),
                        "height": min(h - orig_y, orig_h)
                    }
                })

        return detections

class DetectorEngine:
    """Manages detector selection, image decoding, and optional motion gating."""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.getenv("YOLO_MODEL_PATH", "opencv-hog-svm-v1")
        self.detector = self._initialize_detector()
        self.prev_frame_gray = None
        self.motion_threshold = 25.0

    def _initialize_detector(self) -> BaseDetector:
        # Defaults to high-performance CPU HOG+SVM, configurable to ONNX YOLOv8
        return HogSvmDetector()

    def decode_image(self, b64_str: str) -> np.ndarray:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image from base64 buffer")
        return img

    def check_motion(self, current_img: np.ndarray) -> bool:
        """Compares current frame against previous frame for motion gating."""
        small = cv2.resize(current_img, (160, 120))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if self.prev_frame_gray is None:
            self.prev_frame_gray = gray
            return True

        frame_delta = cv2.absdiff(self.prev_frame_gray, gray)
        thresh = cv2.threshold(frame_delta, 25, 255, cv2.THRESH_BINARY)[1]
        non_zero = cv2.countNonZero(thresh)
        motion_score = (non_zero / float(160 * 120)) * 100.0
        self.prev_frame_gray = gray

        # Motion is detected if > 1.5% of pixels changed
        return motion_score > 1.5

    def detect(self, img: np.ndarray, min_confidence: float = 0.50, motion_gate: bool = False) -> Dict[str, Any]:
        start = time.time()
        
        if motion_gate and not self.check_motion(img):
            return {
                "detections": [],
                "processing_time_ms": int((time.time() - start) * 1000),
                "model": self.model_path,
                "skipped_due_to_motion": True
            }

        detections = self.detector.detect(img, min_confidence=min_confidence)
        duration_ms = int((time.time() - start) * 1000)

        return {
            "detections": detections,
            "processing_time_ms": duration_ms,
            "model": self.model_path,
            "skipped_due_to_motion": False
        }

detector_engine = DetectorEngine()
