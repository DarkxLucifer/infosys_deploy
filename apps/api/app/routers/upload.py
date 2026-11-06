import os
import io
import time
import base64
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status, Response, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc
from PIL import Image
import cv2
import numpy as np

from app.config import settings
from app.database import get_db
from app.models.all_models import (
    Inspection,
    InspectionImage,
    ProcessedImage,
    ImageQualityReport,
    ImageProcessingRun,
    Detection,
    Measurement,
    User,
    AuditLog
)
from app.security.jwt import get_current_user
from app.services.image_quality import (
    assess_quality,
    preprocess_image,
    compute_sha256,
    transform_image,
    generate_augmentations,
    OPENCV_VERSION
)

router = APIRouter(prefix="", tags=["Image Capture, Quality & Preprocessing"])

logger = logging.getLogger(__name__)

API_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_DIR = os.path.dirname(API_DIR)

def resolve_storage_dir(subdir: str) -> str:
    candidates = [
        os.path.join(API_DIR, "storage", subdir),
        os.path.join(PROJECT_DIR, "storage", subdir),
        os.path.join(os.getcwd(), "storage", subdir)
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    target = os.path.join(API_DIR, "storage", subdir)
    os.makedirs(target, exist_ok=True)
    return target

UPLOAD_DIR = resolve_storage_dir("uploads")
THUMBNAIL_DIR = resolve_storage_dir("thumbnails")
PROCESSED_DIR = resolve_storage_dir("processed")
YOLO_DIR = resolve_storage_dir("yolo")
RFDETR_DIR = resolve_storage_dir("rfdetr")
UNET_DIR = resolve_storage_dir("unet")
GEOMETRY_DIR = resolve_storage_dir("geometry")

for d in [UPLOAD_DIR, THUMBNAIL_DIR, PROCESSED_DIR, YOLO_DIR, RFDETR_DIR, UNET_DIR, GEOMETRY_DIR]:
    os.makedirs(d, exist_ok=True)

def find_stored_file(subdir: str, filename: str) -> Optional[str]:
    candidates = [
        os.path.join(API_DIR, "storage", subdir, filename),
        os.path.join(PROJECT_DIR, "storage", subdir, filename),
        os.path.join(os.getcwd(), "storage", subdir, filename)
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

ALLOWED_UPLOAD_ROLES = {"admin", "manager", "engineer", "civil-engineer", "inspector"}

def require_upload_permission(user: User, inspection: Optional[Inspection] = None):
    """Enforces Section 1 & Check J9: Upload permissions."""
    user_role = (user.role or "").lower()
    if user_role not in ALLOWED_UPLOAD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Your role is not authorized to upload inspection imagery."}
        )
    if inspection and user_role == "inspector" and inspection.inspector_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Inspectors can only upload to their assigned inspections."}
        )

def enforce_image_visibility(
    user: User,
    image: InspectionImage,
    inspection: Optional[Inspection],
    is_quality_or_processed: bool = False
):
    """
    Enforces Section 6.5 Role Visibility Rules in API:
    - Infrastructure Inspector: Everything for their own inspections.
    - Civil Engineer and Administrator: Everything for any inspection in the organisation.
    - Infrastructure Manager and Maintenance Engineer: NEVER quality reports or processed copies.
      They see reviewed original images only.
    """
    user_role = (user.role or "").lower()

    # Cross-organization isolation
    if image.organization_id != user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Cross-organization image access denied."}
        )

    # Manager / Maintenance: strictly forbidden from quality reports or intermediate processed copies
    if user_role in ("manager", "maintenance"):
        if is_quality_or_processed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ACCESS_DENIED",
                    "message": "Managers and Maintenance personnel are not authorized to view raw quality reports or intermediate preprocessed files."
                }
            )
        # If viewing original, inspection must be reviewed
        if inspection and inspection.status not in ("reviewed", "reported", "closed"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "UNREVIEWED_ACCESS_BLOCKED",
                    "message": "Unreviewed inspection imagery is restricted to field inspectors and civil engineers."
                }
            )

    # Inspector isolation: can only view own inspection images
    if user_role == "inspector" and inspection and inspection.inspector_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Inspectors can only access imagery from their assigned inspections."}
        )


class ScaleCalibrationRequest(BaseModel):
    method: str = Field(..., description="'manual_line' or 'mm_per_pixel'")
    mm_per_pixel: Optional[float] = Field(None, gt=0.0, description="Millimetres per pixel (must be > 0)")
    reference_line_length_mm: Optional[float] = Field(None, gt=0.0, description="Real physical length in mm")
    pixel_length: Optional[float] = Field(None, gt=0.0, description="Length in pixels")
    reference_p1: Optional[List[float]] = Field(None, description="[x1, y1] line start in pixels")
    reference_p2: Optional[List[float]] = Field(None, description="[x2, y2] line end in pixels")
    width_metric: Optional[str] = Field("maximum", description="'maximum' or 'average'")


class ImageTransformRequest(BaseModel):
    rotation_deg: Optional[int] = Field(0, description="0, 90, 180, 270")
    crop_x: Optional[int] = Field(None, description="Crop origin X in px")
    crop_y: Optional[int] = Field(None, description="Crop origin Y in px")
    crop_w: Optional[int] = Field(None, description="Crop width in px")
    crop_h: Optional[int] = Field(None, description="Crop height in px")
    flip_h: Optional[bool] = Field(False, description="Flip horizontal")
    flip_v: Optional[bool] = Field(False, description="Flip vertical")
    src_quad: Optional[List[List[int]]] = Field(None, description="Perspective quadrilateral [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]")


class DatasetImportRequest(BaseModel):
    sample_id: str
    inspection_id: str


# Public Benchmark Dataset Catalog (PDF §5.3 Image Sources: Public infrastructure datasets)
DATASET_SAMPLES = [
    {
        "id": "SDNET-01",
        "dataset": "SDNET2018",
        "title": "Bridge Deck Concrete Crack (0.35mm)",
        "defect_type": "longitudinal_crack",
        "surface": "concrete_bridge_deck",
        "resolution": "1920x1080",
        "estimated_width_mm": 0.35,
        "description": "Longitudinal drying shrinkage crack on reinforced bridge deck surface.",
        "source": "dataset",
        "tags": ["SDNET2018", "Bridge Deck", "0.35mm", "Longitudinal"]
    },
    {
        "id": "METU-02",
        "dataset": "METU_CCIC",
        "title": "Concrete Shear Wall Shear Crack (0.80mm)",
        "defect_type": "transverse_crack",
        "surface": "reinforced_concrete_wall",
        "resolution": "1920x1080",
        "estimated_width_mm": 0.80,
        "description": "Structural shear crack with pronounced aggregate separation.",
        "source": "dataset",
        "tags": ["METU/CCIC", "Shear Wall", "0.80mm", "Transverse"]
    },
    {
        "id": "RDD-03",
        "dataset": "RDD2022",
        "title": "Corridor Pavement Fatigue Cracking",
        "defect_type": "alligator_crack",
        "surface": "asphalt_concrete_deck",
        "resolution": "1920x1080",
        "estimated_width_mm": 1.20,
        "description": "Multi-axis fatigue cracking on traffic-wearing surface.",
        "source": "dataset",
        "tags": ["RDD2022", "Pavement", "1.20mm", "Alligator"]
    },
    {
        "id": "CRACK500-04",
        "dataset": "CRACK500",
        "title": "Bridge Pier Cap Concrete Spalling & Fracture",
        "defect_type": "spalling",
        "surface": "concrete_pier_cap",
        "resolution": "1920x1080",
        "estimated_width_mm": 2.50,
        "description": "Concrete delamination and spall with exposed aggregate.",
        "source": "dataset",
        "tags": ["CRACK500", "Pier Cap", "Spalling", "2.50mm"]
    },
    {
        "id": "DRONE-05",
        "dataset": "DRONE_SURVEY",
        "title": "Aerial High-Resolution Drone Pier Survey",
        "defect_type": "hairline_crack",
        "surface": "bridge_pier_column",
        "resolution": "3840x2160",
        "estimated_width_mm": 0.18,
        "description": "4K aerial survey orthomosaic tile captured by UAV at 12m standoff.",
        "source": "drone",
        "drone_altitude": 12.5,
        "drone_gimbal_pitch": -45.0,
        "tags": ["UAV Survey", "4K", "Hairline", "Pier Column"]
    }
]

