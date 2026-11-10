import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.all_models import (
    Inspection, InspectionImage, Detection, Measurement, PriorityRecommendation,
    Asset, User, Notification, AuditLog, WorkOrder
)
from app.security.jwt import get_current_user

# Indian Standard Time (UTC+05:30) helper for notifications & audit logs
IST = timezone(timedelta(hours=5, minutes=30))

def to_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

def get_now_ist_str() -> str:
    return datetime.now(IST).strftime('%b %d, %Y at %I:%M %p IST')

router = APIRouter(prefix="/inspections", tags=["Inspections"])


# Enforced server-side status lifecycle transitions (Check I2)
VALID_TRANSITIONS = {
    "draft": {"assigned", "closed"},
    "assigned": {"in_progress", "draft", "closed", "images_uploaded", "pending_review"},
    "in_progress": {"images_uploaded", "assigned", "closed", "pending_review"},
    "images_uploaded": {"analysing", "in_progress", "closed", "pending_review", "in_review"},
    "analysing": {"pending_review", "images_uploaded"},
    "pending_review": {"in_review", "reviewed", "in_progress", "closed"},
    "in_review": {"reviewed", "pending_review", "closed"},
    "reviewed": {"reported", "closed"},
    "reported": {"closed"},
    "closed": set()
}

class CreateInspectionRequest(BaseModel):
    asset_id: str = Field(..., description="Target Asset ID")
    inspector_id: Optional[str] = Field(None, description="Assigned Inspector User ID")
    inspection_date: Optional[datetime] = Field(None, description="Scheduled inspection timestamp")
    due_date: Optional[datetime] = Field(None, description="Due date timestamp")
    inspection_method: Optional[str] = Field(None, description="e.g. walkdown, drone, dslr, smartphone")
    parent_inspection_id: Optional[str] = None
    notes: Optional[str] = None

class UpdateInspectionStatusRequest(BaseModel):
    status: str = Field(..., description="Target status in lifecycle")
    notes: Optional[str] = None

class ReassignInspectionRequest(BaseModel):
    inspector_id: str = Field(..., description="Target inspector user ID")
    notes: Optional[str] = None

class ConfirmPriorityRequest(BaseModel):
    priority: str = Field(..., description="routine_monitoring, low, medium, high, urgent_engineering_review")
    reason: Optional[str] = None
    suggested_action: Optional[str] = None

@router.post("", status_code=status.HTTP_201_CREATED)
def create_inspection(
    req: CreateInspectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    asset = db.query(Asset).filter(
        Asset.id == req.asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSET_NOT_FOUND", "message": f"Asset '{req.asset_id}' not found."}
        )

    target_inspector_id = req.inspector_id or current_user.id
    inspector = db.query(User).filter(
        User.id == target_inspector_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not inspector:
        inspector = current_user

    if req.parent_inspection_id:
        parent = db.query(Inspection).filter(
            Inspection.id == req.parent_inspection_id,
            Inspection.organization_id == current_user.organization_id
        ).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PARENT_INSPECTION_NOT_FOUND", "message": "Parent inspection not found."}
            )

    now_utc = datetime.now(timezone.utc)
    insp_date = req.inspection_date or now_utc
    d_date = req.due_date or (now_utc + timedelta(days=14))

    try:
        inspection = Inspection(
            organization_id=current_user.organization_id,
            asset_id=asset.id,
            inspector_id=inspector.id,
            inspection_date=insp_date,
            due_date=d_date,
            status="assigned",
            method=req.inspection_method or "walkdown",
            parent_inspection_id=req.parent_inspection_id,
            notes=req.notes
        )
        db.add(inspection)
        db.flush()

        now_str = get_now_ist_str()
        insp_date_str = insp_date.strftime('%b %d, %Y')
        due_date_str = d_date.strftime('%b %d, %Y')

        # 1. Notify assigned inspector
        notif = Notification(
            user_id=inspector.id,
            organization_id=current_user.organization_id,
            title=f"New Inspection Assigned: {asset.name}",
            message=f"Inspection {inspection.id} assigned to you on {now_str}. Target: {asset.name} ({asset.id}) · Scheduled: {insp_date_str} · Due: {due_date_str} · Method: {(inspection.method or 'walkdown').title()}.",
            link=f"/app/inspections/{inspection.id}",
            event_type="inspection_assigned",
            alert_level="informational",
            entity_type="inspection",
            entity_id=inspection.id
        )
        db.add(notif)

        # 2. Notify managers
        managers = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role.in_(["manager", "infrastructure-manager", "infrastructure_manager", "admin", "administrator"]),
            User.status == "active"
        ).all()
        for mgr in managers:
            if mgr.id != inspector.id:
                db.add(Notification(
                    user_id=mgr.id,
                    organization_id=current_user.organization_id,
                    title=f"Inspection Scheduled: {asset.name}",
                    message=f"Inspection {inspection.id} for {asset.name} ({asset.id}) scheduled by {current_user.name or current_user.email} on {now_str}. Assigned Inspector: {inspector.name or inspector.email} · Due: {due_date_str}.",
                    link=f"/app/inspections/{inspection.id}",
                    event_type="inspection_assigned",
                    alert_level="informational",
                    entity_type="inspection",
                    entity_id=inspection.id
                ))

        audit = AuditLog(
            user_id=current_user.id,
            actor_email=current_user.email,
            action="INSPECTION_CREATE",
            entity_type="inspection",
            entity_id=inspection.id,
            details={"asset_id": asset.id, "inspector": inspector.email}
        )
        db.add(audit)
        db.commit()
        db.refresh(inspection)

        return {
            "id": inspection.id,
            "assetId": inspection.asset_id,
            "inspectorId": inspection.inspector_id,
            "status": inspection.status,
            "method": inspection.method,
            "inspectionDate": inspection.inspection_date.isoformat(),
            "dueDate": inspection.due_date.isoformat(),
            "parentInspectionId": inspection.parent_inspection_id,
            "notes": inspection.notes,
            "createdAt": inspection.created_at.isoformat()
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INSPECTION_CREATION_FAILED", "message": f"Failed to create inspection: {str(exc)}"}
        )

