import csv
import io
from datetime import datetime, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

from app.database import get_db
from app.models.all_models import Asset, Inspection, AuditLog, User
from app.security.jwt import get_current_user


router = APIRouter(prefix="/assets", tags=["Assets"])

VALID_ASSET_TYPES = {
    "bridge", "road", "tunnel", "retaining-wall",
    "building", "dam", "culvert", "pier"
}

ALLOWED_MANAGERS = {"admin", "manager", "engineer", "civil-engineer", "inspector"}

TYPE_PREFIX_MAP = {
    "bridge": "BR",
    "road": "RD",
    "tunnel": "TU",
    "retaining-wall": "RW",
    "retaining_wall": "RW",
    "building": "BD",
    "dam": "DM",
    "culvert": "CV",
    "pier": "PR",
}

def require_asset_management_role(user: User):
    """Enforces asset management permissions."""
    user_role = (user.role or "").lower()
    if user_role not in ALLOWED_MANAGERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCESS_DENIED",
                "message": "Only Civil Engineers, Infrastructure Managers, Administrators, and Inspectors can register assets."
            }
        )

class AssetCreateRequest(BaseModel):
    id: Optional[str] = Field(None, max_length=64, description="Unique Infrastructure ID, e.g. BR-018. If omitted, auto-generated.")
    name: str = Field(..., min_length=2, max_length=255)
    asset_type: str = Field("bridge", description="One of 8 infrastructure types")
    address: Optional[str] = Field(None, max_length=512)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    construction_year: Optional[int] = Field(None, ge=1800)
    material: Optional[str] = Field(None, max_length=128)
    department: Optional[str] = Field(None, max_length=128)
    inspection_frequency: Optional[str] = Field(None, max_length=64)
    importance: Optional[str] = Field(None, max_length=64)
    notes: Optional[str] = None

class AssetUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    asset_type: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    construction_year: Optional[int] = Field(None, ge=1800)
    material: Optional[str] = None
    department: Optional[str] = None
    inspection_frequency: Optional[str] = None
    importance: Optional[str] = None
    notes: Optional[str] = None

def sanitize_csv_cell(value: Any) -> str:
    """Neutralizes formula injection characters (=, +, -, @) per Check H6."""
    text = str(value or "")
    if text and text[0] in ("=", "+", "-", "@"):
        return "'" + text
    return text

@router.post("", status_code=status.HTTP_201_CREATED)
def create_asset(
    req: AssetCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_asset_management_role(current_user)

    current_year = datetime.now(timezone.utc).year
    const_year = req.construction_year or 2018
    if const_year > current_year:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_YEAR", "message": f"Construction year cannot be in the future ({current_year})."}
        )

    norm_type = req.asset_type.lower().strip()
    if norm_type not in VALID_ASSET_TYPES:
        norm_type = "bridge"

    # Auto-generate or clean ID
    if req.id and req.id.strip():
        asset_id_clean = req.id.strip().upper()
    else:
        prefix = TYPE_PREFIX_MAP.get(norm_type, "INF")
        count = db.query(Asset).filter(
            Asset.organization_id == current_user.organization_id,
            Asset.asset_type == norm_type
        ).count() + 1
        asset_id_clean = f"{prefix}-{count:03d}"
        while db.query(Asset).filter(Asset.id == asset_id_clean, Asset.organization_id == current_user.organization_id).first():
            count += 1
            asset_id_clean = f"{prefix}-{count:03d}"

    existing = db.query(Asset).filter(
        Asset.id == asset_id_clean,
        Asset.organization_id == current_user.organization_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_ASSET_ID", "message": f"Asset with ID '{asset_id_clean}' already exists."}
        )

    lat = req.latitude if req.latitude is not None else 40.7128
    lng = req.longitude if req.longitude is not None else -74.0060
    addr = req.address.strip() if (req.address and req.address.strip()) else f"Field GPS ({lat:.4f}, {lng:.4f})"

    asset = Asset(
        id=asset_id_clean,
        organization_id=current_user.organization_id,
        name=req.name.strip(),
        asset_type=norm_type,
        address=addr,
        latitude=lat,
        longitude=lng,
        construction_year=const_year,
        material=req.material.strip() if req.material else "Reinforced concrete",
        department=req.department.strip() if req.department else "Civil Infrastructure Division",
        inspection_frequency=req.inspection_frequency.strip() if req.inspection_frequency else "Quarterly",
        importance=req.importance.strip() if req.importance else "medium",
        notes=req.notes,
        is_active=True
    )
    db.add(asset)

    # Audit event (Check H3, O1)
    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ASSET_CREATE",
        entity_type="asset",
        entity_id=asset.id,
        details={"name": asset.name, "type": asset.asset_type}
    )
    db.add(audit)
    db.commit()
    db.refresh(asset)

    return {
        "id": asset.id,
        "name": asset.name,
        "assetType": asset.asset_type,
        "address": asset.address,
        "latitude": asset.latitude,
        "longitude": asset.longitude,
        "constructionYear": asset.construction_year,
        "material": asset.material,
        "department": asset.department,
        "inspectionFrequency": asset.inspection_frequency,
        "importance": asset.importance,
        "isActive": asset.is_active,
        "createdAt": asset.created_at.isoformat() if asset.created_at else None
    }

