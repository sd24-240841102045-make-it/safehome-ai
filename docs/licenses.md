# SafeHome AI — Model & Dependency License Registry

> **Scope**: Audit of all machine learning models, computer vision algorithms, and backend/frontend libraries used or planned for SafeHome AI.
> **Last Updated**: 2026-09-30 (Phase 0 Audit)

---

## 1. Machine Learning Models & Computer Vision Algorithms

| Component / Library | Version / Source | License | Commercial Use Permitted? | AGPL / Copyleft Flag | Notes & Compliance Requirements |
|---|---|---|---|---|---|
| **YOLOv8 Nano (ONNX)** | `yolov8n.onnx` (Ultralytics) | **AGPL-3.0** | Conditional (Requires Open Source / Commercial License) | ⚠️ **AGPL-3.0 FLAGGED** | Ultralytics models under AGPL-3.0 require any software providing network service using the model to make complete source available under AGPL-3.0, or acquire an enterprise license. Suitable for open-source / personal use. |
| **ByteTrack** | Standalone algorithm / `norfair` / custom tracker | **MIT** / **BSD-3-Clause** | Yes | None | ByteTrack association algorithm (Kalman filter + Hungarian matching on high/low confidence boxes) is MIT licensed. Standalone Python/TypeScript implementation without GPL dependencies. |
| **BoT-SORT** (Alternative Tracker) | NirAharon/BoT-SORT | **GPL-3.0** (Official) | Conditional (Copyleft) | ⚠️ **GPL-3.0 FLAGGED** | Official BoT-SORT repo is GPL-3.0. **Recommendation:** Use **ByteTrack** (MIT) to prevent viral GPL constraints on the pipeline. |
| **OpenCV** (`opencv-python-headless`) | 4.10.x | **Apache 2.0** | Yes | None | Standard computer vision library used for Laplacian blur detection, color thresholding, masking, and DNN ONNX execution. |
| **Haar Cascades / OpenCV Face Detector** | OpenCV repository | **Apache 2.0** | Yes | None | Used for lightweight face occlusion / mask verification. |

---

## 2. Python AI Service Dependencies

| Library | Version | License | Copyleft Terms |
|---|---|---|---|
| **FastAPI** | 0.115+ | **MIT** | Permissive, no copyleft |
| **Uvicorn** | 0.30+ | **BSD-3-Clause** | Permissive, no copyleft |
| **Pydantic** | 2.9+ | **MIT** | Permissive, no copyleft |
| **NumPy** | 1.26+ / 2.x | **BSD-3-Clause** | Permissive, no copyleft |
| **Requests / httpx** | latest | **Apache 2.0** | Permissive, no copyleft |
| **PyYAML** | 6.0+ | **MIT** | Permissive, no copyleft |

---

## 3. Node.js Backend Dependencies

| Library | Purpose | License | Copyleft Terms |
|---|---|---|---|
| **express** | HTTP REST & API Gateway | **MIT** | Permissive |
| **ws** | WebSocket server & streaming | **MIT** | Permissive |
| **web-push** (Planned for Phase 4) | VAPID Web Push protocol | **MIT** | Permissive |
| **better-sqlite3** | Local zero-config SQLite driver | **MIT** | Permissive |
| **pg** / `@supabase/supabase-js` | PostgreSQL & Supabase client | **MIT** | Permissive |
| **zod** | Runtime schema validation | **MIT** | Permissive |
| **dotenv** | Environment variable loading | **BSD-2-Clause** | Permissive |
| **cors** | Cross-Origin middleware | **MIT** | Permissive |

---

## 4. Frontend Dependencies

| Library | Purpose | License | Copyleft Terms |
|---|---|---|---|
| **react** / **react-dom** | UI Framework | **MIT** | Permissive |
| **vite** | Build tool and dev server | **MIT** | Permissive |
| **lucide-react** | UI iconography | **ISC** | Permissive |
| **tailwindcss** | Utility styling | **MIT** | Permissive |
| **workbox** (Planned for Phase 4) | Service Worker & PWA caching | **MIT** | Permissive |

---

## 5. Summary & Governance Decision

1. **YOLOv8 (AGPL-3.0)**:
   * Permitted for **personal use, academic projects, and open-source applications**.
   * If commercialized as a closed-source SaaS/product, either an Ultralytics Commercial License must be obtained or the detection model can be swapped for **YOLOv5/v6 (commercial friendly) / MobileNet-SSD (Apache 2.0) / RT-DETR (Apache 2.0)**.
2. **Tracker Choice**:
   * **ByteTrack** is selected for Phase 2 due to its **MIT License** and superior lightweight CPU/GPU execution profile, avoiding BoT-SORT's GPL-3.0 copyleft terms.
3. **No Non-Commercial Only (NC) Restrictions**:
   * No CC-BY-NC or non-commercial research-only models/libraries are used in the codebase.