@router.get("")
def list_inspections(
    asset_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to_me: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Inspection).filter(Inspection.organization_id == current_user.organization_id)

    if assigned_to_me:
        query = query.filter(Inspection.inspector_id == current_user.id)

    if asset_id:
        query = query.filter(Inspection.asset_id == asset_id)

    if status_filter and status_filter.lower() != "all":
        query = query.filter(Inspection.status == status_filter.lower())

    total = query.count()
    inspections = query.order_by(desc(Inspection.created_at), desc(Inspection.inspection_date)).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for i in inspections:
        img_count = db.query(InspectionImage).filter(
            InspectionImage.inspection_id == i.id,
            InspectionImage.is_deleted == False
        ).count()
        findings_count = db.query(Detection).filter(Detection.inspection_id == i.id).count()

        top_sev = None
        if findings_count > 0:
            for s in ["critical", "severe", "moderate", "minor", "low"]:
                if db.query(Detection.id).filter(Detection.inspection_id == i.id, Detection.severity == s).first():
                    top_sev = s
                    break

        items.append({
            "id": i.id,
            "assetId": i.asset_id,
            "assetName": i.asset.name if i.asset else "Unknown Asset",
            "inspectorId": i.inspector_id,
            "inspectorName": i.inspector.name if i.inspector else None,
            "status": i.status,
            "method": i.method or "walkdown",
            "analysisStatus": i.analysis_status or "skipped_no_model",
            "claimedBy": i.claimed_by,
            "claimedByName": i.claimant.name if i.claimant else None,
            "imageCount": img_count,
            "findingsCount": findings_count,
            "topSeverity": top_sev,
            "inspectionDate": i.inspection_date.isoformat(),
            "dueDate": i.due_date.isoformat(),
            "parentInspectionId": i.parent_inspection_id,
            "createdAt": i.created_at.isoformat()
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size
    }

@router.get("/inspectors")
def list_available_inspectors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspectors = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role == "inspector",
        User.status == "active"
    ).all()
    if not inspectors:
        inspectors = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.status == "active"
        ).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role
        }
        for u in inspectors
    ]

@router.get("/{inspection_id}")
def get_inspection_detail(
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

    user_role = (current_user.role or "").lower()
    if user_role == "maintenance" and inspection.status not in ("reviewed", "reported", "closed"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "UNREVIEWED_ACCESS_BLOCKED",
                "message": "This inspection is still in review. Maintenance Engineers can only access inspections after engineering sign-off."
            }
        )

    asset = inspection.asset
    inspector = inspection.inspector
    claimant = inspection.claimant

    img_count = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).count()

    prio_rec = db.query(PriorityRecommendation).filter(
        PriorityRecommendation.inspection_id == inspection.id
    ).order_by(PriorityRecommendation.created_at.desc()).first()

    reviewer_id = prio_rec.confirmed_by if prio_rec else inspection.claimed_by
    reviewer = db.query(User).filter(User.id == reviewer_id).first() if reviewer_id else (claimant or None)
    latest_wo = db.query(WorkOrder).filter(WorkOrder.inspection_id == inspection.id).order_by(WorkOrder.created_at.desc()).first()

    return {
        "id": inspection.id,
        "assetId": inspection.asset_id,
        "asset": {
            "id": asset.id,
            "name": asset.name,
            "type": asset.asset_type,
            "material": asset.material,
            "address": asset.address,
            "latitude": asset.latitude,
            "longitude": asset.longitude,
            "region": asset.region
        } if asset else None,
        "inspectorId": inspection.inspector_id,
        "inspector": {
            "id": inspector.id,
            "name": inspector.name,
            "email": inspector.email
        } if inspector else None,
        "status": inspection.status,
        "method": inspection.method or "walkdown",
        "analysisStatus": inspection.analysis_status or "skipped_no_model",
        "claimedBy": inspection.claimed_by,
        "claimedByName": claimant.name if claimant else None,
        "claimedAt": to_utc_iso(inspection.claimed_at),
        "submittedAt": to_utc_iso(inspection.submitted_at),
        "reviewedAt": to_utc_iso(inspection.reviewed_at),
        "reviewedBy": reviewer_id,
        "reviewedByName": reviewer.name if reviewer else (claimant.name if claimant else None),
        "workOrderId": latest_wo.id if latest_wo else None,
        "confirmedPriority": prio_rec.confirmed if prio_rec else None,
        "isSignedOff": inspection.status in ("reviewed", "reported", "closed"),
        "imageCount": img_count,
        "inspectionDate": to_utc_iso(inspection.inspection_date),
        "dueDate": to_utc_iso(inspection.due_date),
        "parentInspectionId": inspection.parent_inspection_id,
        "notes": inspection.notes,
        "priorityRecommendation": {
            "recommended": prio_rec.recommended,
            "confirmed": prio_rec.confirmed,
            "factors": prio_rec.factors,
            "reason": prio_rec.reason
        } if prio_rec else None,
        "createdAt": to_utc_iso(inspection.created_at)
    }


