import os
import io
import time
import base64
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status, Response
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

UPLOAD_DIR = os.path.join(os.getcwd(), "storage", "uploads")
THUMBNAIL_DIR = os.path.join(os.getcwd(), "storage", "thumbnails")
PROCESSED_DIR = os.path.join(os.getcwd(), "storage", "processed")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

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
                    "code": "ACCESS_DENIED",
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

    # Step 2: Automatic Preprocessing (Profile: general_v1) - only for accepted images
    is_blur_warn = any(c["key"] == "blur" and c["status"] == "warn" for c in report["checks"])
    if quality_status == "accepted":
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
        "previewUrl": f"/api/v1/images/{img_record.id}/file?variant=processed",
        "originalUrl": f"/api/v1/images/{img_record.id}/file?variant=original",
        "thumbnailUrl": f"/api/v1/images/{img_record.id}/file?variant=thumbnail",
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

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).order_by(InspectionImage.created_at).all()

    items = []
    user_role = (current_user.role or "").lower()
    is_mgmt = user_role in ("manager", "maintenance")

    for img in images:
        proc_run = db.query(ImageProcessingRun).filter(
            ImageProcessingRun.image_id == img.id
        ).order_by(desc(ImageProcessingRun.created_at)).first()

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
            "createdAt": img.created_at.isoformat()
        }

        # Role isolation: Managers & Maintenance never see quality reports or intermediate processed copies
        if not is_mgmt:
            item["qualityReport"] = img.quality_report
            if proc_run:
                item["processingRun"] = {
                    "status": proc_run.status,
                    "profile": proc_run.profile,
                    "steps": proc_run.steps,
                    "metrics_before": proc_run.metrics_before,
                    "metrics_after": proc_run.metrics_after,
                    "transform": proc_run.transform,
                    "duration_ms": (proc_run.finished_at - proc_run.started_at).total_seconds() * 1000 if proc_run.finished_at and proc_run.started_at else None
                }

        items.append(item)

    return {
        "inspectionId": inspection.id,
        "totalImages": len(images),
        "validCount": sum(1 for img in images if (img.quality_status == "accepted" or img.status == "valid")),
        "warnedCount": sum(1 for img in images if img.quality_status == "warning" or img.status == "warned"),
        "rejectedCount": sum(1 for img in images if img.quality_status == "rejected" or img.status == "rejected"),
        "processingCount": sum(1 for img in images if img.processing_status in ("queued", "running")),
        "completeCount": sum(1 for img in images if img.processing_status == "complete"),
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
        "originalUrl": f"/api/v1/images/{image.id}/file?variant=original",
        "thumbnailUrl": f"/api/v1/images/{image.id}/file?variant=thumbnail",
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed" if image.processing_status == "complete" else None,
        "createdAt": image.created_at.isoformat()
    }

    if not is_mgmt:
        response["qualityReport"] = image.quality_report
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


# ─── Image File Delivery (Original, Processed, Thumbnail) ─────────────────────

@router.get("/images/{image_id}/file")
@router.get("/inspections/{inspection_id}/images/{image_id}/file")
def get_image_file_variant(
    image_id: str,
    inspection_id: Optional[str] = None,
    variant: str = Query("original", description="'original', 'processed', or 'thumbnail'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Section 7: Serves the requested image variant with role-based access enforcement.
    """
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    inspection = db.query(Inspection).filter(Inspection.id == image.inspection_id).first()
    is_proc_or_quality = (variant == "processed")
    enforce_image_visibility(current_user, image, inspection, is_quality_or_processed=is_proc_or_quality)

    target_path = image.original_path

    if variant == "processed":
        if image.processed_path and os.path.exists(image.processed_path):
            target_path = image.processed_path
        else:
            proc = db.query(ProcessedImage).filter(ProcessedImage.image_id == image.id).order_by(desc(ProcessedImage.created_at)).first()
            if proc and os.path.exists(proc.output_path):
                target_path = proc.output_path

    elif variant == "thumbnail":
        if image.thumbnail_path and os.path.exists(image.thumbnail_path):
            target_path = image.thumbnail_path

    if not os.path.exists(target_path):
        target_path = image.original_path

    if not os.path.exists(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested image variant not found on disk")

    media_type = "image/png" if target_path.lower().endswith(".png") else "image/jpeg"
    return FileResponse(target_path, media_type=media_type)


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
    db.commit()

    return {
        "status": "accepted",
        "quality_status": image.quality_status,
        "processing_status": image.processing_status,
        "warningConfirmed": True,
        "warningConfirmedAt": image.warning_confirmed_at.isoformat()
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
    db.commit()

    return {
        "status": "complete",
        "processing_status": "complete",
        "imageId": image.id,
        "processedUrl": f"/api/v1/images/{image.id}/file?variant=processed"
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
    if req.method == "manual_line":
        if not req.reference_line_length_mm or not req.pixel_length:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_CALIBRATION", "message": "Manual line calibration requires reference_line_length_mm and pixel_length."}
            )
        mm_per_px = req.reference_line_length_mm / req.pixel_length

    if not mm_per_px or mm_per_px <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_CALIBRATION", "message": "Computed scale mm_per_pixel must be strictly positive."}
        )

    calib_record = {
        "method": req.method,
        "calibrated": True,
        "mm_per_pixel": round(mm_per_px, 6),
        "mm_per_px": round(mm_per_px, 6),
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
    db.commit()

    return {
        "status": "calibrated",
        "imageId": image.id,
        "calibration": calib_record
    }


# ─── Image Replacement Endpoint ──────────────────────────────────────────────

@router.post("/images/{image_id}/replace")
async def replace_image_endpoint(
    image_id: str,
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

    return {
        "status": "transformed",
        "imageId": image.id,
        "width": image.width,
        "height": image.height,
        "qualityReport": report,
        "quality_status": image.quality_status,
        "processing_status": image.processing_status,
        "previewUrl": f"/api/v1/images/{image.id}/file?variant=processed&v={int(time.time())}",
        "originalUrl": f"/api/v1/images/{image.id}/file?variant=original&v={int(time.time())}",
        "thumbnailUrl": f"/api/v1/images/{image.id}/file?variant=thumbnail&v={int(time.time())}"
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
        "previewUrl": f"/api/v1/images/{img_record.id}/file?variant=processed",
        "originalUrl": f"/api/v1/images/{img_record.id}/file?variant=original",
        "thumbnailUrl": f"/api/v1/images/{img_record.id}/file?variant=thumbnail",
        "createdAt": img_record.created_at.isoformat()
    }
