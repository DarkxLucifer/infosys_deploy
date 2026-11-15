import os
import io
import pytest
import numpy as np
from PIL import Image
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, ensure_schema_upgrades
from app.main import app as fastapi_app
from app.models.all_models import (
    Organization, User, Asset, Inspection, InspectionImage, Detection
)
from app.security.jwt import create_access_token

TEST_DB_URL = "sqlite:///./test_rbac_locks.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_textured_image_bytes(width=640, height=480):
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    for i in range(0, height, 16):
        arr[i:i+8, :, :] = 190
    for j in range(0, width, 16):
        arr[:, j:j+8, :] = 130
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

@pytest.fixture(scope="module", autouse=True)
def setup_rbac_test_env():
    fastapi_app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    ensure_schema_upgrades(test_engine)

    db = TestingSessionLocal()
    org = Organization(id="org-1", name="State Highway Authority", allow_self_registration=True)
    db.add(org)

    inspector = User(id="user-inspector", organization_id="org-1", name="Inspector Jane", email="inspector@test.com", role="inspector", status="active")
    engineer = User(id="user-engineer", organization_id="org-1", name="Engineer Bob", email="engineer@test.com", role="civil-engineer", status="active")
    maintenance = User(id="user-maint", organization_id="org-1", name="Maintenance Mike", email="maint@test.com", role="maintenance", status="active")
    manager = User(id="user-mgr", organization_id="org-1", name="Manager Alice", email="mgr@test.com", role="manager", status="active")
    db.add_all([inspector, engineer, maintenance, manager])

    asset = Asset(
        id="BR-101",
        organization_id="org-1",
        name="Sunset Viaduct",
        asset_type="bridge",
        address="100 Coastal Highway, Pier 4",
        latitude=45.5152,
        longitude=-122.6784,
        construction_year=2008,
        material="reinforced_concrete",
        department="Bridges & Structures",
        region="Northwest",
        inspection_frequency="Annual",
        importance="critical",
        is_active=True
    )
    db.add(asset)
    db.commit()
    db.close()

    yield

    fastapi_app.dependency_overrides.pop(get_db, None)
    try:
        if os.path.exists("./test_rbac_locks.db"):
            os.remove("./test_rbac_locks.db")
    except Exception:
        pass

@pytest.fixture
def client():
    with TestClient(fastapi_app) as c:
        yield c

def get_auth_header(email: str, role: str, user_id: str, org_id="org-1"):
    token = create_access_token(data={"sub": user_id, "email": email, "role": role, "org_id": org_id})
    return {"Authorization": f"Bearer {token}"}

def test_inspector_image_set_lock_after_submission(client):
    db = TestingSessionLocal()
    insp = Inspection(
        id="insp-001",
        organization_id="org-1",
        asset_id="BR-101",
        inspector_id="user-inspector",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        status="in_progress"
    )
    db.add(insp)
    db.commit()
    db.close()

    headers = get_auth_header("inspector@test.com", "inspector", "user-inspector")

    # Upload first photo while in progress
    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("photo1.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=headers
    )
    assert res_up.status_code in (200, 201), res_up.text
    img_id = res_up.json()["id"]

    # 1. Inspector submits inspection for engineering review
    res_sub = client.post(f"/api/v1/inspections/{insp.id}/submit", headers=headers, json={"description": "Field capture completed."})
    assert res_sub.status_code == 200, res_sub.text

    # 2. Trying to upload new image after submit must be locked (HTTP 423)
    res_upload_locked = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("photo2.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=headers
    )
    assert res_upload_locked.status_code == 423, f"Expected 423 Locked on image upload, got {res_upload_locked.status_code}"
    assert "locked" in res_upload_locked.json()["detail"]["code"].lower()

    # 3. Trying to delete image after submit must also be locked (HTTP 423)
    res_del = client.delete(f"/api/v1/images/{img_id}", headers=headers)
    assert res_del.status_code == 423, f"Expected 423 Locked on image delete, got {res_del.status_code}"

def test_inspector_cannot_sign_off_or_verify_geometry(client):
    db = TestingSessionLocal()
    insp = Inspection(
        id="insp-002",
        organization_id="org-1",
        asset_id="BR-101",
        inspector_id="user-inspector",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        status="in_progress"
    )
    db.add(insp)
    db.commit()
    db.close()

    inspector_headers = get_auth_header("inspector@test.com", "inspector", "user-inspector")

    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("photo_insp2.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=inspector_headers
    )
    assert res_up.status_code in (200, 201)
    img_id = res_up.json()["id"]

    db = TestingSessionLocal()
    det = Detection(
        id="det-001",
        inspection_id="insp-002",
        image_id=img_id,
        defect_type="crack",
        geometry={"type": "crack_polyline", "points": [[10, 10], [50, 50]]},
        confidence=0.92,
        severity="moderate",
        source="ai_model",
        created_by="user-inspector"
    )
    db.add(det)
    db.commit()
    db.close()

    # Inspector attempting to sign off must be rejected with 403 Forbidden
    res_signoff = client.post(f"/api/v1/inspections/{insp.id}/sign-off", headers=inspector_headers, json={})
    assert res_signoff.status_code == 403, f"Expected 403 Forbidden for inspector sign-off, got {res_signoff.status_code}"

    # Inspector attempting to verify geometry must be rejected with 403 Forbidden
    res_verify = client.post(f"/api/v1/detections/{det.id}/verify-geometry", headers=inspector_headers, json={"confirmed": True})
    assert res_verify.status_code == 403, f"Expected 403 Forbidden for inspector geometry verification, got {res_verify.status_code}"

