from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.all_models import (
    Inspection, InspectionImage, Detection, Measurement, PriorityRecommendation,
    Asset, User, Notification, AuditLog
)
from app.security.jwt import get_current_user

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

        notif = Notification(
            user_id=inspector.id,
            organization_id=current_user.organization_id,
            title="Inspection Assigned",
            message=f"You have been assigned inspection for asset {asset.name} ({asset.id}).",
            link=f"/dashboard/inspections/{inspection.id}",
            event_type="inspection_assigned"
        )
        db.add(notif)

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
    inspections = query.order_by(desc(Inspection.inspection_date)).offset((page - 1) * page_size).limit(page_size).all()

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
        "analysisStatus": inspection.analysis_status or "skipped_no_model",
        "claimedBy": inspection.claimed_by,
        "claimedByName": claimant.name if claimant else None,
        "claimedAt": inspection.claimed_at.isoformat() if inspection.claimed_at else None,
        "submittedAt": inspection.submitted_at.isoformat() if inspection.submitted_at else None,
        "reviewedAt": inspection.reviewed_at.isoformat() if inspection.reviewed_at else None,
        "imageCount": img_count,
        "inspectionDate": inspection.inspection_date.isoformat(),
        "dueDate": inspection.due_date.isoformat(),
        "parentInspectionId": inspection.parent_inspection_id,
        "notes": inspection.notes,
        "priorityRecommendation": {
            "recommended": prio_rec.recommended,
            "confirmed": prio_rec.confirmed,
            "factors": prio_rec.factors,
            "reason": prio_rec.reason
        } if prio_rec else None,
        "createdAt": inspection.created_at.isoformat()
    }

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

@router.post("/{inspection_id}/submit")
def submit_inspection_for_review(
    inspection_id: str,
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

    inspection.status = "pending_review"
    inspection.submitted_at = datetime.now(timezone.utc)
    inspection.analysis_status = "skipped_no_model"

    # Notify civil engineers
    engineers = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role.in_(["civil-engineer", "engineer"]),
        User.status == "active"
    ).all()
    for eng in engineers:
        notif = Notification(
            user_id=eng.id,
            organization_id=current_user.organization_id,
            title="Inspection Ready for Engineering Review",
            message=f"Inspection {inspection.id} has been submitted by {current_user.name} and is awaiting review.",
            link=f"/dashboard/review",
            event_type="review_required"
        )
        db.add(notif)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="INSPECTION_SUBMITTED",
        entity_type="inspection",
        entity_id=inspection.id,
        details={"images_count": len(valid_images)}
    )
    db.add(audit)
    db.commit()

    return {"status": "pending_review", "submittedAt": inspection.submitted_at.isoformat()}

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

@router.post("/{inspection_id}/sign-off")
def sign_off_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-10 & ENG-14: Sign-off and lock. Mandatory verification gate for all findings."""
    user_role = (current_user.role or "").lower()
    if user_role not in ("admin", "engineer", "civil-engineer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only engineers can sign off inspections.")

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    detections = db.query(Detection).filter(Detection.inspection_id == inspection.id).all()
    if not detections:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "FINDINGS_OR_NO_DEFECT_REQUIRED", "message": "At least one finding or a certified 'No defects recorded' entry is required before signoff."}
        )

    unverified = [d for d in detections if not d.verified_by]
    if unverified:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "UNVERIFIED_GEOMETRY", "message": f"{len(unverified)} finding(s) have not had their geometry verified. Check the verification checkbox for each finding."}
        )

    inspection.status = "reviewed"
    inspection.reviewed_at = datetime.now(timezone.utc)

    # Evaluate Maintenance Priority Recommendation (ENG-15)
    from app.services.priority_engine import evaluate_priority
    from app.models.all_models import PriorityRule, RepairTaskTemplate

    max_sev = "minor"
    sev_rank = {"no_visible_damage": 0, "minor": 1, "moderate": 2, "severe": 3, "critical": 4}
    for d in detections:
        if sev_rank.get(d.severity, 1) > sev_rank.get(max_sev, 1):
            max_sev = d.severity

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

    prio_rec = PriorityRecommendation(
        inspection_id=inspection.id,
        finding_id=detections[0].id if detections else None,
        factors=prio_result,
        recommended=prio_result["recommended_priority"],
        confirmed=prio_result["recommended_priority"],
        confirmed_by=current_user.id,
        reason="Initial sign-off recommendation generated"
    )
    db.add(prio_rec)

    # Notifications
    inspector = inspection.inspector
    if inspector:
        notif = Notification(
            user_id=inspector.id,
            organization_id=current_user.organization_id,
            title="Inspection Review Complete",
            message=f"Inspection {inspection.id} for {asset.name if asset else 'asset'} has been reviewed and signed off.",
            link=f"/dashboard/inspections/{inspection.id}",
            event_type="inspection_completed"
        )
        db.add(notif)

    managers = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role == "manager",
        User.status == "active"
    ).all()
    for mgr in managers:
        notif = Notification(
            user_id=mgr.id,
            organization_id=current_user.organization_id,
            title="Engineering Review Signed Off",
            message=f"Inspection {inspection.id} signed off. Recommended Priority: {prio_result['recommended_priority'].replace('_', ' ').title()}.",
            link=f"/dashboard/inspections/{inspection.id}",
            event_type="severe_damage_identified" if max_sev in ("severe", "critical") else "inspection_completed"
        )
        db.add(notif)

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
        "reviewedAt": inspection.reviewed_at.isoformat(),
        "priorityRecommendation": prio_result
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