@router.get("")
def list_assets(
    search: Optional[str] = None,
    asset_type: Optional[str] = None,
    department: Optional[str] = None,
    frequency: Optional[str] = None,
    include_deactivated: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Asset).filter(Asset.organization_id == current_user.organization_id)

    if not include_deactivated:
        query = query.filter(Asset.is_active == True)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(Asset.id.ilike(s), Asset.name.ilike(s), Asset.address.ilike(s)))

    if asset_type and asset_type.lower() != "all":
        query = query.filter(Asset.asset_type == asset_type.lower())

    if department and department.lower() != "all":
        query = query.filter(Asset.department.ilike(f"%{department}%"))

    if frequency and frequency.lower() != "all":
        query = query.filter(Asset.inspection_frequency == frequency)

    total = query.count()

    order_col = getattr(Asset, sort_by, Asset.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(order_col))
    else:
        query = query.order_by(desc(order_col))

    assets = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            {
                "id": a.id,
                "name": a.name,
                "assetType": a.asset_type,
                "address": a.address,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "constructionYear": a.construction_year,
                "material": a.material,
                "department": a.department,
                "inspectionFrequency": a.inspection_frequency,
                "importance": a.importance,
                "isActive": a.is_active,
                "createdAt": a.created_at.isoformat() if a.created_at else None
            }
            for a in assets
        ],
        "total": total,
        "page": page,
        "pageSize": page_size
    }

@router.get("/{asset_id}")
def get_asset_detail(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce organization isolation (Check G2, H5)
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    inspections = db.query(Inspection).filter(
        Inspection.asset_id == asset.id,
        Inspection.organization_id == current_user.organization_id
    ).order_by(desc(Inspection.inspection_date)).all()

    return {
        "id": asset.id,
        "name": asset.name,
        "assetType": asset.asset_type,
        "address": asset.address,
        "latitude": asset.latitude,
        "longitude": asset.longitude,
        "constructionYear": asset.construction_year,
        "material": asset.material,
        "department": asset.department,
        "inspectionFrequency": asset.inspection_frequency,
        "importance": asset.importance,
        "isActive": asset.is_active,
        "notes": asset.notes,
        "createdAt": asset.created_at.isoformat() if asset.created_at else None,
        "inspections": [
            {
                "id": i.id,
                "status": i.status,
                "inspectionDate": i.inspection_date.isoformat(),
                "dueDate": i.due_date.isoformat(),
                "inspectorId": i.inspector_id,
            }
            for i in inspections
        ],
        "maintenanceHistory": []  # Connected to real maintenance work orders when present
    }

@router.put("/{asset_id}")
def update_asset(
    asset_id: str,
    req: AssetUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_asset_management_role(current_user)

    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if req.construction_year is not None:
        curr_year = datetime.now(timezone.utc).year
        if req.construction_year > curr_year:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_YEAR", "message": f"Construction year cannot be in future ({curr_year})."}
            )
        asset.construction_year = req.construction_year

    if req.asset_type is not None:
        norm_type = req.asset_type.lower().strip()
        if norm_type not in VALID_ASSET_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_ASSET_TYPE", "message": f"Asset type must be one of: {sorted(list(VALID_ASSET_TYPES))}"}
            )
        asset.asset_type = norm_type

    if req.name is not None:
        asset.name = req.name.strip()
    if req.address is not None:
        asset.address = req.address.strip()
    if req.latitude is not None:
        asset.latitude = req.latitude
    if req.longitude is not None:
        asset.longitude = req.longitude
    if req.material is not None:
        asset.material = req.material.strip()
    if req.department is not None:
        asset.department = req.department.strip()
    if req.inspection_frequency is not None:
        asset.inspection_frequency = req.inspection_frequency.strip()
    if req.importance is not None:
        asset.importance = req.importance.strip()
    if req.notes is not None:
        asset.notes = req.notes

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ASSET_UPDATE",
        entity_type="asset",
        entity_id=asset.id,
        details={"name": asset.name}
    )
    db.add(audit)
    db.commit()
    db.refresh(asset)

    return {"status": "updated", "id": asset.id}

@router.post("/{asset_id}/deactivate")
def deactivate_asset(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_asset_management_role(current_user)

    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    asset.is_active = False

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ASSET_DEACTIVATE",
        entity_type="asset",
        entity_id=asset.id,
        details={"name": asset.name}
    )
    db.add(audit)
    db.commit()

    return {"status": "deactivated", "id": asset.id}

