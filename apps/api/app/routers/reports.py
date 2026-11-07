import os
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import (
    Inspection, Report, Detection, Measurement, PriorityRecommendation,
    Asset, User, AuditLog
)
from app.security.jwt import get_current_user
from app.services.reporting import (
    generate_inspection_pdf_report,
    generate_inspection_csv_report,
    generate_inspection_xlsx_report,
    generate_inspection_json_report
)

router = APIRouter(prefix="", tags=["Engineering Reports"])

class GenerateReportRequest(BaseModel):
    format: str = Field("pdf", description="'pdf', 'csv', 'xlsx', 'json', or 'all'")

def prepare_inspection_report_payload(inspection: Inspection, db: Session):
    asset = inspection.asset
    inspector = inspection.inspector
    reviewer = inspection.claimant or db.query(User).filter(User.role.in_(["civil-engineer", "engineer"])).first()

    insp_data = {
        "id": inspection.id,
        "inspection_date": inspection.inspection_date.strftime("%Y-%m-%d") if inspection.inspection_date else "N/A",
        "due_date": inspection.due_date.strftime("%Y-%m-%d") if inspection.due_date else "N/A",
        "status": inspection.status,
        "reviewed_at": inspection.reviewed_at.strftime("%Y-%m-%d %H:%M UTC") if inspection.reviewed_at else None,
        "asset": {
            "id": asset.id if asset else "N/A",
            "name": asset.name if asset else "N/A",
            "asset_type": asset.asset_type if asset else "N/A",
            "material": asset.material if asset else "N/A",
            "region": asset.region if asset else "Central",
            "address": asset.address if asset else "N/A"
        },
        "inspector": {
            "name": inspector.name if inspector else "N/A",
            "email": inspector.email if inspector else "N/A"
        },
        "reviewer": {
            "name": reviewer.name if reviewer else "Civil Engineer",
            "email": reviewer.email if reviewer else "N/A"
        }
    }

    detections = db.query(Detection).filter(Detection.inspection_id == inspection.id).all()
    findings_data = []
    for d in detections:
        m = db.query(Measurement).filter(Measurement.detection_id == d.id).first()
        findings_data.append({
            "id": d.id,
            "defect_type": d.defect_type,
            "severity": d.severity,
            "notes": d.notes,
            "measurement": {
                "length": m.length if m else 0.0,
                "avg_width": m.avg_width if m else 0.0,
                "max_width": m.max_width if m else 0.0,
                "area": m.area if m else 0.0,
                "density": m.density if m else None,
                "unit": m.unit if m else "px",
                "calibrated": m.calibrated if m else False,
                "uncertainty": m.uncertainty if m else None
            } if m else {}
        })

    prio_rec = db.query(PriorityRecommendation).filter(PriorityRecommendation.inspection_id == inspection.id).order_by(PriorityRecommendation.created_at.desc()).first()
    priority_data = {
        "recommended": prio_rec.recommended if prio_rec else "routine_monitoring",
        "confirmed": prio_rec.confirmed if prio_rec else None,
        "suggested_action": prio_rec.factors.get("suggested_action") if (prio_rec and prio_rec.factors) else None
    } if prio_rec else None

    return insp_data, findings_data, priority_data

@router.get("/inspections/{inspection_id}/reports")
def list_reports(
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

    reports = db.query(Report).filter(Report.inspection_id == inspection.id).order_by(Report.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "inspectionId": r.inspection_id,
            "version": r.version,
            "fileFormat": r.file_format,
            "checksum": r.checksum,
            "createdAt": r.created_at.isoformat()
        }
        for r in reports
    ]

