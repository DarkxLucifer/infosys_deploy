from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import (
    Inspection, InspectionImage, Detection, Measurement, Review,
    Asset, User, AuditLog, SeverityRule
)
from app.security.jwt import get_current_user
from app.services.geometry import process_geometry_and_measure
from app.services.severity_engine import evaluate_severity

router = APIRouter(prefix="", tags=["Engineer Findings & Annotations"])

ENGINEER_ROLES = {"admin", "engineer", "civil-engineer", "civil_engineer"}

def require_engineer(user: User):
    user_role = (user.role or "").lower()
    if user_role not in ENGINEER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Only licensed Civil Engineers and Administrators can annotate and verify findings."}
        )

class GeometryPayload(BaseModel):
    type: str = Field("crack_polyline", description="'crack_polyline', 'damage_polygon', or 'roi'")
    points: List[List[float]] = Field(default_factory=list)
    width_segments: Optional[List[List[List[float]]]] = None
    roi_points: Optional[List[List[float]]] = None
    branching: Optional[int] = 0

class CreateDetectionRequest(BaseModel):
    image_id: str
    defect_type: str = Field(..., description="e.g. longitudinal, transverse, alligator, spalling, corrosion")
    geometry: GeometryPayload
    severity: Optional[str] = None
    notes: Optional[str] = None

class UpdateDetectionRequest(BaseModel):
    defect_type: Optional[str] = None
    geometry: Optional[GeometryPayload] = None
    severity: Optional[str] = None
    override_reason: Optional[str] = None
    notes: Optional[str] = None

class VerifyGeometryRequest(BaseModel):
    confirmed: bool = Field(True, description="Must be true to certify geometry verification")

