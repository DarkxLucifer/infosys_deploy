from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.all_models import (
    Dataset, DatasetInspectionStat, DatasetClassStat,
    DefectType, SeverityLevel, PriorityCategory, InfrastructureType, AlertLevel
)

router = APIRouter(prefix="", tags=["Datasets & Reference Data"])

@router.get("/reference-data")
def get_reference_data(db: Session = Depends(get_db)):
    """Check L2: Returns exact reference categories from InfraScan specification."""
    defects = db.query(DefectType).all()
    cracks = [d for d in defects if d.category == "crack"]
    surface = [d for d in defects if d.category == "surface_damage"]
    severities = db.query(SeverityLevel).order_by(SeverityLevel.level_rank).all()
    priorities = db.query(PriorityCategory).order_by(PriorityCategory.sla_days).all()
    infra_types = db.query(InfrastructureType).all()
    alert_levels = db.query(AlertLevel).order_by(AlertLevel.severity_order).all()

    return {
        "counts": {
            "crackCategories": len(cracks),
            "surfaceDamageCategories": len(surface),
            "severityLevels": len(severities),
            "priorityCategories": len(priorities),
            "infrastructureTypes": len(infra_types),
            "alertLevels": len(alert_levels)
        },
        "crackCategories": [{"code": c.code, "name": c.name, "description": c.description} for c in cracks],
        "surfaceDamageCategories": [{"code": s.code, "name": s.name, "description": s.description} for s in surface],
        "severityLevels": [{"code": s.code, "name": s.name, "levelRank": s.level_rank} for s in severities],
        "priorityCategories": [{"code": p.code, "name": p.name, "slaDays": p.sla_days} for p in priorities],
        "infrastructureTypes": [{"code": t.code, "name": t.name, "description": t.description} for t in infra_types],
        "alertLevels": [{"code": a.code, "name": a.name, "severityOrder": a.severity_order} for a in alert_levels]
    }

@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db)):
    """Check L3: Returns verified datasets from database with suitability limits and license notes."""
    datasets = db.query(Dataset).all()
    result = []
    for ds in datasets:
        stats = db.query(DatasetInspectionStat).filter(DatasetInspectionStat.dataset_id == ds.id).all()
        classes = db.query(DatasetClassStat).filter(DatasetClassStat.dataset_id == ds.id).all()
        result.append({
            "id": ds.id,
            "name": ds.name,
            "purpose": ds.purpose,
            "suitabilityLimits": ds.suitability_limits,
            "licenseNote": ds.license_note,
            "totalSamples": ds.total_samples,
            "inspectionStats": {s.metric_name: s.metric_value for s in stats},
            "classDistribution": {c.class_code: {"name": c.class_name, "count": c.sample_count} for c in classes}
        })
    return {"datasets": result, "total": len(result)}

@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    stats = db.query(DatasetInspectionStat).filter(DatasetInspectionStat.dataset_id == ds.id).all()
    classes = db.query(DatasetClassStat).filter(DatasetClassStat.dataset_id == ds.id).all()

    return {
        "id": ds.id,
        "name": ds.name,
        "purpose": ds.purpose,
        "suitabilityLimits": ds.suitability_limits,
        "licenseNote": ds.license_note,
        "totalSamples": ds.total_samples,
        "inspectionStats": {s.metric_name: s.metric_value for s in stats},
        "classDistribution": {c.class_code: {"name": c.class_name, "count": c.sample_count} for c in classes}
    }