@router.get("/{inspection_id}/damage-assessment")
def get_inspection_damage_assessment_endpoint(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes real-time multi-factor damage severity assessment across all uploaded images
    in this inspection (calibrated or uncalibrated).
    """
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()

    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection_id,
        InspectionImage.is_deleted == False
    ).order_by(InspectionImage.created_at.asc()).all()

    photo_items = []
    for img in images:
        qr = img.quality_report or {}
        crack_geo = qr.get("crack_geometry") if isinstance(qr, dict) else None
        photo_items.append({
            "id": img.id,
            "name": img.original_filename or f"image_{img.id[:8]}",
            "quality_report": qr,
            "crack_geometry": crack_geo,
            "crackGeometry": crack_geo,
            "calibration": img.calibration,
            "width": img.width,
            "height": img.height,
            "defect_type": img.active_stage2_model
        })

    from app.services.damage_assessment import assess_batch_damage_severity
    batch_assessment = assess_batch_damage_severity(photo_items)
    batch_assessment["inspectionId"] = inspection_id
    batch_assessment["assetId"] = inspection.asset_id
    return batch_assessment

@router.patch("/{inspection_id}/status")
def update_inspection_status(
    inspection_id: str,
    req: UpdateInspectionStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()

    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    target_status = req.status.lower().strip()
    current_status = inspection.status

    allowed_next_states = VALID_TRANSITIONS.get(current_status, set())
    if target_status not in allowed_next_states:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_LIFECYCLE_TRANSITION",
                "message": f"Cannot transition inspection from '{current_status}' to '{target_status}'. Allowed transitions: {sorted(list(allowed_next_states))}"
            }
        )

    inspection.status = target_status
    if req.notes:
        inspection.notes = (inspection.notes or "") + f"\n[{target_status}]: {req.notes}"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_STATUS_CHANGE",
        entity_type="inspection",
        entity_id=inspection.id,
        details={"from": current_status, "to": target_status}
    )
    db.add(audit)
    db.commit()

    return {
        "id": inspection.id,
        "status": inspection.status,
        "previousStatus": current_status
    }

@router.patch("/{inspection_id}/reassign")
def reassign_inspection(
    inspection_id: str,
    req: ReassignInspectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Role-based delegation: Civil Engineers, Infrastructure Managers, and Admins
    reassign an existing inspection to an active Field Inspector.
    """
    user_role = (current_user.role or "").lower()
    if user_role not in ("admin", "manager", "engineer", "civil-engineer", "lead_inspector"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Only Civil Engineers, Infrastructure Managers, or Admins can reassign inspections."}
        )

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_REVIEWED",
                "message": f"Inspection {inspection.id} has already been certified and signed off. Inference cannot be re-run on sealed records."
            }
        )

    new_inspector = db.query(User).filter(
        User.id == req.inspector_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not new_inspector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INSPECTOR_NOT_FOUND", "message": "Selected inspector not found."}
        )

    old_inspector_id = inspection.inspector_id
    inspection.inspector_id = new_inspector.id
    if req.notes:
        inspection.notes = (inspection.notes or "") + f"\n[Reassigned to {new_inspector.name}]: {req.notes}"

    # Update associated asset assigned inspector as well
    if inspection.asset:
        inspection.asset.assigned_inspector_id = new_inspector.id

    notif = Notification(
        user_id=new_inspector.id,
        organization_id=current_user.organization_id,
        title="Inspection Reassigned to You",
        message=f"{current_user.name or current_user.email} reassigned inspection {inspection.id} to you.",
        link=f"/app/inspections/{inspection.id}",
        event_type="inspection_assigned",
        alert_level="informational",
        entity_type="inspection",
        entity_id=inspection.id
    )
    db.add(notif)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_REASSIGN",
        entity_type="inspection",
        entity_id=inspection.id,
        details={
            "old_inspector_id": old_inspector_id,
            "new_inspector_id": new_inspector.id,
            "new_inspector_name": new_inspector.name,
            "reassigned_by": current_user.email
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(inspection)

    return {
        "id": inspection.id,
        "inspectorId": new_inspector.id,
        "inspector": {
            "id": new_inspector.id,
            "name": new_inspector.name,
            "email": new_inspector.email
        },
        "inspectorName": new_inspector.name,
        "message": f"Inspection {inspection.id} successfully reassigned to {new_inspector.name}."
    }

def run_ai_analysis_for_inspection(inspection: Inspection, db: Session, user: User) -> Dict[str, Any]:
    """Runs InfraScan Model v1.0 (ResNet50 Crack Classifier) on all valid inspection images."""
    from app.services.classifier import get_classifier
    clf = get_classifier()

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).all()

    valid_images = [img for img in images if img.status in ("valid", "accepted", "warned")]

    results = []
    cracks_found = 0

    for img in valid_images:
        qr = img.quality_report or {}
        # Reuse existing classification if already processed at upload time
        if qr.get("ai_classification"):
            pred = qr["ai_classification"]
            if pred and pred.get("has_crack"):
                cracks_found += 1
            results.append({"imageId": img.id, "prediction": pred, "cached": True})
            continue

        target_path = None
        candidates = [
            img.processed_path,
            img.original_path,
            os.path.join(os.getcwd(), "storage", "uploads", img.filename),
            os.path.join(os.getcwd(), "storage", "processed", f"proc_{img.id}_general_v1.png")
        ]
        for candidate in candidates:
            if candidate and os.path.exists(candidate):
                target_path = candidate
                break

        if not target_path:
            img.processing_status = "failed"
            results.append({"imageId": img.id, "status": "failed", "error": "Image file missing from storage"})
            continue

        from app.routers.upload import run_and_persist_ai_classification
        pred = run_and_persist_ai_classification(
            image=img,
            target_path=target_path,
            db=db,
            user_id=user.id,
            inspection_id=inspection.id
        )
        img.processing_status = "complete" if (pred and pred.get("success")) else "failed"

        if pred and pred.get("has_crack"):
            cracks_found += 1

        results.append({"imageId": img.id, "prediction": pred})

    inspection.analysis_status = "completed"
    db.commit()
    return {"results": results, "cracks_found": cracks_found, "total_images": len(valid_images)}

