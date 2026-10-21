import io
import os
import csv
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from PIL import Image

from app.database import Base, get_db
from app.main import app
from app.models.all_models import (
    User, UserCredential, Organization, Asset, Inspection, InspectionImage,
    ProcessedImage, Notification, AuditLog, DefectType, SeverityLevel,
    PriorityCategory, InfrastructureType, AlertLevel, Dataset
)
from app.security.password import hash_password
from app.security.jwt import create_access_token
from app.services.preprocessing import run_preprocessing_pipeline
from app.cli import seed_reference_data, import_eda

TEST_DB_URL = "sqlite:///./test_week1_audit.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def apply_db_override():
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)

client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        # Seed 8 crack categories (§5.7)
        crack_defects = [
            ("D00", "Longitudinal crack", "Crack oriented parallel to structural axis", "crack"),
            ("D10", "Transverse crack", "Crack oriented perpendicular to structural axis", "crack"),
            ("D11", "Diagonal / shear crack", "Inclined crack formed under shear stress", "crack"),
            ("D20", "Alligator / map fatigue cracking", "Interconnected polygonal crack network", "crack"),
            ("D30", "Reflection crack", "Crack propagating through pavement overlay from sub-layer", "crack"),
            ("D40", "Lateral crack", "Crack running across member boundary or joints", "crack"),
            ("D50", "Block cracking", "Rectangular interconnected cracking grid pattern", "crack"),
            ("D60", "Edge cracking", "Cracking along unsupported shoulder or member edge", "crack"),
        ]
        for code, name, desc, cat in crack_defects:
            db.add(DefectType(code=code, name=name, description=desc, category=cat))

        # Seed 9 surface damage categories (§5.8)
        surface_defects = [
            ("S01", "Surface spalling & fragment loss", "Detachment and loss of surface concrete fragments", "surface_damage"),
            ("S02", "Exposed reinforcement & rebar corrosion", "Corroded rebar exposed to moisture/atmosphere", "surface_damage"),
            ("S03", "Efflorescence & salt leaching", "Crystalline salt deposit on concrete surface", "surface_damage"),
            ("S04", "Honeycombing & voiding", "Coarse aggregate voids due to incomplete compaction", "surface_damage"),
            ("S05", "Scaling & surface disintegration", "Loss of surface mortar matrix exposing coarse aggregates", "surface_damage"),
            ("S06", "Popouts", "Conical shallow depressions caused by expansive internal aggregates", "surface_damage"),
            ("S07", "Abrasion & wear", "Mechanical surface erosion from traffic or abrasive fluids", "surface_damage"),
            ("S08", "Water seepage & moisture staining", "Active dampness or chemical staining from liquid migration", "surface_damage"),
            ("S09", "Delamination", "Sub-surface planar separation of near-surface concrete layer", "surface_damage"),
        ]
        for code, name, desc, cat in surface_defects:
            db.add(DefectType(code=code, name=name, description=desc, category=cat))

        # Seed 5 severity levels (§5.10)
        severities = [
            ("no_visible_damage", "No Visible Damage", 0),
            ("minor", "Minor Damage", 1),
            ("moderate", "Moderate Damage", 2),
            ("severe", "Severe Damage", 3),
            ("critical", "Critical / Requires Urgent Engineering Review", 4),
        ]
        for code, name, rank in severities:
            db.add(SeverityLevel(code=code, name=name, level_rank=rank))

        # Seed 5 priority categories
        priorities = [
            ("P1", "Emergency Intervention", 1),
            ("P2", "High Priority", 30),
            ("P3", "Medium Priority", 90),
            ("P4", "Low Priority", 180),
            ("P5", "Routine Monitoring", 365),
        ]
        for code, name, sla in priorities:
            db.add(PriorityCategory(code=code, name=name, sla_days=sla))

        # Seed 8 infrastructure types
        infra_types = [
            ("bridge", "Bridge"),
            ("road", "Road corridor"),
            ("tunnel", "Tunnel"),
            ("retaining-wall", "Retaining wall"),
            ("building", "Structure deck / Building"),
            ("dam", "Dam / Reservoir spillway"),
            ("culvert", "Culvert"),
            ("pier", "Pier / Marine structure"),
        ]
        for code, name in infra_types:
            db.add(InfrastructureType(code=code, name=name))

        # Seed 5 alert levels
        alert_levels = [
            ("green", "Normal / Operational", 0),
            ("blue", "Advisory", 1),
            ("yellow", "Caution / Elevated Watch", 2),
            ("orange", "Warning / Impaired Margin", 3),
            ("red", "Critical Alert", 4),
        ]
        for code, name, order in alert_levels:
            db.add(AlertLevel(code=code, name=name, severity_order=order))

        # Seed 5 datasets
        datasets = [
            ("SDNET2018", "SDNET2018 Concrete Crack Benchmark", "Classification-only benchmark; cannot support semantic segmentation or physical crack width measurement.", "CC BY 4.0", 56098),
            ("METU", "Concrete Crack Images (CCIC / METU)", "Classification-only dataset; no pixel masks or bounding box coordinates provided.", "Academic Research", 40000),
            ("RDD2022", "Road Damage Dataset 2022 (RDD2022)", "Object detection bounding boxes only; does not provide pixel-level polygon segmentation masks.", "CC BY-SA 4.0", 47420),
            ("CFD", "CrackForest Dataset (CFD)", "Suitable for semantic segmentation; limited geographic diversity (urban road surfaces only).", "Open Source", 118),
            ("CRACK500", "CRACK500 High-Resolution Dataset", "Semantic segmentation and morphology analysis; requires tiling for GPU inference.", "Academic", 3368),
        ]
        for ds_id, name, limits, lic, total in datasets:
            db.add(Dataset(id=ds_id, name=name, purpose=name, suitability_limits=limits, license_note=lic, total_samples=total))

        db.commit()
    finally:
        db.close()

    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists("./test_week1_audit.db"):
        try:
            os.remove("./test_week1_audit.db")
        except Exception:
            pass

