# InfraScan — Full-Stack AI Model Integration & Inspection Workflow Report

**Project:** InfraScan — AI-Powered Crack & Damage Assessment for Civil Infrastructure  
**Location:** `D:\project\aiml prime\project\infosys`  
**Date:** October 28, 2026  
**Environment:** Windows 11 / PowerShell, Python 3.12 (`D:\project\aiml prime\.venv`), React 19 + TypeScript + Vite (`frontend`)  

---

## 1. Executive Summary

This document serves as the comprehensive engineering guide and reference report for the **InfraScan AI Model Integration, Photo Inspection Suite, and Dashboard Upgrade**.

Prior to this implementation:
- The civil engineering review queue and inspector dashboard displayed placeholder statuses (`CrackNet-R v3.2`, `"AI not connected"`, mock confidence values `1.0`, or `"skipped_no_model"`).
- Image uploads lacked per-photo granular controls (inspectors could not zoom with original/enhanced toggles, crop/rotate, replace images cleanly, or annotate visible defects).
- The ResNet50 crack classification model was trained and exported, but disconnected from the FastAPI backend and frontend state.

With this release:
1. **InfraScan Model v1.0 — Crack Classification (ResNet50)** is fully loaded into memory once at backend startup via ONNX Runtime (CPU fallback verified) with exact ImageNet preprocessing and calibrated threshold `0.095097`.
2. **OpenCV Image Quality Pipeline** performs 7 classical checks per photograph upon upload (blur variance, brightness, contrast, resolution, format, completeness, and duplicate pHash).
3. **Comprehensive Photo Inspection Suite** provides camera capture, multi-file drag-and-drop, individual photo cards with live status badges, Original vs. Enhanced (CLAHE + unsharp mask) image toggle, replacement with automated stale detection clearing, and deletion safeguards.
4. **Per-Photo Manual Review & Defect Annotations** allow inspectors and civil engineers to record manual verdicts (`Crack`, `No Crack`, `Uncertain`) with override reasons, and draw bounding boxes on an interactive canvas. Manual annotations are strictly segregated from AI predictions.
5. **Civil Engineer Review Queue** is connected to persistent backend records with mandatory geometry verification gates before sign-off and report export.
6. **Zero Mock Data Rule**: All dashboard counters, detection lists, and confidence percentages are computed directly from database tables (`Inspection`, `InspectionImage`, `Detection`).

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INFRASTRUCTURE INSPECTOR                           │
│  - Multi-file Photo Upload / Camera Capture                                 │
│  - OpenCV Image Quality Validation (Blur, Light, Duplicate)                 │
│  - Per-Photo Controls: Zoom, Replace, Delete, Notes                         │
│  - Manual Classification Verdict (Crack / No Crack / Uncertain)             │
│  - Manual Defect Bounding Box Canvas Annotation                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP POST / Upload
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FASTAPI BACKEND & ORM                              │
│  - apps/api/app/services/image_quality.py   -> 7 OpenCV Quality Checks      │
│  - apps/api/app/services/classifier.py      -> ResNet50 ONNX Engine         │
│  - apps/api/app/routers/upload.py           -> Photo Replacement & Review   │
│  - apps/api/app/routers/inspections.py      -> Batch & Single AI Trigger    │
│  - apps/api/app/routers/dashboards.py       -> Live SQL Metrics Aggregation │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Inference & Detections Saved to DB
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CIVIL ENGINEER REVIEW QUEUE                           │
│  - Real Detection Records (Source: ai_model vs inspector_manual)            │
│  - Calibrated Width & Severity Assessment                                   │
│  - Geometry Verification Gate (ENG-10)                                      │
│  - Formal Sign-Off & Tamper-Evident Report Generation (PDF, JSON, CSV)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. AI Model Integration: InfraScan Model v1.0 (ResNet50)