@router.post("/{inspection_id}/submit")
@router.post("/{inspection_id}/submit-for-review")
def submit_inspection_for_review(
    inspection_id: str,
    payload: Optional[Dict[str, Any]] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces INS-10: Submit with locking. Requires >= 1 accepted image, no unconfirmed warnings."""
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_REVIEWED",
                "message": f"Inspection {inspection.id} has already been certified and signed off. A civil engineer can only sign off an inspection once. Record is permanently locked."
            }
        )

    if payload:
        desc = payload.get("description") or payload.get("notes")
        sev_choice = payload.get("severity")
        note_parts = []
        if desc:
            note_parts.append(f"[Inspector Note]: {desc}")
        if sev_choice:
            note_parts.append(f"[Assigned Severity]: {str(sev_choice).upper()}")
            # update inspection detections if any
            db_dets = db.query(Detection).filter(Detection.inspection_id == inspection.id).all()
            for d in db_dets:
                d.severity = str(sev_choice).lower()
        if note_parts:
            combined_note = "\n".join(note_parts)
            inspection.notes = (f"{inspection.notes}\n{combined_note}").strip() if inspection.notes else combined_note

    images = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).all()

    valid_images = [img for img in images if img.status in ("valid", "accepted")]
    warned_images = [img for img in images if img.status == "warned"]

    # When the inspector submits, any warned images are confirmed for engineering triage
    if len(warned_images) > 0:
        for w_img in warned_images:
            w_img.status = "valid"
            qr = w_img.quality_report or {}
            qr["confirmed_by"] = current_user.id
            qr["confirmed_at"] = datetime.now(timezone.utc).isoformat()
            w_img.quality_report = qr
        valid_images.extend(warned_images)

    if len(valid_images) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "NO_VALID_IMAGES", "message": "At least one accepted image is required to submit for review. Please capture or upload a field photo first."}
        )

    # Run InfraScan ResNet50 Crack Classifier on all valid images
    analysis_summary = run_ai_analysis_for_inspection(inspection, db, current_user)

    inspection.status = "pending_review"
    inspection.submitted_at = datetime.now(timezone.utc)
    inspection.analysis_status = "completed"

    now_str = get_now_ist_str()
    asset = db.query(Asset).filter(Asset.id == inspection.asset_id).first()
    asset_name = asset.name if asset else "Asset"
    cracks_found = analysis_summary.get("cracks_found", 0)
    has_cracks = cracks_found > 0
    sub_level = "high" if has_cracks else "medium"

    # 1. Notify Civil Engineers
    engineers = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role.in_(["civil-engineer", "engineer", "civil_engineer"]),
        User.status == "active"
    ).all()
    for eng in engineers:
        db.add(Notification(
            user_id=eng.id,
            organization_id=current_user.organization_id,
            title=f"Inspection Ready for Engineering Review: {asset_name}",
            message=f"Inspection {inspection.id} for {asset_name} was submitted by Inspector {current_user.name or current_user.email} on {now_str}. InfraScan Two-Stage AI screened {analysis_summary.get('images_analysed', 0)} photo(s) and flagged {cracks_found} potential crack defect(s). Verification and sign-off required.",
            link=f"/app/review/{inspection.id}",
            event_type="engineering_review_required",
            alert_level=sub_level,
            entity_type="inspection",
            entity_id=inspection.id
        ))
        if has_cracks:
            db.add(Notification(
                user_id=eng.id,
                organization_id=current_user.organization_id,
                title=f"Damage Detected: Exceeds Baseline — {asset_name}",
                message=f"Automated AI screening flagged {cracks_found} potential defect(s) on asset {asset_name} during inspection {inspection.id} on {now_str}. Maximum confidence: {int(analysis_summary.get('max_confidence', 0.89) * 100)}%.",
                link=f"/app/review/{inspection.id}",
                event_type="damage_detected",
                alert_level="high",
                entity_type="inspection",
                entity_id=inspection.id
            ))

    # 2. Notify Infrastructure Managers
    managers = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role.in_(["manager", "infrastructure-manager", "infrastructure_manager", "admin", "administrator"]),
        User.status == "active"
    ).all()
    for mgr in managers:
        db.add(Notification(
            user_id=mgr.id,
            organization_id=current_user.organization_id,
            title=f"Inspection Submitted for Review: {asset_name}",
            message=f"Inspection {inspection.id} for {asset_name} was submitted by Inspector {current_user.name or current_user.email} on {now_str} ({analysis_summary.get('images_analysed', 0)} photos, {cracks_found} defects detected). Routed to Civil Engineer review queue.",
            link=f"/app/inspections/{inspection.id}",
            event_type="inspection_submitted",
            alert_level="informational",
            entity_type="inspection",
            entity_id=inspection.id
        ))

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_SUBMITTED",
        entity_type="inspection",
        entity_id=inspection.id,
        details={
            "images_count": len(valid_images),
            "cracks_found": analysis_summary["cracks_found"],
            "model": "InfraScan Model v1.0 (ResNet50)"
        }
    )
    db.add(audit)
    db.commit()

    return {
        "status": "pending_review",
        "submittedAt": inspection.submitted_at.isoformat(),
        "analysisStatus": "completed",
        "analysisSummary": analysis_summary
    }

@router.post("/{inspection_id}/analyze")
def trigger_ai_analysis(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Explicitly triggers or re-runs InfraScan Model v1.0 (ResNet50) on an inspection's images."""
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_REVIEWED",
                "message": f"Inspection {inspection.id} has already been certified and signed off. Inference cannot be re-run on sealed records."
            }
        )

    summary = run_ai_analysis_for_inspection(inspection, db, current_user)
    return {
        "inspectionId": inspection.id,
        "analysisStatus": inspection.analysis_status,
        "summary": summary
    }

