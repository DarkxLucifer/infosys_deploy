import os
import io
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from PIL import Image

from app.database import get_db
from app.models.all_models import Inspection, InspectionImage, ProcessedImage, User, AuditLog
from app.security.jwt import get_current_user
from app.services.image_validation import validate_inspection_image, compute_sha256, compute_phash
from app.services.preprocessing import run_preprocessing_pipeline, PROFILES

router = APIRouter(prefix="", tags=["Image Capture & Upload"])

UPLOAD_DIR = os.path.join(os.getcwd(), "storage", "uploads")
THUMBNAIL_DIR = os.path.join(os.getcwd(), "storage", "thumbnails")
PROCESSED_DIR = os.path.join(os.getcwd(), "storage", "processed")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

ALLOWED_UPLOAD_ROLES = {"admin", "manager", "engineer", "civil-engineer", "inspector"}

def require_upload_permission(user: User, inspection: Inspection):
    """Enforces Check J9: Only assigned inspector, engineers, and administrators can upload."""
    user_role = (user.role or "").lower()
    if user_role not in ALLOWED_UPLOAD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Your role is not authorized to upload inspection imagery."}
        )
    if user_role == "inspector" and inspection.inspector_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Inspectors can only upload to their assigned inspections."}
        )

class ScaleCalibrationRequest(BaseModel):
    method: str = Field(..., description="'manual_line' or 'mm_per_pixel'")
    mm_per_pixel: Optional[float] = Field(None, gt=0.0, description="Millimetres per pixel (must be > 0)")
    reference_line_length_mm: Optional[float] = Field(None, gt=0.0, description="Real physical length in mm")
    pixel_length: Optional[float] = Field(None, gt=0.0, description="Length in pixels")

class PreprocessRequest(BaseModel):
    profile_name: str = Field("standard_crack_enhancement", description="Profile name from engine")

@router.post("/inspections/{inspection_id}/images", status_code=status.HTTP_201_CREATED)
async def upload_inspection_image(
    inspection_id: str,
    file: UploadFile = File(...),
    source: str = Form("upload"),
    allow_warning: bool = Form(False),
    gps_lat: Optional[float] = Form(None),
    gps_lng: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify inspection
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    require_upload_permission(current_user, inspection)

    file_bytes = await file.read()
    filename = file.filename or "uploaded_image.jpg"

    # Validation & Abuse check (Check J4, J6)
    is_valid, qual_status, metrics, pil_img = validate_inspection_image(file_bytes, filename)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": metrics.get("error", "IMAGE_VALIDATION_FAILED"),
                "message": metrics.get("message", "Image validation failed."),
                "metrics": metrics
            }
        )

    if qual_status == "warned" and not allow_warning:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "IMAGE_QUALITY_WARNING",
                "message": metrics.get("message", "Quality warning detected. User confirmation required to proceed."),
                "warning": metrics.get("warning"),
                "metrics": metrics
            }
        )

    # Cryptographic SHA256 & Perceptual dHash (Check J3)
    sha_hash = compute_sha256(file_bytes)
    phash_val = compute_phash(pil_img)

    # Duplicate check within inspection and asset (Check J2, J4)
    duplicate = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.sha256 == sha_hash,
        InspectionImage.is_deleted == False
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "DUPLICATE_IMAGE",
                "message": "An identical image has already been uploaded for this inspection.",
                "existingImageId": duplicate.id
            }
        )

    # Save original to disk
    orig_filename = f"{inspection.id}_{sha_hash[:12]}_{filename}"
    orig_path = os.path.join(UPLOAD_DIR, orig_filename)
    with open(orig_path, "wb") as f:
        f.write(file_bytes)

    # Generate and save thumbnail
    thumb = pil_img.copy()
    thumb.thumbnail((256, 256))
    thumb_filename = f"thumb_{inspection.id}_{sha_hash[:12]}.jpg"
    thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)
    thumb.save(thumb_path, format="JPEG", quality=80)

    # Create DB record (Check J3)
    img_record = InspectionImage(
        organization_id=current_user.organization_id,
        inspection_id=inspection.id,
        uploader_id=current_user.id,
        filename=filename,
        original_path=orig_path,
        thumbnail_path=thumb_path,
        sha256=sha_hash,
        phash=phash_val,
        width=metrics.get("width", pil_img.width),
        height=metrics.get("height", pil_img.height),
        file_size=len(file_bytes),
        source=source,
        status=qual_status,
        quality_report=metrics
    )
    db.add(img_record)
    db.flush()

    # Automatic initial preprocessing (CLAHE contrast enhancement, sharpening, noise reduction)
    try:
        proc_bytes, proc_checksum, steps_applied = run_preprocessing_pipeline(
            file_bytes,
            profile_name="standard_crack_enhancement"
        )
        proc_filename = f"proc_{img_record.id}_standard_{proc_checksum[:10]}.png"
        proc_path = os.path.join(PROCESSED_DIR, proc_filename)
        with open(proc_path, "wb") as f:
            f.write(proc_bytes)
        proc_record = ProcessedImage(
            image_id=img_record.id,
            profile_name="standard_crack_enhancement",
            steps_applied=steps_applied,
            output_path=proc_path,
            checksum=proc_checksum
        )
        db.add(proc_record)
    except Exception as e:
        print(f"Auto-preprocessing warning: {e}")

    # Update inspection status if currently assigned/in_progress
    if inspection.status in ("draft", "assigned", "in_progress"):
        inspection.status = "images_uploaded"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_UPLOAD",
        entity_type="inspection_image",
        entity_id=img_record.id,
        details={"filename": filename, "sha256": sha_hash, "status": qual_status}
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
        "sha256": img_record.sha256,
        "phash": img_record.phash,
        "qualityReport": img_record.quality_report,
        "createdAt": img_record.created_at.isoformat()
    }

