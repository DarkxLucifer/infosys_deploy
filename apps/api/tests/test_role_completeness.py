import io
import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from PIL import Image

from app.database import Base, get_db, ensure_schema_upgrades
from app.main import app
from app.models.all_models import (
    User, Organization, Asset, Inspection, InspectionImage,
    Detection, Measurement, Review, PriorityRecommendation,
    WorkOrder, WorkOrderEvent, RepairTaskTemplate, Report
)
from app.security.jwt import create_access_token

# Test database
TEST_DB_URL = "sqlite:///./test_completeness.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    ensure_schema_upgrades(test_engine)
    
    db = TestingSessionLocal()
    org = Organization(id="org-prime", name="State Highway & Bridge Authority")
    db.add(org)
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_db, None)
    try:
        if os.path.exists("./test_completeness.db"):
            os.remove("./test_completeness.db")
    except Exception:
        pass

def get_auth_headers(user: User):
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role, "org_id": user.organization_id})
    return {"Authorization": f"Bearer {token}"}

def create_user(db, email, role, org_id="org-prime"):
    u = User(
        email=email,
        name=f"Test {role.title()}",
        role=role,
        status="active",
        organization_id=org_id
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u

def create_dummy_image_bytes():
    import numpy as np
    # Generate an image with high contrast texture/lines so it passes blur and completeness checks
    arr = np.zeros((480, 640, 3), dtype=np.uint8)
    for i in range(0, 480, 20):
        arr[i:i+10, :, :] = 200
    for j in range(0, 640, 20):
        arr[:, j:j+10, :] = 150
    # Add high frequency noise
    noise = np.random.randint(0, 50, (480, 640, 3), dtype=np.uint8)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_full_role_completeness_lifecycle():
    client = TestClient(app)
    db = TestingSessionLocal()

    # 1. Create 4 operational role users
    admin = create_user(db, "admin@test.com", "admin")
    inspector = create_user(db, "inspector@test.com", "inspector")
    engineer = create_user(db, "engineer@test.com", "civil-engineer")
    maintenance = create_user(db, "maintenance@test.com", "maintenance")
    manager = create_user(db, "manager@test.com", "manager")

    # 2. Manager / Admin creates an Asset with Region
    asset = Asset(
        id="BR-101",
        organization_id="org-prime",
        name="Riverside Viaduct",
        asset_type="bridge",
        address="100 River Road",
        latitude=40.7128,
        longitude=-74.0060,
        construction_year=2005,
        material="reinforced_concrete",
        department="Bridges",
        region="Northern",
        inspection_frequency="Annual",
        importance="critical",
        is_active=True
    )
    db.add(asset)
    db.commit()

    # 3. Schedule Inspection assigned to Inspector
    insp_payload = {
        "asset_id": asset.id,
        "inspector_id": inspector.id,
        "inspection_date": datetime.now(timezone.utc).isoformat(),
        "due_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "notes": "Annual structural crack monitoring"
    }
    res_insp = client.post("/api/v1/inspections", json=insp_payload, headers=get_auth_headers(manager))
    assert res_insp.status_code == 201
    insp_id = res_insp.json()["id"]

    # 4. Inspector Dashboard checks (INS-1)
    res_dash = client.get("/api/v1/dashboards/inspector", headers=get_auth_headers(inspector))
    assert res_dash.status_code == 200
    dash_data = res_dash.json()
    assert dash_data["assignedCount"] >= 1
    assert dash_data["aiStatus"] == "AI detection: not connected"

    # 5. Inspector uploads image (INS-4, INS-7)
    img_bytes = create_dummy_image_bytes()
    res_up = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": ("field_photo.jpg", img_bytes, "image/jpeg")},
        data={"source": "Digital camera", "allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    assert res_up.status_code == 201
    img_id = res_up.json()["id"]

    # 6. Scale Calibration (INS-9, ENG-8)
    res_cal = client.post(
        f"/api/v1/inspections/{insp_id}/images/{img_id}/calibrate",
        json={"method": "manual_line", "reference_line_length_mm": 50.0, "pixel_length": 200.0},
        headers=get_auth_headers(inspector)
    )
    assert res_cal.status_code == 200
    assert res_cal.json()["calibration"]["mm_per_pixel"] == 0.25

    # 7. SECTION 4 VISIBILITY GATE VERIFICATION:
    # Manager and Maintenance personnel MUST receive 403 Forbidden for unreviewed images and unreviewed findings!
    res_mgr_blocked = client.get(f"/api/v1/inspections/{insp_id}/images", headers=get_auth_headers(manager))
    assert res_mgr_blocked.status_code == 403
    assert res_mgr_blocked.json()["detail"]["code"] == "UNREVIEWED_ACCESS_BLOCKED"

    res_mnt_blocked = client.get(f"/api/v1/inspections/{insp_id}/images", headers=get_auth_headers(maintenance))
    assert res_mnt_blocked.status_code == 403

    res_mgr_det_blocked = client.get(f"/api/v1/inspections/{insp_id}/detections", headers=get_auth_headers(manager))
    assert res_mgr_det_blocked.status_code == 403

    # 8. Inspector Submits for Review (INS-10: submit with locking)
    res_sub = client.post(f"/api/v1/inspections/{insp_id}/submit", headers=get_auth_headers(inspector))
    assert res_sub.status_code == 200
    assert res_sub.json()["status"] == "pending_review"

    # 9. Civil Engineer Claims Inspection (ENG-2)
    res_claim = client.post(f"/api/v1/inspections/{insp_id}/claim", headers=get_auth_headers(engineer))
    assert res_claim.status_code == 200
    assert res_claim.json()["status"] == "in_review"

    # 10. Civil Engineer draws polyline crack with width cross-sections (ENG-4, ENG-5, ENG-9, ENG-11, ENG-12)
    det_payload = {
        "image_id": img_id,
        "defect_type": "transverse",
        "geometry": {
            "type": "crack_polyline",
            "points": [[100, 100], [200, 105], [300, 110]],  # ~200px length
            "width_segments": [[[150, 95], [150, 115]], [[250, 100], [250, 120]]], # 20px width -> 5mm
            "branching": 0
        },
        "notes": "Transverse flexural crack across bottom deck"
    }
    res_det = client.post(f"/api/v1/inspections/{insp_id}/detections", json=det_payload, headers=get_auth_headers(engineer))
    assert res_det.status_code == 201
    det_data = res_det.json()
    det_id = det_data["id"]
    # Check calibrated server measurements
    meas = det_data["measurement"]
    assert meas["calibrated"] is True
    assert meas["unit"] == "mm"
    assert meas["avg_width"] == 5.0  # 20px * 0.25mm/px = 5.0mm
    assert meas["uncertainty"] is not None
    # Check severity rule breakdown
    assert "severityEvaluation" in det_data
    assert det_data["severityEvaluation"]["recommended_severity"] in ("moderate", "severe", "critical")
    # Check rule suggestion
    assert det_data["ruleSuggestion"] == "transverse"

    # 11. Attempt signoff BEFORE geometry verification (ENG-10 gate must block)
    res_sign_early = client.post(f"/api/v1/inspections/{insp_id}/sign-off", headers=get_auth_headers(engineer))
    assert res_sign_early.status_code == 422
    assert res_sign_early.json()["detail"]["code"] == "UNVERIFIED_GEOMETRY"

    # 12. Verify Geometry (ENG-10)
    res_verify = client.post(
        f"/api/v1/detections/{det_id}/verify-geometry",
        json={"confirmed": True},
        headers=get_auth_headers(engineer)
    )
    assert res_verify.status_code == 200
    assert res_verify.json()["status"] == "verified"

    # 13. Sign-off and lock (ENG-14, ENG-15)
    res_sign = client.post(f"/api/v1/inspections/{insp_id}/sign-off", headers=get_auth_headers(engineer))
    assert res_sign.status_code == 200
    assert res_sign.json()["status"] == "reviewed"
    assert "priorityRecommendation" in res_sign.json()

    # 14. Priority confirmation / override (ENG-15)
    res_prio_confirm = client.post(
        f"/api/v1/inspections/{insp_id}/confirm-priority",
        json={"priority": "high", "reason": "Confirmed high priority due to heavy freight traffic on bridge"},
        headers=get_auth_headers(engineer)
    )
    assert res_prio_confirm.status_code == 200
    assert res_prio_confirm.json()["priority"] == "high"

    # 15. Report Generation in 4 Formats (ENG-18, §5.19)
    res_rep = client.post(
        f"/api/v1/inspections/{insp_id}/reports/generate",
        json={"format": "all"},
        headers=get_auth_headers(engineer)
    )
    assert res_rep.status_code == 200
    reports = res_rep.json()
    assert len(reports) == 4
    formats = [r["format"] for r in reports]
    assert "pdf" in formats
    assert "csv" in formats
    assert "xlsx" in formats
    assert "json" in formats
    for r in reports:
        assert len(r["checksum"]) == 64  # SHA-256

    # 16. Work Order Creation & State Machine (MNT-2, MNT-4, MNT-6, ENG-16)
    wo_payload = {
        "asset_id": asset.id,
        "inspection_id": insp_id,
        "finding_id": det_id,
        "action": "Epoxy pressure injection and surface elastomeric sealing",
        "priority": "high",
        "assignee_id": maintenance.id,
        "due_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        "repair_window": "Night window (22:00 - 05:00)"
    }
    res_wo = client.post("/api/v1/work-orders", json=wo_payload, headers=get_auth_headers(engineer))
    assert res_wo.status_code == 201
    wo_id = res_wo.json()["id"]

    # Work Order status state machine:
    # Current status: "open" (because assigned to maintenance)
    # Transition to "in_progress"
    res_prog = client.post(
        f"/api/v1/work-orders/{wo_id}/transition",
        json={"to_status": "in_progress", "note": "Crew dispatched with epoxy injection rig."},
        headers=get_auth_headers(maintenance)
    )
    assert res_prog.status_code == 200
    assert res_prog.json()["to"] == "in_progress"

    # Invalid jump: in_progress -> unassigned directly must fail (400)
    res_inv_jump = client.post(
        f"/api/v1/work-orders/{wo_id}/transition",
        json={"to_status": "unassigned"},
        headers=get_auth_headers(maintenance)
    )
    assert res_inv_jump.status_code == 400

    # Closing requires mandatory closure note
    res_close_fail = client.post(
        f"/api/v1/work-orders/{wo_id}/transition",
        json={"to_status": "closed", "note": ""},
        headers=get_auth_headers(maintenance)
    )
    assert res_close_fail.status_code == 422

    res_close_ok = client.post(
        f"/api/v1/work-orders/{wo_id}/transition",
        json={"to_status": "closed", "note": "Crack injected to refusal at 1.8 MPa. Surface sealed. Core sample verified full depth penetration."},
        headers=get_auth_headers(maintenance)
    )
    assert res_close_ok.status_code == 200
    assert res_close_ok.json()["to"] == "closed"

    # 17. NOW INSPECTION IS REVIEWED: Section 4 Visibility Gate allows Manager & Maintenance
    res_mgr_allowed = client.get(f"/api/v1/inspections/{insp_id}/images", headers=get_auth_headers(manager))
    assert res_mgr_allowed.status_code == 200

    res_mnt_allowed = client.get(f"/api/v1/inspections/{insp_id}/images", headers=get_auth_headers(maintenance))
    assert res_mnt_allowed.status_code == 200

    # 18. Manager Dashboard reflects reviewed metrics (MGR-1)
    res_mgr_dash = client.get("/api/v1/dashboards/manager", headers=get_auth_headers(manager))
    assert res_mgr_dash.status_code == 200
    mgr_data = res_mgr_dash.json()
    assert mgr_data["damagedAssetsCount"] >= 1
    assert mgr_data["highPriorityCount"] >= 1
    assert "Northern" in mgr_data["regionsSummary"]

    # 19. Maintenance Dashboard reflects closed order (MNT-1)
    res_mnt_dash = client.get("/api/v1/dashboards/maintenance", headers=get_auth_headers(maintenance))
    assert res_mnt_dash.status_code == 200
    mnt_data = res_mnt_dash.json()
    assert mnt_data["closedCount"] >= 1