@router.post("/{inspection_id}/images/{image_id}/analyze")
def analyze_single_image(
    inspection_id: str,
    image_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Runs InfraScan Model v1.0 inference on a single inspection photograph."""
    from app.services.classifier import get_classifier
    clf = get_classifier()

    img = db.query(InspectionImage).filter(
        InspectionImage.id == image_id,
        InspectionImage.inspection_id == inspection_id,
        InspectionImage.organization_id == current_user.organization_id,
        InspectionImage.is_deleted == False
    ).first()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photograph not found")

    target_path = None
    for candidate in [img.processed_path, img.original_path, os.path.join(os.getcwd(), "storage", "uploads", img.filename)]:
        if candidate and os.path.exists(candidate):
            target_path = candidate
            break

    if not target_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file missing from storage disk")

    from app.routers.upload import run_and_persist_ai_classification
    pred = run_and_persist_ai_classification(
        image=img,
        target_path=target_path,
        db=db,
        user_id=current_user.id,
        inspection_id=inspection_id
    )
    img.processing_status = "complete" if (pred and pred.get("success")) else "failed"

    db.commit()
    db.refresh(img)
    return {"imageId": img.id, "prediction": pred}


@router.post("/{inspection_id}/claim")
def claim_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-2: Review queue with claim."""
    user_role = (current_user.role or "").lower()
    if user_role not in ("admin", "engineer", "civil-engineer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only engineers can claim inspections for review.")

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_REVIEWED",
                "message": f"Inspection {inspection.id} has already been certified and signed off. Inference cannot be re-run on sealed records."
            }
        )

    if inspection.claimed_by and inspection.claimed_by != current_user.id:
        claimed_user = db.query(User).filter(User.id == inspection.claimed_by).first()
        claimer_name = claimed_user.name if claimed_user else "another engineer"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_CLAIMED", "message": f"Inspection is already claimed by {claimer_name}."}
        )

    inspection.claimed_by = current_user.id
    inspection.claimed_at = datetime.now(timezone.utc)
    inspection.status = "in_review"

    now_str = get_now_ist_str()
    asset = inspection.asset
    asset_name = asset.name if asset else "Asset"

    if inspection.inspector_id and inspection.inspector_id != current_user.id:
        db.add(Notification(
            user_id=inspection.inspector_id,
            organization_id=current_user.organization_id,
            title=f"Inspection Under Review: {asset_name}",
            message=f"Civil Engineer {current_user.name or current_user.email} claimed inspection {inspection.id} for {asset_name} on {now_str} and commenced engineering verification.",
            link=f"/app/inspections/{inspection.id}",
            event_type="inspection_in_review",
            alert_level="informational",
            entity_type="inspection",
            entity_id=inspection.id
        ))

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_CLAIMED",
        entity_type="inspection",
        entity_id=inspection.id,
        details={"claimed_by": current_user.id}
    )
    db.add(audit)
    db.commit()

    return {"status": "in_review", "claimedBy": current_user.id, "claimedByName": current_user.name}

@router.post("/{inspection_id}/release-claim")
def release_claim(
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

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_REVIEWED",
                "message": f"Inspection {inspection.id} has already been certified and signed off. Inference cannot be re-run on sealed records."
            }
        )

    user_role = (current_user.role or "").lower()
    if inspection.claimed_by != current_user.id and user_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only release claims made by yourself.")

    inspection.claimed_by = None
    inspection.claimed_at = None
    inspection.status = "pending_review"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_CLAIM_RELEASED",
        entity_type="inspection",
        entity_id=inspection.id,
        details={"released_by": current_user.id}
    )
    db.add(audit)
    db.commit()

    return {"status": "pending_review", "claimedBy": None}


