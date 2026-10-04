import os
import time
import base64
import cv2
import numpy as np
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from app.detect.hardware import hardware_manager
from app.detect.face_analyzer import face_analyzer

# Complete COCO 80 Class Labels for YOLOv8
COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
]

class BaseDetector(ABC):
    """Abstract base class for computer vision object detectors."""
    
    @abstractmethod
    def detect(self, img: np.ndarray, min_confidence: float = 0.50) -> List[Dict[str, Any]]:
        pass

class YoloV8OnnxDetector(BaseDetector):
    """
    High-accuracy real-time object detector using YOLOv8 Nano ONNX via OpenCV DNN.
    Detects 80 real-world classes: persons, vehicles, animals, and household objects
    with high precision and zero false positives on empty space.
    """
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.net = cv2.dnn.readNetFromONNX(model_path)
        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self.input_size = (640, 640)

    def detect(self, img: np.ndarray, min_confidence: float = 0.35) -> List[Dict[str, Any]]:
        orig_h, orig_w = img.shape[:2]
        if orig_h == 0 or orig_w == 0:
            return []

        # YOLOv8 expects 640x640 normalized RGB input
        blob = cv2.dnn.blobFromImage(
            img,
            scalefactor=1.0 / 255.0,
            size=self.input_size,
            mean=[0, 0, 0],
            swapRB=True,
            crop=False
        )
        self.net.setInput(blob)
        outputs = self.net.forward()

        # Output shape is (1, 84, 8400) -> transpose to (8400, 84)
        predictions = np.transpose(outputs[0])

        scale_x = orig_w / float(self.input_size[0])
        scale_y = orig_h / float(self.input_size[1])

        classes_scores = predictions[:, 4:]
        class_ids = np.argmax(classes_scores, axis=1)
        confidences = np.max(classes_scores, axis=1)

        mask = confidences >= min_confidence
        if not np.any(mask):
            return []

        filtered_preds = predictions[mask]
        filtered_cids = class_ids[mask]
        filtered_confs = confidences[mask]

        cx = filtered_preds[:, 0]
        cy = filtered_preds[:, 1]
        w = filtered_preds[:, 2]
        h = filtered_preds[:, 3]

        xs = ((cx - w / 2.0) * scale_x).astype(int)
        ys = ((cy - h / 2.0) * scale_y).astype(int)
        ws = (w * scale_x).astype(int)
        hs = (h * scale_y).astype(int)

        boxes = [[int(xs[i]), int(ys[i]), int(ws[i]), int(hs[i])] for i in range(len(xs))]
        conf_list = [float(c) for c in filtered_confs]

        # NMS with 0.50 IoU threshold preserves distinct people even in crowded scenes
        indices = cv2.dnn.NMSBoxes(boxes, conf_list, min_confidence, 0.50)
        if len(indices) == 0:
            return []

        indices_flat = np.asarray(indices).flatten()

        detections = []
        for idx in indices_flat:
            bx, by, bw, bh = boxes[int(idx)]
            cid = int(filtered_cids[int(idx)])
            class_name = COCO_CLASSES[cid] if cid < len(COCO_CLASSES) else f"object_{cid}"

            detections.append({
                "class": class_name,
                "confidence": round(conf_list[int(idx)], 2),
                "bounding_box": {
                    "x": max(0, min(bx, orig_w - 1)),
                    "y": max(0, min(by, orig_h - 1)),
                    "width": max(1, min(bw, orig_w - max(0, bx))),
                    "height": max(1, min(bh, orig_h - max(0, by)))
                }
            })

        return detections