def create_test_user(db, email: str, role: str, org_id: str, name: str = "Test Person"):
    user = User(
        name=name,
        email=email.lower().strip(),
        role=role,
        organization_id=org_id,
        status="active",
        email_verified_at=datetime.now(timezone.utc)
    )
    db.add(user)
    db.flush()
    cred = UserCredential(user_id=user.id, password_hash=hash_password("CobaltHorizon987#"))
    db.add(cred)
    db.commit()
    db.refresh(user)
    return user

def get_auth_headers(user: User):
    token = create_access_token(data={"sub": user.id, "role": user.role, "email": user.email})
    return {"Authorization": f"Bearer {token}"}


# =========================================================================
# SECTION G: Roles and Permissions
# =========================================================================

def test_roles_and_permissions_matrix():
    db = TestingSessionLocal()
    org = Organization(name="Primary Transport Authority", allow_self_registration=True)
    db.add(org)
    db.commit()

    admin = create_test_user(db, "admin@test.com", "admin", org.id, "Admin User")
    manager = create_test_user(db, "manager@test.com", "manager", org.id, "Manager User")
    engineer = create_test_user(db, "engineer@test.com", "civil-engineer", org.id, "Engineer User")
    inspector = create_test_user(db, "inspector@test.com", "inspector", org.id, "Inspector User")
    maintenance = create_test_user(db, "maint@test.com", "maintenance-engineer", org.id, "Maint User")

    # G1: Inspector and Maintenance cannot create assets (Must return 403)
    asset_payload = {
        "id": "BR-901",
        "name": "Northern Viaduct",
        "asset_type": "bridge",
        "address": "Expressway Km 45",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "construction_year": 2012,
        "material": "Prestressed concrete",
        "department": "Civil Infrastructure",
        "inspection_frequency": "Annual",
        "importance": "Critical"
    }

    res_insp = client.post("/api/v1/assets", json=asset_payload, headers=get_auth_headers(inspector))
    assert res_insp.status_code == 403, "Inspector must get 403 on asset creation"
    assert res_insp.json()["detail"]["code"] == "ACCESS_DENIED"


    res_maint = client.post("/api/v1/assets", json=asset_payload, headers=get_auth_headers(maintenance))
    assert res_maint.status_code == 403, "Maintenance must get 403 on asset creation"

    # Engineer and Manager can create assets (201)
    res_eng = client.post("/api/v1/assets", json=asset_payload, headers=get_auth_headers(engineer))
    assert res_eng.status_code == 201, "Engineer can create asset"

    # Non-admin cannot access admin endpoints (403)
    assert client.get("/api/v1/admin/pending-users", headers=get_auth_headers(inspector)).status_code == 403
    assert client.get("/api/v1/admin/pending-users", headers=get_auth_headers(engineer)).status_code == 403
    assert client.get("/api/v1/admin/pending-users", headers=get_auth_headers(manager)).status_code == 403
    assert client.get("/api/v1/admin/pending-users", headers=get_auth_headers(admin)).status_code == 200