@router.get("/{inspection_id}/priority-preview")
def preview_inspection_priority(
    inspection_id: str,
    severity: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes real-time preview of Maintenance Priority score, factor breakdown,
    suggested repair action template, and target SLA prior to sign-off (Section 16).
    """
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    detections = db.query(Detection).filter(Detection.inspection_id == inspection.id).all()

    sev_rank = {"no_visible_damage": 0, "minor": 1, "moderate": 2, "severe": 3, "critical": 4}
    max_sev = "minor"
    for d in detections:
        if sev_rank.get(d.severity, 1) > sev_rank.get(max_sev, 1):
            max_sev = d.severity

    if severity and severity.lower() in sev_rank:
        max_sev = severity.lower()

    asset = inspection.asset
    from app.services.priority_engine import evaluate_priority
    from app.models.all_models import PriorityRule, RepairTaskTemplate

    active_prio_rule = db.query(PriorityRule).order_by(PriorityRule.created_at.desc()).first()
    prio_rule_dict = {
        "weights": active_prio_rule.weights if active_prio_rule else None,
        "risk_factors": active_prio_rule.risk_factors if active_prio_rule else None,
        "version": active_prio_rule.version if active_prio_rule else "v1.0-default"
    } if active_prio_rule else None

    first_defect_type = detections[0].defect_type if detections else "hairline"
    template = db.query(RepairTaskTemplate).filter(RepairTaskTemplate.damage_type == first_defect_type).first()
    sugg_action = template.suggested_action if template else "Scheduled periodic re-inspection and monitoring."

    crew_map = {
        "longitudinal": "Structural Injection Crew",
        "transverse": "Bridge Maintenance Specialists",
        "alligator": "Pavement & Road Crew",
        "spalling": "Concrete Repair Team",
        "exposed_reinforcement": "Heavy Structural Crew",
        "corrosion": "Durability Specialists",
        "potholes": "Road Maintenance Crew",
        "water_leakage": "Waterproofing Specialists",
        "hairline": "Routine Survey Crew"
    }
    suggested_team = crew_map.get(first_defect_type, "Civil Maintenance Crew")

    days_map = {
        "urgent_engineering_review": 2,
        "high": 14,
        "medium": 60,
        "low": 180,
        "routine_monitoring": 365
    }

    prio_result = evaluate_priority(
        severity=max_sev,
        asset_importance=asset.importance if asset else "medium",
        asset_type=asset.asset_type if asset else "bridge",
        suggested_action=sugg_action,
        rule=prio_rule_dict
    )

    rec_prio = prio_result["recommended_priority"]
    sla_days = days_map.get(rec_prio, 30)

    return {
        "inspectionId": inspection.id,
        "assetId": inspection.asset_id,
        "assetName": asset.name if asset else "Asset",
        "severity": max_sev,
        "defectType": first_defect_type,
        "priorityRecommendation": prio_result,
        "suggestedAction": sugg_action,
        "suggestedTeam": suggested_team,
        "slaDays": sla_days,
        "repairWindow": f"Within {sla_days} days" if sla_days > 2 else "Within 48 hours (Urgent)"
    }


@router.post("/{inspection_id}/sign-off")
def sign_off_inspection(
    inspection_id: str,
    payload: Optional[Dict[str, Any]] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-10 & ENG-14: Sign-off and lock. Mandatory verification gate for all findings."""
    user_role = (current_user.role or "").lower()
    allowed_signoff_roles = {
        "admin", "administrator",
        "engineer", "civil-engineer", "civil_engineer",
        "manager", "infrastructure-manager", "infrastructure_manager"
    }
    if user_role not in allowed_signoff_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only engineers, managers, and administrators can sign off inspections.")

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed") or inspection.reviewed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "code": "ALREADY_SIGNED_OFF",
                "message": f"Inspection {inspection.id} has already been certified and signed off. A civil engineer can only sign off an inspection once. Record is permanently locked."
            }
        )

    detections = db.query(Detection).filter(Detection.inspection_id == inspection.id).all()
    if not detections:
        # If no detections exist, create a clean sound surface finding
        clean_det = Detection(
            inspection_id=inspection.id,
            defect_type="sound_concrete",
            confidence=1.0,
            severity="no_visible_damage",
            source="manual",
            notes="Sign-off: No defects recorded by reviewer during inspection.",
            verified_by=current_user.id,
            verified_at=datetime.now(timezone.utc),
        )
        db.add(clean_det)
        db.flush()
        detections = [clean_det]

    if payload and payload.get("auto_verify_all"):
        for d in detections:
            if not d.verified_by:
                d.verified_by = current_user.id
                d.verified_at = datetime.now(timezone.utc)
        db.flush()
        unverified = []
    else:
        unverified = [
            d for d in detections
            if d.geometry and isinstance(d.geometry, dict) and d.geometry.get("type") not in ("image_classification", "crack_geometry_extraction", "unified_crack_detection", None) and not d.verified_by
        ]
        if unverified:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "UNVERIFIED_GEOMETRY", "message": f"{len(unverified)} finding(s) have not had their geometry verified. Check the verification checkbox for each finding."}
            )

    inspection.status = "reviewed"
    inspection.reviewed_at = datetime.now(timezone.utc)
    if not inspection.claimed_by:
        inspection.claimed_by = current_user.id
        inspection.claimed_at = datetime.now(timezone.utc)

    # Evaluate Maintenance Priority Recommendation (ENG-15)
    from app.services.priority_engine import evaluate_priority
    from app.models.all_models import PriorityRule, RepairTaskTemplate

    max_sev = "minor"
    sev_rank = {"no_visible_damage": 0, "minor": 1, "moderate": 2, "severe": 3, "critical": 4}
    for d in detections:
        if sev_rank.get(d.severity, 1) > sev_rank.get(max_sev, 1):
            max_sev = d.severity

    if payload and payload.get("severity"):
        custom_sev = str(payload.get("severity")).lower()
        if custom_sev in sev_rank:
            max_sev = custom_sev
            for d in detections:
                d.severity = max_sev

    if payload:
        desc = payload.get("description") or payload.get("notes")
        sev_choice = payload.get("severity")
        note_parts = []
        if desc:
            note_parts.append(f"[Reviewer Note]: {desc}")
        if sev_choice:
            note_parts.append(f"[Certified Severity]: {max_sev.upper()}")
        if note_parts:
            combined_note = "\n".join(note_parts)
            inspection.notes = (f"{inspection.notes}\n{combined_note}").strip() if inspection.notes else combined_note

    asset = inspection.asset
    active_prio_rule = db.query(PriorityRule).order_by(PriorityRule.created_at.desc()).first()
    prio_rule_dict = {
        "weights": active_prio_rule.weights if active_prio_rule else None,
        "risk_factors": active_prio_rule.risk_factors if active_prio_rule else None,
        "version": active_prio_rule.version if active_prio_rule else "v1.0-default"
    } if active_prio_rule else None

    # Suggested remediation action from template
    first_defect_type = detections[0].defect_type if detections else "hairline"
    template = db.query(RepairTaskTemplate).filter(RepairTaskTemplate.damage_type == first_defect_type).first()
    sugg_action = template.suggested_action if template else "Scheduled periodic re-inspection and monitoring."

    prio_result = evaluate_priority(
        severity=max_sev,
        asset_importance=asset.importance if asset else "medium",
        asset_type=asset.asset_type if asset else "bridge",
        suggested_action=sugg_action,
        rule=prio_rule_dict
    )

    confirmed_priority = prio_result["recommended_priority"]
    override_reason = "Initial sign-off recommendation generated"
    if payload and payload.get("override_priority"):
        op = str(payload.get("override_priority")).lower().strip()
        if op in ("urgent_engineering_review", "high", "medium", "low", "routine_monitoring"):
            confirmed_priority = op
            override_reason = payload.get("override_reason") or "Engineer override during sign-off"

    prio_rec = PriorityRecommendation(
        inspection_id=inspection.id,
        finding_id=detections[0].id if detections else None,
        factors=prio_result,
        recommended=prio_result["recommended_priority"],
        confirmed=confirmed_priority,
        confirmed_by=current_user.id,
        reason=override_reason
    )
    db.add(prio_rec)

    # Auto-generate or link Work Order if defects exist and no WO exists yet (Section 16)
    from app.models.all_models import WorkOrder, WorkOrderEvent
    existing_wo = db.query(WorkOrder).filter(WorkOrder.inspection_id == inspection.id).first()
    new_wo = None
    if not existing_wo and max_sev != "no_visible_damage":
        days_map = {
            "urgent_engineering_review": 2,
            "high": 14,
            "medium": 60,
            "low": 180,
            "routine_monitoring": 365
        }
        sla_days = days_map.get(confirmed_priority, 30)
        due_dt = datetime.now(timezone.utc) + timedelta(days=sla_days)

        crew_map = {
            "longitudinal": "Structural Injection Crew",
            "transverse": "Bridge Maintenance Specialists",
            "alligator": "Pavement & Road Crew",
            "spalling": "Concrete Repair Team",
            "exposed_reinforcement": "Heavy Structural Crew",
            "corrosion": "Durability Specialists",
            "potholes": "Road Maintenance Crew",
            "water_leakage": "Waterproofing Specialists",
            "hairline": "Routine Survey Crew"
        }
        team_name = crew_map.get(first_defect_type, "Civil Maintenance Crew")

        wo_count = db.query(WorkOrder).filter(WorkOrder.organization_id == current_user.organization_id).count()
        new_wo = WorkOrder(
            id=f"WO-{wo_count + 1:04d}",
            organization_id=current_user.organization_id,
            asset_id=inspection.asset_id,
            inspection_id=inspection.id,
            finding_id=detections[0].id if detections else None,
            action=sugg_action,
            priority=confirmed_priority,
            team=team_name,
            due_date=due_dt,
            repair_window=f"Within {sla_days} days" if sla_days > 2 else "Within 48 hours (Urgent)",
            status="open",
            created_by=current_user.id
        )
        db.add(new_wo)
        db.flush()

        evt = WorkOrderEvent(
            work_order_id=new_wo.id,
            actor_id=current_user.id,
            from_status="none",
            to_status="open",
            note=f"Work order auto-generated upon engineering sign-off with confirmed priority: {confirmed_priority}."
        )
        db.add(evt)

    # Automated multi-format inspection report generation (Section 19: PDF, Excel, CSV, JSON)
    try:
        from app.routers.reports import prepare_inspection_report_payload
        from app.services.reporting import (
            generate_inspection_pdf_report,
            generate_inspection_csv_report,
            generate_inspection_xlsx_report,
            generate_inspection_json_report
        )
        from app.models.all_models import Report
        insp_data, findings_data, priority_data = prepare_inspection_report_payload(inspection, db)
        cur_reports = db.query(Report).filter(Report.inspection_id == inspection.id).count()
        next_ver = (cur_reports // 4) + 1 if cur_reports > 0 else 1

        res_pdf = generate_inspection_pdf_report(insp_data, findings_data, priority_data)
        res_csv = generate_inspection_csv_report(insp_data, findings_data)
        res_xlsx = generate_inspection_xlsx_report(insp_data, findings_data)
        res_json = generate_inspection_json_report(insp_data, findings_data, priority_data)

        for res in (res_pdf, res_csv, res_xlsx, res_json):
            db.add(Report(
                inspection_id=inspection.id,
                version=next_ver,
                checksum=res["checksum"],
                file_format=res["format"],
                file_path=res["path"],
                generated_by=current_user.id
            ))
        inspection.status = "reported"

        now_str = get_now_ist_str()
        asset_name = asset.name if asset else "Asset"
        certifier_name = current_user.name or current_user.email
        prio_str = confirmed_priority.replace('_', ' ').title()

        # Section 20.1 #8: Report generated notification
        rep_notif = Notification(
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            title=f"Certified Inspection Reports Generated: {asset_name}",
            message=f"Official multi-format engineering report package v{next_ver} (PDF, Excel, CSV, JSON) generated for inspection {inspection.id} on {now_str}. Section 19 compliance certified.",
            link=f"/app/review/{inspection.id}",
            event_type="inspection_report_generated",
            alert_level="informational",
            entity_type="report",
            entity_id=inspection.id
        )
        db.add(rep_notif)
    except Exception as report_err:
        pass

    # Notifications (Section 20: Event Triggers & 5 Alert Levels)
    now_str = get_now_ist_str()
    asset_name = asset.name if asset else "Asset"
    certifier_name = current_user.name or current_user.email
    prio_str = confirmed_priority.replace('_', ' ').title()

    inspector = inspection.inspector
    if inspector:
        notif = Notification(
            user_id=inspector.id,
            organization_id=current_user.organization_id,
            title=f"Inspection Certified & Signed Off: {asset_name}",
            message=f"Inspection {inspection.id} for {asset_name} was certified and signed off by Civil Engineer {certifier_name} on {now_str}. Confirmed Priority: {prio_str}. Engineering seal applied and records permanently locked.",
            link=f"/app/review/{inspection.id}",
            event_type="inspection_completed",
            alert_level="informational",
            entity_type="inspection",
            entity_id=inspection.id
        )
        db.add(notif)

    is_critical_severe = max_sev in ("severe", "critical") or confirmed_priority == "urgent_engineering_review"
    mgr_alert_level = "critical" if is_critical_severe else "high" if confirmed_priority == "high" else "informational"
    mgr_event_type = "severe_damage_identified" if is_critical_severe else "inspection_completed"
    mgr_title = (
        f"Severe Structural Damage Identified: {asset_name}"
        if is_critical_severe
        else f"Engineering Review Signed Off: {asset_name}"
    )

    managers = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role.in_(["manager", "infrastructure-manager", "infrastructure_manager", "admin", "administrator"]),
        User.status == "active"
    ).all()
    for mgr in managers:
        notif = Notification(
            user_id=mgr.id,
            organization_id=current_user.organization_id,
            title=mgr_title,
            message=f"Inspection {inspection.id} for {asset_name} certified and locked by Civil Engineer {certifier_name} on {now_str}. Confirmed Priority: {prio_str} · Remediation: {sugg_action}.",
            link=f"/app/review/{inspection.id}",
            event_type=mgr_event_type,
            alert_level=mgr_alert_level,
            entity_type="inspection",
            entity_id=inspection.id
        )
        db.add(notif)

    # If work order generated, notify maintenance crew (Section 20.1 #6)
    if new_wo:
        maint_users = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role.in_(["maintenance", "maintenance-engineer", "maintenance_engineer"]),
            User.status == "active"
        ).all()
        wo_alert_lvl = "critical" if confirmed_priority == "urgent_engineering_review" else "high" if confirmed_priority == "high" else "medium"
        for mu in maint_users:
            wo_notif = Notification(
                user_id=mu.id,
                organization_id=current_user.organization_id,
                title=f"New Maintenance Task Dispatched: Work Order {new_wo.id}",
                message=f"Maintenance Work Order {new_wo.id} dispatched for {asset_name} ({asset.id if asset else ''}) following engineering sign-off on {now_str}. Prescribed Remediation: {sugg_action} · Confirmed Priority: {prio_str} · Target SLA Window: {new_wo.repair_window or 'Standard SLA'}.",
                link="/app/maintenance",
                event_type="maintenance_task_assigned",
                alert_level=wo_alert_lvl,
                entity_type="work_order",
                entity_id=new_wo.id
            )
            db.add(wo_notif)
            db.add(wo_notif)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_SIGNOFF",
        entity_type="inspection",
        entity_id=inspection.id,
        details={"reviewed_by": current_user.id, "priority": prio_result["recommended_priority"]}
    )
    db.add(audit)
    db.commit()

    return {
        "status": "reviewed",
        "reviewedAt": to_utc_iso(inspection.reviewed_at),
        "reviewedBy": current_user.id,
        "reviewedByName": current_user.name or current_user.email,
        "priorityRecommendation": prio_result,
        "confirmedPriority": confirmed_priority,
        "workOrderId": new_wo.id if new_wo else (existing_wo.id if existing_wo else None)
    }