@router.get("/inspections/{inspection_id}/detections")
def list_inspection_detections(
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

    # Section 4 Visibility Gate: Managers and Maintenance cannot view unreviewed findings
    user_role = (current_user.role or "").lower()
    if user_role in ("manager", "maintenance") and inspection.status not in ("reviewed", "reported", "closed"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNREVIEWED_ACCESS_BLOCKED", "message": "Managers and Maintenance personnel cannot access unreviewed inspection findings."}
        )

    detections = db.query(Detection).filter(
        Detection.inspection_id == inspection.id
    ).order_by(Detection.created_at).all()

    items = []
    all_verified = True
    for d in detections:
        meas = db.query(Measurement).filter(Measurement.detection_id == d.id).first()
        reviews = db.query(Review).filter(Review.detection_id == d.id).order_by(Review.created_at.desc()).all()
        
        if not d.verified_by:
            all_verified = False

        meas_dict = {
            "id": meas.id if meas else None,
            "length": meas.length if meas else 0.0,
            "avg_width": meas.avg_width if meas else 0.0,
            "max_width": meas.max_width if meas else 0.0,
            "area": meas.area if meas else 0.0,
            "orientation": meas.orientation if meas else 0.0,
            "branching": meas.branching if meas else 0,
            "density": meas.density if meas else None,
            "unit": meas.unit if meas else "px",
            "calibrated": meas.calibrated if meas else False,
            "uncertainty": meas.uncertainty if meas else None,
        } if meas else None

        items.append({
            "id": d.id,
            "inspectionId": d.inspection_id,
            "imageId": d.image_id,
            "source": d.source,
            "defectType": d.defect_type,
            "geometry": d.geometry,
            "severity": d.severity,
            "verified": bool(d.verified_by),
            "verifiedAt": d.verified_at.isoformat() if d.verified_at else None,
            "confidence": d.confidence,  # None
            "modelId": d.model_id,       # None
            "notes": d.notes,
            "createdAt": d.created_at.isoformat(),
            "measurement": meas_dict,
            "reviews": [
                {
                    "decision": r.decision,
                    "reason": r.reason,
                    "createdAt": r.created_at.isoformat()
                } for r in reviews
            ]
        })

    return {
        "inspectionId": inspection.id,
        "totalFindings": len(items),
        "allGeometriesVerified": all_verified if items else True,
        "items": items
    }

@router.post("/inspections/{inspection_id}/detections", status_code=status.HTTP_201_CREATED)
def create_detection(
    inspection_id: str,
    req: CreateDetectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_engineer(current_user)

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    image = db.query(InspectionImage).filter(
        InspectionImage.id == req.image_id,
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found in inspection")

    asset = db.query(Asset).filter(Asset.id == inspection.asset_id).first()
    material = asset.material if asset else "concrete"

    # Server-side geometry & measurement computation
    geometry_dict = req.geometry.model_dump()
    computed_meas = process_geometry_and_measure(geometry_dict, image.calibration)

    # Active Severity rule evaluation
    active_rule = db.query(SeverityRule).order_by(SeverityRule.created_at.desc()).first()
    rule_dict = {
        "weights": active_rule.weights if active_rule else None,
        "thresholds": active_rule.thresholds if active_rule else None,
        "version": active_rule.version if active_rule else "v1.0-default"
    } if active_rule else None

    severity_eval = evaluate_severity(computed_meas, req.defect_type, material, rule_dict)
    assigned_severity = req.severity or severity_eval["recommended_severity"]

    # Create Detection (Master Rule: strictly engineer_manual, no AI confidence score)
    detection = Detection(
        inspection_id=inspection.id,
        image_id=image.id,
        source="engineer_manual",
        defect_type=req.defect_type,
        geometry=geometry_dict,
        severity=assigned_severity,
        created_by=current_user.id,
        confidence=None,
        model_id=None,
        notes=req.notes
    )
    db.add(detection)
    db.flush()

    # Create Measurement
    measurement = Measurement(
        detection_id=detection.id,
        length=computed_meas["length"],
        avg_width=computed_meas["avg_width"],
        max_width=computed_meas["max_width"],
        area=computed_meas["area"],
        orientation=computed_meas["orientation"],
        branching=computed_meas["branching"],
        continuity=computed_meas["continuity"],
        density=computed_meas["density"],
        unit=computed_meas["unit"],
        calibrated=computed_meas["calibrated"],
        uncertainty=computed_meas["uncertainty"]
    )
    db.add(measurement)

    # Initial Review record
    review = Review(
        inspection_id=inspection.id,
        detection_id=detection.id,
        reviewer_id=current_user.id,
        decision="created",
        reason="Initial finding drawn by licensed engineer",
        new_value={"defect_type": req.defect_type, "severity": assigned_severity}
    )
    db.add(review)

    # Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="DETECTION_CREATE",
        entity_type="detection",
        entity_id=detection.id,
        details={
            "inspection_id": inspection.id,
            "defect_type": req.defect_type,
            "severity": assigned_severity,
            "rule_suggestion": computed_meas.get("rule_suggestion")
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(detection)
    db.refresh(measurement)

    return {
        "id": detection.id,
        "inspectionId": detection.inspection_id,
        "imageId": detection.image_id,
        "defectType": detection.defect_type,
        "severity": detection.severity,
        "source": detection.source,
        "verified": False,
        "measurement": {
            "id": measurement.id,
            "length": measurement.length,
            "avg_width": measurement.avg_width,
            "max_width": measurement.max_width,
            "area": measurement.area,
            "orientation": measurement.orientation,
            "branching": measurement.branching,
            "density": measurement.density,
            "unit": measurement.unit,
            "calibrated": measurement.calibrated,
            "uncertainty": measurement.uncertainty
        },
        "severityEvaluation": severity_eval,
        "ruleSuggestion": computed_meas.get("rule_suggestion")
    }

@router.patch("/detections/{detection_id}")
def update_detection(
    detection_id: str,
    req: UpdateDetectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_engineer(current_user)

    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found")

    inspection = db.query(Inspection).filter(
        Inspection.id == detection.inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit findings after inspection sign-off.")

    image = db.query(InspectionImage).filter(InspectionImage.id == detection.image_id).first()
    asset = db.query(Asset).filter(Asset.id == inspection.asset_id).first()
    material = asset.material if asset else "concrete"

    prev_severity = detection.severity
    prev_defect_type = detection.defect_type

    if req.defect_type:
        detection.defect_type = req.defect_type
    if req.notes is not None:
        detection.notes = req.notes

    # If geometry updated, recalculate measurements
    if req.geometry:
        geom_dict = req.geometry.model_dump()
        detection.geometry = geom_dict
        calib = image.calibration if image else None
        computed_meas = process_geometry_and_measure(geom_dict, calib)

        meas = db.query(Measurement).filter(Measurement.detection_id == detection.id).first()
        if meas:
            meas.length = computed_meas["length"]
            meas.avg_width = computed_meas["avg_width"]
            meas.max_width = computed_meas["max_width"]
            meas.area = computed_meas["area"]
            meas.orientation = computed_meas["orientation"]
            meas.branching = computed_meas["branching"]
            meas.continuity = computed_meas["continuity"]
            meas.density = computed_meas["density"]
            meas.unit = computed_meas["unit"]
            meas.calibrated = computed_meas["calibrated"]
            meas.uncertainty = computed_meas["uncertainty"]

    # If severity overridden
    if req.severity and req.severity != prev_severity:
        if not req.override_reason or len(req.override_reason.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "OVERRIDE_REASON_REQUIRED", "message": "Engineer override of severity requires a mandatory explanation."}
            )
        detection.severity = req.severity

        # Record correction in Review
        review = Review(
            inspection_id=inspection.id,
            detection_id=detection.id,
            reviewer_id=current_user.id,
            decision="corrected",
            reason=req.override_reason,
            previous_value={"severity": prev_severity, "defect_type": prev_defect_type},
            new_value={"severity": req.severity, "defect_type": detection.defect_type}
        )
        db.add(review)

    db.commit()
    db.refresh(detection)
    return {"status": "updated", "id": detection.id, "severity": detection.severity, "defectType": detection.defect_type}

@router.delete("/detections/{detection_id}")
def delete_detection(
    detection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_engineer(current_user)

    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found")

    inspection = db.query(Inspection).filter(
        Inspection.id == detection.inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    if inspection.status in ("reviewed", "reported", "closed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete findings after inspection sign-off.")

    db.delete(detection)
    db.commit()
    return {"status": "deleted", "id": detection_id}

@router.post("/detections/{detection_id}/verify-geometry")
def verify_geometry(
    detection_id: str,
    req: VerifyGeometryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces Check ENG-10: Mandatory geometry verification gate for signoff."""
    require_engineer(current_user)

    if not req.confirmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CONFIRMATION_REQUIRED", "message": "You must check the certification box to verify geometry."}
        )

    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found")

    inspection = db.query(Inspection).filter(
        Inspection.id == detection.inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if inspection and inspection.status in ("reviewed", "reported", "closed"):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"code": "INSPECTION_LOCKED", "message": "Cannot verify findings after inspection sign-off. Record is permanently locked."}
        )

    detection.verified_by = current_user.id
    detection.verified_at = datetime.now(timezone.utc)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="GEOMETRY_VERIFIED",
        entity_type="detection",
        entity_id=detection.id,
        details={"inspection_id": detection.inspection_id}
    )
    db.add(audit)
    db.commit()

    return {"status": "verified", "id": detection.id, "verifiedAt": detection.verified_at.isoformat()}

@router.post("/inspections/{inspection_id}/mark-no-defects")
def mark_no_defects(
    inspection_id: str,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enforces ENG-13: Certified no-defect recording (labelled 'No defects recorded by engineer')."""
    require_engineer(current_user)

    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    first_image = db.query(InspectionImage).filter(
        InspectionImage.inspection_id == inspection.id,
        InspectionImage.is_deleted == False
    ).first()
    if not first_image:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inspection has no uploaded images.")

    detection = Detection(
        inspection_id=inspection.id,
        image_id=first_image.id,
        source="engineer_manual",
        defect_type="no_visible_damage",
        geometry={"type": "no_defect", "points": []},
        severity="no_visible_damage",
        created_by=current_user.id,
        verified_by=current_user.id,
        verified_at=datetime.now(timezone.utc),
        notes=notes or "Certified: No defects recorded by engineer during visual inspection review."
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    return {"status": "recorded", "id": detection.id, "defectType": "no_visible_damage"}