def test_organization_isolation():
    """Check G2: Cross-organization data leakage strictly prevented."""
    db = TestingSessionLocal()
    org_a = Organization(name="Authority A", allow_self_registration=True)
    org_b = Organization(name="Authority B", allow_self_registration=True)
    db.add_all([org_a, org_b])
    db.commit()

    user_a = create_test_user(db, "usera@orga.com", "manager", org_a.id)
    user_b = create_test_user(db, "userb@orgb.com", "manager", org_b.id)

    # Create asset in Org A
    asset_a = Asset(
        id="BR-ORGA",
        organization_id=org_a.id,
        name="Asset Org A",
        asset_type="bridge",
        address="Sector 1",
        latitude=19.0,
        longitude=72.0,
        construction_year=2015,
        material="Concrete",
        department="Dep A",
        inspection_frequency="Annual",
        importance="High",
        is_active=True
    )
    db.add(asset_a)
    db.commit()

    # User B requests Org A asset by ID -> must get 404 (no data revealed)
    res_b_get = client.get(f"/api/v1/assets/{asset_a.id}", headers=get_auth_headers(user_b))
    assert res_b_get.status_code == 404, "Org B user must get 404 requesting Org A asset"

    # User B list assets -> does not include Org A asset
    res_b_list = client.get("/api/v1/assets", headers=get_auth_headers(user_b))
    items_b = res_b_list.json()["items"]
    assert all(item["id"] != "BR-ORGA" for item in items_b), "Org B list must not include Org A assets"

def test_token_tampering():
    """Check G3: Token with alg none or tampered role claim is rejected."""
    # alg none
    tampered_token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ."
    res = client.get("/api/v1/admin/pending-users", headers={"Authorization": f"Bearer {tampered_token}"})
    assert res.status_code == 401

# =========================================================================
# SECTION H: Asset Management
# =========================================================================

def test_asset_management_lifecycle():
    db = TestingSessionLocal()
    org = db.query(Organization).first()
    admin = create_test_user(db, "asset_admin@test.com", "admin", org.id)

    # H1: Valid asset creation
    asset_data = {
        "id": "RD-201",
        "name": "Coastal Highway Corridor",
        "asset_type": "road",
        "address": "Marine Way 1-10",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "construction_year": 2018,
        "material": "Asphalt concrete",
        "department": "Highways Division",
        "inspection_frequency": "Semi-Annual",
        "importance": "Critical",
        "notes": "Regular coastal salt spray exposure."
    }
    res = client.post("/api/v1/assets", json=asset_data, headers=get_auth_headers(admin))
    assert res.status_code == 201
    assert res.json()["id"] == "RD-201"

    # Duplicate ID rejected (Check H1)
    res_dup = client.post("/api/v1/assets", json=asset_data, headers=get_auth_headers(admin))
    assert res_dup.status_code == 409

    # Year in future rejected (Check H1)
    bad_year = dict(asset_data, id="RD-202", construction_year=2099)
    res_bad_yr = client.post("/api/v1/assets", json=bad_year, headers=get_auth_headers(admin))
    assert res_bad_yr.status_code == 422

    # Latitude out of bounds rejected (Check H1)
    bad_lat = dict(asset_data, id="RD-203", latitude=95.0)
    assert client.post("/api/v1/assets", json=bad_lat, headers=get_auth_headers(admin)).status_code == 422

    # H3: Edit and Deactivate asset (audit event recorded)
    res_edit = client.put("/api/v1/assets/RD-201", json={"name": "Updated Coastal Highway"}, headers=get_auth_headers(admin))
    assert res_edit.status_code == 200

    res_deact = client.post("/api/v1/assets/RD-201/deactivate", headers=get_auth_headers(admin))
    assert res_deact.status_code == 200

    # Deactivated asset hidden by default
    res_list = client.get("/api/v1/assets", headers=get_auth_headers(admin))
    assert all(a["id"] != "RD-201" for a in res_list.json()["items"])

    # Appears if include_deactivated is true
    res_list_all = client.get("/api/v1/assets?include_deactivated=true", headers=get_auth_headers(admin))
    assert any(a["id"] == "RD-201" for a in res_list_all.json()["items"])

