# 🏗️ InfraScan — Civil Infrastructure Inspection & Automated Defect Intelligence Platform

[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6.svg)](https://www.typescriptlang.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0+-EE4C2C.svg)](https://pytorch.org/)
[![OpenCV](https://img.shields.io/badge/OpenCV-4.10+-5C3EE8.svg)](https://opencv.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](https://tailwindcss.com/)

**InfraScan** is an enterprise-grade, full-stack cyber-physical platform designed for automated civil infrastructure inspection, structural health monitoring, and AI-assisted defect quantification. Built for state highway departments, civil engineering authorities, and infrastructure maintenance teams, InfraScan bridges the gap between field photo acquisition and deterministic engineering decisions.

---

## 📑 Table of Contents

1. [System Overview & Architecture](#-system-overview--architecture)
2. [Key Features](#-key-features)
3. [How It Works: The 4-Stage AI Pipeline](#-how-it-works-the-4-stage-ai-pipeline)
4. [Technical Implementation Details](#-technical-implementation-details)
   - [AI & Computer Vision Services](#1-ai--computer-vision-services)
   - [Mathematical Crack Geometry Engine](#2-mathematical-crack-geometry-engine)
   - [Image Quality & Preprocessing Engine](#3-image-quality--preprocessing-engine)
   - [Interactive Image Transformations (Crop & Rotate)](#4-interactive-image-transformations-crop--rotate)
   - [FastAPI Backend & REST API Layer](#5-fastapi-backend--rest-api-layer)
   - [Frontend Architecture & Inspection Suite](#6-frontend-architecture--inspection-suite)
   - [Database Schema & Data Persistence](#7-database-schema--data-persistence)
5. [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
6. [Quick Start & Installation](#-quick-start--installation)
7. [Running Automated Tests](#-running-automated-tests)
8. [Documentation Links](#-documentation-links)

---

## 🏗️ System Overview & Architecture

InfraScan operates on a strict multi-stage inspection lifecycle: field capture $\to$ automated quality validation $\to$ multi-stage neural defect inference $\to$ deterministic mathematical geometry extraction $\to$ civil engineer review & sign-off $\to$ tamper-evident report delivery.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FIELD INSPECTION & ACQUISITION                            │
│  - Camera Capture / Multi-file Batch Upload                                            │
│  - Geolocation & GPS Acquisition (Mock / Live coordinates)                             │
│  - Interactive Crop & Free-Angle Rotation (Dynamic canvas preview & re-inference)       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ HTTP Multi-part Upload
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 0: CLASSICAL COMPUTER VISION AUDIT                        │
│  - 7 OpenCV Quality Checks: Blur (Laplacian), Illumination, Contrast, pHash Duplicates │
│  - CLAHE (Contrast-Limited Adaptive Histogram Equalization) & Unsharp Mask Enhancement │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ Verified / Warned Image
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: BINARY CRACK CLASSIFICATION                            │
│  - ResNet-18 / ResNet-50 Deep Residual Network (ONNX / TorchScript)                    │
│  - Binary Decision: Sound Concrete vs. Crack Detected (80% Defect Cutoff)              │
└─────────────────────────────┬──────────────────────────────────────────────────────────┘
                              │ If Crack Detected (Prob >= 80%)
                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: DAMAGE LOCALIZATION & CLASSIFICATION                   │
│  - Primary: RF-DETR Medium (RDD2022) Transformer Detector                              │
│    * D00: Longitudinal Crack | D10: Transverse Crack | D20: Alligator | D40: Pothole   │
│  - Fallback: YOLO11n Infrastructure Detector (Triggered if RF-DETR detects 0 defects)  │
└─────────────────────────────┬──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 3: PIXEL-LEVEL CRACK SEGMENTATION                         │
│  - Deep U-Net (4-Stage Encoder-Decoder with Skip Connections, trained on CrackSeg9k)   │
│  - High-Resolution Probability Mask & Semi-Transparent Crimson Visual Overlay          │
│  - Automatic Dashboard Card Thumbnail (Prioritizes U-Net overlay for cracked images)   │
└─────────────────────────────┬──────────────────────────────────────────────────────────┘
                              │ Binary Crack Mask (0 / 255)
                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 4: MATHEMATICAL CRACK GEOMETRY EXTRACTION                 │
│  - Medial Axis Skeletonization & Centerline Integration (Orthogonal + Diagonal Steps)   │
│  - Euclidean Distance Transform (L2) for Continuous Width Profiling (Mean, Med, Max)   │
│  - Principal Component Analysis (PCA) Orientation & Structural Crack Type Rules        │
│  - Bifurcation Junction Detection & Physical Metric Scaling (mm / mm²)                 │
└─────────────────────────────┬──────────────────────────────────────────────────────────┘
                              │ Real Records Saved to DB
                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CIVIL ENGINEER REVIEW QUEUE & GOVERNANCE                        │
│  - Zero Mock Data: Live SQL analytics across Inspector, Engineer, and Manager roles    │
│  - Interactive Comparison Slider (Original vs Processed vs U-Net vs Binary Mask)       │
│  - Structural Sign-off Gate & Tamper-Evident SHA-256 PDF/JSON/CSV Reports              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Features

- **Multi-Stage AI Inspection Pipeline**: Replaces single-model guesswork with a 4-stage pipeline combining ResNet classification, RF-DETR transformer detection, YOLO11n fallback, and U-Net semantic segmentation.
- **Deterministic Crack Geometry Engine**: Computes exact centerline length in pixels/mm, local crack thickness (mean, median, max), PCA dominant orientation ($0^\circ-180^\circ$), branch junctions, and unaffected surface area percentages.
- **Dynamic U-Net Thumbnail Prioritization**: Cards on the Photo Capture dashboard automatically display the high-definition U-Net crack segmentation overlay whenever a defect is detected.
- **7-Point Classical Quality Audit**: Evaluates every photo upon upload using OpenCV (Laplacian variance for blur, luminance distribution, contrast, decoding completeness, and 64-bit perceptual hash duplicate detection).
- **Interactive Crop & Rotate Tool**: Inspect and edit photos directly from the side panel. Free rotation, $90^\circ$ turns, horizontal/vertical flips, and bounding crops immediately trigger re-preprocessing, model re-inference, and dashboard updates.
- **Split Image Comparison Suite**: Interactive before/after split slider allowing engineers to swipe between Original, CLAHE-Enhanced, U-Net Segmentation Overlay, and Binary Mask views.
- **Zero Mock Data Architecture**: All dashboard counters, detection lists, severity rankings, and progression rates are computed from live relational database queries.
- **Role-Based Engineering Governance**: 5 distinct workspaces (Admin, Asset Manager, Civil Engineer, Infrastructure Inspector, Maintenance Worker) with structural review gates and SHA-256 tamper-evident exportable inspection reports.

---

## 🔬 How It Works: The 4-Stage AI Pipeline

### Stage 0: Preprocessing & Quality Assurance
When an image is acquired via camera or file upload:
1. **Quality Audit**: [apps/api/app/services/image_quality.py](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/image_quality.py) executes 7 deterministic checks:
   - **Blur**: Laplacian variance ($\sigma^2_{\Delta}$). Scores $\ge 80$ pass; $< 80$ warn; $< 30$ fail.
   - **Illumination**: Mean luminance ($Y = 0.299R + 0.587G + 0.114B$). Scores $\ge 70$ pass; $< 40$ fail.
   - **Perceptual Hash**: 64-bit DCT pHash. If Hamming distance $\le 5$ against existing asset photos, a duplicate warning is flagged.
2. **CLAHE Enhancement**: [apps/api/app/services/preprocessing.py](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/preprocessing.py) converts the image to CIE LAB color space, applies Contrast Limited Adaptive Histogram Equalization to the L-channel ($\text{clipLimit}=2.0, \text{grid}=(8, 8)$), and blends with an unsharp mask ($\alpha=0.6$) to highlight crack edges under harsh field lighting.

### Stage 1: Binary Crack Classification
- **Model**: ResNet-18 / ResNet-50 trained on concrete and asphalt defect datasets ([`apps/api/app/services/classifier.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/classifier.py)).
- **Input**: Normalized $(1, 3, 224, 224)$ RGB tensor with ImageNet mean $[0.485, 0.456, 0.406]$ and std $[0.229, 0.224, 0.225]$.
- **Execution**: Run via ONNX Runtime or TorchScript.
- **Decision Logic**: Evaluates softmax probability for Class 1 (`Cracked`). If $P(\text{Crack}) \ge 0.80$, the image is flagged as **Crack Detected** and routed to Stage 2 & Stage 3. Otherwise, it is marked as **Sound Surface (No Crack)**.

### Stage 2: Damage Localization & Classification
- **Primary Detector**: **RF-DETR Medium** ([`apps/api/app/services/rfdetr_detector.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/rfdetr_detector.py)) trained on RDD2022 (Road Damage Dataset).
  - Architecture: Transformer-based Real-time DEtection TRansformer with DINOv2 backbone.
  - Class codes:
    - `D00`: Longitudinal Crack (Yellow/Amber `#F59E0B`)
    - `D10`: Transverse Crack (Cyan/Sky `#0EA5E9`)
    - `D20`: Alligator Crack (Crimson/Red `#EF4444`)
    - `D40`: Pothole / Spalling (Purple/Violet `#A855F7`)
- **Fallback Detector**: **YOLO11n** ([`apps/api/app/services/yolo_detector.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/yolo_detector.py)).
  - If RF-DETR yields 0 detections on a crack-classified photo, the system automatically falls back to fine-tuned YOLO11n to ensure no structural defects go unlocalized.

### Stage 3: Pixel-Level Crack Segmentation
- **Model**: Deep U-Net architecture ([`apps/api/app/services/unet_segmentor.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/unet_segmentor.py)) trained on CrackSeg9k (Validation Dice: $75.14\%$, IoU: $60.18\%$).
- **Architecture**:
  - Encoder: 4 stages of `DoubleConv` (Conv2D $3\times3 \to$ BatchNorm $\to$ ReLU $\to$ Conv2D $3\times3 \to$ BatchNorm $\to$ ReLU) followed by $2\times2$ MaxPool.
  - Bottleneck: High-capacity feature representation ($16\times$ base channels).
  - Decoder: 4 stages of Transposed Convolution ($2\times2$, stride 2) concatenated with encoder skip connections.
  - Output Head: $1\times1$ convolution producing single-channel crack logit map.
- **Output**: Binary mask $(H, W)$ thresholded at $0.5$ sigmoid probability, and a semi-transparent crimson visual overlay $(R=239, G=68, B=68, \alpha=0.45)$.
- **Card Thumbnail Update**: The segmented overlay is dynamically rendered as the card thumbnail on the inspector's capture grid.

### Stage 4: Mathematical Crack Geometry Extraction
- **Engine**: [`apps/api/app/services/crack_geometry.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/crack_geometry.py).
- Extracts engineering metrics from the binary mask:
  1. **Skeletonization & Centerline Length**: Applies morphological medial axis thinning (`skimage.morphology.skeletonize`). Traverses the 8-connected skeleton graph, weighting orthogonal steps as $1.0$ and diagonal steps as $\sqrt{2}$. Identifies junction branch points (degree $\ge 3$).
  2. **Thickness & Width Profiling**: Computes Euclidean Distance Transform (`cv2.DIST_L2`). Evaluates local thickness $w = 2 \times D(x, y)$ along the skeleton centerline, reporting average, median, and maximum crack widths.
  3. **PCA Orientation**: Computes covariance matrix of crack coordinates and diagonalizes via eigenvector decomposition. Determines principal angle $\theta \in [0^\circ, 180^\circ)$.
  4. **Structural Crack Type Rules**:
     - *Alligator / Interconnected*: Branch junctions $\ge 4$ or complex network.
     - *Transverse*: $\theta \le 25^\circ$ or $\theta \ge 155^\circ$.
     - *Longitudinal*: $65^\circ \le \theta \le 115^\circ$.
     - *Diagonal / Oblique*: $25^\circ < \theta < 65^\circ$ or $115^\circ < \theta < 155^\circ$.
  5. **Severity Classification**:
     - Hairline: $< 1.0\text{ mm}$
     - Minor: $1.0 - 3.0\text{ mm}$
     - Moderate: $3.0 - 5.0\text{ mm}$
     - Severe: $> 5.0\text{ mm}$

---

## 💻 Technical Implementation Details

### 1. AI & Computer Vision Services

| Service File | Class / Engine | Core Responsibilities |
|---|---|---|
| [`apps/api/app/services/classifier.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/classifier.py) | `CrackClassifier` | ResNet-18 / ResNet-50 inference via ONNX Runtime / TorchScript; calibrated softmax thresholding. |
| [`apps/api/app/services/rfdetr_detector.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/rfdetr_detector.py) | `RFDETRCrackDetector` | Transformer-based bounding box detection for longitudinal, transverse, alligator cracks, and potholes. |
| [`apps/api/app/services/yolo_detector.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/yolo_detector.py) | `YOLOCrackDetector` | Ultralytics YOLO11n detection engine used as automated fallback. |
| [`apps/api/app/services/unet_segmentor.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/unet_segmentor.py) | `UNetCrackSegmentor` | PyTorch U-Net semantic segmentation, mask generation, and overlay compositing. |
| [`apps/api/app/services/crack_geometry.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/crack_geometry.py) | `extract_crack_geometry` | Graph-based skeleton centerline, distance transform width profiling, PCA orientation, and HUD visualizer. |
| [`apps/api/app/services/image_quality.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/image_quality.py) | `ImageQualityService` | 7-point OpenCV quality audit (blur, illumination, contrast, resolution, format, integrity, pHash). |
| [`apps/api/app/services/preprocessing.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/services/preprocessing.py) | `ImagePreprocessingService` | CLAHE histogram equalization, unsharp masking, and standardized pyramid tiling. |

### 2. Mathematical Crack Geometry Engine

```python
# Centerline length integration using 8-connected graph traversal:
# Orthogonal steps = 1.0, Diagonal steps = sqrt(2)
for dr, dc, weight in _FORWARD_EDGE_OFFSETS:
    if (r + dr, c + dc) in skel_set:
        total_length += weight

# Thickness profiling via Euclidean Distance Transform along skeleton:
dist_map = cv2.distanceTransform(comp_mask, cv2.DIST_L2, 5)
widths = dist_map[skel_coords] * 2.0
avg_width = np.mean(widths)
max_width = np.max(widths)

# Orientation via Principal Component Analysis (PCA):
cov = np.cov(centered_coords, rowvar=False)
evals, evecs = np.linalg.eigh(cov)
principal_vec = evecs[:, np.argmax(evals)]
deg = math.degrees(math.atan2(principal_vec[1], principal_vec[0])) % 180.0
```

### 3. Image Quality & Preprocessing Engine

The system validates photos using OpenCV without relying on heavy deep-learning models for triage:
- **Blur Detection**: Calculates the variance of the Laplacian filter:
  $$\text{Blur Score} = \text{Var}(\nabla^2 I)$$
- **Duplicate Detection**: Computes a 64-bit discrete cosine transform (DCT) perceptual hash (`pHash`). Images sharing a Hamming distance $\le 5$ are flagged with duplicate warnings to prevent redundant processing.

### 4. Interactive Image Transformations (Crop & Rotate)

Implemented in [`apps/api/app/routers/upload.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/upload.py) via the endpoint:
`POST /api/v1/images/{image_id}/transform`

**Payload**:
```json
{
  "rotate_degrees": 90,
  "flip_horizontal": false,
  "flip_vertical": false,
  "crop_box": { "x": 50, "y": 80, "width": 640, "height": 480 }
}
```

**Workflow**:
1. Reads the original image, applies bounding crop, geometric rotation, and flips using OpenCV/Pillow.
2. Re-runs the 7 OpenCV quality assessments on the modified image.
3. Automatically triggers the multi-stage AI pipeline:
   - Re-evaluates ResNet-18 classification.
   - Re-runs RF-DETR / YOLO defect detection.
   - Re-runs U-Net crack segmentation.
   - Re-runs crack geometry extraction.
4. Overwrites derivative files (processed image, thumbnail, U-Net mask, geometry HUD overlay).
5. Returns updated metadata with cache-busting timestamps (`?t=...`), immediately refreshing the frontend dashboard cards and side panel inspection view.

### 5. FastAPI Backend & REST API Layer

Located in `apps/api/app/routers/`:
- [`upload.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/upload.py): Image upload, quality assessment, multi-stage AI analysis, transforms, and derivative image streaming.
- [`inspections.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/inspections.py): Inspection lifecycle management (`assigned` $\to$ `in_progress` $\to$ `review_ready` $\to$ `approved` / `rejected`), walkdown and drive-by tasks.
- [`dashboards.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/dashboards.py): Real-time SQL aggregation feeds for Inspector, Engineer, Manager, and Admin dashboards.
- [`detections.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/detections.py): CRUD operations for AI predictions and manual engineering annotations.
- [`reports.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/routers/reports.py): Formal engineering sign-off report generator producing SHA-256 verified PDF, CSV, and JSON deliverables.

### 6. Frontend Architecture & Inspection Suite

Built with React 19, TypeScript, and Tailwind CSS v4 in `frontend/src/`:
- [`inspection-new.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/inspection-new.tsx): Photo capture workspace supporting camera input, multi-file drag-and-drop, GPS acquisition, photo status cards, and live U-Net thumbnail rendering.
- [`image-quality-components.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/inspection/image-quality-components.tsx): Side panel inspection drawer featuring:
  - Before/After split compare slider (Original vs. Processed vs. U-Net Segment vs. Binary Mask).
  - Tabbed metrics: Compare, AI Model, Quality (7 checks), Pipeline, Augmentation, Metadata.
  - Interactive Crop and Rotate modal tool with live degree slider and aspect ratio locks.
  - Manual review override: Inspector/Engineer manual verdict (`Crack`, `No Crack`, `Uncertain`).
- [`crack-geometry-section.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/inspection/crack-geometry-section.tsx): HUD cards rendering crack area %, maximum thickness, total centerline length, PCA orientation, and defect severity rating.
- [`review-queue.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/review-queue.tsx): Structural review queue for senior civil engineers to inspect flagged defects, verify measurements, and execute formal sign-offs.

### 7. Database Schema & Data Persistence

Configured in [`apps/api/app/models/all_models.py`](file:///D:/project/aiml%20prime/project/infosys/apps/api/app/models/all_models.py) using SQLAlchemy 2.0 (PostgreSQL 16 / SQLite local dev mode):

| Model Table | Purpose | Key Fields |
|---|---|---|
| `users` | User accounts & RBAC status | `id`, `email`, `role`, `status` (`pending_approval`, `active`) |
| `inspections` | Inspection records & workflow state | `id`, `asset_id`, `inspector_id`, `status`, `method` |
| `inspection_images` | Captured photographs & pipeline state | `id`, `inspection_id`, `original_filename`, `is_cracked`, `crack_confidence` |
| `image_quality_reports` | OpenCV 7-point audit metrics | `id`, `image_id`, `blur_score`, `light_score`, `phash_value`, `verdict` |
| `detections` | Defect bounding boxes & classifications | `id`, `image_id`, `defect_type`, `confidence`, `box_x`, `box_y`, `box_w`, `box_h`, `source` (`ai_model` / `manual`) |
| `reports` | Formal sign-off reports & hash chains | `id`, `inspection_id`, `signed_by_user_id`, `sha256_hash`, `pdf_url` |

---

## 👥 Role-Based Access Control (RBAC)

InfraScan enforces 5 distinct roles tailored to civil infrastructure workflows:

1. **Infrastructure Inspector (`inspector`)**:
   - Executes field walkdowns and drive-by surveys.
   - Captures photos via camera or file upload.
   - Adjusts framing via Crop & Rotate tools and resolves image quality warnings.
2. **Civil / Structural Engineer (`engineer`)**:
   - Accesses the Review Queue to examine AI-detected cracks.
   - Verifies mathematical crack geometry (length, width, orientation, severity).
   - Segregates manual annotations from model predictions and grants sign-off approval.
3. **Asset & Maintenance Manager (`manager`)**:
   - Monitors bridge, road, and tunnel health dashboards.
   - Tracks defect progression over time and dispatches maintenance work orders.
4. **Maintenance Worker (`maintenance`)**:
   - Views scheduled repair orders, patch requirements, and post-repair verification tasks.
5. **Lead Administrator (`admin`)**:
   - Approves pending user accounts, manages organization settings, and audits system event logs.

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Python 3.12**
- **Node.js 20+**
- Recommended environment: `D:\project\aiml prime\.venv`

### 1. Backend Setup

```powershell
# Navigate to API directory
cd "D:\project\aiml prime\project\infosys\apps\api"

# Run database migrations and seed reference categories
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli seed
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli import-eda

# Create lead administrator account
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli create-admin --email admin@infrascan.local --name "Lead Admin"

# Start the FastAPI server (Port 8000)
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`
- **Active Model Health Status**: `http://localhost:8000/api/v1/models/active`

### 2. Frontend Setup

```powershell
# Navigate to Frontend directory
cd "D:\project\aiml prime\project\infosys\frontend"

# Install dependencies (if not already installed)
npm install

# Start Vite development server (Port 5173)
npm run dev
```

- **Web Application**: `http://localhost:5173`

---

## 🧪 Running Automated Tests

Run the complete backend regression test suite:

```powershell
cd "D:\project\aiml prime\project\infosys"

# Run all test suites
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m pytest apps/api/tests/ -v

# Run multi-stage AI model integration tests specifically
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m pytest apps/api/tests/test_model_integration.py apps/api/tests/test_two_stage_pipeline.py apps/api/tests/test_image_quality.py -v
```

Run frontend typechecking and linting:

```powershell
cd "D:\project\aiml prime\project\infosys\frontend"
npm run build
npm run lint
```

---

## 📚 Documentation Links

- [Complete Features & Technical Implementation Deep-Dive](docs/FEATURES_AND_IMPLEMENTATION.md)
- [AI Model Integration & Inspection Workflow Report](docs/AI_MODEL_INTEGRATION_AND_INSPECTION_WORKFLOW_REPORT.md)
- [Model Quick Reference Guide](MODEL_INTEGRATION_GUIDE.md)
- [API Contract Specification](docs/api-contract.yaml)
- [System Audit Report & Quality Thresholds](docs/audit-report.md)

---

## 📄 License & Compliance

InfraScan is developed for civil engineering compliance with ASTM / AASHTO infrastructure inspection standards. All AI predictions serve as decision support and require human structural engineer review prior to report issuance.