def generate_benchmark_sample_bytes(sample: Dict[str, Any]) -> bytes:
    """Generates realistic synthetic concrete crack images for benchmark dataset imports."""
    width, height = 1920, 1080
    if sample.get("resolution") == "3840x2160":
        width, height = 3840, 2160

    img = np.full((height, width, 3), 130, dtype=np.uint8)
    np.random.seed(abs(hash(sample["id"])) % 10000)

    # Concrete aggregate texture
    noise = np.random.normal(0, 14, (height, width, 3)).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # Draw distinctive cracks based on defect type
    dtype = sample.get("defect_type", "longitudinal_crack")
    if dtype == "longitudinal_crack":
        pts = np.array([[width//2 - 50, 50], [width//2 - 20, height//3], [width//2 + 30, 2*height//3], [width//2, height - 50]], np.int32)
        cv2.polylines(img, [pts], isClosed=False, color=(30, 30, 30), thickness=3)
    elif dtype == "transverse_crack":
        pts = np.array([[100, height//2 - 30], [width//3, height//2 + 20], [2*width//3, height//2 - 10], [width - 100, height//2 + 40]], np.int32)
        cv2.polylines(img, [pts], isClosed=False, color=(25, 25, 25), thickness=4)
    elif dtype == "alligator_crack":
        for i in range(5):
            cx, cy = width//2 + (i-2)*150, height//2 + ((i%2)-1)*100
            cv2.ellipse(img, (cx, cy), (120, 80), i*30, 0, 360, (35, 35, 35), 2)
    elif dtype == "spalling":
        cv2.ellipse(img, (width//2, height//2), (300, 180), 15, 0, 360, (70, 70, 70), -1)
        cv2.ellipse(img, (width//2, height//2), (280, 160), 15, 0, 360, (40, 40, 40), 3)
    else:  # hairline crack
        pts = np.array([[width//3, 100], [width//3 + 40, height//2], [width//3 + 80, height - 100]], np.int32)
        cv2.polylines(img, [pts], isClosed=False, color=(45, 45, 45), thickness=1)

    cv2.putText(img, f"[{sample['dataset']}] {sample['title']}", (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (230, 230, 230), 2)

    buf = io.BytesIO()
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def run_and_persist_ai_classification(
    image: InspectionImage,
    target_path: str,
    db: Session,
    user_id: str,
    inspection_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Multi-Stage Deep Learning Pipeline:
    1. Stage 1: ResNet-18 Multi-Scale Spatial Classifier assesses concrete crack probability (threshold 80%).
    2. Stage 2A: If cracked, YOLOv8 defect localizer runs on the preprocessed image (imgsz 768px),
       generates the annotated visual result image (saved to storage/yolo/{id}.jpg),
       and records defect bounding box detections (Longitudinal, Transverse, Alligator, Pothole).
    3. Stage 2B: If cracked, UNet pixel-level crack segmentation runs on the image (imgsz 384px),
       generates the neon crimson overlay image (saved to storage/unet/{id}.jpg) and binary mask
       (saved to storage/unet/{id}_mask.png), computing crack area %, max thickness (px/mm),
       and length (px/mm).
    """
    if not target_path or not os.path.exists(target_path):
        return None
    try:
        from app.services.classifier import get_classifier
        clf = get_classifier()
        pred = clf.predict(target_path)
        if pred and pred.get("success"):
            qr = dict(image.quality_report or {})
            qr["ai_classification"] = pred

            has_crack = bool(pred.get("has_crack", False))
            p_crack = float(pred.get("crack_probability", 0.0))
            rfdetr_result = None
            unet_result = None
            yolo_result = None

            # Stage 2: Always run localized detection and pixel segmentation for concrete inspection
            proc_target = image.processed_path if (image.processed_path and os.path.exists(image.processed_path)) else target_path

            # Stage 2A: Run RF-DETR Medium Defect Detector (RDD2022)
            try:
                from app.services.rfdetr_detector import get_rfdetr_detector
                rfdetr_detector = get_rfdetr_detector()
                rfdetr_ann_path = os.path.join(RFDETR_DIR, f"{image.id}.jpg")
                rfdetr_thumb_path = os.path.join(THUMBNAIL_DIR, f"{image.id}_rfdetr.jpg")
                rfdetr_result = rfdetr_detector.detect(
                    image_input=proc_target,
                    threshold=0.20,
                    save_annotated_path=rfdetr_ann_path,
                    save_thumbnail_path=rfdetr_thumb_path,
                    resnet_confidence=p_crack
                )
                qr["rfdetr_detection"] = rfdetr_result
                pred["rfdetr_detection"] = rfdetr_result
            except Exception as rfdetr_exc:
                logger.warning("RF-DETR crack detection failed for image %s: %s", image.id, rfdetr_exc)

            # Stage 2B: Run YOLOv8 Crack Detector
            try:
                from app.services.yolo_detector import get_yolo_detector
                yolo_detector = get_yolo_detector()
                yolo_ann_path = os.path.join(YOLO_DIR, f"{image.id}.jpg")
                yolo_result = yolo_detector.detect(
                    image_input=proc_target,
                    conf=0.10,
                    imgsz=768,
                    save_annotated_path=yolo_ann_path
                )
                qr["yolo_detection"] = yolo_result
                pred["yolo_detection"] = yolo_result
            except Exception as yolo_exc:
                logger.warning("YOLO crack detection failed for image %s: %s", image.id, yolo_exc)

            # Stage 2C: Run U-Net Pixel-Level Crack Segmentation (CrackSeg9k)
            try:
                from app.services.unet_segmentor import get_unet_segmentor
                segmentor = get_unet_segmentor()
                unet_ann_path = os.path.join(UNET_DIR, f"{image.id}.jpg")
                unet_mask_path = os.path.join(UNET_DIR, f"{image.id}_mask.png")
                mm_scale = None
                if image.calibration and isinstance(image.calibration, dict):
                    mm_scale = image.calibration.get("mm_per_pixel")
                unet_result = segmentor.segment(
                    image_input=proc_target,
                    threshold=0.5,
                    save_overlay_path=unet_ann_path,
                    save_mask_path=unet_mask_path,
                    mm_per_pixel=mm_scale
                )
                qr["unet_segmentation"] = unet_result
                pred["unet_segmentation"] = unet_result

                # Stage 2D: Crack Geometry Extraction (Area, Coverage %, Centerline, EDT Width, PCA Orientation)
                try:
                    from app.services.crack_geometry import extract_crack_geometry
                    geo_ann_path = os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
                    orig_target = image.original_path if (image.original_path and os.path.exists(image.original_path)) else proc_target
                    geo_result = extract_crack_geometry(
                        original_image=orig_target,
                        binary_mask=unet_mask_path,
                        orig_w=image.width,
                        orig_h=image.height,
                        calibration=image.calibration if isinstance(image.calibration, dict) else None,
                        mm_per_pixel=mm_scale,
                        generate_visualization=True,
                        visualization_save_path=geo_ann_path
                    )
                    qr["crack_geometry"] = geo_result
                    pred["crack_geometry"] = geo_result
                except Exception as geo_exc:
                    logger.warning("Crack geometry extraction failed for image %s: %s", image.id, geo_exc)
            except Exception as unet_exc:
                logger.warning("UNet crack segmentation failed for image %s: %s", image.id, unet_exc)

            rfdetr_has_defects = bool(rfdetr_result and rfdetr_result.get("has_defect"))
            if not rfdetr_has_defects:
                qr["active_stage2_model"] = "unet_fallback"
                pred["active_stage2_model"] = "unet_fallback"
                pred["model_fallback"] = True
            else:
                qr["active_stage2_model"] = "rfdetr"
                pred["active_stage2_model"] = "rfdetr"
                pred["model_fallback"] = False

            image.quality_report = qr

            # Clean prior AI detections & associated measurements for this image
            old_det_ids = [d[0] for d in db.query(Detection.id).filter(
                Detection.image_id == image.id,
                Detection.source == "ai_model"
            ).all()]
            if old_det_ids:
                db.query(Measurement).filter(Measurement.detection_id.in_(old_det_ids)).delete(synchronize_session=False)
                db.query(Detection).filter(Detection.id.in_(old_det_ids)).delete(synchronize_session=False)

            insp_id = inspection_id or image.inspection_id
            if insp_id:
                # 1. Compute Crack Geometry & Multi-Factor Damage Severity Assessment
                geo_data = qr.get("crack_geometry") if isinstance(qr, dict) else None
                geo_sum = geo_data.get("summary", {}) if (geo_data and geo_data.get("success")) else {}
                sev_info = geo_sum.get("severity_assessment", {})
                dmg_assessment = None
                geo_sev = None

                if geo_sum:
                    from app.services.damage_assessment import assess_photo_damage_severity
                    photo_metrics = {
                        "has_cracks": geo_sum.get("crack_count", 0) > 0,
                        "crack_count": geo_sum.get("crack_count", 0),
                        "crack_area_px": geo_sum.get("total_crack_area_px", 0.0),
                        "surface_area_px": geo_sum.get("inspected_surface_area_px", 0.0),
                        "crack_density_pct": geo_sum.get("crack_coverage_pct", 0.0),
                        "maximum_crack_width_px": geo_sum.get("maximum_crack_width_px", 0.0),
                        "average_crack_width_px": geo_sum.get("average_crack_width_px", 0.0),
                        "maximum_crack_width_mm": geo_sum.get("maximum_crack_width_mm"),
                        "average_crack_width_mm": geo_sum.get("average_crack_width_mm"),
                        "total_crack_length_px": geo_sum.get("total_crack_length_px", 0.0),
                        "total_branch_count": geo_sum.get("total_branch_count", 0),
                        "image_width": image.width,
                        "image_height": image.height,
                        "is_calibrated": geo_sum.get("is_calibrated"),
                        "mm_per_pixel": geo_sum.get("mm_per_pixel")
                    }
                    defect_override = rfdetr_result.get("top_class") if (has_crack and rfdetr_result) else None
                    dmg_assessment = assess_photo_damage_severity(
                        photo_metrics,
                        calibration=image.calibration if isinstance(image.calibration, dict) else None,
                        defect_type=defect_override
                    )
                    geo_sum["damage_assessment"] = dmg_assessment
                    qr["damage_assessment"] = dmg_assessment
                    pred["damage_assessment"] = dmg_assessment
                    geo_sev = dmg_assessment.get("severity_code")

                # 2. Determine Primary Defect Type & Controlling Severity
                rf_has_def = bool(rfdetr_result and rfdetr_result.get("has_defect"))
                unet_has_crk = bool(unet_result and unet_result.get("has_crack"))
                is_damaged = has_crack or rf_has_def or unet_has_crk

                if rf_has_def and rfdetr_result.get("primary_defect"):
                    primary_defect = rfdetr_result.get("primary_defect")
                elif is_damaged:
                    primary_defect = "crack"
                else:
                    primary_defect = "uncracked"

                if geo_sev:
                    final_severity = geo_sev
                elif is_damaged:
                    final_severity = "severe" if p_crack >= 0.95 else ("moderate" if p_crack >= 0.70 else "minor")
                else:
                    final_severity = "no_visible_damage"

                # 3. Best Confidence Across Pipelines
                best_conf = float(max(
                    p_crack if has_crack else pred.get("uncracked_probability", 0.89),
                    rfdetr_result.get("confidence", 0.0) if rfdetr_result else 0.0,
                    unet_result.get("mean_crack_confidence", 0.0) if unet_result else 0.0
                ))

                # 4. Synthesize Combined Human-Readable Findings Note
                if is_damaged:
                    notes_parts = []
                    if rf_has_def and rfdetr_result.get("num_detections"):
                        notes_parts.append(f"RF-DETR: {rfdetr_result.get('num_detections')} defect regions detected ({rfdetr_result.get('primary_label')}).")
                    if unet_has_crk:
                        notes_parts.append(f"UNet: {unet_result.get('crack_area_pct')}% crack surface area ({unet_result.get('crack_pixels'):,} px), max thickness {unet_result.get('max_width_px')}px.")
                    if dmg_assessment and dmg_assessment.get("severity"):
                        notes_parts.append(f"Damage: {dmg_assessment['severity']}.")
                    unified_note = " ".join(notes_parts) if notes_parts else f"AI Pipeline: Defect detected ({best_conf:.1%} confidence)."
                else:
                    unified_note = f"ResNet-18: Sound concrete / Uncracked ({pred.get('uncracked_probability', 1.0 - p_crack):.1%} confidence)."

                # 5. Persist EXACTLY ONE Unified Detection Record per Image
                unified_det = Detection(
                    inspection_id=insp_id,
                    image_id=image.id,
                    source="ai_model",
                    defect_type=primary_defect,
                    geometry={
                        "type": "unified_crack_detection",
                        "model": "InfraScan AI Pipeline (ResNet-18 + RF-DETR + UNet)",
                        "predicted_class": pred.get("predicted_class", "Uncertain"),
                        "probabilities": {
                            "uncracked": pred.get("uncracked_probability", 0.0),
                            "cracked": p_crack
                        },
                        "threshold": pred.get("threshold", 0.80),
                        "rfdetr": {
                            "has_defect": rf_has_def,
                            "num_detections": rfdetr_result.get("num_detections", 0) if rfdetr_result else 0,
                            "primary_defect": rfdetr_result.get("primary_defect") if rfdetr_result else None,
                            "primary_label": rfdetr_result.get("primary_label") if rfdetr_result else None,
                            "detections": rfdetr_result.get("detections", []) if rfdetr_result else [],
                        },
                        "unet": {
                            "has_crack": unet_has_crk,
                            "crack_area_pct": unet_result.get("crack_area_pct", 0) if unet_result else 0,
                            "crack_pixels": unet_result.get("crack_pixels", 0) if unet_result else 0,
                            "max_width_px": unet_result.get("max_width_px", 0) if unet_result else 0,
                            "max_width_mm": unet_result.get("max_width_mm") if unet_result else None,
                            "total_length_px": unet_result.get("total_length_px", 0) if unet_result else 0,
                            "total_length_mm": unet_result.get("total_length_mm") if unet_result else None,
                            "mean_crack_confidence": unet_result.get("mean_crack_confidence") if unet_result else None,
                        },
                        "crack_geometry": geo_sum if geo_sum else None,
                        "damage_assessment": dmg_assessment if dmg_assessment else None,
                    },
                    severity=final_severity,
                    created_by=user_id,
                    confidence=best_conf,
                    model_id="InfraScan AI Pipeline (ResNet-18 + RF-DETR + UNet)",
                    notes=unified_note
                )
                db.add(unified_det)
                db.flush()

                # 6. Persist Associated Single Measurement Record
                is_cal = bool(geo_sum.get("is_calibrated")) if geo_sum else False
                length_val = float(geo_sum.get("total_crack_length_mm") if is_cal and geo_sum.get("total_crack_length_mm") is not None else (geo_sum.get("total_crack_length_px", 0.0) if geo_sum else (unet_result.get("total_length_px", 0.0) if unet_result else 0.0)))
                avg_w_val = float(geo_sum.get("average_crack_width_mm") if is_cal and geo_sum.get("average_crack_width_mm") is not None else (geo_sum.get("average_crack_width_px", 0.0) if geo_sum else 0.0))
                max_w_val = float(geo_sum.get("maximum_crack_width_mm") if is_cal and geo_sum.get("maximum_crack_width_mm") is not None else (geo_sum.get("maximum_crack_width_px", 0.0) if geo_sum else (unet_result.get("max_width_px", 0.0) if unet_result else 0.0)))
                area_val = float(geo_sum.get("total_crack_area_mm2") if is_cal and geo_sum.get("total_crack_area_mm2") is not None else (geo_sum.get("total_crack_area_px", 0.0) if geo_sum else (unet_result.get("crack_pixels", 0.0) if unet_result else 0.0)))
                density_val = float(geo_sum.get("crack_coverage_pct", 0.0) if geo_sum else (unet_result.get("crack_area_pct", 0.0) if unet_result else 0.0))

                meas = Measurement(
                    detection_id=unified_det.id,
                    length=length_val,
                    avg_width=avg_w_val,
                    max_width=max_w_val,
                    area=area_val,
                    unit="mm" if is_cal else "px",
                    calibrated=is_cal,
                    density=density_val
                )
                db.add(meas)

            return pred
    except Exception as exc:
        logger.warning("Auto AI classification failed for image %s: %s", image.id, exc)
    return None


# ─── Configuration Limits Endpoint ──────────────────────────────────────────

@router.get("/config/image-limits")
def get_image_limits():
    """
    Section 7: Returns safe configuration limits and thresholds for UI client pre-check
    and Photo Quality Guide card. Resolution limit is removed per specification.
    """
    return {
        "allowed_formats": ["JPEG", "PNG", "TIFF", "WEBP", "BMP", "HEIC"],
        "max_size_mb": settings.MAX_FILE_SIZE_MB,
        "max_file_size_bytes": settings.MAX_FILE_SIZE_MB * 1024 * 1024,
        "resolution_limit_enforced": False,
        "min_resolution": {
            "width": 0,
            "height": 0,
        },
        "min_long_side": 0,
        "min_short_side": 0,
        "thresholds": {
            "blur_variance_warn": settings.BLUR_WARN,
            "blur_variance_fail": settings.BLUR_FAIL,
            "mean_brightness_warn": settings.LIGHT_WARN,
            "mean_brightness_fail": settings.LIGHT_FAIL,
            "dup_hamming_max": settings.DUP_HAMMING_MAX,
        },
        "blur_warn": settings.BLUR_WARN,
        "blur_fail": settings.BLUR_FAIL,
        "light_warn": settings.LIGHT_WARN,
        "light_fail": settings.LIGHT_FAIL,
        "dup_hamming_max": settings.DUP_HAMMING_MAX,
        "processed_max_side": settings.PROCESSED_MAX_SIDE,
        "tile_threshold_px": settings.TILE_THRESHOLD_PX
    }


# ─── Image Assessment Endpoint ───────────────────────────────────────────────

@router.post("/images/assess")
async def assess_image_endpoint(
    file: UploadFile = File(...),
    inspection_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Section 4 & Step 1: Quality assessment of image file bytes without persisting.
    Executes seven classical vision checks and returns structured report JSON.
    """
    file_bytes = await file.read()
    filename = file.filename or "photo.jpg"

    asset_id = None
    if inspection_id:
        insp = db.query(Inspection).filter(
            Inspection.id == inspection_id,
            Inspection.organization_id == current_user.organization_id
        ).first()
        if insp:
            asset_id = insp.asset_id

    report = assess_quality(
        file_bytes,
        filename=filename,
        db_session=db,
        inspection_id=inspection_id,
        asset_id=asset_id
    )

    return report


# ─── Unified Image Upload Endpoint ───────────────────────────────────────────

@router.post("/images/upload", status_code=status.HTTP_201_CREATED)
@router.post("/inspections/{inspection_id}/images", status_code=status.HTTP_201_CREATED)
async def upload_image_endpoint(
    inspection_id: Optional[str] = None,
    file: UploadFile = File(...),
    source: str = Form("upload"),
    allow_warning: bool = Form(False),
    gps_lat: Optional[float] = Form(None),
    gps_lng: Optional[float] = Form(None),
    drone_altitude: Optional[float] = Form(None),
    drone_gimbal_pitch: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sections 3, 4, 5 & 7:
    1. Runs full 7-check quality assessment.
    2. If hard rejected (or warning not confirmed): returns HTTP 422 with structured report.
    3. If accepted or confirmed: saves original, runs deterministic preprocessing,
       saves preview & thumbnail, records run metrics and transforms in database.
    """
    # Resolve inspection
    inspection: Optional[Inspection] = None
    if inspection_id:
        inspection = db.query(Inspection).filter(
            Inspection.id == inspection_id,
            Inspection.organization_id == current_user.organization_id
        ).first()
        if not inspection:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    else:
        # Default to user's most recent active inspection if not specified
        inspection = db.query(Inspection).filter(
            Inspection.organization_id == current_user.organization_id
        ).order_by(desc(Inspection.created_at)).first()

    require_upload_permission(current_user, inspection)

    file_bytes = await file.read()
    filename = file.filename or "uploaded_photo.jpg"

    # Step 1: Full 7-check Quality Assessment
    report = assess_quality(
        file_bytes,
        filename=filename,
        db_session=db,
        inspection_id=inspection.id if inspection else None,
        asset_id=inspection.asset_id if inspection else None
    )

    if drone_altitude is not None or drone_gimbal_pitch is not None:
        report["drone"] = {
            "altitude_m": drone_altitude,
            "gimbal_pitch_deg": drone_gimbal_pitch
        }
        if source == "upload":
            source = "drone"

    overall = report["overall"]  # accepted, warning, rejected

    # Enforcement: Hard rejected files are never saved or processed
    if overall == "rejected":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "IMAGE_QUALITY_REJECTED",
                "message": report["reason"],
                "report": report
            }
        )

    # Enforcement: Warnings require explicit user confirmation before preprocessing
    # If not allowed yet, image is saved with quality_status='warning' and processing_status='not_started'
    sha_hash = report["metrics"].get("sha256") or compute_sha256(file_bytes)
    phash_val = report["metrics"].get("phash") or "0000000000000000"

    # Save original image to disk
    insp_prefix = inspection.id if inspection else "standalone"
    orig_filename = f"{insp_prefix}_{sha_hash[:12]}_{filename}"
    orig_path = os.path.join(UPLOAD_DIR, orig_filename)
    with open(orig_path, "wb") as f:
        f.write(file_bytes)

    # Extract GPS override if provided
    exif_gps = report.get("exif", {}).get("gps")
    final_lat = gps_lat if gps_lat is not None else (exif_gps.get("lat") if exif_gps else None)
    final_lng = gps_lng if gps_lng is not None else (exif_gps.get("lng") if exif_gps else None)

    # Initial image DB record
    quality_status = "warning" if (overall == "warning" and not allow_warning) else "accepted"
    if allow_warning and overall == "warning":
        quality_status = "accepted"

    img_record = InspectionImage(
        organization_id=current_user.organization_id,
        inspection_id=inspection.id if inspection else "standalone",
        uploader_id=current_user.id,
        filename=filename,
        original_path=orig_path,
        thumbnail_path=None,
        processed_path=None,
        sha256=sha_hash,
        phash=phash_val,
        width=report["metrics"].get("width", 1920),
        height=report["metrics"].get("height", 1080),
        file_size=len(file_bytes),
        exif_lat=final_lat,
        exif_lng=final_lng,
        exif_captured_at=datetime.now(timezone.utc),
        source=source,
        status="valid" if quality_status == "accepted" else "warned",
        quality_status=quality_status,
        processing_status="queued" if quality_status == "accepted" else "not_started",
        warning_confirmed_by=current_user.id if (allow_warning and overall == "warning") else None,
        warning_confirmed_at=datetime.now(timezone.utc) if (allow_warning and overall == "warning") else None,
        quality_report=report
    )
    db.add(img_record)
    db.flush()

    # Record ImageQualityReport in separate table
    quality_report_row = ImageQualityReport(
        image_id=img_record.id,
        overall=overall,
        checks=report["checks"],
        config_snapshot=report["config_snapshot"]
    )
    db.add(quality_report_row)

    # Step 2: Automatic Preprocessing (Profile: general_v1) - for accepted and warning images
    is_blur_warn = any(c["key"] == "blur" and c["status"] == "warn" for c in report["checks"])
    proc_path = None
    if quality_status in ("accepted", "warning") and overall != "rejected":
        try:
            img_record.processing_status = "running"
            db.flush()

            proc_bytes, thumb_bytes, run_record = preprocess_image(
                file_bytes,
                profile_name="general_v1",
                blur_warning=is_blur_warn
            )

            proc_filename = f"proc_{img_record.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
            proc_path = os.path.join(PROCESSED_DIR, proc_filename)
            with open(proc_path, "wb") as f:
                f.write(proc_bytes)

            thumb_filename = f"thumb_{img_record.id}_{sha_hash[:10]}.jpg"
            thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
            with open(thumb_path, "wb") as f:
                f.write(thumb_bytes)

            img_record.processed_path = proc_path
            img_record.thumbnail_path = thumb_path
            img_record.processing_status = "complete"

            # Record ImageProcessingRun
            proc_run = ImageProcessingRun(
                image_id=img_record.id,
                profile="general_v1",
                profile_version=run_record["profile_version"],
                status="complete",
                steps=run_record["steps"],
                metrics_before=run_record["metrics_before"],
                metrics_after=run_record["metrics_after"],
                transform=run_record["transform"],
                tiles=run_record["tiles"],
                processed_path=proc_path,
                thumbnail_path=thumb_path,
                processed_sha256=run_record["processed_sha256"],
                width=run_record["width"],
                height=run_record["height"],
                opencv_version=OPENCV_VERSION,
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
                retry_count=0
            )
            db.add(proc_run)

            # Also store in legacy ProcessedImage table for backwards compatibility
            legacy_proc = ProcessedImage(
                image_id=img_record.id,
                profile_name="general_v1",
                steps_applied=run_record["steps"],
                output_path=proc_path,
                checksum=run_record["processed_sha256"]
            )
            db.add(legacy_proc)
        except Exception as exc:
            logger.warning("Preprocessing failed for %s: %s", img_record.id, exc)
            img_record.processing_status = "failed"
            failed_run = ImageProcessingRun(
                image_id=img_record.id,
                profile="general_v1",
                profile_version="1.0.0",
                status="failed",
                steps=[],
                processed_path="",
                processed_sha256="",
                error_code=str(exc)
            )
            db.add(failed_run)

    # Step 3: Run Multi-Stage AI classification & defect detection on uploaded image
    classify_target = proc_path if (proc_path and os.path.exists(proc_path)) else orig_path
    pred = run_and_persist_ai_classification(
        image=img_record,
        target_path=classify_target,
        db=db,
        user_id=current_user.id,
        inspection_id=inspection.id if inspection else None
    )
    if pred:
        report["ai_classification"] = pred
        if pred.get("yolo_detection"):
            report["yolo_detection"] = pred["yolo_detection"]
        if pred.get("unet_segmentation"):
            report["unet_segmentation"] = pred["unet_segmentation"]
        if pred.get("crack_geometry"):
            report["crack_geometry"] = pred["crack_geometry"]
        if pred.get("damage_assessment"):
            report["damage_assessment"] = pred["damage_assessment"]

    if inspection and inspection.status in ("draft", "assigned", "in_progress"):
        inspection.status = "images_uploaded"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_UPLOAD",
        entity_type="inspection_image",
        entity_id=img_record.id,
        details={"filename": filename, "sha256": sha_hash, "quality": overall}
    )
    db.add(audit)
    db.commit()
    db.refresh(img_record)

    ai_clf = report.get("ai_classification") if isinstance(report, dict) else None
    rfdetr_det = (report.get("rfdetr_detection") if isinstance(report, dict) else None) or (ai_clf.get("rfdetr_detection") if isinstance(ai_clf, dict) else None)
    active_stage2_model = (report.get("active_stage2_model") if isinstance(report, dict) else None) or (ai_clf.get("active_stage2_model") if isinstance(ai_clf, dict) else None)
    model_fallback = bool(report.get("model_fallback") if isinstance(report, dict) else (ai_clf.get("model_fallback") if isinstance(ai_clf, dict) else False))
    yolo_det = (report.get("yolo_detection") if isinstance(report, dict) else None) or (ai_clf.get("yolo_detection") if isinstance(ai_clf, dict) else None)
    unet_seg = (report.get("unet_segmentation") if isinstance(report, dict) else None) or (ai_clf.get("unet_segmentation") if isinstance(ai_clf, dict) else None)
    crack_geo = (
        (report.get("crack_geometry") if isinstance(report, dict) else None)
        or (ai_clf.get("crack_geometry") if isinstance(ai_clf, dict) else None)
        or (img_record.quality_report.get("crack_geometry") if (img_record.quality_report and isinstance(img_record.quality_report, dict)) else None)
    )
    dmg_assess = (
        (report.get("damage_assessment") if isinstance(report, dict) else None)
        or (ai_clf.get("damage_assessment") if isinstance(ai_clf, dict) else None)
        or (crack_geo.get("summary", {}).get("damage_assessment") if (crack_geo and isinstance(crack_geo, dict)) else None)
        or (img_record.quality_report.get("damage_assessment") if (img_record.quality_report and isinstance(img_record.quality_report, dict)) else None)
    )

    rfdetr_file = find_stored_file("rfdetr", f"{img_record.id}.jpg")
    yolo_file = find_stored_file("yolo", f"{img_record.id}.jpg")
    unet_file = find_stored_file("unet", f"{img_record.id}.jpg")
    unet_mask_file = find_stored_file("unet", f"{img_record.id}_mask.png")
    has_rfdetr = bool(rfdetr_file and os.path.exists(rfdetr_file))
    has_yolo = bool(yolo_file and os.path.exists(yolo_file))
    has_unet = bool(unet_file and os.path.exists(unet_file))

    p_crack = float(ai_clf.get("crack_probability", 0.0)) if isinstance(ai_clf, dict) else 0.0
    is_crack_defect = bool(
        p_crack >= 0.80 or
        (isinstance(ai_clf, dict) and ai_clf.get("has_crack")) or
        (rfdetr_det and rfdetr_det.get("has_defect")) or
        (unet_seg and (unet_seg.get("has_crack") or (unet_seg.get("crack_area_pct") or 0) > 0)) or
        getattr(img_record, "is_cracked", False)
    )

    # Display UNet segmentation result image as default preview / thumbnail for cracked images
    default_preview = f"/api/v1/images/{img_record.id}/file?variant=processed"
    if (is_crack_defect or has_unet) and unet_file and os.path.exists(unet_file):
        default_preview = f"/api/v1/images/{img_record.id}/file?variant=unet"
    elif is_crack_defect and has_unet:
        default_preview = f"/api/v1/images/{img_record.id}/file?variant=unet"
    elif has_rfdetr and not model_fallback:
        default_preview = f"/api/v1/images/{img_record.id}/file?variant=rfdetr"
    elif has_unet:
        default_preview = f"/api/v1/images/{img_record.id}/file?variant=unet"

    return {
        "id": img_record.id,
        "inspectionId": img_record.inspection_id,
        "filename": img_record.filename,
        "width": img_record.width,
        "height": img_record.height,
        "fileSize": img_record.file_size,
        "status": img_record.status,
        "quality_status": img_record.quality_status,
        "processing_status": img_record.processing_status,
        "sha256": img_record.sha256,
        "phash": img_record.phash,
        "qualityReport": report,
        "quality_report": report,
        "aiClassification": ai_clf,
        "ai_classification": ai_clf,
        "hasRfdetr": has_rfdetr,
        "has_rfdetr": has_rfdetr,
        "rfdetrDetection": rfdetr_det,
        "rfdetr_detection": rfdetr_det,
        "activeStage2Model": active_stage2_model,
        "active_stage2_model": active_stage2_model,
        "modelFallback": model_fallback,
        "model_fallback": model_fallback,
        "yoloDetection": yolo_det,
        "yolo_detection": yolo_det,
        "unetSegmentation": unet_seg,
        "unet_segmentation": unet_seg,
        "hasYolo": has_yolo,
        "has_yolo": has_yolo,
        "hasUnet": has_unet,
        "has_unet": has_unet,
        "hasGeometry": bool(crack_geo),
        "has_geometry": bool(crack_geo),
        "crackGeometry": crack_geo,
        "crack_geometry": crack_geo,
        "damageAssessment": dmg_assess,
        "damage_assessment": dmg_assess,
        "calibration": img_record.calibration,
        "geometryUrl": (f"/api/v1/images/{img_record.id}/file?variant=geometry") if crack_geo else None,
        "previewUrl": default_preview,
        "originalUrl": f"/api/v1/images/{img_record.id}/file?variant=original",
        "thumbnailUrl": f"/api/v1/images/{img_record.id}/file?variant=thumbnail",
        "processedUrl": f"/api/v1/images/{img_record.id}/file?variant=processed",
        "enhancedUrl": f"/api/v1/images/{img_record.id}/file?variant=enhanced",
        "rfdetrUrl": f"/api/v1/images/{img_record.id}/file?variant=rfdetr" if has_rfdetr else None,
        "yoloUrl": f"/api/v1/images/{img_record.id}/file?variant=yolo" if has_yolo else None,
        "annotatedUrl": (f"/api/v1/images/{img_record.id}/file?variant=unet" if (is_crack_defect and has_unet) else ((f"/api/v1/images/{img_record.id}/file?variant=rfdetr") if (has_rfdetr and not model_fallback) else ((f"/api/v1/images/{img_record.id}/file?variant=unet") if has_unet else (f"/api/v1/images/{img_record.id}/file?variant=yolo" if has_yolo else None)))),
        "unetUrl": f"/api/v1/images/{img_record.id}/file?variant=unet" if has_unet else None,
        "unetMaskUrl": f"/api/v1/images/{img_record.id}/file?variant=mask" if has_unet else None,
        "createdAt": img_record.created_at.isoformat()
    }


# ─── Inspection Image List Endpoint ──────────────────────────────────────────

@router.get("/inspections/{inspection_id}/images")
def list_inspection_images(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns inspection imagery with quality and processing state summaries."""
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    user_role = (current_user.role or "").lower()
    is_mgmt = user_role in ("manager", "maintenance")
    if is_mgmt and inspection.status not in ("reviewed", "reported", "closed"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "UNREVIEWED_ACCESS_BLOCKED",
                "message": "Unreviewed inspection imagery is restricted to field inspectors and civil engineers."
            }
        )
    if user_role == "inspector" and inspection.inspector_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Inspectors can only access imagery from their assigned inspections."}
        )

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).order_by(InspectionImage.created_at).all()

    items = []

    for img in images:
        proc_run = db.query(ImageProcessingRun).filter(
            ImageProcessingRun.image_id == img.id
        ).order_by(desc(ImageProcessingRun.created_at)).first()

        rfdetr_file = find_stored_file("rfdetr", f"{img.id}.jpg") or os.path.join(RFDETR_DIR, f"{img.id}.jpg")
        has_rfdetr = bool(rfdetr_file and os.path.exists(rfdetr_file))
        yolo_file = find_stored_file("yolo", f"{img.id}.jpg") or os.path.join(YOLO_DIR, f"{img.id}.jpg")
        has_yolo = bool(yolo_file and os.path.exists(yolo_file))
        unet_file = find_stored_file("unet", f"{img.id}.jpg") or os.path.join(UNET_DIR, f"{img.id}.jpg")
        has_unet = bool(unet_file and os.path.exists(unet_file))

        qr_item = img.quality_report or {}
        ai_item = qr_item.get("ai_classification") if isinstance(qr_item, dict) else None
        p_item_crack = float(ai_item.get("crack_probability", 0.0)) if isinstance(ai_item, dict) else 0.0
        item_rfdetr = qr_item.get("rfdetr_detection") if isinstance(qr_item, dict) else (ai_item.get("rfdetr_detection") if isinstance(ai_item, dict) else None)
        item_unet = qr_item.get("unet_segmentation") if isinstance(qr_item, dict) else (ai_item.get("unet_segmentation") if isinstance(ai_item, dict) else None)
        item_is_crack = bool(
            p_item_crack >= 0.80 or
            (isinstance(ai_item, dict) and ai_item.get("has_crack")) or
            (item_rfdetr and item_rfdetr.get("has_defect")) or
            (item_unet and (item_unet.get("has_crack") or (item_unet.get("crack_area_pct") or 0) > 0)) or
            getattr(img, "is_cracked", False)
        )

        default_preview = f"/api/v1/images/{img.id}/file?variant=processed"
        if (item_is_crack or has_unet) and unet_file and os.path.exists(unet_file):
            default_preview = f"/api/v1/images/{img.id}/file?variant=unet"
        elif item_is_crack and has_unet:
            default_preview = f"/api/v1/images/{img.id}/file?variant=unet"
        elif has_rfdetr:
            default_preview = f"/api/v1/images/{img.id}/file?variant=rfdetr"
        elif has_unet:
            default_preview = f"/api/v1/images/{img.id}/file?variant=unet"

        item = {
            "id": img.id,
            "filename": img.filename,
            "width": img.width,
            "height": img.height,
            "fileSize": img.file_size,
            "status": img.status,
            "quality_status": img.quality_status or "accepted",
            "processing_status": img.processing_status or "complete",
            "source": img.source,
            "sha256": img.sha256,
            "phash": img.phash,
            "calibration": img.calibration,
            "warningConfirmed": bool(img.warning_confirmed_by),
            "hasRfdetr": has_rfdetr,
            "has_rfdetr": has_rfdetr,
            "hasYolo": has_yolo,
            "has_yolo": has_yolo,
            "hasUnet": has_unet,
            "has_unet": has_unet,
            "originalUrl": f"/api/v1/images/{img.id}/file?variant=original",
            "previewUrl": f"{default_preview}{'&' if '?' in default_preview else '?'}v={img.sha256[:10] if img.sha256 else ''}",
            "thumbnailUrl": f"/api/v1/images/{img.id}/file?variant=thumbnail&v={img.sha256[:10] if img.sha256 else ''}",
            "processedUrl": f"/api/v1/images/{img.id}/file?variant=processed&v={img.sha256[:10] if img.sha256 else ''}",
            "enhancedUrl": f"/api/v1/images/{img.id}/file?variant=enhanced&v={img.sha256[:10] if img.sha256 else ''}",
            "rfdetrUrl": (f"/api/v1/images/{img.id}/file?variant=rfdetr&v={img.sha256[:10] if img.sha256 else ''}") if has_rfdetr else None,
            "yoloUrl": (f"/api/v1/images/{img.id}/file?variant=yolo&v={img.sha256[:10] if img.sha256 else ''}") if has_yolo else None,
            "annotatedUrl": (f"/api/v1/images/{img.id}/file?variant=unet&v={img.sha256[:10] if img.sha256 else ''}" if (item_is_crack and has_unet) else ((f"/api/v1/images/{img.id}/file?variant=rfdetr&v={img.sha256[:10] if img.sha256 else ''}") if has_rfdetr else ((f"/api/v1/images/{img.id}/file?variant=unet&v={img.sha256[:10] if img.sha256 else ''}") if has_unet else None))),
            "unetUrl": (f"/api/v1/images/{img.id}/file?variant=unet&v={img.sha256[:10] if img.sha256 else ''}") if has_unet else None,
            "unetMaskUrl": (f"/api/v1/images/{img.id}/file?variant=mask&v={img.sha256[:10] if img.sha256 else ''}") if has_unet else None,
            "createdAt": img.created_at.isoformat()
        }

        # Role isolation: Managers & Maintenance never see quality reports or intermediate processed copies
        if not is_mgmt:
            item["qualityReport"] = img.quality_report
            item["quality_report"] = img.quality_report
            if img.quality_report and isinstance(img.quality_report, dict):
                item["aiClassification"] = img.quality_report.get("ai_classification")
                item["ai_classification"] = img.quality_report.get("ai_classification")

            # Also check Detection table for ai_model detections
            ai_det = db.query(Detection).filter(
                Detection.image_id == img.id,
                Detection.source == "ai_model"
            ).first()
            if ai_det:
                item["aiDetection"] = {
                    "id": ai_det.id,
                    "defectType": ai_det.defect_type,
                    "confidence": ai_det.confidence,
                    "severity": ai_det.severity,
                    "modelId": ai_det.model_id,
                    "notes": ai_det.notes,
                    "geometry": ai_det.geometry
                }
            if proc_run:
                item["processingRun"] = {
                    "status": proc_run.status,
                    "profile": proc_run.profile,
                    "steps": proc_run.steps,
                    "metrics_before": proc_run.metrics_before,
                    "metrics_after": proc_run.metrics_after,
                    "processed_sha256": proc_run.processed_sha256
                }

        # Stage 2 on-demand RF-DETR (primary) & UNet (fallback/measurement) checks
        ai_clf = item.get("aiClassification")
        p_crack = float(ai_clf.get("crack_probability", 0.0)) if isinstance(ai_clf, dict) else 0.0
        if (p_crack >= 0.80 or (isinstance(ai_clf, dict) and ai_clf.get("has_crack"))):
            proc_target = img.processed_path if (img.processed_path and os.path.exists(img.processed_path)) else img.original_path
            if proc_target and os.path.exists(proc_target):
                # On-demand RF-DETR
                if not has_rfdetr:
                    try:
                        from app.services.rfdetr_detector import get_rfdetr_detector
                        rfdetr_detector = get_rfdetr_detector()
                        rfdetr_thumb_path = os.path.join(THUMBNAIL_DIR, f"{img.id}_rfdetr.jpg")
                        rfdetr_res = rfdetr_detector.detect(
                            image_input=proc_target,
                            threshold=0.20,
                            save_annotated_path=rfdetr_file,
                            save_thumbnail_path=rfdetr_thumb_path,
                            resnet_confidence=p_crack
                        )
                        qr = dict(img.quality_report or {})
                        qr["rfdetr_detection"] = rfdetr_res
                        if rfdetr_res and rfdetr_res.get("has_defect"):
                            qr["active_stage2_model"] = "rfdetr"
                            qr["model_fallback"] = False
                            has_rfdetr = os.path.exists(rfdetr_file)
                        else:
                            qr["active_stage2_model"] = "unet_fallback"
                            qr["model_fallback"] = True
                        img.quality_report = qr
                        db.commit()
                        item["hasRfdetr"] = has_rfdetr
                        item["has_rfdetr"] = has_rfdetr
                        if has_rfdetr and not qr.get("model_fallback"):
                            item["rfdetrUrl"] = f"/api/v1/images/{img.id}/file?variant=rfdetr"
                            if not (p_crack >= 0.80 and has_unet):
                                item["annotatedUrl"] = f"/api/v1/images/{img.id}/file?variant=rfdetr"
                                item["previewUrl"] = f"/api/v1/images/{img.id}/file?variant=rfdetr"
                    except Exception as rfdetr_err:
                        logger.warning("On-demand RF-DETR generation error in list_inspection_images for %s: %s", img.id, rfdetr_err)

                # On-demand UNet
                if not has_unet:
                    try:
                        from app.services.unet_segmentor import get_unet_segmentor
                        segmentor = get_unet_segmentor()
                        unet_mask_path = os.path.join(UNET_DIR, f"{img.id}_mask.png")
                        mm_scale = img.calibration.get("mm_per_pixel") if (img.calibration and isinstance(img.calibration, dict)) else None
                        unet_res = segmentor.segment(
                            image_input=proc_target,
                            threshold=0.5,
                            save_overlay_path=unet_file,
                            save_mask_path=unet_mask_path,
                            mm_per_pixel=mm_scale
                        )
                        qr = dict(img.quality_report or {})
                        qr["unet_segmentation"] = unet_res
                        img.quality_report = qr
                        db.commit()
                        has_unet = os.path.exists(unet_file)
                        item["hasUnet"] = has_unet
                        item["has_unet"] = has_unet
                        if has_unet:
                            item["unetUrl"] = f"/api/v1/images/{img.id}/file?variant=unet"
                            item["unetMaskUrl"] = f"/api/v1/images/{img.id}/file?variant=mask"
                            if (p_crack >= 0.80) or not has_rfdetr or qr.get("model_fallback"):
                                item["previewUrl"] = f"/api/v1/images/{img.id}/file?variant=unet"
                                item["annotatedUrl"] = f"/api/v1/images/{img.id}/file?variant=unet"
                    except Exception as unet_err:
                        logger.warning("On-demand UNet generation error in list_inspection_images for %s: %s", img.id, unet_err)

        rfdetr_det = (img.quality_report.get("rfdetr_detection") if (img.quality_report and isinstance(img.quality_report, dict)) else None) or (ai_clf.get("rfdetr_detection") if isinstance(ai_clf, dict) else None)
        active_stage2_model = (img.quality_report.get("active_stage2_model") if isinstance(img.quality_report, dict) else None) or (ai_clf.get("active_stage2_model") if isinstance(ai_clf, dict) else ("rfdetr" if (rfdetr_det and rfdetr_det.get("has_defect")) else ("unet_fallback" if (p_crack >= 0.80) else None)))
        model_fallback = bool(img.quality_report.get("model_fallback") if isinstance(img.quality_report, dict) else (ai_clf.get("model_fallback") if isinstance(ai_clf, dict) else (p_crack >= 0.80 and not (rfdetr_det and rfdetr_det.get("has_defect")))))

        yolo_det = (img.quality_report.get("yolo_detection") if (img.quality_report and isinstance(img.quality_report, dict)) else None) or (ai_clf.get("yolo_detection") if isinstance(ai_clf, dict) else None)
        unet_seg = (img.quality_report.get("unet_segmentation") if (img.quality_report and isinstance(img.quality_report, dict)) else None) or (ai_clf.get("unet_segmentation") if isinstance(ai_clf, dict) else None)
        crack_geo = (img.quality_report.get("crack_geometry") if (img.quality_report and isinstance(img.quality_report, dict)) else None) or (ai_clf.get("crack_geometry") if isinstance(ai_clf, dict) else None)

        item["rfdetrDetection"] = rfdetr_det
        item["rfdetr_detection"] = rfdetr_det
        item["activeStage2Model"] = active_stage2_model
        item["active_stage2_model"] = active_stage2_model
        item["modelFallback"] = model_fallback
        item["model_fallback"] = model_fallback
        item["yoloDetection"] = yolo_det
        item["yolo_detection"] = yolo_det
        item["unetSegmentation"] = unet_seg
        item["unet_segmentation"] = unet_seg
        item["hasGeometry"] = bool(crack_geo)
        item["has_geometry"] = bool(crack_geo)
        item["crackGeometry"] = crack_geo
        item["crack_geometry"] = crack_geo
        img_qr = img.quality_report if (img.quality_report and isinstance(img.quality_report, dict)) else {}
        dmg_assess = img_qr.get("damage_assessment") or (crack_geo.get("summary", {}).get("damage_assessment") if crack_geo else None)
        item["damageAssessment"] = dmg_assess
        item["damage_assessment"] = dmg_assess
        if crack_geo:
            item["geometryUrl"] = f"/api/v1/images/{img.id}/file?variant=geometry"

        items.append(item)

    from app.services.damage_assessment import assess_batch_damage_severity
    batch_damage = assess_batch_damage_severity(items)

    return {
        "inspectionId": inspection.id,
        "totalImages": len(images),
        "validCount": sum(1 for img in images if (img.quality_status == "accepted" or img.status == "valid")),
        "warnedCount": sum(1 for img in images if img.quality_status == "warning" or img.status == "warned"),
        "rejectedCount": sum(1 for img in images if img.quality_status == "rejected" or img.status == "rejected"),
        "processingCount": sum(1 for img in images if img.processing_status in ("queued", "running")),
        "completeCount": sum(1 for img in images if img.processing_status == "complete"),
        "damageAssessment": batch_damage,
        "damage_assessment": batch_damage,
        "items": items
    }


# ─── Single Image Details Endpoint ───────────────────────────────────────────

@router.get("/images/{image_id}")
def get_image_details(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Section 7: Returns full status, quality checks, processing steps, metrics, and transform.
    Enforces Section 6.5 role visibility.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection, is_quality_or_processed=False)

    user_role = (current_user.role or "").lower()
    is_mgmt = user_role in ("manager", "maintenance")

    proc_run = db.query(ImageProcessingRun).filter(
        ImageProcessingRun.image_id == image.id
    ).order_by(desc(ImageProcessingRun.created_at)).first()

    yolo_file = find_stored_file("yolo", f"{image.id}.jpg") or os.path.join(YOLO_DIR, f"{image.id}.jpg")
    yolo_thumb = find_stored_file("thumbnails", f"{image.id}_yolo.jpg") or os.path.join(THUMBNAIL_DIR, f"{image.id}_yolo.jpg")
    has_yolo = bool(yolo_file and os.path.exists(yolo_file))

    unet_file = find_stored_file("unet", f"{image.id}.jpg") or os.path.join(UNET_DIR, f"{image.id}.jpg")
    unet_mask = find_stored_file("unet", f"{image.id}_mask.png") or os.path.join(UNET_DIR, f"{image.id}_mask.png")
    geo_file = find_stored_file("geometry", f"{image.id}.jpg") or os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
    has_unet = bool(unet_file and os.path.exists(unet_file))

    # If classified as cracked (p >= 0.80), ensure YOLO & UNet models run on-demand
    ai_clf_existing = image.quality_report.get("ai_classification") if (image.quality_report and isinstance(image.quality_report, dict)) else None
    p_crack_existing = float(ai_clf_existing.get("crack_probability", 0.0)) if isinstance(ai_clf_existing, dict) else 0.0
    is_crack_defect = (p_crack_existing >= 0.80 or (isinstance(ai_clf_existing, dict) and ai_clf_existing.get("has_crack")))

    if is_crack_defect:
        proc_target = image.processed_path if (image.processed_path and os.path.exists(image.processed_path)) else image.original_path

        # On-demand RF-DETR defect detection (first model)
        rfdetr_file = find_stored_file("rfdetr", f"{image.id}.jpg") or os.path.join(RFDETR_DIR, f"{image.id}.jpg")
        rfdetr_thumb = find_stored_file("thumbnails", f"{image.id}_rfdetr.jpg") or os.path.join(THUMBNAIL_DIR, f"{image.id}_rfdetr.jpg")
        qr_curr = dict(image.quality_report or {})
        if ("rfdetr_detection" not in qr_curr) and proc_target and os.path.exists(proc_target):
            try:
                from app.services.rfdetr_detector import get_rfdetr_detector
                rfdetr_detector = get_rfdetr_detector()
                rfdetr_res = rfdetr_detector.detect(
                    image_input=proc_target,
                    threshold=0.20,
                    save_annotated_path=rfdetr_file,
                    save_thumbnail_path=rfdetr_thumb,
                    resnet_confidence=p_crack_existing
                )
                qr_curr["rfdetr_detection"] = rfdetr_res
                if rfdetr_res.get("has_defect"):
                    qr_curr["active_stage2_model"] = "rfdetr"
                    qr_curr["model_fallback"] = False
                else:
                    qr_curr["active_stage2_model"] = "unet_fallback"
                    qr_curr["model_fallback"] = True
                image.quality_report = qr_curr
                db.commit()
            except Exception as rfdetr_err:
                logger.warning("On-demand RF-DETR error in get_image_details for %s: %s", image.id, rfdetr_err)

        # On-demand YOLO crack type classification (fallback or secondary)
        yolo_file = find_stored_file("yolo", f"{image.id}.jpg") or os.path.join(YOLO_DIR, f"{image.id}.jpg")
        yolo_thumb = find_stored_file("thumbnails", f"{image.id}_yolo.jpg") or os.path.join(THUMBNAIL_DIR, f"{image.id}_yolo.jpg")
        qr_curr = dict(image.quality_report or {})
        if ("yolo_detection" not in qr_curr) and proc_target and os.path.exists(proc_target):
            try:
                from app.services.yolo_detector import get_yolo_detector
                detector = get_yolo_detector()
                yolo_res = detector.detect(
                    image_input=proc_target,
                    conf=0.05,
                    imgsz=768,
                    save_annotated_path=yolo_file,
                    save_thumbnail_path=yolo_thumb,
                    resnet_confidence=p_crack_existing
                )
                qr_curr["yolo_detection"] = yolo_res
                image.quality_report = qr_curr
                db.commit()
                has_yolo = os.path.exists(yolo_file)
            except Exception as yolo_err:
                logger.warning("On-demand YOLO generation error in get_image_details for %s: %s", image.id, yolo_err)

        # On-demand UNet crack segmentation
        if (not has_unet) and proc_target and os.path.exists(proc_target):
            try:
                from app.services.unet_segmentor import get_unet_segmentor
                segmentor = get_unet_segmentor()
                mm_scale = image.calibration.get("mm_per_pixel") if (image.calibration and isinstance(image.calibration, dict)) else None
                unet_res = segmentor.segment(
                    image_input=proc_target,
                    threshold=0.5,
                    save_overlay_path=unet_file,
                    save_mask_path=unet_mask,
                    mm_per_pixel=mm_scale
                )
                qr = dict(image.quality_report or {})
                qr["unet_segmentation"] = unet_res
                image.quality_report = qr
                db.commit()
                has_unet = os.path.exists(unet_file)
            except Exception as unet_err:
                logger.warning("On-demand UNet generation error in get_image_details for %s: %s", image.id, unet_err)

        # On-demand crack geometry extraction if mask exists
        geo_file = find_stored_file("geometry", f"{image.id}.jpg") or os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
        qr_curr = dict(image.quality_report or {})
        if os.path.exists(unet_mask) and ("crack_geometry" not in qr_curr or not (geo_file and os.path.exists(geo_file))):
            try:
                from app.services.crack_geometry import extract_crack_geometry
                orig_target = image.original_path if (image.original_path and os.path.exists(image.original_path)) else proc_target
                mm_scale = image.calibration.get("mm_per_pixel") if (image.calibration and isinstance(image.calibration, dict)) else None
                geo_res = extract_crack_geometry(
                    original_image=orig_target,
                    binary_mask=unet_mask,
                    orig_w=image.width,
                    orig_h=image.height,
                    calibration=image.calibration if isinstance(image.calibration, dict) else None,
                    mm_per_pixel=mm_scale,
                    generate_visualization=True,
                    visualization_save_path=geo_file
                )
                qr_curr["crack_geometry"] = geo_res
                image.quality_report = qr_curr
                db.commit()
            except Exception as geo_err:
                logger.warning("On-demand geometry extraction error in get_image_details for %s: %s", image.id, geo_err)

    geo_file = find_stored_file("geometry", f"{image.id}.jpg") or os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
    has_geo = bool((geo_file and os.path.exists(geo_file)) or (image.quality_report and "crack_geometry" in image.quality_report))
    crack_geo = (image.quality_report.get("crack_geometry") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (ai_clf_existing.get("crack_geometry") if isinstance(ai_clf_existing, dict) else None)

    unet_seg = (image.quality_report.get("unet_segmentation") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (ai_clf_existing.get("unet_segmentation") if isinstance(ai_clf_existing, dict) else None)
    yolo_det = (image.quality_report.get("yolo_detection") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (ai_clf_existing.get("yolo_detection") if isinstance(ai_clf_existing, dict) else None)

    rfdetr_file = find_stored_file("rfdetr", f"{image.id}.jpg") or os.path.join(RFDETR_DIR, f"{image.id}.jpg")
    has_rfdetr = bool((rfdetr_file and os.path.exists(rfdetr_file)) or (image.quality_report and "rfdetr_detection" in image.quality_report))
    rfdetr_det = (image.quality_report.get("rfdetr_detection") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (ai_clf_existing.get("rfdetr_detection") if isinstance(ai_clf_existing, dict) else None)
    active_stage2_model = (image.quality_report.get("active_stage2_model") if isinstance(image.quality_report, dict) else None) or (ai_clf_existing.get("active_stage2_model") if isinstance(ai_clf_existing, dict) else ("rfdetr" if (rfdetr_det and rfdetr_det.get("has_defect")) else ("unet_fallback" if is_crack_defect else None)))
    model_fallback = bool(image.quality_report.get("model_fallback") if isinstance(image.quality_report, dict) else (ai_clf_existing.get("model_fallback") if isinstance(ai_clf_existing, dict) else (is_crack_defect and not (rfdetr_det and rfdetr_det.get("has_defect")))))

    v_tag = image.sha256[:10] if image.sha256 else ""

    if is_crack_defect and has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet"
    elif has_rfdetr and not model_fallback:
        default_preview = f"/api/v1/images/{image.id}/file?variant=rfdetr"
    elif has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet"
    else:
        default_preview = f"/api/v1/images/{image.id}/file?variant=processed"

    response = {
        "id": image.id,
        "inspectionId": image.inspection_id,
        "filename": image.filename,
        "width": image.width,
        "height": image.height,
        "fileSize": image.file_size,
        "source": image.source,
        "status": image.status,
        "quality_status": image.quality_status or "accepted",
        "processing_status": image.processing_status or "complete",
        "warningConfirmed": bool(image.warning_confirmed_by),
        "warningConfirmedAt": image.warning_confirmed_at.isoformat() if image.warning_confirmed_at else None,
        "calibration": image.calibration,
        "sha256": image.sha256,
        "phash": image.phash,
        "exif": {
            "lat": image.exif_lat,
            "lng": image.exif_lng,
            "captured_at": image.exif_captured_at.isoformat() if image.exif_captured_at else None
        },
        "hasRfdetr": has_rfdetr,
        "has_rfdetr": has_rfdetr,
        "rfdetrDetection": rfdetr_det,
        "rfdetr_detection": rfdetr_det,
        "activeStage2Model": active_stage2_model,
        "active_stage2_model": active_stage2_model,
        "modelFallback": model_fallback,
        "model_fallback": model_fallback,
        "hasYolo": has_yolo,
        "has_yolo": has_yolo,
        "yoloDetection": yolo_det,
        "yolo_detection": yolo_det,
        "hasUnet": has_unet,
        "has_unet": has_unet,
        "unetSegmentation": unet_seg,
        "unet_segmentation": unet_seg,
        "hasGeometry": has_geo,
        "has_geometry": has_geo,
        "crackGeometry": crack_geo,
        "crack_geometry": crack_geo,
        "damageAssessment": (image.quality_report.get("damage_assessment") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (crack_geo.get("summary", {}).get("damage_assessment") if (crack_geo and isinstance(crack_geo, dict)) else None),
        "damage_assessment": (image.quality_report.get("damage_assessment") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (crack_geo.get("summary", {}).get("damage_assessment") if (crack_geo and isinstance(crack_geo, dict)) else None),
        "calibration": image.calibration,
        "originalUrl": f"/api/v1/images/{image.id}/file?variant=original&v={v_tag}",
        "thumbnailUrl": f"/api/v1/images/{image.id}/file?variant=thumbnail&v={v_tag}",
        "previewUrl": f"{default_preview}{'&' if '?' in default_preview else '?'}v={v_tag}",
        "processedUrl": (f"/api/v1/images/{image.id}/file?variant=processed&v={v_tag}") if image.processing_status == "complete" else None,
        "enhancedUrl": (f"/api/v1/images/{image.id}/file?variant=enhanced&v={v_tag}") if image.processing_status == "complete" else None,
        "rfdetrUrl": (f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}") if has_rfdetr else None,
        "yoloUrl": (f"/api/v1/images/{image.id}/file?variant=yolo&v={v_tag}") if has_yolo else None,
        "annotatedUrl": (f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}" if (is_crack_defect and has_unet) else ((f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}") if (has_rfdetr and not model_fallback) else ((f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}") if has_unet else (f"/api/v1/images/{image.id}/file?variant=yolo&v={v_tag}" if has_yolo else None)))),
        "unetUrl": (f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}") if has_unet else None,
        "unetMaskUrl": (f"/api/v1/images/{image.id}/file?variant=mask&v={v_tag}") if has_unet else None,
        "geometryUrl": (f"/api/v1/images/{image.id}/file?variant=geometry&v={v_tag}") if has_geo else None,
        "damageAssessment": (image.quality_report.get("damage_assessment") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (crack_geo.get("summary", {}).get("damage_assessment") if (crack_geo and isinstance(crack_geo, dict)) else None),
        "damage_assessment": (image.quality_report.get("damage_assessment") if (image.quality_report and isinstance(image.quality_report, dict)) else None) or (crack_geo.get("summary", {}).get("damage_assessment") if (crack_geo and isinstance(crack_geo, dict)) else None),
        "createdAt": image.created_at.isoformat()
    }

    if not is_mgmt:
        response["qualityReport"] = image.quality_report
        response["quality_report"] = image.quality_report

        if image.quality_report and isinstance(image.quality_report, dict):
            response["aiClassification"] = image.quality_report.get("ai_classification")
            response["ai_classification"] = image.quality_report.get("ai_classification")

        ai_det = db.query(Detection).filter(
            Detection.image_id == image.id,
            Detection.source == "ai_model"
        ).first()
        if ai_det:
            response["aiDetection"] = {
                "id": ai_det.id,
                "defectType": ai_det.defect_type,
                "confidence": ai_det.confidence,
                "severity": ai_det.severity,
                "modelId": ai_det.model_id,
                "notes": ai_det.notes,
                "geometry": ai_det.geometry,
                "createdAt": ai_det.created_at.isoformat()
            }
            if "aiClassification" not in response and ai_det.geometry and isinstance(ai_det.geometry, dict) and "probabilities" in ai_det.geometry:
                probs = ai_det.geometry.get("probabilities", {})
                response["aiClassification"] = {
                    "has_crack": ai_det.defect_type == "crack",
                    "predicted_class": ai_det.geometry.get("predicted_class", "Cracked" if ai_det.defect_type == "crack" else "Uncracked"),
                    "confidence": ai_det.confidence,
                    "crack_probability": probs.get("cracked", 0.0),
                    "uncracked_probability": probs.get("uncracked", 0.0),
                    "threshold": ai_det.geometry.get("threshold", 0.80),
                    "model_name": ai_det.geometry.get("model", "InfraScan Model v1.0 (ResNet18)"),
                    "model_version": ai_det.geometry.get("version", "1.0"),
                    "engine": ai_det.geometry.get("engine", "onnxruntime")
                }
                response["ai_classification"] = response["aiClassification"]

        if proc_run:
            response["processingRun"] = {
                "profile": proc_run.profile,
                "profileVersion": proc_run.profile_version,
                "status": proc_run.status,
                "steps": proc_run.steps,
                "metricsBefore": proc_run.metrics_before,
                "metricsAfter": proc_run.metrics_after,
                "transform": proc_run.transform,
                "tiles": proc_run.tiles,
                "opencvVersion": proc_run.opencv_version,
                "retryCount": proc_run.retry_count,
                "errorCode": proc_run.error_code
            }

    return response


# ─── Image File Delivery (Original, Processed, YOLO, Thumbnail) ─────────────

@router.get("/images/{image_id}/file")
@router.get("/inspections/{inspection_id}/images/{image_id}/file")
def get_image_file_variant(
    image_id: str,
    inspection_id: Optional[str] = None,
    variant: str = Query("processed", description="'processed' (default - returns YOLO if cracked), 'original', 'yolo', 'enhanced', or 'thumbnail'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Section 7: Serves the requested image variant with role-based access enforcement:
    - 'processed' (default): If YOLO crack detection result exists, serves the annotated crack bounding box image.
                   Otherwise, serves the preprocessed image.
    - 'yolo' / 'annotated': Serves the YOLO annotated result image.
    - 'enhanced' / 'cv_processed': Serves the classical CV contrast-enhanced image.
    - 'thumbnail': Serves thumbnail image (annotated YOLO thumbnail if crack detected).
    - 'original': Serves the untouched raw uploaded photograph.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    is_proc_or_quality = (variant in ("processed", "yolo", "annotated", "enhanced", "cv_processed"))
    enforce_image_visibility(current_user, image, inspection, is_quality_or_processed=is_proc_or_quality)

    rfdetr_file = find_stored_file("rfdetr", f"{image.id}.jpg") or os.path.join(RFDETR_DIR, f"{image.id}.jpg")
    rfdetr_thumb = find_stored_file("thumbnails", f"{image.id}_rfdetr.jpg") or os.path.join(THUMBNAIL_DIR, f"{image.id}_rfdetr.jpg")
    has_rfdetr = bool(rfdetr_file and os.path.exists(rfdetr_file))

    yolo_file = find_stored_file("yolo", f"{image.id}.jpg") or os.path.join(YOLO_DIR, f"{image.id}.jpg")
    yolo_thumb = find_stored_file("thumbnails", f"{image.id}_yolo.jpg") or os.path.join(THUMBNAIL_DIR, f"{image.id}_yolo.jpg")
    has_yolo = bool(yolo_file and os.path.exists(yolo_file))

    unet_file = find_stored_file("unet", f"{image.id}.jpg") or os.path.join(UNET_DIR, f"{image.id}.jpg")
    unet_mask = find_stored_file("unet", f"{image.id}_mask.png") or os.path.join(UNET_DIR, f"{image.id}_mask.png")
    geo_file = find_stored_file("geometry", f"{image.id}.jpg") or os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
    has_unet = bool(unet_file and os.path.exists(unet_file))

    qr = image.quality_report or {}
    ai_clf = qr.get("ai_classification") if isinstance(qr, dict) else None
    p_crack = float(ai_clf.get("crack_probability", 0.0)) if isinstance(ai_clf, dict) else 0.0
    rfdetr_det = qr.get("rfdetr_detection") if isinstance(qr, dict) else (ai_clf.get("rfdetr_detection") if isinstance(ai_clf, dict) else None)
    unet_seg = qr.get("unet_segmentation") if isinstance(qr, dict) else (ai_clf.get("unet_segmentation") if isinstance(ai_clf, dict) else None)
    model_fallback = bool(qr.get("model_fallback") if isinstance(qr, dict) else (ai_clf.get("model_fallback") if isinstance(ai_clf, dict) else False))
    is_crack_defect = bool(
        p_crack >= 0.80 or
        (isinstance(ai_clf, dict) and ai_clf.get("has_crack")) or
        (rfdetr_det and rfdetr_det.get("has_defect")) or
        (unet_seg and (unet_seg.get("has_crack") or (unet_seg.get("crack_area_pct") or 0) > 0)) or
        getattr(image, "is_cracked", False)
    )

    proc_target = image.processed_path if (image.processed_path and os.path.exists(image.processed_path)) else image.original_path

    target_path = image.original_path

    if variant in ("rfdetr", "rdd2022"):
        if has_rfdetr:
            target_path = rfdetr_file
        elif has_yolo:
            target_path = yolo_file
        elif image.processed_path and os.path.exists(image.processed_path):
            target_path = image.processed_path
        else:
            target_path = image.original_path

    elif variant in ("yolo",):
        if has_yolo:
            target_path = yolo_file
        elif proc_target and os.path.exists(proc_target):
            try:
                from app.services.yolo_detector import get_yolo_detector
                detector = get_yolo_detector()
                detector.detect(
                    image_input=proc_target,
                    conf=0.10,
                    imgsz=768,
                    save_annotated_path=yolo_file
                )
                if os.path.exists(yolo_file):
                    target_path = yolo_file
                elif has_rfdetr:
                    target_path = rfdetr_file
                else:
                    target_path = proc_target
            except Exception as yolo_err:
                logger.warning("On-demand YOLO generation failed in get_image_file_variant: %s", yolo_err)
                target_path = rfdetr_file if has_rfdetr else proc_target
        else:
            target_path = rfdetr_file if has_rfdetr else image.original_path

    elif variant in ("annotated", "ai"):
        if has_unet:
            target_path = unet_file
        elif has_rfdetr and not model_fallback:
            target_path = rfdetr_file
        elif has_yolo:
            target_path = yolo_file
        elif image.processed_path and os.path.exists(image.processed_path):
            target_path = image.processed_path
        else:
            target_path = image.original_path

    elif variant in ("unet", "segmentation", "unet_overlay"):
        if has_unet:
            target_path = unet_file
        elif proc_target and os.path.exists(proc_target):
            try:
                from app.services.unet_segmentor import get_unet_segmentor
                segmentor = get_unet_segmentor()
                mm_scale = image.calibration.get("mm_per_pixel") if (image.calibration and isinstance(image.calibration, dict)) else None
                segmentor.segment(
                    image_input=proc_target,
                    threshold=0.5,
                    save_overlay_path=unet_file,
                    save_mask_path=unet_mask,
                    mm_per_pixel=mm_scale
                )
                if os.path.exists(unet_file):
                    target_path = unet_file
                else:
                    target_path = proc_target
            except Exception as unet_err:
                logger.warning("On-demand UNet generation failed in variant=unet: %s", unet_err)
                target_path = proc_target
        else:
            target_path = proc_target if (proc_target and os.path.exists(proc_target)) else image.original_path

    elif variant in ("mask", "unet_mask"):
        if os.path.exists(unet_mask):
            target_path = unet_mask
        elif proc_target and os.path.exists(proc_target):
            try:
                from app.services.unet_segmentor import get_unet_segmentor
                segmentor = get_unet_segmentor()
                mm_scale = image.calibration.get("mm_per_pixel") if (image.calibration and isinstance(image.calibration, dict)) else None
                segmentor.segment(
                    image_input=proc_target,
                    threshold=0.5,
                    save_overlay_path=unet_file,
                    save_mask_path=unet_mask,
                    mm_per_pixel=mm_scale
                )
                if os.path.exists(unet_mask):
                    target_path = unet_mask
                else:
                    target_path = proc_target
            except Exception:
                target_path = proc_target
        else:
            target_path = image.original_path

    elif variant in ("geometry", "geo", "skeleton"):
        if geo_file and os.path.exists(geo_file):
            target_path = geo_file
        elif has_unet:
            target_path = unet_file
        else:
            target_path = image.original_path

    elif variant == "processed":
        # When crack defect was identified:
        # Deliver UNet segmentation if cracked, or RF-DETR if defects found
        if is_crack_defect and has_unet:
            target_path = unet_file
        elif has_rfdetr and not model_fallback:
            target_path = rfdetr_file
        elif has_unet:
            target_path = unet_file
        elif image.processed_path and os.path.exists(image.processed_path):
            target_path = image.processed_path
        else:
            proc = db.query(ProcessedImage).filter(ProcessedImage.image_id == image.id).order_by(desc(ProcessedImage.created_at)).first()
            if proc and os.path.exists(proc.output_path):
                target_path = proc.output_path

    elif variant in ("enhanced", "cv_processed"):
        if image.processed_path and os.path.exists(image.processed_path):
            target_path = image.processed_path
        else:
            proc = db.query(ProcessedImage).filter(ProcessedImage.image_id == image.id).order_by(desc(ProcessedImage.created_at)).first()
            if proc and os.path.exists(proc.output_path):
                target_path = proc.output_path

    elif variant == "thumbnail":
        if (is_crack_defect or has_unet) and unet_file and os.path.exists(unet_file):
            target_path = unet_file
        elif is_crack_defect and has_unet:
            target_path = unet_file
        elif has_rfdetr and not model_fallback:
            target_path = rfdetr_thumb if (rfdetr_thumb and os.path.exists(rfdetr_thumb)) else rfdetr_file
        elif has_unet:
            target_path = unet_file
        elif image.thumbnail_path and os.path.exists(image.thumbnail_path):
            target_path = image.thumbnail_path

    elif variant == "original":
        target_path = image.original_path

    if not os.path.exists(target_path):
        target_path = image.original_path

    if not os.path.exists(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested image variant not found on disk")

    media_type = "image/png" if target_path.lower().endswith(".png") else "image/jpeg"
    return FileResponse(
        target_path,
        media_type=media_type,
        headers={"Cache-Control": "no-cache, must-revalidate"}
    )


@router.get("/images/{image_id}/rfdetr")
@router.get("/inspections/{inspection_id}/images/{image_id}/rfdetr")
def get_rfdetr_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="rfdetr", current_user=current_user, db=db)


@router.get("/images/{image_id}/yolo")
@router.get("/inspections/{inspection_id}/images/{image_id}/yolo")
def get_yolo_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="yolo", current_user=current_user, db=db)


@router.get("/images/{image_id}/unet")
@router.get("/inspections/{inspection_id}/images/{image_id}/unet")
def get_unet_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="unet", current_user=current_user, db=db)


@router.get("/images/{image_id}/mask")
@router.get("/inspections/{inspection_id}/images/{image_id}/mask")
def get_mask_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="mask", current_user=current_user, db=db)


@router.get("/images/{image_id}/thumbnail")
def get_thumbnail_shortcut(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="thumbnail", current_user=current_user, db=db)


@router.get("/images/{image_id}/processed")
@router.get("/inspections/{inspection_id}/images/{image_id}/processed")
def get_processed_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="processed", current_user=current_user, db=db)


class GeometryComputeRequest(BaseModel):
    force_recompute: Optional[bool] = False
    mm_per_pixel: Optional[float] = None
    width_metric: Optional[str] = "maximum"
    min_region_area_px: Optional[int] = 10
    surface_mask_path: Optional[str] = None


@router.get("/images/{image_id}/geometry/file")
@router.get("/inspections/{inspection_id}/images/{image_id}/geometry/file")
def get_geometry_file_shortcut(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_image_file_variant(image_id=image_id, variant="geometry", current_user=current_user, db=db)


@router.get("/images/{image_id}/geometry")
@router.get("/inspections/{inspection_id}/images/{image_id}/geometry")
def get_image_geometry_endpoint(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    # Return cached geometry if present
    if image.quality_report and isinstance(image.quality_report, dict) and "crack_geometry" in image.quality_report:
        return image.quality_report["crack_geometry"]

    return execute_geometry_calculation(image=image, payload=None, inspection_id=inspection_id, user_id=current_user.id, db=db)


@router.post("/images/{image_id}/geometry")
@router.post("/inspections/{inspection_id}/images/{image_id}/geometry")
def calculate_image_geometry_endpoint(
    image_id: str,
    payload: Optional[GeometryComputeRequest] = Body(default=None),
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    # If cached and not forced recomputation
    if payload and not payload.force_recompute and payload.mm_per_pixel is None:
        existing_geo = image.quality_report.get("crack_geometry") if (image.quality_report and isinstance(image.quality_report, dict)) else None
        if existing_geo and isinstance(existing_geo, dict):
            current_metric = existing_geo.get("summary", {}).get("controlling_metric")
            if not payload.width_metric or payload.width_metric == current_metric:
                return existing_geo

    return execute_geometry_calculation(image=image, payload=payload, inspection_id=inspection_id, user_id=current_user.id, db=db)


def execute_geometry_calculation(
    image: InspectionImage,
    payload: Optional[GeometryComputeRequest],
    inspection_id: Optional[str],
    user_id: str,
    db: Session
) -> Dict[str, Any]:
    from app.services.crack_geometry import extract_crack_geometry
    from sqlalchemy.orm.attributes import flag_modified

    unet_mask_path = find_stored_file("unet", f"{image.id}_mask.png") or os.path.join(UNET_DIR, f"{image.id}_mask.png")
    unet_file = find_stored_file("unet", f"{image.id}.jpg") or os.path.join(UNET_DIR, f"{image.id}.jpg")

    proc_target = None
    if image.processed_path and os.path.exists(image.processed_path):
        proc_target = image.processed_path
    elif image.processed_path:
        proc_target = find_stored_file("processed", os.path.basename(image.processed_path))
    if not proc_target:
        if image.original_path and os.path.exists(image.original_path):
            proc_target = image.original_path
        elif image.original_path:
            proc_target = find_stored_file("raw", os.path.basename(image.original_path))

    # If mask doesn't exist, execute U-Net on demand
    if not (unet_mask_path and os.path.exists(unet_mask_path)) and proc_target and os.path.exists(proc_target):
        try:
            from app.services.unet_segmentor import get_unet_segmentor
            segmentor = get_unet_segmentor()
            mm_scale = image.calibration.get("mm_per_pixel") if (image.calibration and isinstance(image.calibration, dict)) else None
            segmentor.segment(
                image_input=proc_target,
                threshold=0.5,
                save_overlay_path=unet_file,
                save_mask_path=unet_mask_path,
                mm_per_pixel=mm_scale
            )
        except Exception as e:
            logger.warning("Failed on-demand UNet for geometry: %s", e)

    chosen_width_metric = (
        payload.width_metric
        if (payload and payload.width_metric)
        else (
            image.calibration.get("width_metric", "maximum")
            if (image.calibration and isinstance(image.calibration, dict))
            else "maximum"
        )
    )

    mm_scale = None
    if payload and payload.mm_per_pixel is not None:
        if payload.mm_per_pixel <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_SCALE", "message": "Optical scale factor mm_per_pixel must be strictly positive."}
            )
        mm_scale = payload.mm_per_pixel
        cal = dict(image.calibration or {})
        cal["mm_per_pixel"] = round(float(payload.mm_per_pixel), 6)
        cal["mm_per_px"] = round(float(payload.mm_per_pixel), 6)
        cal["calibrated"] = True
        cal["width_metric"] = chosen_width_metric
        if "method" not in cal:
            cal["method"] = "direct_scale"
        image.calibration = cal
        flag_modified(image, "calibration")
    elif image.calibration and isinstance(image.calibration, dict):
        mm_scale = image.calibration.get("mm_per_pixel") or image.calibration.get("mm_per_px")
        if payload and payload.width_metric:
            cal = dict(image.calibration)
            cal["width_metric"] = chosen_width_metric
            image.calibration = cal
            flag_modified(image, "calibration")

    if not (unet_mask_path and os.path.exists(unet_mask_path)):
        img_w = int(image.width or 800)
        img_h = int(image.height or 600)
        is_cal = bool(mm_scale)
        scale_val = float(mm_scale) if is_cal else None
        geo_empty = {
            "success": True,
            "summary": {
                "total_crack_area_px": 0,
                "inspected_surface_area_px": img_w * img_h,
                "unaffected_surface_area_px": img_w * img_h,
                "crack_coverage_pct": 0.0,
                "unaffected_surface_pct": 100.0,
                "crack_count": 0,
                "total_crack_length_px": 0.0,
                "average_crack_width_px": 0.0,
                "maximum_crack_width_px": 0.0,
                "is_calibrated": is_cal,
                "mm_per_pixel": scale_val,
                "unit": "mm" if is_cal else "px",
                "image_width": img_w,
                "image_height": img_h,
                "has_surface_mask": False,
                "total_crack_area_mm2": 0.0 if is_cal else None,
                "inspected_surface_area_mm2": round(img_w * img_h * (scale_val ** 2), 2) if is_cal else None,
                "unaffected_surface_area_mm2": round(img_w * img_h * (scale_val ** 2), 2) if is_cal else None,
                "total_crack_length_mm": 0.0 if is_cal else None,
                "average_crack_width_mm": 0.0 if is_cal else None,
                "maximum_crack_width_mm": 0.0 if is_cal else None,
                "controlling_metric": chosen_width_metric,
                "crack_severity_category": "None" if is_cal else "Uncalibrated",
                "crack_severity_code": "none" if is_cal else "uncalibrated",
                "severity_assessment": {
                    "category": "None" if is_cal else "Uncalibrated",
                    "category_code": "none" if is_cal else "uncalibrated",
                    "badge_color": "emerald" if is_cal else "zinc",
                    "controlling_width_mm": 0.0 if is_cal else None,
                    "controlling_metric": chosen_width_metric,
                    "is_calibrated": is_cal,
                    "description": "Sound concrete surface. No crack defect detected." if is_cal else "Uncalibrated: Millimetre measurements unavailable.",
                    "threshold_range": "0.0 mm" if is_cal else "N/A (uncalibrated)",
                    "requires_engineer_review": True,
                    "warning": None if is_cal else "Uncalibrated: Millimetre measurements and crack-width severity classification are unavailable without verified optical scale calibration.",
                }
            },
            "cracks": [],
            "visualization_path": None,
            "version": "1.0.0-infrascan-geometry"
        }
        qr = dict(image.quality_report or {})
        qr["crack_geometry"] = geo_empty
        image.quality_report = qr
        flag_modified(image, "quality_report")
        db.commit()
        return geo_empty

    geo_ann_path = os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
    orig_target = None
    if image.original_path and os.path.exists(image.original_path):
        orig_target = image.original_path
    elif image.original_path:
        orig_target = find_stored_file("raw", os.path.basename(image.original_path))
    if not orig_target:
        orig_target = proc_target

    if not (orig_target and os.path.exists(orig_target)):
        img_w = int(image.width or 800)
        img_h = int(image.height or 600)
        orig_target = np.zeros((img_h, img_w, 3), dtype=np.uint8)

    min_area = payload.min_region_area_px if (payload and payload.min_region_area_px) else 10
    surface_mask = payload.surface_mask_path if (payload and payload.surface_mask_path) else None

    try:
        geo_res = extract_crack_geometry(
            original_image=orig_target,
            binary_mask=unet_mask_path,
            orig_w=image.width,
            orig_h=image.height,
            surface_mask=surface_mask,
            calibration=image.calibration if isinstance(image.calibration, dict) else None,
            mm_per_pixel=float(mm_scale) if mm_scale else None,
            width_metric=chosen_width_metric,
            min_region_area_px=min_area,
            generate_visualization=True,
            visualization_save_path=geo_ann_path
        )
    except Exception as e:
        logger.error("Error running extract_crack_geometry on image %s: %s", image.id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "GEOMETRY_CALCULATION_ERROR", "message": f"Geometry extraction failed: {str(e)}"}
        )

    qr = dict(image.quality_report or {})
    qr["crack_geometry"] = geo_res
    image.quality_report = qr
    flag_modified(image, "quality_report")

    insp_id = inspection_id or image.inspection_id
    if insp_id:
        from app.services.damage_assessment import assess_photo_damage_severity
        geo_sum = geo_res.get("summary", {})
        sev_info = geo_sum.get("severity_assessment", {})

        photo_metrics = {
            "has_cracks": geo_sum.get("crack_count", 0) > 0,
            "crack_count": geo_sum.get("crack_count", 0),
            "crack_area_px": geo_sum.get("total_crack_area_px", 0.0),
            "surface_area_px": geo_sum.get("inspected_surface_area_px", 0.0),
            "crack_density_pct": geo_sum.get("crack_coverage_pct", 0.0),
            "maximum_crack_width_px": geo_sum.get("maximum_crack_width_px", 0.0),
            "average_crack_width_px": geo_sum.get("average_crack_width_px", 0.0),
            "maximum_crack_width_mm": geo_sum.get("maximum_crack_width_mm"),
            "average_crack_width_mm": geo_sum.get("average_crack_width_mm"),
            "total_crack_length_px": geo_sum.get("total_crack_length_px", 0.0),
            "total_branch_count": geo_sum.get("total_branch_count", 0),
            "image_width": image.width,
            "image_height": image.height,
            "is_calibrated": geo_sum.get("is_calibrated"),
            "mm_per_pixel": geo_sum.get("mm_per_pixel")
        }
        dmg_assessment = assess_photo_damage_severity(
            photo_metrics,
            calibration=image.calibration if isinstance(image.calibration, dict) else None
        )
        geo_sum["damage_assessment"] = dmg_assessment
        qr["damage_assessment"] = dmg_assessment
        geo_sev = dmg_assessment["severity_code"]

        note_str = (
            f"Crack Measurement: {geo_sum.get('crack_coverage_pct')}% coverage, {geo_sum.get('crack_count')} regions. Max width: {geo_sum.get('maximum_crack_width_mm')} mm [{sev_info.get('category')}]. Damage: {dmg_assessment.get('severity')}."
            if geo_sum.get("is_calibrated")
            else f"Crack Measurement (uncalibrated): {geo_sum.get('crack_coverage_pct')}% coverage, {geo_sum.get('crack_count')} regions. Max width: {geo_sum.get('maximum_crack_width_px')} px. Damage: {dmg_assessment.get('severity')}."
        )

        existing_det = db.query(Detection).filter(
            Detection.image_id == image.id,
            Detection.source == "ai_model"
        ).first()

        if existing_det:
            # Update the single unified detection
            existing_det.severity = geo_sev
            existing_det.notes = note_str
            current_geom = dict(existing_det.geometry or {})
            current_geom["crack_geometry"] = geo_sum
            current_geom["damage_assessment"] = dmg_assessment
            existing_det.geometry = current_geom
            flag_modified(existing_det, "geometry")
            target_det_id = existing_det.id
        else:
            # Clean existing crack_geometry detection
            db.query(Detection).filter(
                Detection.image_id == image.id,
                Detection.defect_type == "crack_geometry"
            ).delete()
            geo_det = Detection(
                inspection_id=insp_id,
                image_id=image.id,
                source="ai_model",
                defect_type="crack",
                geometry={
                    "type": "unified_crack_detection",
                    "crack_geometry": geo_sum,
                    "damage_assessment": dmg_assessment,
                },
                severity=geo_sev,
                created_by=user_id,
                confidence=0.95,
                model_id="InfraScan Crack Geometry v1.0",
                notes=note_str
            )
            db.add(geo_det)
            db.flush()
            target_det_id = geo_det.id

        # Update or create Measurement
        is_cal = bool(geo_sum.get("is_calibrated"))
        meas = db.query(Measurement).filter(Measurement.detection_id == target_det_id).first()
        if not meas:
            meas = Measurement(detection_id=target_det_id)
            db.add(meas)
        meas.length = float(geo_sum.get("total_crack_length_mm") if is_cal and geo_sum.get("total_crack_length_mm") is not None else geo_sum.get("total_crack_length_px", 0.0))
        meas.avg_width = float(geo_sum.get("average_crack_width_mm") if is_cal and geo_sum.get("average_crack_width_mm") is not None else geo_sum.get("average_crack_width_px", 0.0))
        meas.max_width = float(geo_sum.get("maximum_crack_width_mm") if is_cal and geo_sum.get("maximum_crack_width_mm") is not None else geo_sum.get("maximum_crack_width_px", 0.0))
        meas.area = float(geo_sum.get("total_crack_area_mm2") if is_cal and geo_sum.get("total_crack_area_mm2") is not None else geo_sum.get("total_crack_area_px", 0.0))
        meas.unit = "mm" if is_cal else "px"
        meas.calibrated = is_cal
        meas.density = float(geo_sum.get("crack_coverage_pct", 0.0))

    db.commit()
    return geo_res


# ─── Warning Confirmation & Preprocessing Trigger ─────────────────────────────

@router.post("/images/{image_id}/quality/confirm")
@router.post("/images/{image_id}/confirm-warning")
def confirm_warning_endpoint(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Section 3.1 & 7: Explicit 'Continue anyway' confirmation.
    Stores user ID and timestamp, transitions image to 'accepted', and triggers preprocessing.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    image.quality_status = "accepted"
    image.status = "valid"
    image.warning_confirmed_by = current_user.id
    image.warning_confirmed_at = datetime.now(timezone.utc)

    # Start preprocessing after confirmation
    if os.path.exists(image.original_path):
        try:
            with open(image.original_path, "rb") as f:
                orig_bytes = f.read()

            proc_bytes, thumb_bytes, run_record = preprocess_image(
                orig_bytes,
                profile_name="general_v1",
                blur_warning=True  # Confirmed warning capture
            )

            proc_filename = f"proc_{image.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
            proc_path = os.path.join(PROCESSED_DIR, proc_filename)
            with open(proc_path, "wb") as f:
                f.write(proc_bytes)

            thumb_filename = f"thumb_{image.id}_{image.sha256[:10]}.jpg"
            thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
            with open(thumb_path, "wb") as f:
                f.write(thumb_bytes)

            image.processed_path = proc_path
            image.thumbnail_path = thumb_path
            image.processing_status = "complete"

            proc_run = ImageProcessingRun(
                image_id=image.id,
                profile="general_v1",
                profile_version=run_record["profile_version"],
                status="complete",
                steps=run_record["steps"],
                metrics_before=run_record["metrics_before"],
                metrics_after=run_record["metrics_after"],
                transform=run_record["transform"],
                tiles=run_record["tiles"],
                processed_path=proc_path,
                thumbnail_path=thumb_path,
                processed_sha256=run_record["processed_sha256"],
                width=run_record["width"],
                height=run_record["height"],
                opencv_version=OPENCV_VERSION,
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc)
            )
            db.add(proc_run)
        except Exception:
            image.processing_status = "failed"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_WARNING_CONFIRMED",
        entity_type="inspection_image",
        entity_id=image.id,
        details={"confirmed_by": current_user.id}
    )
    db.add(audit)

    # Auto-run AI classification on confirmed image
    target_to_classify = image.processed_path if (image.processed_path and os.path.exists(image.processed_path)) else image.original_path
    run_and_persist_ai_classification(image, target_to_classify, db, current_user.id, image.inspection_id)

    db.commit()
    db.refresh(image)

    rfdetr_file = find_stored_file("rfdetr", f"{image.id}.jpg")
    yolo_file = find_stored_file("yolo", f"{image.id}.jpg")
    unet_file = find_stored_file("unet", f"{image.id}.jpg")
    geo_file = find_stored_file("geometry", f"{image.id}.jpg")
    has_rfdetr = bool(rfdetr_file and os.path.exists(rfdetr_file))
    has_yolo = bool(yolo_file and os.path.exists(yolo_file))
    has_unet = bool(unet_file and os.path.exists(unet_file))
    has_geo = bool(geo_file and os.path.exists(geo_file))
    qr = image.quality_report or {}
    ai_clf = qr.get("ai_classification") if isinstance(qr, dict) else None
    rfdetr_det = qr.get("rfdetr_detection") if isinstance(qr, dict) else (ai_clf.get("rfdetr_detection") if isinstance(ai_clf, dict) else None)
    active_stage2_model = qr.get("active_stage2_model") if isinstance(qr, dict) else (ai_clf.get("active_stage2_model") if isinstance(ai_clf, dict) else None)
    model_fallback = bool(qr.get("model_fallback") if isinstance(qr, dict) else (ai_clf.get("model_fallback") if isinstance(ai_clf, dict) else False))
    yolo_det = qr.get("yolo_detection") if isinstance(qr, dict) else None
    unet_seg = qr.get("unet_segmentation") if isinstance(qr, dict) else None
    crack_geo = qr.get("crack_geometry") if isinstance(qr, dict) else None

    p_crack = float(ai_clf.get("crack_probability", 0.0)) if isinstance(ai_clf, dict) else 0.0
    is_crack_defect = (p_crack >= 0.80 or (isinstance(ai_clf, dict) and ai_clf.get("has_crack")))

    default_preview = f"/api/v1/images/{image.id}/file?variant=processed"
    if is_crack_defect and has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet"
    elif has_rfdetr and not model_fallback:
        default_preview = f"/api/v1/images/{image.id}/file?variant=rfdetr"
    elif has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet"

    return {
        "status": "accepted",
        "quality_status": image.quality_status,
        "processing_status": image.processing_status,
        "warningConfirmed": True,
        "warningConfirmedAt": image.warning_confirmed_at.isoformat() if image.warning_confirmed_at else None,
        "aiClassification": ai_clf,
        "ai_classification": ai_clf,
        "hasRfdetr": has_rfdetr,
        "has_rfdetr": has_rfdetr,
        "rfdetrDetection": rfdetr_det,
        "rfdetr_detection": rfdetr_det,
        "activeStage2Model": active_stage2_model,
        "active_stage2_model": active_stage2_model,
        "modelFallback": model_fallback,
        "model_fallback": model_fallback,
        "yoloDetection": yolo_det,
        "yolo_detection": yolo_det,
        "unetSegmentation": unet_seg,
        "unet_segmentation": unet_seg,
        "hasYolo": has_yolo,
        "has_yolo": has_yolo,
        "hasUnet": has_unet,
        "has_unet": has_unet,
        "hasGeometry": has_geo,
        "has_geometry": has_geo,
        "crackGeometry": crack_geo,
        "crack_geometry": crack_geo,
        "damageAssessment": qr.get("damage_assessment") or (crack_geo.get("summary", {}).get("damage_assessment") if crack_geo else None),
        "damage_assessment": qr.get("damage_assessment") or (crack_geo.get("summary", {}).get("damage_assessment") if crack_geo else None),
        "calibration": image.calibration,
        "previewUrl": default_preview,
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed",
        "rfdetrUrl": f"/api/v1/images/{image.id}/file?variant=rfdetr" if has_rfdetr else None,
        "yoloUrl": f"/api/v1/images/{image.id}/file?variant=yolo" if has_yolo else None,
        "annotatedUrl": (f"/api/v1/images/{image.id}/file?variant=unet" if (is_crack_defect and has_unet) else ((f"/api/v1/images/{image.id}/file?variant=rfdetr") if (has_rfdetr and not model_fallback) else ((f"/api/v1/images/{image.id}/file?variant=unet") if has_unet else (f"/api/v1/images/{image.id}/file?variant=yolo" if has_yolo else None)))),
        "unetUrl": f"/api/v1/images/{image.id}/file?variant=unet" if has_unet else None,
        "unetMaskUrl": f"/api/v1/images/{image.id}/file?variant=mask" if has_unet else None,
        "geometryUrl": f"/api/v1/images/{image.id}/file?variant=geometry" if has_geo else None
    }


# ─── Preprocessing Retry Endpoint ─────────────────────────────────────────────

@router.post("/images/{image_id}/processing/retry")
def retry_processing_endpoint(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Section 3.1 & 7: Re-attempts preprocessing on an image whose preprocessing failed."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    if not os.path.exists(image.original_path):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Original image file missing from storage.")

    with open(image.original_path, "rb") as f:
        orig_bytes = f.read()

    prev_run = db.query(ImageProcessingRun).filter(
        ImageProcessingRun.image_id == image.id
    ).order_by(desc(ImageProcessingRun.created_at)).first()
    retries = (prev_run.retry_count + 1) if prev_run else 1

    proc_bytes, thumb_bytes, run_record = preprocess_image(
        orig_bytes,
        profile_name="general_v1",
        blur_warning=(image.quality_status == "warning")
    )

    proc_filename = f"proc_{image.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
    proc_path = os.path.join(PROCESSED_DIR, proc_filename)
    with open(proc_path, "wb") as f:
        f.write(proc_bytes)

    thumb_filename = f"thumb_{image.id}_{image.sha256[:10]}.jpg"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    image.processed_path = proc_path
    image.thumbnail_path = thumb_path
    image.processing_status = "complete"

    proc_run = ImageProcessingRun(
        image_id=image.id,
        profile="general_v1",
        profile_version=run_record["profile_version"],
        status="complete",
        steps=run_record["steps"],
        metrics_before=run_record["metrics_before"],
        metrics_after=run_record["metrics_after"],
        transform=run_record["transform"],
        tiles=run_record["tiles"],
        processed_path=proc_path,
        thumbnail_path=thumb_path,
        processed_sha256=run_record["processed_sha256"],
        width=run_record["width"],
        height=run_record["height"],
        opencv_version=OPENCV_VERSION,
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        retry_count=retries
    )
    db.add(proc_run)

    # Run AI classification automatically after reprocessing
    target_to_classify = proc_path if (proc_path and os.path.exists(proc_path)) else image.original_path
    pred = run_and_persist_ai_classification(image, target_to_classify, db, current_user.id, image.inspection_id)

    db.commit()

    return {
        "status": "complete",
        "processing_status": "complete",
        "imageId": image.id,
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed",
        "aiClassification": pred
    }


# ─── Direct Single-Image Analysis Endpoint ───────────────────────────────────

@router.post("/images/{image_id}/analyze")
def analyze_image_endpoint(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Section 6 & 8: Single-image ResNet50 AI analysis endpoint."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    from app.services.classifier import get_classifier
    clf = get_classifier()

    target_path = None
    for candidate in [image.processed_path, image.original_path, os.path.join(os.getcwd(), "storage", "uploads", image.filename)]:
        if candidate and os.path.exists(candidate):
            target_path = candidate
            break

    if not target_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file missing from disk")

    pred = run_and_persist_ai_classification(
        image=image,
        target_path=target_path,
        db=db,
        user_id=current_user.id,
        inspection_id=image.inspection_id
    )

    db.commit()
    db.refresh(image)

    qr = dict(image.quality_report or {})
    rfdetr_file = find_stored_file("rfdetr", f"{image.id}.jpg") or os.path.join(RFDETR_DIR, f"{image.id}.jpg")
    has_rfdetr = bool(rfdetr_file and os.path.exists(rfdetr_file))
    rfdetr_det = qr.get("rfdetr_detection") if isinstance(qr, dict) else (pred.get("rfdetr_detection") if pred else None)
    active_stage2_model = qr.get("active_stage2_model") if isinstance(qr, dict) else (pred.get("active_stage2_model") if pred else None)
    model_fallback = bool(qr.get("model_fallback") if isinstance(qr, dict) else (pred.get("model_fallback") if pred else False))

    unet_file = find_stored_file("unet", f"{image.id}.jpg") or os.path.join(UNET_DIR, f"{image.id}.jpg")
    unet_mask = find_stored_file("unet", f"{image.id}_mask.png") or os.path.join(UNET_DIR, f"{image.id}_mask.png")
    geo_file = find_stored_file("geometry", f"{image.id}.jpg") or os.path.join(GEOMETRY_DIR, f"{image.id}.jpg")
    has_unet = bool(unet_file and os.path.exists(unet_file))
    has_geo = bool(geo_file and os.path.exists(geo_file))
    yolo_file = os.path.join(YOLO_DIR, f"{image.id}.jpg")
    has_yolo = os.path.exists(yolo_file)

    v_tag = image.sha256[:10] if image.sha256 else str(int(time.time()))
    p_crack = float(pred.get("crack_probability", 0.0)) if pred else 0.0
    is_crack_defect = (p_crack >= 0.80 or (bool(pred.get("has_crack")) if pred else False))

    if is_crack_defect and has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}"
    elif has_rfdetr and not model_fallback:
        default_preview = f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}"
    elif has_unet:
        default_preview = f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}"
    else:
        default_preview = f"/api/v1/images/{image.id}/file?variant=processed&v={v_tag}"

    return {
        "imageId": image.id,
        "aiClassification": pred,
        "ai_classification": pred,
        "qualityReport": qr,
        "quality_report": qr,
        "hasRfdetr": has_rfdetr,
        "has_rfdetr": has_rfdetr,
        "rfdetrDetection": rfdetr_det,
        "rfdetr_detection": rfdetr_det,
        "activeStage2Model": active_stage2_model,
        "active_stage2_model": active_stage2_model,
        "modelFallback": model_fallback,
        "model_fallback": model_fallback,
        "hasUnet": has_unet,
        "has_unet": has_unet,
        "unetSegmentation": qr.get("unet_segmentation"),
        "unet_segmentation": qr.get("unet_segmentation"),
        "hasGeometry": has_geo,
        "has_geometry": has_geo,
        "crackGeometry": qr.get("crack_geometry"),
        "crack_geometry": qr.get("crack_geometry"),
        "damageAssessment": qr.get("damage_assessment") or (qr.get("crack_geometry", {}).get("summary", {}).get("damage_assessment") if qr.get("crack_geometry") else None),
        "damage_assessment": qr.get("damage_assessment") or (qr.get("crack_geometry", {}).get("summary", {}).get("damage_assessment") if qr.get("crack_geometry") else None),
        "calibration": image.calibration,
        "yoloDetection": qr.get("yolo_detection"),
        "yolo_detection": qr.get("yolo_detection"),
        "hasYolo": has_yolo,
        "previewUrl": default_preview,
        "originalUrl": f"/api/v1/images/{image.id}/file?variant=original&v={v_tag}",
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed&v={v_tag}",
        "enhancedUrl": f"/api/v1/images/{image.id}/file?variant=enhanced&v={v_tag}",
        "rfdetrUrl": f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}" if has_rfdetr else None,
        "unetUrl": f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}" if has_unet else None,
        "unetMaskUrl": f"/api/v1/images/{image.id}/file?variant=mask&v={v_tag}" if has_unet else None,
        "geometryUrl": f"/api/v1/images/{image.id}/file?variant=geometry&v={v_tag}" if has_geo else None,
        "yoloUrl": f"/api/v1/images/{image.id}/file?variant=yolo&v={v_tag}" if has_yolo else None,
        "annotatedUrl": (f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}" if (is_crack_defect and has_unet) else ((f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}") if (has_rfdetr and not model_fallback) else ((f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}") if has_unet else None)))
    }


# ─── Scale Calibration Endpoint ──────────────────────────────────────────────

@router.post("/images/{image_id}/calibration")
@router.post("/inspections/{inspection_id}/images/{image_id}/calibrate")
def calibrate_scale_endpoint(
    image_id: str,
    req: ScaleCalibrationRequest,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Section 7: Saves reference line or mm/px calibration record on the original image."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    mm_per_px = req.mm_per_pixel
    calc_pixel_len = req.pixel_length
    if req.method == "manual_line":
        if (not calc_pixel_len or calc_pixel_len <= 0) and req.reference_p1 and req.reference_p2 and len(req.reference_p1) == 2 and len(req.reference_p2) == 2:
            dx = float(req.reference_p2[0]) - float(req.reference_p1[0])
            dy = float(req.reference_p2[1]) - float(req.reference_p1[1])
            calc_pixel_len = math.sqrt(dx * dx + dy * dy)
            req.pixel_length = round(calc_pixel_len, 2)

        if not req.reference_line_length_mm or not calc_pixel_len or calc_pixel_len <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_CALIBRATION", "message": "Manual line calibration requires known reference_line_length_mm and positive pixel_length."}
            )
        mm_per_px = float(req.reference_line_length_mm) / float(calc_pixel_len)

    if not mm_per_px or mm_per_px <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_CALIBRATION", "message": "Computed scale mm_per_pixel must be strictly positive."}
        )

    chosen_metric = req.width_metric if req.width_metric in ("average", "maximum") else "maximum"
    calib_record = {
        "method": req.method,
        "calibrated": True,
        "mm_per_pixel": round(mm_per_px, 6),
        "mm_per_px": round(mm_per_px, 6),
        "reference_line_length_mm": req.reference_line_length_mm,
        "pixel_length": round(req.pixel_length, 2) if req.pixel_length else None,
        "reference_p1": req.reference_p1,
        "reference_p2": req.reference_p2,
        "width_metric": chosen_metric,
        "user_id": current_user.id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    image.calibration = calib_record

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_CALIBRATE",
        entity_type="inspection_image",
        entity_id=image.id,
        details=calib_record
    )
    db.add(audit)
    db.flush()

    # Re-extract geometry & crack severity classification with new physical scale
    geo_res = None
    try:
        geo_payload = GeometryComputeRequest(
            force_recompute=True,
            mm_per_pixel=mm_per_px,
            width_metric=chosen_metric
        )
        geo_res = execute_geometry_calculation(
            image=image,
            payload=geo_payload,
            inspection_id=inspection_id or image.inspection_id,
            user_id=current_user.id,
            db=db
        )
    except Exception as geo_err:
        logger.warning("Failed recalculating geometry upon calibration for %s: %s", image.id, geo_err)

    db.commit()

    return {
        "status": "calibrated",
        "imageId": image.id,
        "calibration": calib_record,
        "crack_geometry": geo_res,
        "crackGeometry": geo_res,
        "severity_assessment": geo_res.get("summary", {}).get("severity_assessment") if geo_res else None,
        "damage_assessment": geo_res.get("summary", {}).get("damage_assessment") if geo_res else None,
        "damageAssessment": geo_res.get("summary", {}).get("damage_assessment") if geo_res else None,
    }


@router.delete("/images/{image_id}/calibration")
@router.delete("/inspections/{inspection_id}/images/{image_id}/calibrate")
def delete_image_calibration_endpoint(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Resets calibration on the image to uncalibrated mode and recomputes pixel geometry."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    image.calibration = None
    db.flush()

    geo_res = None
    try:
        geo_payload = GeometryComputeRequest(force_recompute=True, mm_per_pixel=None)
        geo_res = execute_geometry_calculation(
            image=image,
            payload=geo_payload,
            inspection_id=inspection_id or image.inspection_id,
            user_id=current_user.id,
            db=db
        )
    except Exception as e:
        logger.warning("Failed recalculating uncalibrated geometry for %s: %s", image.id, e)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_CALIBRATE_RESET",
        entity_type="inspection_image",
        entity_id=image.id,
        details={"status": "uncalibrated"}
    )
    db.add(audit)
    db.commit()

    return {
        "status": "uncalibrated",
        "imageId": image.id,
        "calibration": None,
        "crack_geometry": geo_res,
        "crackGeometry": geo_res,
        "severity_assessment": geo_res.get("summary", {}).get("severity_assessment") if geo_res else None,
        "damage_assessment": geo_res.get("summary", {}).get("damage_assessment") if geo_res else None,
        "damageAssessment": geo_res.get("summary", {}).get("damage_assessment") if geo_res else None,
    }


# ─── Image Replacement Endpoint ──────────────────────────────────────────────

@router.post("/images/{image_id}/replace")
@router.post("/inspections/{inspection_id}/images/{image_id}/replace")
async def replace_image_endpoint(
    image_id: str,
    inspection_id: Optional[str] = None,
    file: UploadFile = File(...),
    allow_warning: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Section 7: Replaces a rejected or substandard image with a fresh file."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    require_upload_permission(current_user, inspection)

    file_bytes = await file.read()
    filename = file.filename or "replacement.jpg"

    report = assess_quality(
        file_bytes,
        filename=filename,
        db_session=db,
        inspection_id=image.inspection_id,
        current_image_id=image.id
    )

    if report["overall"] == "rejected":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "IMAGE_QUALITY_REJECTED", "message": report["reason"], "report": report}
        )

    sha_hash = report["metrics"]["sha256"]
    orig_filename = f"{image.inspection_id}_{sha_hash[:12]}_{filename}"
    orig_path = os.path.join(UPLOAD_DIR, orig_filename)
    with open(orig_path, "wb") as f:
        f.write(file_bytes)

    image.filename = filename
    image.original_path = orig_path
    image.sha256 = sha_hash
    image.phash = report["metrics"]["phash"]
    image.width = report["metrics"]["width"]
    image.height = report["metrics"]["height"]
    image.file_size = len(file_bytes)
    image.quality_status = "accepted" if report["overall"] != "warning" or allow_warning else "warning"
    image.status = "valid" if image.quality_status == "accepted" else "warned"
    image.quality_report = report

    # Clean old AI inference and detections from replaced photo so stale results don't linger
    db.query(Detection).filter(Detection.image_id == image.id).delete()

    # Preprocess
    proc_bytes, thumb_bytes, run_record = preprocess_image(
        file_bytes,
        profile_name="general_v1",
        blur_warning=(report["overall"] == "warning")
    )
    proc_filename = f"proc_{image.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
    proc_path = os.path.join(PROCESSED_DIR, proc_filename)
    with open(proc_path, "wb") as f:
        f.write(proc_bytes)

    thumb_filename = f"thumb_{image.id}_{sha_hash[:10]}.jpg"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    image.processed_path = proc_path
    image.thumbnail_path = thumb_path
    image.processing_status = "complete"

    db.commit()

    return {
        "status": "replaced",
        "imageId": image.id,
        "quality_status": image.quality_status,
        "processing_status": image.processing_status,
        "qualityReport": report
    }


class ImageReviewActionRequest(BaseModel):
    decision: str = Field(..., description="accepted, rejected, warned, or manual_review")
    manual_classification: Optional[str] = Field(None, description="crack, no_crack, or uncertain")
    override_reason: Optional[str] = None
    notes: Optional[str] = None


@router.post("/images/{image_id}/review")
@router.post("/inspections/{inspection_id}/images/{image_id}/review")
def review_image_endpoint(
    image_id: str,
    req: ImageReviewActionRequest,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Per-photo inspector action: accept, reject, continue with warning, or mark for manual review.
    Allows manual classification (Crack, No Crack, Uncertain) with reviewer identity and override reason.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    require_upload_permission(current_user, inspection)

    decision = req.decision.lower()
    if decision == "accepted":
        image.status = "valid"
        image.quality_status = "accepted"
    elif decision == "rejected":
        image.status = "rejected"
        image.quality_status = "rejected"
    elif decision == "warned":
        image.status = "warned"
        image.quality_status = "warning"
    elif decision == "manual_review":
        image.status = "valid"
        image.quality_status = "manual_review"

    qr = dict(image.quality_report or {})
    manual_entry = {
        "reviewed_by": current_user.id,
        "reviewer_name": current_user.name,
        "decision": decision,
        "manual_classification": req.manual_classification,
        "override_reason": req.override_reason,
        "notes": req.notes,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    qr["manual_review"] = manual_entry
    image.quality_report = qr

    # If inspector manually classified crack or no_crack, record in detections as manual source
    if req.manual_classification in ("crack", "no_crack"):
        # Remove any prior manual classification for this image
        db.query(Detection).filter(
            Detection.image_id == image.id,
            Detection.source.in_(["inspector_manual", "engineer_manual"])
        ).delete()

        defect_type = "crack" if req.manual_classification == "crack" else "uncracked_concrete"
        severity = "moderate" if req.manual_classification == "crack" else "no_visible_damage"
        det = Detection(
            inspection_id=image.inspection_id,
            image_id=image.id,
            source="inspector_manual",
            defect_type=defect_type,
            geometry={
                "type": "manual_classification",
                "class": req.manual_classification,
                "notes": req.notes,
                "override_reason": req.override_reason
            },
            severity=severity,
            created_by=current_user.id,
            confidence=None,  # Strictly None for manual annotations
            model_id=None,    # Strictly None for manual annotations
            notes=f"Manual Classification by {current_user.name}: {req.manual_classification}. Reason: {req.override_reason or 'None'}"
        )
        db.add(det)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_REVIEW_ACTION",
        entity_type="inspection_image",
        entity_id=image.id,
        details={
            "decision": decision,
            "manual_classification": req.manual_classification,
            "override_reason": req.override_reason
        }
    )
    db.add(audit)
    db.commit()

    return {
        "status": "updated",
        "imageId": image.id,
        "imageStatus": image.status,
        "qualityStatus": image.quality_status,
        "manualReview": manual_entry
    }


class ImageAnnotationRequest(BaseModel):
    bbox: Dict[str, Any] = Field(..., description="Bounding box with x, y, width, height or coords")
    defect_type: str = Field("crack", description="Defect type, e.g. crack, spalling, efflorescence")
    severity: Optional[str] = Field("moderate", description="minor, moderate, severe, critical")
    notes: Optional[str] = None


@router.post("/images/{image_id}/annotations")
@router.post("/inspections/{inspection_id}/images/{image_id}/annotations")
def create_image_annotation_endpoint(
    image_id: str,
    req: ImageAnnotationRequest,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Saves a manual defect bounding box annotation drawn by an inspector or engineer.
    Annotated defects are saved with source='inspector_manual' or 'engineer_manual' and
    confidence=None, keeping them strictly distinct from AI predictions.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    user_role = (current_user.role or "").lower()
    source_tag = "engineer_manual" if user_role in ("engineer", "civil-engineer", "admin") else "inspector_manual"

    det = Detection(
        inspection_id=image.inspection_id,
        image_id=image.id,
        source=source_tag,
        defect_type=req.defect_type,
        geometry={
            "type": "bounding_box",
            "bbox": req.bbox,
            "author_role": user_role
        },
        severity=req.severity or "moderate",
        created_by=current_user.id,
        verified_by=current_user.id if user_role in ("engineer", "civil-engineer", "admin") else None,
        verified_at=datetime.now(timezone.utc) if user_role in ("engineer", "civil-engineer", "admin") else None,
        confidence=None,  # Strictly None for manual annotations
        model_id=None,    # Strictly None for manual annotations
        notes=req.notes or f"Manual bounding box defect drawn by {current_user.name}"
    )
    db.add(det)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ANNOTATION_CREATED",
        entity_type="detection",
        entity_id=det.id,
        details={
            "image_id": image.id,
            "defect_type": req.defect_type,
            "severity": req.severity,
            "bbox": req.bbox
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(det)

    return {
        "status": "created",
        "id": det.id,
        "imageId": image.id,
        "source": det.source,
        "defectType": det.defect_type,
        "defect_type": det.defect_type,
        "geometry": det.geometry,
        "severity": det.severity,
        "notes": det.notes
    }



# ─── Image Deletion Endpoint ──────────────────────────────────────────────────

@router.delete("/images/{image_id}")
@router.delete("/inspections/{inspection_id}/images/{image_id}")
def delete_image_endpoint(
    image_id: str,
    inspection_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Section 7: Soft-deletes an image."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    require_upload_permission(current_user, inspection)

    image.is_deleted = True
    db.commit()

    return {"status": "deleted", "imageId": image.id}


# ─── Interactive Image Transformation Endpoint (Crop, Rotate, Flip, Perspective) ──

@router.post("/images/{image_id}/transform")
async def transform_image_endpoint(
    image_id: str,
    req: ImageTransformRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Module 3 & 4: Interactive Image Cropping, Rotation, Flip & Perspective Correction.
    Updates the original image, re-assesses quality, and re-executes deterministic preprocessing.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    require_upload_permission(current_user, inspection)

    if not os.path.exists(image.original_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Original image file missing from storage")

    with open(image.original_path, "rb") as f:
        orig_bytes = f.read()

    crop_box = None
    if req.crop_w and req.crop_h and req.crop_w > 0 and req.crop_h > 0:
        crop_box = [req.crop_x or 0, req.crop_y or 0, req.crop_w, req.crop_h]

    transformed_bytes = transform_image(
        image_bytes=orig_bytes,
        rotation_deg=req.rotation_deg or 0,
        crop_box=crop_box,
        flip_h=bool(req.flip_h),
        flip_v=bool(req.flip_v),
        src_quad=req.src_quad
    )

    # Overwrite original image with transformed bytes
    with open(image.original_path, "wb") as f:
        f.write(transformed_bytes)

    # Re-assess quality
    report = assess_quality(
        transformed_bytes,
        filename=image.filename,
        db_session=db,
        inspection_id=image.inspection_id,
        current_image_id=image.id
    )

    image.sha256 = report["metrics"]["sha256"]
    image.phash = report["metrics"]["phash"]
    image.width = report["metrics"]["width"]
    image.height = report["metrics"]["height"]
    image.file_size = len(transformed_bytes)
    image.quality_status = "accepted" if report["overall"] != "rejected" else "warning"
    image.quality_report = report

    # Re-run preprocessing
    proc_bytes, thumb_bytes, run_record = preprocess_image(
        transformed_bytes,
        profile_name="general_v1",
        blur_warning=(report["overall"] == "warning")
    )

    proc_filename = f"proc_{image.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
    proc_path = os.path.join(PROCESSED_DIR, proc_filename)
    with open(proc_path, "wb") as f:
        f.write(proc_bytes)

    thumb_filename = f"thumb_{image.id}_{report['metrics']['sha256'][:10]}.jpg"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    image.processed_path = proc_path
    image.thumbnail_path = thumb_path
    image.processing_status = "complete"

    # Save run record
    now_utc = datetime.now(timezone.utc)
    run = ImageProcessingRun(
        image_id=image.id,
        profile=run_record["profile"],
        profile_version=run_record["profile_version"],
        status="complete",
        steps=run_record["steps"],
        metrics_before=run_record["metrics_before"],
        metrics_after=run_record["metrics_after"],
        transform=run_record["transform"],
        tiles=run_record["tiles"],
        processed_path=proc_path,
        thumbnail_path=thumb_path,
        processed_sha256=run_record["processed_sha256"],
        width=run_record["width"],
        height=run_record["height"],
        opencv_version=run_record["opencv_version"],
        started_at=now_utc,
        finished_at=now_utc,
        error_code=None
    )
    db.add(run)

    # Run AI classification automatically after transform
    target_to_classify = proc_path if (proc_path and os.path.exists(proc_path)) else image.original_path
    pred = run_and_persist_ai_classification(image, target_to_classify, db, current_user.id, image.inspection_id)
    if pred:
        report["ai_classification"] = pred

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_TRANSFORM",
        entity_type="inspection_image",
        entity_id=image.id,
        details={
            "rotation": req.rotation_deg,
            "crop": crop_box,
            "flip_h": req.flip_h,
            "flip_v": req.flip_v
        }
    )
    db.add(audit)
    db.commit()

    ts = int(time.time())
    v_tag = image.sha256[:10] if image.sha256 else str(ts)
    rfdetr_det = pred.get("rfdetr_detection") if pred else None
    has_rfdetr = bool(rfdetr_det and rfdetr_det.get("has_defect"))
    active_stage2_model = pred.get("active_stage2_model") if pred else None
    model_fallback = bool(pred.get("model_fallback") if pred else False)
    has_unet = bool(pred and pred.get("unet_segmentation"))
    has_geo = bool(pred and pred.get("crack_geometry"))
    has_yolo = bool(pred and pred.get("yolo_detection"))

    p_crack = float(pred.get("crack_probability", 0.0)) if pred else 0.0
    is_crack_defect = (p_crack >= 0.80 or (bool(pred.get("has_crack")) if pred else False))

    if is_crack_defect and has_unet:
        preview_url = f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}"
    elif has_rfdetr and not model_fallback:
        preview_url = f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}"
    elif has_unet:
        preview_url = f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}"
    elif image.processing_status == "complete":
        preview_url = f"/api/v1/images/{image.id}/file?variant=processed&v={v_tag}"
    else:
        preview_url = f"/api/v1/images/{image.id}/file?variant=original&v={v_tag}"

    return {
        "status": "transformed",
        "imageId": image.id,
        "width": image.width,
        "height": image.height,
        "qualityReport": report,
        "quality_report": report,
        "quality_status": image.quality_status,
        "processing_status": image.processing_status,
        "aiClassification": pred,
        "ai_classification": pred,
        "hasRfdetr": has_rfdetr,
        "has_rfdetr": has_rfdetr,
        "rfdetrDetection": rfdetr_det,
        "rfdetr_detection": rfdetr_det,
        "activeStage2Model": active_stage2_model,
        "active_stage2_model": active_stage2_model,
        "modelFallback": model_fallback,
        "model_fallback": model_fallback,
        "hasUnet": has_unet,
        "has_unet": has_unet,
        "unetSegmentation": pred.get("unet_segmentation") if pred else None,
        "unet_segmentation": pred.get("unet_segmentation") if pred else None,
        "hasGeometry": has_geo,
        "has_geometry": has_geo,
        "crackGeometry": pred.get("crack_geometry") if pred else None,
        "crack_geometry": pred.get("crack_geometry") if pred else None,
        "damageAssessment": pred.get("damage_assessment") if pred else None,
        "damage_assessment": pred.get("damage_assessment") if pred else None,
        "calibration": image.calibration,
        "hasYolo": has_yolo,
        "has_yolo": has_yolo,
        "yoloDetection": pred.get("yolo_detection") if pred else None,
        "yolo_detection": pred.get("yolo_detection") if pred else None,
        "previewUrl": preview_url,
        "originalUrl": f"/api/v1/images/{image.id}/file?variant=original&v={v_tag}",
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed&v={v_tag}",
        "thumbnailUrl": f"/api/v1/images/{image.id}/file?variant=thumbnail&v={v_tag}",
        "rfdetrUrl": f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}" if has_rfdetr else None,
        "unetUrl": f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}" if has_unet else None,
        "unetMaskUrl": f"/api/v1/images/{image.id}/file?variant=mask&v={v_tag}" if has_unet else None,
        "geometryUrl": f"/api/v1/images/{image.id}/file?variant=geometry&v={v_tag}" if has_geo else None,
        "annotatedUrl": (f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}" if (is_crack_defect and has_unet) else ((f"/api/v1/images/{image.id}/file?variant=rfdetr&v={v_tag}") if (has_rfdetr and not model_fallback) else ((f"/api/v1/images/{image.id}/file?variant=unet&v={v_tag}") if has_unet else None))),
    }


# ─── Data Augmentation Endpoint (Preview & ML Invariance) ─────────────────────

@router.get("/images/{image_id}/augmentations")
async def get_image_augmentations_endpoint(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Module 4: Generates deep learning data augmentation variants (flips, 90 deg rotation, contrast jitter).
    Returns descriptions and base64 preview data for interactive review.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    enforce_image_visibility(current_user, image, inspection)

    target_path = image.processed_path if (image.processed_path and os.path.exists(image.processed_path)) else image.original_path
    if not target_path or not os.path.exists(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file not found on storage")

    with open(target_path, "rb") as f:
        file_bytes = f.read()

    np_img = cv2.imdecode(np.frombuffer(file_bytes, np.uint8), cv2.IMREAD_COLOR)
    if np_img is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to decode image")

    # Downscale for snappy browser rendering
    h, w = np_img.shape[:2]
    if max(h, w) > 800:
        scale = 800.0 / max(h, w)
        np_img = cv2.resize(np_img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    img_rgb = cv2.cvtColor(np_img, cv2.COLOR_BGR2RGB)
    raw_augs = generate_augmentations(img_rgb)

    results = []
    for aug in raw_augs:
        bgr_var = cv2.cvtColor(aug["image"], cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", bgr_var, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            b64_str = base64.b64encode(buf.tobytes()).decode("utf-8")
            results.append({
                "name": aug["name"],
                "description": aug["description"],
                "data_uri": f"data:image/jpeg;base64,{b64_str}"
            })

    return {
        "imageId": image.id,
        "variants": results,
        "count": len(results)
    }


# ─── Public Benchmark Dataset Endpoints ───────────────────────────────────────

@router.get("/images/datasets/samples")
def get_dataset_samples_endpoint(
    current_user: User = Depends(get_current_user)
):
    """
    Module 3 Image Sources: Returns public infrastructure benchmark dataset samples
    (SDNET2018, METU/CCIC, RDD2022, CRACK500, Drone survey) for testing and evaluation.
    """
    return {
        "samples": DATASET_SAMPLES,
        "count": len(DATASET_SAMPLES)
    }


@router.post("/images/datasets/import", status_code=status.HTTP_201_CREATED)
async def import_dataset_sample_endpoint(
    req: DatasetImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Module 3: Imports a verified sample from public benchmark datasets into an active inspection.
    Executes complete capture -> validation -> quality assessment -> upload -> preprocessing workflow.
    """
    sample = next((s for s in DATASET_SAMPLES if s["id"] == req.sample_id), None)
    if not sample:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dataset sample {req.sample_id} not found")

    inspection = db.query(Inspection).filter(
        Inspection.id == req.inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    require_upload_permission(current_user, inspection)

    # Generate benchmark sample bytes
    sample_bytes = generate_benchmark_sample_bytes(sample)
    filename = f"{sample['id'].lower()}_{sample['dataset'].lower()}_sample.jpg"

    # Quality Assessment
    report = assess_quality(
        sample_bytes,
        filename=filename,
        db_session=db,
        inspection_id=inspection.id,
        asset_id=inspection.asset_id
    )

    if sample.get("drone_altitude") is not None or sample.get("drone_gimbal_pitch") is not None:
        report["drone"] = {
            "altitude_m": sample.get("drone_altitude"),
            "gimbal_pitch_deg": sample.get("drone_gimbal_pitch")
        }

    sha_hash = report["metrics"]["sha256"]
    phash_val = report["metrics"]["phash"]

    orig_filename = f"{inspection.id}_{sha_hash[:12]}_{filename}"
    orig_path = os.path.join(UPLOAD_DIR, orig_filename)
    with open(orig_path, "wb") as f:
        f.write(sample_bytes)

    source_val = sample.get("source", "dataset")

    img_record = InspectionImage(
        organization_id=current_user.organization_id,
        inspection_id=inspection.id,
        uploader_id=current_user.id,
        filename=filename,
        original_path=orig_path,
        thumbnail_path=None,
        processed_path=None,
        sha256=sha_hash,
        phash=phash_val,
        width=report["metrics"].get("width", 1920),
        height=report["metrics"].get("height", 1080),
        file_size=len(sample_bytes),
        source=source_val,
        status="valid",
        quality_status="accepted",
        processing_status="queued",
        quality_report=report
    )
    db.add(img_record)
    db.flush()

    # Preprocessing
    proc_bytes, thumb_bytes, run_record = preprocess_image(
        sample_bytes,
        profile_name="general_v1",
        blur_warning=False
    )

    proc_filename = f"proc_{img_record.id}_general_v1_{run_record['processed_sha256'][:10]}.png"
    proc_path = os.path.join(PROCESSED_DIR, proc_filename)
    with open(proc_path, "wb") as f:
        f.write(proc_bytes)

    thumb_filename = f"thumb_{img_record.id}_{sha_hash[:10]}.jpg"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    img_record.processed_path = proc_path
    img_record.thumbnail_path = thumb_path
    img_record.processing_status = "complete"

    now_import = datetime.now(timezone.utc)
    run = ImageProcessingRun(
        image_id=img_record.id,
        profile="general_v1",
        profile_version="1.0.0",
        status="complete",
        steps=run_record["steps"],
        metrics_before=run_record["metrics_before"],
        metrics_after=run_record["metrics_after"],
        transform=run_record["transform"],
        tiles=run_record["tiles"],
        processed_path=proc_path,
        thumbnail_path=thumb_path,
        processed_sha256=run_record["processed_sha256"],
        width=run_record["width"],
        height=run_record["height"],
        opencv_version=run_record["opencv_version"],
        started_at=now_import,
        finished_at=now_import,
        error_code=None
    )
    db.add(run)

    if inspection.status in ("draft", "assigned", "in_progress"):
        inspection.status = "images_uploaded"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="DATASET_SAMPLE_IMPORT",
        entity_type="inspection_image",
        entity_id=img_record.id,
        details={"sample_id": sample["id"], "dataset": sample["dataset"]}
    )
    db.add(audit)

    # Auto-run AI classification on benchmark sample
    target_to_classify = proc_path if (proc_path and os.path.exists(proc_path)) else orig_path
    pred = run_and_persist_ai_classification(img_record, target_to_classify, db, current_user.id, inspection.id)
    if pred:
        report["ai_classification"] = pred

    db.commit()
    db.refresh(img_record)

    return {
        "id": img_record.id,
        "inspectionId": img_record.inspection_id,
        "filename": img_record.filename,
        "width": img_record.width,
        "height": img_record.height,
        "fileSize": img_record.file_size,
        "status": img_record.status,
        "quality_status": img_record.quality_status,
        "processing_status": img_record.processing_status,
        "sha256": img_record.sha256,
        "phash": img_record.phash,
        "qualityReport": report,
        "aiClassification": pred,
        "previewUrl": f"/api/v1/images/{img_record.id}/file?variant=processed",
        "originalUrl": f"/api/v1/images/{img_record.id}/file?variant=original",
        "thumbnailUrl": f"/api/v1/images/{img_record.id}/file?variant=thumbnail",
        "createdAt": img_record.created_at.isoformat()
    }