@router.post("/import-csv")
async def import_assets_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_asset_management_role(current_user)

    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid UTF-8 encoded CSV file.")

    reader = csv.DictReader(io.StringIO(decoded))
    required_cols = {"id", "name", "asset_type", "address", "latitude", "longitude", "construction_year", "material", "department"}
    if not required_cols.issubset(set(reader.fieldnames or [])):
        missing = required_cols - set(reader.fieldnames or [])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "MISSING_CSV_COLUMNS", "message": f"CSV is missing required headers: {list(missing)}"}
        )

    rows = list(reader)
    errors = []
    current_year = datetime.now(timezone.utc).year
    valid_assets_to_add = []

    for idx, r in enumerate(rows, start=1):
        asset_id = (r.get("id") or "").strip().upper()
        if not asset_id:
            errors.append({"row": idx, "field": "id", "error": "ID is required"})
            continue

        existing = db.query(Asset).filter(
            Asset.id == asset_id,
            Asset.organization_id == current_user.organization_id
        ).first()
        if existing:
            errors.append({"row": idx, "field": "id", "error": f"Asset ID {asset_id} already exists."})
            continue

        try:
            lat = float(r.get("latitude", 0))
            if not (-90.0 <= lat <= 90.0):
                errors.append({"row": idx, "field": "latitude", "error": "Latitude must be between -90 and 90."})
                continue
        except ValueError:
            errors.append({"row": idx, "field": "latitude", "error": "Latitude must be numeric."})
            continue

        try:
            lng = float(r.get("longitude", 0))
            if not (-180.0 <= lng <= 180.0):
                errors.append({"row": idx, "field": "longitude", "error": "Longitude must be between -180 and 180."})
                continue
        except ValueError:
            errors.append({"row": idx, "field": "longitude", "error": "Longitude must be numeric."})
            continue

        try:
            yr = int(r.get("construction_year", 0))
            if yr > current_year or yr < 1800:
                errors.append({"row": idx, "field": "construction_year", "error": f"Year must be between 1800 and {current_year}."})
                continue
        except ValueError:
            errors.append({"row": idx, "field": "construction_year", "error": "Construction year must be an integer."})
            continue

        norm_type = (r.get("asset_type") or "").lower().strip()
        if norm_type not in VALID_ASSET_TYPES:
            errors.append({"row": idx, "field": "asset_type", "error": f"Invalid type. Allowed: {sorted(list(VALID_ASSET_TYPES))}"})
            continue

        valid_assets_to_add.append(
            Asset(
                id=asset_id,
                organization_id=current_user.organization_id,
                name=r.get("name", "").strip(),
                asset_type=norm_type,
                address=r.get("address", "").strip(),
                latitude=lat,
                longitude=lng,
                construction_year=yr,
                material=r.get("material", "Reinforced concrete").strip(),
                department=r.get("department", "Infrastructure Engineering").strip(),
                inspection_frequency=r.get("inspection_frequency", "Annual").strip(),
                importance=r.get("importance", "Standard").strip(),
                notes=r.get("notes"),
                is_active=True
            )
        )

    # Per Check H6: If bad rows exist, report row-level errors and abort or import only valid rows
    if errors:
        return {
            "status": "validation_failed",
            "importedCount": 0,
            "errors": errors
        }

    for a in valid_assets_to_add:
        db.add(a)

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ASSET_CSV_IMPORT",
        entity_type="asset",
        details={"count": len(valid_assets_to_add)}
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "importedCount": len(valid_assets_to_add),
        "errors": []
    }

@router.get("/export/csv")
def export_assets_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    assets = db.query(Asset).filter(
        Asset.organization_id == current_user.organization_id,
        Asset.is_active == True
    ).order_by(Asset.id).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "asset_type", "address", "latitude", "longitude",
        "construction_year", "material", "department", "inspection_frequency",
        "importance", "created_at"
    ])

    for a in assets:
        writer.writerow([
            sanitize_csv_cell(a.id),
            sanitize_csv_cell(a.name),
            sanitize_csv_cell(a.asset_type),
            sanitize_csv_cell(a.address),
            a.latitude,
            a.longitude,
            a.construction_year,
            sanitize_csv_cell(a.material),
            sanitize_csv_cell(a.department),
            sanitize_csv_cell(a.inspection_frequency),
            sanitize_csv_cell(a.importance),
            a.created_at.isoformat() if a.created_at else ""
        ])

    audit = AuditLog(
        user_id=current_user.id,
        actor_email=current_user.email,
        action="ASSET_EXPORT_CSV",
        entity_type="asset",
        details={"exported_count": len(assets)}
    )
    db.add(audit)
    db.commit()

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=infrascan_assets.csv"}
    )