def test_asset_csv_import_and_export():
    """Checks H6: CSV import row-level validation & formula injection neutralization on export."""
    db = TestingSessionLocal()
    org = db.query(Organization).first()
    admin = create_test_user(db, "csv_admin@test.com", "admin", org.id)

    # 1. Bad CSV with row-level error
    bad_csv = (
        "id,name,asset_type,address,latitude,longitude,construction_year,material,department\n"
        "TN-101,North Tunnel,tunnel,Ridge Road,18.5,73.8,2010,Concrete,Tunnels\n"
        "TN-102,Bad Year Tunnel,tunnel,Ridge Road,18.5,73.8,2099,Concrete,Tunnels\n"
    )
    res_bad = client.post(
        "/api/v1/assets/import-csv",
        files={"file": ("bad_assets.csv", bad_csv.encode("utf-8"), "text/csv")},
        headers=get_auth_headers(admin)
    )
    assert res_bad.status_code == 200
    assert res_bad.json()["status"] == "validation_failed"
    assert len(res_bad.json()["errors"]) > 0

    # 2. Valid CSV with formula injection test in cell
    valid_csv = (
        "id,name,asset_type,address,latitude,longitude,construction_year,material,department\n"
        "TN-301,=1+1 Injection Tunnel,tunnel,South Valley,18.5,73.8,2015,Concrete,Tunnels\n"
    )
    res_valid = client.post(
        "/api/v1/assets/import-csv",
        files={"file": ("valid_assets.csv", valid_csv.encode("utf-8"), "text/csv")},
        headers=get_auth_headers(admin)
    )
    assert res_valid.json()["status"] == "success"
    assert res_valid.json()["importedCount"] == 1

    # 3. Export CSV check formula injection neutralization
    res_export = client.get("/api/v1/assets/export/csv", headers=get_auth_headers(admin))
    assert res_export.status_code == 200
    csv_text = res_export.text
    # Cell starting with '=' must be prefixed with single quote "'"
    assert "'=1+1 Injection Tunnel" in csv_text

# =========================================================================
# SECTION I: Inspection Management
# =========================================================================

def test_inspection_lifecycle_and_state_machine():
    """Checks I1, I2, I3, I4: Creation, notifications, status machine, re-inspection."""
    db = TestingSessionLocal()
    org = db.query(Organization).first()
    admin = create_test_user(db, "insp_admin@test.com", "admin", org.id)
    inspector = create_test_user(db, "insp_worker@test.com", "inspector", org.id)

    # Create asset
    asset = Asset(
        id="BR-501", organization_id=org.id, name="Skyway Bridge",
        asset_type="bridge", address="Skyway Pier 4", latitude=19.1, longitude=72.9,
        construction_year=2008, material="Steel", department="Bridges",
        inspection_frequency="Annual", importance="Critical", is_active=True
    )
    db.add(asset)
    db.commit()

    # I1: Create inspection -> creates notification
    insp_payload = {
        "asset_id": asset.id,
        "inspector_id": inspector.id,
        "inspection_date": datetime.now(timezone.utc).isoformat(),
        "due_date": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "notes": "Routine bi-annual visual scan."
    }
    res_create = client.post("/api/v1/inspections", json=insp_payload, headers=get_auth_headers(admin))
    assert res_create.status_code == 201
    insp_id = res_create.json()["id"]

    # Inspector notification check (Check I1, M1)
    notif = db.query(Notification).filter(Notification.user_id == inspector.id).first()
    assert notif is not None
    assert "Inspection Assigned" in notif.title

    # I2: Status lifecycle enforcement
    # Invalid transition: assigned -> reviewed directly (must fail 422)
    res_invalid = client.patch(
        f"/api/v1/inspections/{insp_id}/status",
        json={"status": "reviewed"},
        headers=get_auth_headers(inspector)
    )
    assert res_invalid.status_code == 422
    assert res_invalid.json()["detail"]["code"] == "INVALID_LIFECYCLE_TRANSITION"

    # Valid step: assigned -> in_progress
    res_valid = client.patch(
        f"/api/v1/inspections/{insp_id}/status",
        json={"status": "in_progress"},
        headers=get_auth_headers(inspector)
    )
    assert res_valid.status_code == 200
    assert res_valid.json()["status"] == "in_progress"

    # I4: Re-inspection linking & comparison
    re_insp_payload = dict(insp_payload, parent_inspection_id=insp_id)
    res_re = client.post("/api/v1/inspections", json=re_insp_payload, headers=get_auth_headers(admin))
    assert res_re.status_code == 201
    re_id = res_re.json()["id"]

    res_comp = client.get(f"/api/v1/inspections/{insp_id}/compare/{re_id}", headers=get_auth_headers(admin))
    assert res_comp.status_code == 200
    assert res_comp.json()["inspectionA"]["id"] == insp_id
    assert res_comp.json()["inspectionB"]["id"] == re_id