@router.post("/inspections/{inspection_id}/reports/generate")
def generate_reports(
    inspection_id: str,
    req: GenerateReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    # Gate: inspection must be signed off / reviewed
    if inspection.status not in ("reviewed", "reported", "closed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SIGNOFF_REQUIRED", "message": "Inspection must be signed off and reviewed by an engineer before reports can be generated."}
        )

    insp_data, findings_data, priority_data = prepare_inspection_report_payload(inspection, db)

    existing_ver = db.query(Report).filter(Report.inspection_id == inspection.id).count()
    next_ver = existing_ver + 1

    formats_to_build = ["pdf", "csv", "xlsx", "json"] if req.format == "all" else [req.format]
    created_reports = []

    for fmt in formats_to_build:
        if fmt == "pdf":
            res = generate_inspection_pdf_report(insp_data, findings_data, priority_data)
        elif fmt == "csv":
            res = generate_inspection_csv_report(insp_data, findings_data)
        elif fmt == "xlsx":
            res = generate_inspection_xlsx_report(insp_data, findings_data)
        elif fmt == "json":
            res = generate_inspection_json_report(insp_data, findings_data, priority_data)
        else:
            continue

        report_row = Report(
            inspection_id=inspection.id,
            version=next_ver,
            checksum=res["checksum"],
            file_format=res["format"],
            file_path=res["path"],
            generated_by=current_user.id
        )
        db.add(report_row)
        created_reports.append(report_row)

    if inspection.status == "reviewed":
        inspection.status = "reported"

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="REPORT_GENERATE",
        entity_type="report",
        entity_id=inspection.id,
        details={"formats": formats_to_build, "version": next_ver}
    )
    db.add(audit)
    db.commit()

    return [
        {
            "id": r.id,
            "format": r.file_format,
            "version": r.version,
            "checksum": r.checksum,
            "downloadUrl": f"/api/v1/reports/{r.id}/download"
        }
        for r in created_reports
    ]

@router.get("/reports/{report_id}/download")
def download_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    inspection = report.inspection
    if inspection.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report file missing from disk")

    filename = os.path.basename(report.file_path)
    media_types = {
        "pdf": "application/pdf",
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "json": "application/json"
    }
    media_type = media_types.get(report.file_format, "application/octet-stream")

    return FileResponse(
        path=report.file_path,
        filename=filename,
        media_type=media_type
    )


@router.get("/inspections/{inspection_id}/reports/download")
def download_inspection_report(
    inspection_id: str,
    format: str = "pdf",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Downloads or dynamically generates certified engineering report for an inspection.
    Supports formats: pdf, csv, xlsx, json.
    """
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.organization_id == current_user.organization_id
    ).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    fmt = format.lower().strip()
    if fmt not in ("pdf", "csv", "xlsx", "json"):
        fmt = "pdf"

    # Look for existing report file on disk
    report = db.query(Report).filter(
        Report.inspection_id == inspection.id,
        Report.file_format == fmt
    ).order_by(Report.version.desc()).first()

    if report and report.file_path and os.path.exists(report.file_path):
        target_path = report.file_path
        filename = os.path.basename(target_path)
    else:
        # Generate on the fly
        insp_data, findings_data, priority_data = prepare_inspection_report_payload(inspection, db)
        existing_ver = db.query(Report).filter(Report.inspection_id == inspection.id).count()
        next_ver = existing_ver + 1

        if fmt == "pdf":
            res = generate_inspection_pdf_report(insp_data, findings_data, priority_data)
        elif fmt == "csv":
            res = generate_inspection_csv_report(insp_data, findings_data)
        elif fmt == "xlsx":
            res = generate_inspection_xlsx_report(insp_data, findings_data)
        elif fmt == "json":
            res = generate_inspection_json_report(insp_data, findings_data, priority_data)
        else:
            res = generate_inspection_pdf_report(insp_data, findings_data, priority_data)

        report_row = Report(
            inspection_id=inspection.id,
            version=next_ver,
            checksum=res["checksum"],
            file_format=res["format"],
            file_path=res["path"],
            generated_by=current_user.id
        )
        db.add(report_row)
        db.commit()
        target_path = res["path"]
        filename = os.path.basename(target_path)

    media_types = {
        "pdf": "application/pdf",
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "json": "application/json"
    }
    media_type = media_types.get(fmt, "application/octet-stream")

    return FileResponse(
        path=target_path,
        filename=filename,
        media_type=media_type
    )