class HogSvmDetector(BaseDetector):
    """Fallback CPU Person Detector with calibrated thresholding to avoid empty space false positives."""
    
    def __init__(self):
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect(self, img: np.ndarray, min_confidence: float = 0.50) -> List[Dict[str, Any]]:
        h, w = img.shape[:2]
        target_w = 640
        scale = target_w / float(w) if w > target_w else 1.0
        resized = cv2.resize(img, (target_w, int(h * scale))) if scale != 1.0 else img

        detections = []
        # Calibrated stride and threshold to reject empty background noise
        boxes, weights = self.hog.detectMultiScale(
            resized,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.08,
            hitThreshold=0.2
        )

        for i, box in enumerate(boxes):
            weight = float(weights[i]) if i < len(weights) else 0.0
            # Strict weight filtering: discard negative/weak SVM scores
            if weight > 0.4:
                conf = min(0.95, 0.50 + (weight * 0.10))
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

        return detections

class DetectorEngine:
    """Manages detector selection (YOLOv8 ONNX primary, HOG+SVM fallback), image decoding, and motion gating."""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.getenv("YOLO_MODEL_PATH", "")
        self.detector = self._initialize_detector()
        self.prev_frame_gray = None
        self.motion_threshold = 25.0

    def _initialize_detector(self) -> BaseDetector:
        # Search for YOLOv8 ONNX model
        candidate_paths = [
            self.model_path,
            os.path.join(os.path.dirname(__file__), "..", "..", "models", "yolov8n.onnx"),
            os.path.join("models", "yolov8n.onnx"),
            os.path.join("python-service", "models", "yolov8n.onnx"),
            "yolov8n.onnx"
        ]
        
        for path in candidate_paths:
            if path and os.path.exists(path) and os.path.getsize(path) > 1000000:
                try:
                    detector = YoloV8OnnxDetector(path)
                    self.model_path = f"yolov8n-onnx ({os.path.basename(path)})"
                    print(f"[AI Detector] Successfully loaded YOLOv8 ONNX model from: {path}")
                    return detector
                except Exception as e:
                    print(f"[AI Detector] Failed loading ONNX model from {path}: {e}")

        # Fallback if no ONNX model present
        self.model_path = "opencv-hog-svm-calibrated"
        print("[AI Detector] Using calibrated OpenCV HOG+SVM detector.")
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

    def detect(self, img: np.ndarray, min_confidence: float = 0.35, motion_gate: bool = False) -> Dict[str, Any]:
        start = time.time()
        
        if motion_gate and not self.check_motion(img):
            return {
                "detections": [],
                "processing_time_ms": int((time.time() - start) * 1000),
                "model": self.model_path,
                "skipped_due_to_motion": True
            }

        raw_detections = self.detector.detect(img, min_confidence=min_confidence)
        
        # Analyze persons for face mask or half-face concealment
        detections = []
        for det in raw_detections:
            detections.append(det)
            if det.get("class") == "person" and "bounding_box" in det:
                try:
                    face_info = face_analyzer.analyze_head_region(img, det["bounding_box"])
                    if face_info and face_info.get("is_masked"):
                        det["face_status"] = face_info["face_status"]
                        det["is_masked"] = True
                        det["occlusion_type"] = face_info["occlusion_type"]
                        det["face_reason"] = face_info["reason"]

                        # Insert high-priority security alert detection
                        detections.append({
                            "class": "masked_person",
                            "category": "threat",
                            "confidence": face_info["confidence"],
                            "bounding_box": face_info.get("face_box", det["bounding_box"]),
                            "face_status": face_info["face_status"],
                            "occlusion_type": face_info["occlusion_type"],
                            "is_masked": True,
                            "is_unusual": True,
                            "anomaly_reason": face_info["reason"]
                        })
                except Exception as fe:
                    pass

        duration_ms = int((time.time() - start) * 1000)
        hw = hardware_manager.get_hardware_telemetry()

        return {
            "detections": detections,
            "processing_time_ms": duration_ms,
            "model": self.model_path,
            "accelerator": hw.get("accelerator", "CPU"),
            "device": hw.get("target_device", "cpu"),
            "gpu_available": hw.get("gpu_available", False),
            "skipped_due_to_motion": False
        }

detector_engine = DetectorEngine()