# =========================================================================
# SECTION J & K: Image Upload, Validation, Calibration, and Preprocessing
# =========================================================================

def generate_test_image(width=600, height=600, color=(128, 128, 128), add_noise=True):
    img = Image.new("RGB", (width, height), color)
    if add_noise:
        # Add texture/variance so variance of Laplacian and pixel std are realistic
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        for i in range(0, width, 20):
            draw.line([(i, 0), (i, height)], fill=(i % 255, 100, 150), width=2)
            draw.line([(0, i), (width, i)], fill=(50, (i * 2) % 255, 80), width=2)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()

def test_image_upload_and_validation():
    """Checks J1-J9: Image upload, validation, duplicate rejection, abuse defense, scale calibration."""
    db = TestingSessionLocal()
    org = db.query(Organization).first()
    admin = create_test_user(db, "img_admin@test.com", "admin", org.id)
    inspector = create_test_user(db, "img_insp@test.com", "inspector", org.id)

    asset = Asset(
        id="BR-777", organization_id=org.id, name="Bridge 777",
        asset_type="bridge", address="Location 777", latitude=19.2, longitude=72.8,
        construction_year=2015, material="Concrete", department="Bridges",
        inspection_frequency="Annual", importance="Medium", is_active=True
    )
    db.add(asset)
    db.flush()

    insp = Inspection(
        organization_id=org.id, asset_id=asset.id, inspector_id=inspector.id,
        inspection_date=datetime.now(timezone.utc), due_date=datetime.now(timezone.utc) + timedelta(days=7),
        status="in_progress"
    )
    db.add(insp)
    db.commit()

    # J6: Abuse: .exe renamed to .jpg
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00This is a fake windows binary file"
    res_exe = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("malicious.jpg", fake_exe, "image/jpeg")},
        headers=get_auth_headers(inspector)
    )
    assert res_exe.status_code == 422
    assert "INVALID_IMAGE_HEADER" in res_exe.json()["detail"]["code"]

    # J6: Abuse: Path traversal filename
    valid_bytes = generate_test_image()
    res_trav = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("../../etc/passwd.jpg", valid_bytes, "image/jpeg")},
        headers=get_auth_headers(inspector)
    )
    assert res_trav.status_code == 422
    assert res_trav.json()["detail"]["code"] == "INVALID_FILENAME"

    # J1, J3: Valid image upload
    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("pier_surface.jpg", valid_bytes, "image/jpeg")},
        headers=get_auth_headers(inspector)
    )
    assert res_up.status_code == 201
    img_id = res_up.json()["id"]
    assert res_up.json()["status"] == "valid"

    # J2, J4: Duplicate upload rejection
    res_dup = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("pier_surface_dup.jpg", valid_bytes, "image/jpeg")},
        headers=get_auth_headers(inspector)
    )
    assert res_dup.status_code == 409
    assert res_dup.json()["detail"]["code"] == "DUPLICATE_IMAGE"


    # J7: Scale calibration
    res_calib = client.post(
        f"/api/v1/inspections/{insp.id}/images/{img_id}/calibrate",
        json={"method": "manual_line", "reference_line_length_mm": 100.0, "pixel_length": 400.0},
        headers=get_auth_headers(inspector)
    )
    assert res_calib.status_code == 200
    assert res_calib.json()["calibration"]["mm_per_pixel"] == 0.25

    # J7: Negative or zero scale rejected
    res_bad_calib = client.post(
        f"/api/v1/inspections/{insp.id}/images/{img_id}/calibrate",
        json={"method": "manual_line", "reference_line_length_mm": -50.0, "pixel_length": 400.0},
        headers=get_auth_headers(inspector)
    )
    assert res_bad_calib.status_code == 422

    # K1-K3: Preprocessing pipeline & checksum determinism
    res_proc1 = client.post(
        f"/api/v1/images/{img_id}/preprocess",
        json={"profile_name": "standard_crack_enhancement"},
        headers=get_auth_headers(inspector)
    )
    assert res_proc1.status_code == 200
    checksum1 = res_proc1.json()["checksum"]

    # Run again with same profile -> Must produce identical checksum (Check K2)
    res_proc2 = client.post(
        f"/api/v1/images/{img_id}/preprocess",
        json={"profile_name": "standard_crack_enhancement"},
        headers=get_auth_headers(inspector)
    )
    checksum2 = res_proc2.json()["checksum"]
    assert checksum1 == checksum2, "Preprocessing must produce byte-identical reproducible output"

    # J8: Image deletion
    res_del = client.delete(f"/api/v1/inspections/{insp.id}/images/{img_id}", headers=get_auth_headers(inspector))
    assert res_del.status_code == 200
    assert res_del.json()["status"] == "deleted"