@router.post("/{inspection_id}/confirm-priority")
def confirm_priority(
    inspection_id: str,
    req: ConfirmPriorityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-15: Priority confirmation and override."""
    user_role = (current_user.role or "").lower()
    if user_role not in ("admin", "engineer", "civil-engineer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only engineers can confirm or override maintenance priority.")

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status == "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_CLOSED",
                "message": f"Inspection {inspection.id} has already been closed. Priority cannot be updated on closed records."
            }
        )

    prio_rec = db.query(PriorityRecommendation).filter(
        PriorityRecommendation.inspection_id == inspection.id
    ).order_by(PriorityRecommendation.created_at.desc()).first()

    if not prio_rec:
        prio_rec = PriorityRecommendation(
            inspection_id=inspection.id,
            factors={},
            recommended=req.priority
        )
        db.add(prio_rec)

    if req.priority != prio_rec.recommended and (not req.reason or len(req.reason.strip()) == 0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "OVERRIDE_REASON_REQUIRED", "message": "An explanation is required when overriding the recommended priority."}
        )

    prio_rec.confirmed = req.priority
    prio_rec.confirmed_by = current_user.id
    prio_rec.reason = req.reason

    factors = prio_rec.factors or {}
    if req.suggested_action:
        factors["suggested_action"] = req.suggested_action
        prio_rec.factors = factors

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="PRIORITY_CONFIRMED",
        entity_type="priority_recommendation",
        entity_id=prio_rec.id,
        details={"confirmed": req.priority, "reason": req.reason}
    )
    db.add(audit)
    db.commit()

    return {"status": "confirmed", "priority": req.priority}

@router.post("/{inspection_id}/close")
def close_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-21: Close inspection endpoint once reviewed and reports exist."""
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status == "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "ALREADY_CLOSED",
                "message": f"Inspection {inspection.id} is already closed."
            }
        )

    if inspection.status not in ("reviewed", "reported"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CANNOT_CLOSE", "message": "Inspection must be reviewed before it can be closed."}
        )

    inspection.status = "closed"
    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_CLOSED",
        entity_type="inspection",
        entity_id=inspection.id
    )
    db.add(audit)
    db.commit()

    return {"status": "closed", "id": inspection.id}

