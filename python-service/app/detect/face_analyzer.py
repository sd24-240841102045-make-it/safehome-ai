import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

class FaceOcclusionAnalyzer:
    """
    Real-time face mask and partial/half face occlusion analyzer.
    Detects:
    1. Masked faces (surgical mask, cloth, bandana, balaclava covering mouth/nose while eyes/forehead exposed).
    2. Half-face visibility (profile view, half of face covered by hand/cloth/scarf, or side-angle occlusion).
    """

    def __init__(self):
        # Load OpenCV built-in Haar cascades
        cascade_dir = cv2.data.haarcascades
        self.frontal_face = cv2.CascadeClassifier(os.path.join(cascade_dir, 'haarcascade_frontalface_default.xml'))
        self.profile_face = cv2.CascadeClassifier(os.path.join(cascade_dir, 'haarcascade_profileface.xml'))
        self.eye_cascade = cv2.CascadeClassifier(os.path.join(cascade_dir, 'haarcascade_eye.xml'))

    def _compute_skin_mask(self, bgr_img: np.ndarray) -> np.ndarray:
        """Computes a robust skin color mask using combined HSV and YCrCb color spaces."""
        if bgr_img.size == 0:
            return np.zeros((0, 0), dtype=np.uint8)

        # HSV Skin Thresholds
        hsv = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2HSV)
        lower_hsv = np.array([0, 25, 40], dtype=np.uint8)
        upper_hsv = np.array([25, 255, 255], dtype=np.uint8)
        mask_hsv1 = cv2.inRange(hsv, lower_hsv, upper_hsv)

        lower_hsv2 = np.array([165, 25, 40], dtype=np.uint8)
        upper_hsv2 = np.array([180, 255, 255], dtype=np.uint8)
        mask_hsv2 = cv2.inRange(hsv, lower_hsv2, upper_hsv2)
        mask_hsv = cv2.bitwise_or(mask_hsv1, mask_hsv2)

        # YCrCb Skin Thresholds
        ycrcb = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2YCrCb)
        lower_ycrcb = np.array([0, 133, 77], dtype=np.uint8)
        upper_ycrcb = np.array([255, 173, 127], dtype=np.uint8)
        mask_ycrcb = cv2.inRange(ycrcb, lower_ycrcb, upper_ycrcb)

        combined = cv2.bitwise_and(mask_hsv, mask_ycrcb)
        return combined

    def analyze_head_region(self, frame_bgr: np.ndarray, person_box: Dict[str, int]) -> Optional[Dict[str, Any]]:
        """
        Analyzes the head/face region of a detected person for mask coverage or half-face visibility.
        """
        fh, fw = frame_bgr.shape[:2]
        px = max(0, min(person_box['x'], fw - 1))
        py = max(0, min(person_box['y'], fh - 1))
        pw = max(1, min(person_box['width'], fw - px))
        ph = max(1, min(person_box['height'], fh - py))

        # Upper ~45% of person bounding box corresponds to the head and upper chest
        head_h = max(20, int(ph * 0.45))
        head_bgr = frame_bgr[py:py + head_h, px:px + pw]
        if head_bgr.shape[0] < 20 or head_bgr.shape[1] < 20:
            return None

        head_gray = cv2.cvtColor(head_bgr, cv2.COLOR_BGR2GRAY)
        head_gray = cv2.equalizeHist(head_gray)

        # 1. Detect frontal faces
        frontal_faces = self.frontal_face.detectMultiScale(
            head_gray, scaleFactor=1.1, minNeighbors=3, minSize=(24, 24)
        )

        # 2. Detect profile / half faces
        profile_faces = self.profile_face.detectMultiScale(
            head_gray, scaleFactor=1.1, minNeighbors=3, minSize=(24, 24)
        )

        # 3. Detect eyes
        eyes = self.eye_cascade.detectMultiScale(
            head_gray, scaleFactor=1.1, minNeighbors=3, minSize=(12, 12)
        )

        # --- CASE 1: Frontal face detected -> Check lower-half mask occlusion ---
        if len(frontal_faces) > 0:
            fx, fy, fw_box, fh_box = frontal_faces[0]
            face_roi_bgr = head_bgr[fy:fy + fh_box, fx:fx + fw_box]
            if face_roi_bgr.shape[0] > 15 and face_roi_bgr.shape[1] > 15:
                # Divide face into upper (eyes/forehead) and lower (nose/mouth/chin)
                mid_y = int(fh_box * 0.50)
                upper_face = face_roi_bgr[:mid_y, :]
                lower_face = face_roi_bgr[mid_y:, :]

                upper_skin = self._compute_skin_mask(upper_face)
                lower_skin = self._compute_skin_mask(lower_face)

                upper_skin_ratio = cv2.countNonZero(upper_skin) / float(upper_skin.size + 1e-5)
                lower_skin_ratio = cv2.countNonZero(lower_skin) / float(lower_skin.size + 1e-5)

                # Check left vs right asymmetry for half-face covering
                mid_x = int(fw_box * 0.50)
                left_face = face_roi_bgr[:, :mid_x]
                right_face = face_roi_bgr[:, mid_x:]
                left_skin = self._compute_skin_mask(left_face)
                right_skin = self._compute_skin_mask(right_face)
                left_ratio = cv2.countNonZero(left_skin) / float(left_skin.size + 1e-5)
                right_ratio = cv2.countNonZero(right_skin) / float(right_skin.size + 1e-5)

                # Mask Detection: Upper face has skin, but lower face skin is blocked (<25% or <40% of upper)
                if upper_skin_ratio > 0.20 and (lower_skin_ratio < 0.15 or lower_skin_ratio < 0.40 * upper_skin_ratio):
                    return {
                        "is_masked": True,
                        "face_status": "masked",
                        "occlusion_type": "mask",
                        "confidence": 0.88,
                        "reason": "Face mask covering mouth and nose detected",
                        "face_box": {
                            "x": px + int(fx),
                            "y": py + int(fy),
                            "width": int(fw_box),
                            "height": int(fh_box)
                        }
                    }

                # Half-face covering (one half of the face occluded by hand/fabric/scarf)
                if max(left_ratio, right_ratio) > 0.25 and min(left_ratio, right_ratio) < 0.08:
                    return {
                        "is_masked": True,
                        "face_status": "half_face",
                        "occlusion_type": "half_face",
                        "confidence": 0.84,
                        "reason": "Only half face visible (partial face occlusion)",
                        "face_box": {
                            "x": px + int(fx),
                            "y": py + int(fy),
                            "width": int(fw_box),
                            "height": int(fh_box)
                        }
                    }

        # --- CASE 2: Eyes visible in upper head, but no full frontal face -> Mask or Obscured ---
        if len(eyes) >= 1 and len(frontal_faces) == 0:
            # When eyes are visible but full frontal face fails to detect, it indicates the lower face is hidden/masked
            eye_y_min = min(e[1] for e in eyes)
            eye_y_max = max(e[1] + e[3] for e in eyes)
            # Check lower head region below eyes
            lower_head_bgr = head_bgr[eye_y_max:, :]
            if lower_head_bgr.shape[0] > 10:
                lower_head_skin = self._compute_skin_mask(lower_head_bgr)
                lower_head_ratio = cv2.countNonZero(lower_head_skin) / float(lower_head_skin.size + 1e-5)
                if lower_head_ratio < 0.22:
                    return {
                        "is_masked": True,
                        "face_status": "masked",
                        "occlusion_type": "mask",
                        "confidence": 0.85,
                        "reason": "Eyes visible with concealed lower face / mask",
                        "face_box": {
                            "x": px,
                            "y": py,
                            "width": pw,
                            "height": head_h
                        }
                    }

        # --- CASE 3: Only profile face detected (Half Face Visibility) ---
        if len(profile_faces) > 0 and len(frontal_faces) == 0:
            pfx, pfy, pfw, pfh = profile_faces[0]
            return {
                "is_masked": True,
                "face_status": "half_face",
                "occlusion_type": "half_face",
                "confidence": 0.82,
                "reason": "Profile view: Only half face visible to camera",
                "face_box": {
                    "x": px + int(pfx),
                    "y": py + int(pfy),
                    "width": int(pfw),
                    "height": int(pfh)
                }
            }

        return None

face_analyzer = FaceOcclusionAnalyzer()