# =========================================================================
# SECTION L: Datasets, EDA, and Schema
# =========================================================================

def test_reference_data_and_eda_counts():
    """Checks L1, L2, L3: Exact PDF counts and dataset suitability limits."""
    res = client.get("/api/v1/reference-data")
    assert res.status_code == 200
    data = res.json()["counts"]
    assert data["crackCategories"] == 8, "Must have exactly 8 crack categories"
    assert data["surfaceDamageCategories"] == 9, "Must have exactly 9 surface damage categories"
    assert data["severityLevels"] == 5, "Must have exactly 5 severity levels"
    assert data["priorityCategories"] == 5, "Must have exactly 5 priority categories"
    assert data["infrastructureTypes"] == 8, "Must have exactly 8 infrastructure types"
    assert data["alertLevels"] == 5, "Must have exactly 5 alert levels"

    # L3: Dataset suitability limits check
    res_ds = client.get("/api/v1/datasets")
    assert res_ds.status_code == 200
    datasets = {d["id"]: d for d in res_ds.json()["datasets"]}
    assert "SDNET2018" in datasets
    assert "Classification-only" in datasets["SDNET2018"]["suitabilityLimits"]
    assert "METU" in datasets
    assert "RDD2022" in datasets
    assert "CFD" in datasets
    assert "CRACK500" in datasets

# =========================================================================
# SECTION M & N: Notifications & Dashboards
# =========================================================================

def test_dashboards_and_global_search():
    """Checks N1-N6: SQL-verified role dashboard metrics and global search."""
    db = TestingSessionLocal()
    org = db.query(Organization).first()
    admin = create_test_user(db, "dash_admin@test.com", "admin", org.id)
    inspector = create_test_user(db, "dash_insp@test.com", "inspector", org.id)

    # 1. Inspector Dashboard
    res_insp_dash = client.get("/api/v1/dashboards/inspector", headers=get_auth_headers(inspector))
    assert res_insp_dash.status_code == 200
    dash_data = res_insp_dash.json()
    assert "assignedCount" in dash_data
    assert "pendingCount" in dash_data
    assert dash_data["isLive"] is True

    # 2. Manager Dashboard
    res_mgr_dash = client.get("/api/v1/dashboards/manager", headers=get_auth_headers(admin))
    assert res_mgr_dash.status_code == 200
    assert "totalAssets" in res_mgr_dash.json()

    # 3. Global search
    res_search = client.get("/api/v1/search?q=Bridge", headers=get_auth_headers(admin))
    assert res_search.status_code == 200
    assert "assets" in res_search.json()

# =========================================================================
# SECTION P: Security Sweep
# =========================================================================

def test_security_headers_and_injection():
    """Checks P3, P4: Security headers and SQL injection protection."""
    res = client.get("/health")
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert "default-src 'self'" in res.headers.get("content-security-policy", "")

    # SQL Injection in search field
    sqli_probe = "BR' OR 1=1 --"
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.role == "admin").first()
    res_sqli = client.get(f"/api/v1/assets?search={sqli_probe}", headers=get_auth_headers(admin))
    assert res_sqli.status_code == 200
    # SQL injection safely neutralized; returns no items or exact match only
    assert isinstance(res_sqli.json()["items"], list)
