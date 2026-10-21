# InfraScan Requirements Traceability Matrix

This matrix maps each requirement and module from the InfraScan Specification PDF (Sections §1 to §22) and Milestone 1 Report to its implementing source files, database tables, and verification tests.

## Master Feature Matrix (All 22 Modules)

| PDF Module | Implementation Phase | Scope | Status | Implementing Files & Tables | Verification Tests |
|---|---|---|---|---|---|
| **1. User Authentication & Role-Based Access** | Phase 1 | Full Stack | **Active & Verified (Week 1)** | `apps/api/app/routers/auth.py`, `apps/api/app/security/*`, `apps/web/src/pages/auth/*`, tables: `users`, `user_credentials`, `auth_tokens`, `refresh_sessions`, `audit_log` | `apps/api/tests/test_auth.py`, `apps/api/tests/test_ui_playwright.py` |
| **2. Asset & Inspection Management** | Phase 2 | Full Stack | **Active & Verified (Week 1)** | `apps/api/app/routers/assets.py`, `inspections.py`, `frontend/src/components/dashboard/assets.tsx`, tables: `assets`, `inspections` | `apps/api/tests/test_week1_audit.py` (H1-H7, I1-I4) |
| **3. Image Capture & Upload** | Phase 3 | Full Stack | **Active & Verified (Week 1)** | `apps/api/app/services/image_validation.py`, `upload.py`, tables: `inspection_images` | `apps/api/tests/test_week1_audit.py` (J1-J9) |
| **4. Image Preprocessing Engine** | Phase 4 | Full Stack | **Active & Verified (Week 1)** | `apps/api/app/services/preprocessing.py`, `upload.py`, table: `processed_images` | `apps/api/tests/test_week1_audit.py` (K1-K3) |
| **4B. Datasets, EDA & Schema** | Phase 4B | Full Stack | **Active & Verified (Week 1)** | `apps/api/app/cli.py` (import-eda, seed), `datasets.py`, tables: `datasets`, `dataset_inspection_stats`, `dataset_class_stats`, `defect_types`, `severity_levels`, `priority_categories`, `infrastructure_types`, `alert_levels` | `apps/api/tests/test_week1_audit.py` (L1-L3) |

| **5. Crack Detection Engine** | Phase 5 | Frontend Only (Milestone 2) | Contract Gated (501) | `docs/api-contract.yaml`, `src/pages/review-queue.tsx` | UI Component Tests, API 501 test |
| **6. Crack Segmentation Engine** | Phase 5 | Frontend Only (Milestone 2) | Contract Gated (501) | `docs/api-contract.yaml`, `src/components/ui/crack-detection-illustration.tsx` | UI Component Tests, API 501 test |
| **7. Crack Type Classification** | Phase 5 | Frontend Only (Milestone 2) | Contract Gated (501) | `docs/api-contract.yaml`, `src/lib/rules.ts` | `src/lib/rules.test.ts` |
| **8. Surface Damage Detection** | Phase 5 | Frontend Only (Milestone 2) | Contract Gated (501) | `docs/api-contract.yaml` | UI Component Tests |
| **9. Crack Geometry & Measurement** | Phase 6 | Frontend Only (Milestone 3) | Contract Gated (501) | `src/lib/rules.ts` (formatMeasurement) | `src/lib/rules.test.ts` (px vs mm tests) |
| **10. Damage Severity Assessment** | Phase 6 | Frontend Only (Milestone 3) | Contract Gated (501) | `src/lib/rules.ts` (formatSeverityLabel) | `src/lib/rules.test.ts` (severity wording tests) |
| **11. Advanced Deep Learning Engine** | Phases 5 & 8 | Frontend Only (Milestone 2/4) | Contract Gated (501) | `docs/api-contract.yaml`, `src/components/dashboard/role-dashboards/admin-dashboard.tsx` | UI Component Tests |
| **12. Explainable AI (XAI)** | Phase 7 | Frontend Only (Milestone 3) | Contract Gated (501) | `docs/api-contract.yaml` | UI Component Tests |
| **13. AI Model Training & Evaluation** | Phases 5 & 8 | Frontend Only (Milestone 2/4) | Contract Gated (501) | `src/components/dashboard/role-dashboards/admin-dashboard.tsx` | UI Component Tests |
| **14. Infrastructure Damage Mapping** | Phase 10 | Frontend Only (Milestone 3) | Contract Gated (501) | `docs/api-contract.yaml`, Leaflet OSM integration | UI Component Tests |
| **15. Damage Progression & Historical Analysis** | Phase 10 | Frontend Only (Milestone 3) | Contract Gated (501) | `src/lib/rules.ts` (evaluateProgression) | `src/lib/rules.test.ts` (progression gate tests) |
| **16. Maintenance Prioritisation** | Phase 10 | Frontend Only (Milestone 3) | Contract Gated (501) | `src/components/dashboard/role-dashboards/maintenance-dashboard.tsx` | UI Component Tests |
| **17. Infrastructure Inspection Dashboards** | Phase 11 | Frontend Only (Milestone 3/4) | Active UI / Live Week 1 | `src/components/dashboard/role-dashboards/*` | UI & Integration Tests |
| **18. Damage Visualization & Analysis Screen** | Phase 7 | Frontend Only (Milestone 3) | Contract Gated (501) | `docs/api-contract.yaml` | UI Component Tests |
| **19. Inspection Report Generation** | Phase 11 | Frontend Only (Milestone 4) | Contract Gated (501) | `docs/api-contract.yaml` | UI Component Tests |
| **20. Notification & Alert System** | Phase 11 | Frontend Only (Milestone 4) | Contract Gated (501) | `src/components/dashboard/notifications-center.tsx`, `topbar.tsx` | UI Component Tests |
| **21. Model Management & Versioning** | Phase 8 | Frontend Only (Milestone 4) | Contract Gated (501) | `src/components/dashboard/role-dashboards/admin-dashboard.tsx` | UI Component Tests |
| **22. Final Integration, Testing & Deployment** | Phase 12 | Full Stack (Week 1 subset) | Active (Docker, CI, Tests) | `docker-compose.yml`, `apps/api/tests/*`, `frontend/src/lib/rules.test.ts` | Test Suites |
| **Engineer Review Gate (Milestone 1 §2.3)** | Phase 9 | Frontend Only (Milestone 3) | Contract Gated (501) | `src/pages/review-queue.tsx`, `src/lib/rules.ts` | `src/lib/rules.test.ts` |