@router.get("/inspections/{inspection_id}/images")
def list_inspection_images(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    # Organization verification
    if inspection.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Cross-organization inspection imagery access denied."}
        )

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).order_by(InspectionImage.created_at).all()

    return {
        "inspectionId": inspection.id,
        "totalImages": len(images),
        "validCount": sum(1 for img in images if img.status == "valid"),
        "warnedCount": sum(1 for img in images if img.status == "warned"),
        "rejectedCount": sum(1 for img in images if img.status == "rejected"),
        "items": [
            {
                "id": img.id,
                "filename": img.filename,
                "width": img.width,
                "height": img.height,
                "fileSize": img.file_size,
                "status": img.status,
                "sha256": img.sha256,
                "calibration": img.calibration,
                "qualityReport": img.quality_report,
                "createdAt": img.created_at.isoformat()
            }
            for img in images
        ]
    }

@router.get("/images/{image_id}/file")
@router.get("/inspections/{inspection_id}/images/{image_id}/file")
def get_image_file(
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
    if inspection and inspection.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Access denied to cross-organization image."}
        )

    if not os.path.exists(image.original_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file not found on disk")

    from fastapi.responses import FileResponse
    return FileResponse(image.original_path)

@router.get("/images/{image_id}/thumbnail")
def get_image_thumbnail(
    image_id: str,
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
    if inspection and inspection.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Access denied to cross-organization thumbnail."}
        )

    from fastapi.responses import FileResponse
    thumb_path = image.thumbnail_path if (image.thumbnail_path and os.path.exists(image.thumbnail_path)) else image.original_path
    return FileResponse(thumb_path)

@router.get("/images/{image_id}/processed")
@router.get("/inspections/{inspection_id}/images/{image_id}/processed")
def get_processed_image_file(
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
    if inspection and inspection.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Access denied to cross-organization thumbnail."}
        )

    from fastapi.responses import FileResponse
    proc = db.query(ProcessedImage).filter(ProcessedImage.image_id == image.id).order_by(ProcessedImage.created_at.desc()).first()
    if proc and os.path.exists(proc.output_path):
        return FileResponse(proc.output_path)

    # If not yet preprocessed, return original
    if os.path.exists(image.original_path):
        return FileResponse(image.original_path)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processed image not found")

@router.post("/images/{image_id}/confirm-warning")
def confirm_image_warning(
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces INS-8: Warning confirmation allows inspector to confirm flagged image."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    if image.status == "warned":
        image.status = "valid"
        qr = image.quality_report or {}
        qr["confirmed_by"] = current_user.id
        qr["confirmed_at"] = datetime.now(timezone.utc).isoformat()
        image.quality_report = qr

        audit = AuditLog(
            user_id=current_user.id,
            actor_email=current_user.email,
            action="IMAGE_WARNING_CONFIRMED",
            entity_type="inspection_image",
            entity_id=image.id,
            details={"warning": qr.get("warning")}
        )
        db.add(audit)
        db.commit()

    return {"status": "valid", "imageId": image.id, "qualityReport": image.quality_report}

@router.post("/inspections/{inspection_id}/images/{image_id}/calibrate")
def calibrate_scale(
    inspection_id: str,
    image_id: str,
    req: ScaleCalibrationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces Check J7: Scale calibration (reference line or mm/px, > 0)."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.inspection_id == inspection_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

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

@router.delete("/inspections/{inspection_id}/images/{image_id}")
def delete_image(
    inspection_id: str,
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check J8: Soft-delete / mark removed image so other organizations or lists cannot access it."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.inspection_id == inspection_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    image.is_deleted = True

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="IMAGE_DELETE",
        entity_type="inspection_image",
        entity_id=image.id,
        details={"filename": image.filename}
    )
    db.add(audit)
    db.commit()

    return {"status": "deleted", "imageId": image.id}

@router.post("/images/{image_id}/preprocess")
def preprocess_image(
    image_id: str,
    req: PreprocessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Checks K1-K3: Runs deterministic preprocessing pipeline, stores output, reproducible checksum."""
    image = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    if not os.path.exists(image.original_path):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Original image file missing from storage.")

    with open(image.original_path, "rb") as f:
        orig_bytes = f.read()

    proc_bytes, checksum, steps_applied = run_preprocessing_pipeline(
        orig_bytes,
        profile_name=req.profile_name
    )

    out_filename = f"proc_{image.id}_{req.profile_name}_{checksum[:10]}.png"
    out_path = os.path.join(PROCESSED_DIR, out_filename)
    with open(out_path, "wb") as f:
        f.write(proc_bytes)

    proc_record = ProcessedImage(
        image_id=image.id,
        profile_name=req.profile_name,
        steps_applied=steps_applied,
        output_path=out_path,
        checksum=checksum
    )
    db.add(proc_record)
    db.commit()
    db.refresh(proc_record)

    return {
        "id": proc_record.id,
        "imageId": image.id,
        "profileName": proc_record.profile_name,
        "checksum": proc_record.checksum,
        "stepsApplied": proc_record.steps_applied,
        "createdAt": proc_record.created_at.isoformat()
    }