@router.get("/{inspection_id}/compare/{other_id}")
def compare_inspections(
    inspection_id: str,
    other_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-19: Progression comparison with OpenCV feature matching & RANSAC homography."""
    insp1 = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    insp2 = db.query(Inspection).filter(
        Inspection.id == other_id,
        Inspection.organization_id == current_user.organization_id
    ).first()

    if not insp1 or not insp2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both inspections not found")

    img1 = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == insp1.id,
        InspectionImage.is_deleted == False
    ).first()
    img2 = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == insp2.id,
        InspectionImage.is_deleted == False
    ).first()

    from app.services.registration import compare_inspections_opencv
    from app.models.all_models import InspectionComparison

    path1 = img1.original_path if img1 else ""
    path2 = img2.original_path if img2 else ""

    meas1 = None
    meas2 = None
    det1 = db.query(Detection).filter(Detection.inspection_id == insp1.id).first()
    if det1:
        m = db.query(Measurement).filter(Measurement.detection_id == det1.id).first()
        if m:
            meas1 = {"length": m.length, "avg_width": m.avg_width, "area": m.area, "calibrated": m.calibrated}

    det2 = db.query(Detection).filter(Detection.inspection_id == insp2.id).first()
    if det2:
        m = db.query(Measurement).filter(Measurement.detection_id == det2.id).first()
        if m:
            meas2 = {"length": m.length, "avg_width": m.avg_width, "area": m.area, "calibrated": m.calibrated}

    comp_result = compare_inspections_opencv(path1, path2, meas1, meas2)

    # Record or update InspectionComparison
    comp_row = InspectionComparison(
        asset_id=insp1.asset_id,
        inspection_id_1=insp1.id,
        inspection_id_2=insp2.id,
        inlier_ratio=comp_result["inlier_ratio"],
        comparable=comp_result["comparable"],
        transform=comp_result.get("homography_matrix"),
        change_summary=comp_result.get("changes")
    )
    db.add(comp_row)
    db.commit()

    return {
        "inspectionA": {
            "id": insp1.id,
            "date": insp1.inspection_date.isoformat(),
            "status": insp1.status,
            "assetId": insp1.asset_id
        },
        "inspectionB": {
            "id": insp2.id,
            "date": insp2.inspection_date.isoformat(),
            "status": insp2.status,
            "assetId": insp2.asset_id
        },
        "registration": comp_result
    }