### 3.1 Model Artifacts & Location
The model weights and metadata are located outside source control at:
```text
C:\Users\yashr\Downloads\infrascan_crack_results\models
```
Files present and verified:
- `infrascan_crack_resnet50.onnx` — 97.4 MB ONNX export (Primary inference artifact).
- `infrascan_crack_resnet50_torchscript.pt` — TorchScript serialized model.
- `infrascan_crack_resnet50_weights.pth` — PyTorch state dictionary.
- `model_metadata.json` — Verified training configuration and calibrated threshold.

Configuration in [apps/api/app/config.py](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/config.py):
```python
MODEL_DIR: str = os.getenv("MODEL_DIR", r"C:\Users\yashr\Downloads\infrascan_crack_results\models")
MODEL_FILENAME: str = os.getenv("MODEL_FILENAME", "infrascan_crack_resnet50.onnx")
TORCHSCRIPT_FILENAME: str = os.getenv("TORCHSCRIPT_FILENAME", "infrascan_crack_resnet50_torchscript.pt")
METADATA_FILENAME: str = os.getenv("METADATA_FILENAME", "model_metadata.json")
```

### 3.2 Preprocessing & Inference Specification
- **Architecture**: Deep Residual Network (ResNet-50), 50 convolutional layers.
- **Task**: Binary Image Classification.
- **Output Classes & Order**: `["Uncracked", "Cracked"]` (Index 0 = Uncracked, Index 1 = Cracked).
- **Input Tensor Dimensions**: `(1, 3, 224, 224)` (Batch Size = 1, Channels = 3, Height = 224, Width = 224).
- **Color Format**: RGB (Converted automatically from BGR if loaded via OpenCV).
- **Interpolation**: Bilinear resizing without cropping.
- **Normalization Constants**: ImageNet standards:
  - `Mean = [0.485, 0.456, 0.406]`
  - `Std  = [0.229, 0.224, 0.225]`
- **Probability Function**: Softmax applied across the 2 logits:
  $$\text{Softmax}(z_i) = \frac{e^{z_i}}{\sum_{j=0}^{1} e^{z_j}}$$
- **Decision Threshold**: Exactly `0.09509705752134323` (loaded dynamically from `model_metadata.json`). An image is classified as **Cracked** if:
  $$P(\text{Crack}) \ge 0.09509705752134323$$
  Otherwise, it is classified as **Uncracked**.
- **Hardware Acceleration**: Executed using `onnxruntime` with `CPUExecutionProvider` and automatic CUDA fallback.

### 3.3 Application Lifecycle Loading
The model is loaded **once** at server startup in [apps/api/app/main.py](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/main.py) via FastAPI's `lifespan` handler. It is maintained as a thread-safe singleton accessed via `get_classifier()`. Requests do not reload model weights from disk.

---

## 4. OpenCV Classical Image Quality Pipeline

Every uploaded photo is evaluated against 7 classical computer vision checks before AI analysis:

| Check Key | Metric Evaluated | Pass Threshold | Warning / Fail Condition |
| :--- | :--- | :--- | :--- |
| `format` | Image MIME & Magic Bytes | JPEG, PNG, WebP | Corrupt or unsupported format |
| `file_size` | Raw Byte Count | 10 KB to 25 MB | Below 10 KB or above 25 MB |
| `resolution` | Pixel Width × Height | Minimum 800×600 | Below 800×600 px |
| `blur` | Laplacian Variance $\sigma^2$ | $\ge 80.0$ | $< 50.0$ (Fail), $50.0 \le \sigma^2 < 80.0$ (Warn) |
| `low_light` | Grayscale Mean Luminance | $\ge 70.0$ | $< 40.0$ (Underexposed Fail), $> 220.0$ (Overexposed Warn) |
| `completeness` | Grayscale Standard Dev. | $\ge 12.0$ | $< 8.0$ (Blank, washed out, or solid block) |
| `duplicate` | Perceptual Hash (pHash) | Hamming dist $> 6$ | Existing identical image in inspection |