def test_civil_engineer_sign_off_and_permanent_lock(client):
    db = TestingSessionLocal()
    insp = Inspection(
        id="insp-003",
        organization_id="org-1",
        asset_id="BR-101",
        inspector_id="user-inspector",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        status="in_progress"
    )
    db.add(insp)
    db.commit()
    db.close()

    inspector_headers = get_auth_header("inspector@test.com", "inspector", "user-inspector")
    eng_headers = get_auth_header("engineer@test.com", "civil-engineer", "user-engineer")

    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("photo_eng.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=inspector_headers
    )
    assert res_up.status_code in (200, 201)
    img_id = res_up.json()["id"]

    # Submit to pending_review
    client.post(f"/api/v1/inspections/{insp.id}/submit", headers=inspector_headers)

    db = TestingSessionLocal()
    det = Detection(
        id="det-002",
        inspection_id="insp-003",
        image_id=img_id,
        defect_type="hairline_crack",
        confidence=0.95,
        severity="minor",
        source="ai_model",
        geometry={"type": "crack_polyline", "points": [[10, 10], [50, 50]]},
        created_by="user-inspector"
    )
    db.add(det)
    db.commit()
    db.close()

    # 1. Engineer claims inspection
    res_claim = client.post(f"/api/v1/inspections/{insp.id}/claim", headers=eng_headers)
    assert res_claim.status_code == 200

    # 2. Engineer verifies finding geometry
    res_verify = client.post(f"/api/v1/detections/{det.id}/verify-geometry", headers=eng_headers, json={"confirmed": True})
    assert res_verify.status_code == 200

    # 3. Engineer signs off with optional remarks and custom severity
    res_signoff = client.post(
        f"/api/v1/inspections/{insp.id}/sign-off",
        headers=eng_headers,
        json={"description": "Certified: superficial hairline fissure. Monitoring recommended.", "severity": "minor"}
    )
    assert res_signoff.status_code == 200, res_signoff.text

    # 4. Attempting to sign off again on reviewed inspection must be locked (HTTP 423)
    res_resign = client.post(f"/api/v1/inspections/{insp.id}/sign-off", headers=eng_headers, json={})
    assert res_resign.status_code == 423, f"Expected 423 on re-sign-off, got {res_resign.status_code}"

    # 5. Attempting to edit detection after sign-off must be locked (HTTP 423)
    res_edit = client.patch(f"/api/v1/detections/{det.id}", headers=eng_headers, json={"severity": "severe", "override_reason": "late change"})
    assert res_edit.status_code in (400, 423), f"Expected 400 or 423 for editing locked finding, got {res_edit.status_code}"

def test_maintenance_engineer_blocked_from_unreviewed_inspections(client):
    db = TestingSessionLocal()
    insp_unreviewed = Inspection(
        id="insp-004",
        organization_id="org-1",
        asset_id="BR-101",
        inspector_id="user-inspector",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        status="in_progress"
    )
    insp_reviewed = Inspection(
        id="insp-005",
        organization_id="org-1",
        asset_id="BR-101",
        inspector_id="user-inspector",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc),
        status="reviewed"
    )
    db.add_all([insp_unreviewed, insp_reviewed])
    db.commit()
    db.close()

    maint_headers = get_auth_header("maint@test.com", "maintenance", "user-maint")

    # 1. Unreviewed inspection access must be blocked with HTTP 403
    res_unrev = client.get(f"/api/v1/inspections/{insp_unreviewed.id}", headers=maint_headers)
    assert res_unrev.status_code == 403
    assert res_unrev.json()["detail"]["code"] == "UNREVIEWED_ACCESS_BLOCKED"

    # 2. Reviewed inspection access must succeed with HTTP 200
    res_rev = client.get(f"/api/v1/inspections/{insp_reviewed.id}", headers=maint_headers)
    assert res_rev.status_code == 200
    assert res_rev.json()["id"] == "insp-005"

def test_profile_role_update_endpoint(client):
    headers = get_auth_header("inspector@test.com", "inspector", "user-inspector")

    # Role self-change must be blocked (one user -> one fixed role)
    res = client.patch("/api/v1/me", headers=headers, json={"role": "manager"})
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "ROLE_CHANGE_FORBIDDEN"

    # Name update still succeeds and role remains unchanged
    name_res = client.patch("/api/v1/me", headers=headers, json={"name": "Inspector One"})
    assert name_res.status_code == 200
    assert name_res.json()["user"]["name"] == "Inspector One"
    assert name_res.json()["user"]["role"] == "inspector"

    db = TestingSessionLocal()
    user = db.query(User).filter(User.id == "user-inspector").first()
    assert user.role == "inspector"
    db.close()
