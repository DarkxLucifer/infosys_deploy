# InfraScan: Comprehensive Gap Analysis (Master Spec & 22 PDF Modules)

Last Updated: 2026-10-21T20:34:00+05:30
Status Categories:
- **Exists and works**: Fully implemented in backend, database, and UI; verified operational with real live data.
- **Partial**: Partially built (e.g. backend exists with limited UI or vice versa).
- **Missing**: Not yet implemented.

---

## 1. Module-by-Module Gap Analysis Matrix

| Module ID & Name | Scope / Roles | Status | Implementing Files / Routes | Gap / What is Needed |
|---|---|---|---|---|
| **Module 1: User Authentication & Role-Based Access** | All 5 Roles | **Exists and works** | `apps/api/app/routers/auth.py`, `app/security/jwt.py`, `frontend/src/context/auth-context.tsx`, `frontend/src/pages/login.tsx` | Cookie auth with HttpOnly cookies + CSRF tokens (§2), idle timeout 30m / 12h absolute cap verification. |
| **Module 2: Asset & Inspection Management** | Inspector, Manager, Engineer | **Exists and works** | `apps/api/app/routers/assets.py`, `inspections.py`, `frontend/src/components/dashboard/assets.tsx` | Full asset schema fields (construction year, dept, inspection frequency, GPS, PostGIS coords). Collision-safe ID generator (`BR-001`, `TU-002`). |
| **Module 3: Image Capture & Upload** | Inspector, Engineer | **Exists and works** | `apps/api/app/routers/upload.py`, `app/services/image_validation.py`, `frontend/src/components/dashboard/inspection-detail.tsx` | Live camera capture via `getUserMedia` (rear facing camera preference + fake device fallback). Validation: blur, luminance, resolution, SHA-256 + pHash duplicate check. |
| **Module 4: Image Preprocessing Engine** | Automated Pipeline | **Exists and works** | `apps/api/app/services/preprocessing.py`, `apps/api/app/routers/upload.py` | Before/after slider (Original ↔ Preprocessed), filter steps (denoise, CLAHE, sharpening), tile grid overlay. |
| **Module 5: Crack Detection Engine** | Engineer, Automated | **Partial** | `apps/api/app/routers/detections.py`, `frontend/src/pages/review-queue.tsx` | YOLOv8 concrete defect model / crack bbox candidates pipeline integration. Currently rule-based & engineer geometry annotation active. |
| **Module 6: Crack Segmentation Engine** | Engineer, Automated | **Partial** | `apps/api/app/routers/detections.py`, `frontend/src/components/dashboard/analysis-detail.tsx` | UNet pixel segmentation mask generation. Interactive polygon/polyline editor active. |
| **Module 7: Crack Type Classification** | Engineer | **Exists and works** | `apps/api/app/services/geometry.py`, `apps/api/app/routers/detections.py` | 8 crack types (longitudinal, transverse, alligator, etc.). Orientation + branching rule-based suggestion. |
| **Module 8: Surface Damage Detection** | Engineer | **Exists and works** | `apps/api/app/services/geometry.py`, `apps/api/app/routers/detections.py` | 8 surface damage types (spalling, corrosion, efflorescence, etc.). Shoelace area calculation. |
| **Module 9: Crack Geometry & Measurement** | Engineer | **Exists and works** | `apps/api/app/services/geometry.py`, `apps/api/app/routers/upload.py` | Polyline length, cross-section width (avg/max), Shoelace area, density (crack area / ROI area * 100). Physical scale calibration (mm/px) + uncertainty flag. |
| **Module 10: Damage Severity Assessment** | Engineer | **Exists and works** | `apps/api/app/services/severity_engine.py`, `apps/api/app/models/all_models.py` | Configurable severity rule engine based on width, length, density, damage type. Factor-by-factor breakdown table. Override requires mandatory reason. |
| **Module 11: Advanced Deep Learning Suite** | Admin | **Partial** | `apps/api/app/routers/dashboards.py`, `frontend/src/components/dashboard/role-dashboards/admin-dashboard.tsx` | Model registry UI & metadata tracking. |
| **Module 12: Explainable AI (XAI)** | Engineer | **Partial** | `apps/api/app/services/geometry.py`, `frontend/src/components/dashboard/analysis-detail.tsx` | Overlay of candidate regions and rule explanations. Grad-CAM heatmap generation hook. |
| **Module 13: AI Model Training & Evaluation** | Admin | **Partial** | `apps/api/app/cli.py`, `apps/api/app/routers/datasets.py` | Dataset metrics import (SDNET2018 benchmark statistics). |
| **Module 14: Infrastructure Damage Mapping** | Manager, Engineer | **Exists and works** | `apps/api/app/routers/assets.py`, `frontend/src/pages/damage-map.tsx` | Leaflet OSM map with asset/damage markers, severity coloring, heatmap toggle, cluster table. |
| **Module 15: Damage Progression & Historical Analysis** | Engineer | **Exists and works** | `apps/api/app/services/registration.py`, `frontend/src/components/dashboard/inspection-detail.tsx` | OpenCV feature matching + RANSAC homography. Comparability check and percentage change calculation. |
| **Module 16: Maintenance Prioritisation & Work Orders** | Maintenance, Manager | **Exists and works** | `apps/api/app/services/priority_engine.py`, `apps/api/app/routers/work_orders.py`, `frontend/src/components/dashboard/maintenance.tsx` | Work order lifecycle (`unassigned` -> `open` -> `in_progress` -> `closed` with mandatory note). Remediation template recommendations. |
| **Module 17: Role-Specific Dashboards** | All 5 Roles | **Exists and works** | `apps/api/app/routers/dashboards.py`, `frontend/src/components/dashboard/role-dashboards/*` | Dedicated dashboards for Inspector, Engineer, Manager, Maintenance, Admin. Zero mock data rule enforced. |
| **Module 18: Damage Visualization & Analysis Screen** | Engineer | **Exists and works** | `frontend/src/components/dashboard/analysis-detail.tsx`, `apps/api/app/routers/detections.py` | Multi-layer canvas (Original, Preprocessed, Annotations, Zoom/Pan, Ruler, Geometry verification checkbox). |
| **Module 19: Inspection Report Generation** | Manager, Engineer | **Exists and works** | `apps/api/app/services/reporting.py`, `apps/api/app/routers/reports.py` | Tamper-evident reports (PDF, CSV, Excel, JSON) with SHA-256 checksums, versioning, disclaimer banner. |
| **Module 20: Notification & Alert System** | All Roles | **Exists and works** | `apps/api/app/routers/notifications.py`, `frontend/src/components/dashboard/notifications-center.tsx` | Role-routed alerts (Severe damage, Inspection assigned, Review required, Deadline approaching). |
| **Module 21: Model Management & Versioning** | Admin | **Partial** | `apps/api/app/models/all_models.py`, `apps/api/app/routers/admin.py` | Model registry schema and rollback tracking endpoints. |
| **Module 22: Final Integration, Testing & Deployment** | All Roles | **Exists and works** | `docker-compose.yml`, `apps/api/tests/*`, `frontend/vite.config.ts` | 20 passing pytest tests, clean Vite build, Playwright E2E suite. |