### Preprocessing Profile (`general_v1`)
Accepted images automatically receive an enhanced copy stored at `storage/processed/`:
1. **Denoising**: Gaussian bilateral filtering preserving crack edges.
2. **Contrast Enhancement**: Contrast Limited Adaptive Histogram Equalization (CLAHE).
3. **Unsharp Masking**: High-frequency edge emphasis.

---

## 5. Photo Inspection & Capture Suite

Implemented in [frontend/src/components/inspection/photo-inspection-suite.tsx](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/inspection/photo-inspection-suite.tsx) and [frontend/src/components/dashboard/inspection-detail.tsx](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/inspection-detail.tsx):

### 5.1 Multi-File Upload & Camera Capture
- Drag-and-drop zone with multi-file queue and per-file progress indicators.
- Per-file success/failure states: An error on one image does not interrupt remaining uploads.
- Real-time display of OpenCV check results with expandable warning breakdowns.

### 5.2 Individual Photo Controls
- **Interactive Fullscreen Zoom Modal**: Zoom up to 4× with panning controls, with an instant switcher between the **Original Image** and the **Processed (Enhanced) Image**.
- **Photo Replacement Workflow**: Allows replacing a flawed image with a new photograph; automatically purges any prior detections associated with the old image to prevent stale results.
- **Safe Deletion**: Soft-deletes the image and clears associated detections with confirmation.
- **Per-Photo AI Analysis**: Inspectors can trigger inference on a single image individually (`POST /inspections/{id}/images/{img_id}/analyze`) or batch-analyze all photos.

### 5.3 Manual Review & Canvas Bounding Box Annotations
- **Review Verdict**: Inspectors can manually designate an image as `Crack`, `No Crack`, or `Uncertain` and submit a mandatory override reason.
- **Interactive Annotation Canvas**: Inspectors and engineers can draw, adjust, and label rectangular bounding boxes on the photo.
- **Strict Provenance**:
  - AI predictions are saved with `source="ai_model"`, `model_id="InfraScan Model v1.0 (ResNet50)"`, and confidence.
  - Manual annotations are saved with `source="inspector_manual"` or `"engineer_manual"`, with `confidence=None`.
  - Machine predictions and human annotations are never conflated.

---

## 6. Backend API Reference

### 6.1 Model Status
- `GET /api/v1/models/active` (and alias `GET /api/models/active`):
  ```json
  {
    "status": "ready",
    "active_model": {
      "model_name": "InfraScan Model v1.0 (ResNet50)",
      "version": "1.0",
      "engine": "ONNXRuntime",
      "labels": ["Uncracked", "Cracked"],
      "decision_threshold": 0.09509705752134323,
      "supported_tasks": ["classification"],
      "device": "CPU"
    }
  }
  ```

### 6.2 AI Analysis Endpoints
- `POST /api/v1/inspections/{id}/analyze` — Batch-analyzes all valid images for an inspection.
- `POST /api/v1/inspections/{id}/images/{image_id}/analyze` — Analyzes an individual photograph.

### 6.3 Photo Review & Annotations
- `POST /api/v1/images/{id}/review` — Saves inspector manual verdict (`verdict`, `reason`, `notes`).
- `POST /api/v1/images/{id}/annotations` — Saves manual bounding box (`bbox: {x, y, w, h}`, `defect_type`, `notes`).
- `POST /api/v1/images/{id}/replace` — Replaces image file and clears prior detections.

### 6.4 Role Visibility & Security Gates
- **Manager / Maintenance Unreviewed Gate**: Unreviewed inspection imagery is strictly forbidden (`403 UNREVIEWED_ACCESS_BLOCKED`) to managers and maintenance staff until an engineer reviews and signs off.
- **Geometry Verification Gate (ENG-10)**: All findings with spatial geometry must be checked and verified by a civil engineer before sign-off is permitted (`422 UNVERIFIED_GEOMETRY`).

---

## 7. Verification & Test Suite

All tests execute inside the active workspace virtual environment `D:\project\aiml prime\.venv`.

