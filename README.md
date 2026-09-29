# SafeHome AI — Architecture & Implementation

SafeHome AI is a locally runnable full-stack home-safety and surveillance application.
An Android smartphone acts as a mobile sensing and camera node, and a Windows laptop acts as the local edge hub hosting the web app, backend, AI computer vision, and statistical anomaly analysis.

---

## 0. Confirmed Environment

| Property | Value |
|---|---|
| **OS** | Windows 11 (NT 10.0.26200.0) |
| **Node.js** | v24.11.0 |
| **Python** | 3.11.9 (in local `.venv`) |
| **Laptop GPU** | NVIDIA GeForce RTX 3050 Laptop GPU (CPU default inference for broad compatibility) |
| **Android Chrome** | Standard Modern Chrome (v115 &ndash; v124) |
| **Database & Auth** | Supabase Postgres + Supabase Auth (`public.profiles` linked to `auth.users(id)`) |

---

## 1. Fixed Architecture Decisions

1. **Frontend:** React 19 + Vite + **TypeScript**, React Router, Tailwind CSS, Recharts. All API requests use **relative URLs** (`/api` and `/ws`) routed through Vite's built-in development proxy.
2. **Backend:** Node.js + Express (**TypeScript**), REST + WebSocket server (`ws`), validated with **Zod** schemas, and centralized error logging to `logs/error.log`.
3. **Python Service:** **ONE** unified FastAPI microservice hosting:
   * `/detect`: OpenCV + YOLOv8n object detection (CPU by default, configurable model path).
   * `/analyze`: Pandas, NumPy, and Scikit-learn statistical anomaly analyzer.
   * `/health`: Module readiness checks.
4. **Database & Auth:** Supabase Postgres with Supabase Auth. Uses `profiles` table referencing `auth.users(id)`. No custom users table or manual password storage.
5. **Streaming:** JPEG frames over WebSocket (`/ws` / WSS). Documented upgrade path to WebRTC in `docs/architecture.md`.
6. **Dashboard Updates:** WebSocket push from backend to dashboard with polling fallback.
7. **Shared Contract:** OpenAPI 3.0 specification in `docs/openapi.yaml` and shared Zod schemas in `shared/schemas.ts`.
8. **Root Concurrently Script:** `npm run dev` in the repository root launches Backend, Frontend, and Python service simultaneously.

---

## 2. Licensing Disclosure: YOLOv8 & Permissive Alternatives

* **Ultralytics YOLOv8 License:** The official `ultralytics` package is distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. Commercial or closed-source deployments requiring non-copyleft terms must acquire an enterprise commercial license from Ultralytics.
* **Permissive Open-Source Alternatives:**
  * **OpenCV MobileNet-SSD / YOLO-ONNX**: Permissively licensed under **Apache 2.0**.
  * **OpenCV Built-in HOG+SVM Person Detector**: Permissively licensed under **Apache 2.0 / BSD 3-Clause**.
  * SafeHome AI's modular `DetectorEngine` allows swapping between these backends via the `YOLO_MODEL_PATH` environment variable.

---

## 3. Directory Layout

```text
safehome-ai/
├── package.json              # Monorepo root scripts (concurrently dev, test, setup)
├── .env.example              # Environment variables template
├── .gitignore
├── README.md
├── docs/
│   ├── openapi.yaml          # OpenAPI 3.0 specification
│   ├── architecture.md       # Architecture & WebRTC upgrade path
│   └── alerts.md             # Alert definitions & cooldown rules
├── database/
│   ├── schema.sql            # Supabase Postgres schema with profiles & RLS
│   └── seed.sql
├── shared/
│   └── schemas.ts            # Shared Zod schemas & category maps
├── backend/                  # TypeScript Express Gateway
│   ├── src/
│   │   ├── config.ts         # Zod validated env config
│   │   ├── server.ts         # Express + WebSocket bootstrap
│   │   ├── routes/health.ts  # Multi-service health check
│   │   ├── services/db.ts    # Database abstraction
│   │   ├── services/logger.ts# Error file logging
│   │   └── middleware/error.ts
│   ├── tsconfig.json
│   └── package.json
├── frontend/                 # TypeScript React Vite Dashboard
│   ├── src/
│   ├── tsconfig.json
│   ├── vite.config.ts        # Vite proxy for relative /api and /ws
│   └── package.json
└── python-service/           # ONE Unified FastAPI Service
    ├── app/
    │   ├── detect/           # Vision detection engine
    │   ├── analyze/          # Statistical anomaly analyzer
    │   └── main.py           # Unified FastAPI /detect & /analyze
    ├── tests/
    │   ├── synthetic_generator.py # Synthetic dataset generator (npm run seed:synthetic)
    │   └── test_api.py       # Pytest unit tests
    ├── pytest.ini
    └── requirements.txt
```

---

## 4. Commands

```powershell
# 1. Start all services concurrently (Root command)
npm run dev

# 2. Run test suites
npm run test

# 3. Generate synthetic data for anomaly baseline testing (DEV ONLY)
npm run seed:synthetic
```

---

## 5. Phase 1 Verification Status

* **Monorepo setup**: Configured with root `package.json` and `concurrently`.
* **TypeScript compilation**: Backend (`npx tsc --noEmit`) and Frontend build compile cleanly.
* **Database schema**: `database/schema.sql` written for Supabase Postgres with `profiles` referencing `auth.users(id)`.
* **Unified Python Service**: Tests pass with pytest (`4 passed in 2.07s`).
* **Health endpoint**: `GET /api/health` reports true state of backend, database, and unified Python AI service.