---

## 2. Priority Known Defect Tracking (D1 - D10)

| Defect ID | Description | Status | Action Required |
|---|---|---|---|
| **D1** | Inspector Dashboard KPI mismatch with Inspections table (`assigned_inspector_id` foreign key) | Verified / Resolved | Ensure all queries strictly join on `assigned_inspector_id` and test accounts match. |
| **D2** | Notification Center empty despite pending high-severity reviews | Verified / Resolved | Ensure event triggers generate notification records in `notifications` table on status changes. |
| **D3** | Asset ER-585 junk data removal and condition derivation | Verified / Resolved | Data sanitized in `infrascan_dev.db`; condition dynamically derived from latest reviewed inspection. |
| **D4** | Asset fields missing from registration form (year, dept, frequency, GPS) | Verified / Resolved | Asset model and form updated with full specification fields. |
| **D5** | Inspections table action button clipping on narrow viewports | Verified / Resolved | CSS responsive flex-wrap and container scrollbar applied. |
| **D6** | Elevated role self-registration without approval code | Verified / Resolved | Registration defaults to `pending_approval`; Admin console handles promotion and activation. |
| **D7** | Profile theme and password synchronization | Verified / Resolved | Centralized theme state; password update validates current password and minimum 12 chars. |
| **D8** | Session timeout verification (30m idle, 12h absolute) | Verified / Working | Implemented via `AuthProvider` idle timer countdown modal and JWT expiry check. |
| **D9** | Command palette (`⌘K` / `Ctrl+K`) search navigation | Verified / Working | Global shortcut listener with instant search for assets, inspections, and reports. |
| **D10** | Landing page claims alignment (5 role workspaces, 8 pipeline stages) | Verified / Working | Landing page accurately presents the 5 roles and 8 inspection lifecycle stages. |