### 7.1 Backend Test Results
Run command:
```powershell
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m pytest apps/api/tests/test_model_integration.py apps/api/tests/test_image_quality.py apps/api/tests/test_role_completeness.py -v
```

**Outcome: 24 PASSED, 0 FAILED** (13.19s)

```text
apps\api\tests\test_model_integration.py::test_resnet50_classifier_direct_inference PASSED
apps\api\tests\test_model_integration.py::test_classifier_graceful_missing_model_fallback PASSED
apps\api\tests\test_model_integration.py::test_active_model_api_endpoint PASSED
apps\api\tests\test_model_integration.py::test_photo_upload_and_quality_inspection PASSED
apps\api\tests\test_model_integration.py::test_single_photo_ai_analysis PASSED
apps\api\tests\test_model_integration.py::test_per_photo_manual_review_override PASSED
apps\api\tests\test_model_integration.py::test_manual_bounding_box_annotation PASSED
apps\api\tests\test_model_integration.py::test_photo_replacement_clears_stale_detections PASSED
apps\api\tests\test_model_integration.py::test_submit_inspection_triggers_ai_and_populates_review_queue PASSED
apps\api\tests\test_model_integration.py::test_role_permissions_and_engineer_sign_off PASSED
apps\api\tests\test_image_quality.py::test_assess_sharp_image PASSED
apps\api\tests\test_image_quality.py::test_assess_blurred_image PASSED
apps\api\tests\test_image_quality.py::test_assess_dark_image PASSED
apps\api\tests\test_image_quality.py::test_assess_corrupted_image PASSED
apps\api\tests\test_image_quality.py::test_assess_unsupported_format PASSED
apps\api\tests\test_image_quality.py::test_assess_duplicate_image PASSED
apps\api\tests\test_image_quality.py::test_preprocessing_crack_preservation PASSED
apps\api\tests\test_image_quality.py::test_role_visibility_enforcement PASSED
apps\api\tests\test_image_quality.py::test_transform_image_crop_rotate PASSED
apps\api\tests\test_image_quality.py::test_generate_augmentations_variants PASSED
apps\api\tests\test_image_quality.py::test_dataset_samples_generation_and_drone_metadata PASSED
apps\api\tests\test_image_quality.py::test_image_processing_run_model_instantiation PASSED
apps\api\tests\test_image_quality.py::test_asset_assignment_permission PASSED
apps\api\tests\test_role_completeness.py::test_full_role_completeness_lifecycle PASSED
======================= 24 passed, 4 warnings in 13.19s =======================
```

### 7.2 Frontend Production Build
Run command:
```powershell
cd "D:\project\aiml prime\project\infosys\frontend"
npm run build
```

**Outcome: Exit Code 0**  
Vite transformed 2,117 modules and generated production assets cleanly in `dist/` with 0 TypeScript errors.

---

## 8. Step-by-Step Instructions to Run on Windows

### 1. Launch Backend API
Open a PowerShell terminal:
```powershell
cd "D:\project\aiml prime\project\infosys\apps\api"
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- Interactive Swagger Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Active Model Health: [http://localhost:8000/api/v1/models/active](http://localhost:8000/api/v1/models/active)

### 2. Launch Frontend Application
Open a second PowerShell terminal:
```powershell
cd "D:\project\aiml prime\project\infosys\frontend"
npm run dev
```
- Access UI: [http://localhost:5173](http://localhost:5173)

---

## 9. Future Model Extensibility

The system architecture is structured to support future deep-learning releases:
- **Model v1.1 — YOLO Defect Detection**: Planned for localized crack and pothole bounding boxes.
- **Model v2.0 — U-Net Crack Segmentation**: Planned for pixel-level crack segmentation masks.

*Status Notice*: Currently, only the ResNet50 classification model is trained and verified. Detection bounding boxes and segmentation masks are therefore **strictly restricted to manual engineer/inspector annotations** and are never fabricated by the backend.
