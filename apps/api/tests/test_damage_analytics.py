import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timezone, timedelta

from app.database import Base, get_db
from app.main import app
from app.models.all_models import (
    Organization, User, Asset, Inspection, InspectionImage, Detection, Measurement, WorkOrder
)
from app.security.jwt import create_access_token

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
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

def create_test_user(db, email, role, org_id):
    user = User(
        email=email,
        name=f"Test {role.title()}",
        role=role,
        status="active",
        organization_id=org_id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_auth_headers(user):
    token = create_access_token({"sub": user.id, "role": user.role, "org_id": user.organization_id})
    return {"Authorization": f"Bearer {token}"}

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    org = Organization(name="Analytics Authority", allow_self_registration=True)
    db.add(org)
    db.commit()

    admin = create_test_user(db, "admin@analytics.test", "admin", org.id)
    eng = create_test_user(db, "eng@analytics.test", "engineer", org.id)
    insp_user = create_test_user(db, "insp@analytics.test", "inspector", org.id)
    maint_user = create_test_user(db, "maint@analytics.test", "maintenance", org.id)
    mgr = create_test_user(db, "mgr@analytics.test", "manager", org.id)

    # Assets
    bridge = Asset(
        id="BR-ANALYTICS-1", organization_id=org.id, name="North Span",
        asset_type="bridge", address="Km 12", latitude=19.123, longitude=72.456,
        construction_year=2015, material="Concrete", department="Bridges",
        inspection_frequency="Annual", importance="High", is_active=True
    )
    tunnel = Asset(
        id="TU-ANALYTICS-1", organization_id=org.id, name="Metro Tube",
        asset_type="tunnel", address="St 4", latitude=19.234, longitude=72.567,
        construction_year=2018, material="Reinforced Concrete", department="Tunnels",
        inspection_frequency="Semi-annual", importance="Critical", is_active=True
    )
    db.add_all([bridge, tunnel])
    db.commit()

    # Inspections
    insp1 = Inspection(
        id="insp-ana-1", organization_id=org.id, asset_id=bridge.id, inspector_id=insp_user.id,
        inspection_date=datetime.now(timezone.utc) - timedelta(days=20),
        due_date=datetime.now(timezone.utc) - timedelta(days=10),
        status="reviewed", method="walkdown"
    )
    insp2 = Inspection(
        id="insp-ana-2", organization_id=org.id, asset_id=bridge.id, inspector_id=insp_user.id,
        inspection_date=datetime.now(timezone.utc) - timedelta(days=5),
        due_date=datetime.now(timezone.utc) + timedelta(days=5),
        status="reviewed", method="walkdown"
    )
    insp3 = Inspection(
        id="insp-ana-3", organization_id=org.id, asset_id=tunnel.id, inspector_id=insp_user.id,
        inspection_date=datetime.now(timezone.utc) - timedelta(days=2),
        due_date=datetime.now(timezone.utc) + timedelta(days=12),
        status="pending_review", method="vehicle"
    )
    db.add_all([insp1, insp2, insp3])
    db.commit()

    # Images
    img1 = InspectionImage(
        id="img-ana-1", organization_id=org.id, inspection_id=insp1.id, uploader_id=insp_user.id,
        filename="photo1.jpg", original_path="/tmp/photo1.jpg", sha256="hash1", phash="phash1",
        width=1920, height=1080, file_size=10240
    )
    img2 = InspectionImage(
        id="img-ana-2", organization_id=org.id, inspection_id=insp2.id, uploader_id=insp_user.id,
        filename="photo2.jpg", original_path="/tmp/photo2.jpg", sha256="hash2", phash="phash2",
        width=1920, height=1080, file_size=10240
    )
    img3 = InspectionImage(
        id="img-ana-3", organization_id=org.id, inspection_id=insp3.id, uploader_id=insp_user.id,
        filename="photo3.jpg", original_path="/tmp/photo3.jpg", sha256="hash3", phash="phash3",
        width=1920, height=1080, file_size=10240
    )
    db.add_all([img1, img2, img3])
    db.commit()

    # Detections & Measurements for Epochs
    det1 = Detection(
        id="det-ana-1", inspection_id=insp1.id, image_id=img1.id, defect_type="longitudinal_crack",
        geometry={"bbox": [10, 10, 100, 100]}, severity="moderate", confidence=0.96, created_by=eng.id
    )
    det2 = Detection(
        id="det-ana-2", inspection_id=insp2.id, image_id=img2.id, defect_type="longitudinal_crack",
        geometry={"bbox": [10, 10, 120, 120]}, severity="severe", confidence=0.98, created_by=eng.id
    )
    det3 = Detection(
        id="det-ana-3", inspection_id=insp3.id, image_id=img3.id, defect_type="spalling",
        geometry={"bbox": [20, 20, 80, 80]}, severity="critical", confidence=0.91, created_by=eng.id
    )
    db.add_all([det1, det2, det3])
    db.commit()

    m1 = Measurement(detection_id=det1.id, length=120.0, avg_width=2.5, max_width=4.0, area=300.0, unit="px")
    m2 = Measurement(detection_id=det2.id, length=180.0, avg_width=4.2, max_width=6.8, area=756.0, unit="px")
    m3 = Measurement(detection_id=det3.id, length=80.0, avg_width=5.0, max_width=8.0, area=400.0, unit="px")
    db.add_all([m1, m2, m3])

    # Work Order
    wo = WorkOrder(
        id="WO-ANA-1", organization_id=org.id, asset_id=bridge.id, inspection_id=insp2.id,
        action="Structural crack injection", priority="high", team="Bridge Maintenance Specialists",
        status="open", created_by=eng.id, created_at=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=14)
    )
    db.add(wo)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)

def test_export_dashboard_csv_all_roles():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    insp = db.query(User).filter(User.role == "inspector").first()
    maint = db.query(User).filter(User.role == "maintenance").first()
    mgr = db.query(User).filter(User.role == "manager").first()
    admin = db.query(User).filter(User.role == "admin").first()

    for role_name, user_obj in [("engineer", eng), ("inspector", insp), ("maintenance", maint), ("manager", mgr), ("admin", admin)]:
        res = client.get(f"/api/v1/exports/dashboard/{role_name}", headers=get_auth_headers(user_obj))
        assert res.status_code == 200, f"Export for {role_name} failed: {res.text}"
        assert "text/csv" in res.headers["content-type"]
        assert "attachment; filename=" in res.headers["content-disposition"]
        assert len(res.text) > 20, f"Empty CSV exported for {role_name}"

def test_damage_analytics_overview():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    res = client.get("/api/v1/analytics/overview?range=30d", headers=get_auth_headers(eng))
    assert res.status_code == 200
    data = res.json()
    assert "defect_detection_rate" in data
    assert "high_priority_rate" in data
    assert "inspection_completion_rate" in data
    assert "mean_time_to_resolution_days" in data
    assert data["total_inspections"] == 3
    assert data["completed_inspections"] == 2
    assert data["total_defects"] == 3
    assert data["high_priority_defects"] == 2 # severe + critical

def test_damage_analytics_damage_distribution():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    res = client.get("/api/v1/analytics/damage-distribution?range=30d", headers=get_auth_headers(eng))
    assert res.status_code == 200
    data = res.json()
    assert "classes" in data
    classes = data["classes"]
    class_keys = [c["key"] for c in classes]
    assert "longitudinal_crack" in class_keys
    assert "spalling" in class_keys

def test_damage_analytics_crack_progression():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    res = client.get("/api/v1/analytics/crack-progression", headers=get_auth_headers(eng))
    assert res.status_code == 200
    data = res.json()
    assert "series" in data
    bridge_series = next((s for s in data["series"] if s["asset_id"] == "BR-ANALYTICS-1"), None)
    assert bridge_series is not None
    assert bridge_series["epochs_count"] == 2
    epochs = bridge_series["epochs"]
    assert epochs[0]["max_aperture_px"] == 4.0
    assert epochs[1]["max_aperture_px"] == 6.8
    assert epochs[1]["growth_rate_per_day"] > 0

def test_damage_analytics_risk_matrix():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    res = client.get("/api/v1/analytics/risk-matrix?range=30d", headers=get_auth_headers(eng))
    assert res.status_code == 200
    data = res.json()
    assert "rows" in data
    bridge_row = next((r for r in data["rows"] if r["asset_type"] == "bridge"), None)
    assert bridge_row is not None
    assert bridge_row["counts"]["moderate"] >= 1
    assert bridge_row["counts"]["severe"] >= 1

def test_damage_analytics_maintenance_velocity():
    db = TestingSessionLocal()
    maint = db.query(User).filter(User.role == "maintenance").first()
    res = client.get("/api/v1/analytics/maintenance-velocity", headers=get_auth_headers(maint))
    assert res.status_code == 200
    data = res.json()
    assert "crews" in data
    assert len(data["crews"]) > 0

def test_damage_analytics_export_csv():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    res = client.get("/api/v1/analytics/export?range=30d", headers=get_auth_headers(eng))
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "INFRASCAN DAMAGE ANALYTICS EXECUTIVE REPORT" in res.text
    assert "Defect Detection Rate (DDR)" in res.text

def test_inspection_report_download():
    db = TestingSessionLocal()
    eng = db.query(User).filter(User.role == "engineer").first()
    # Test CSV report download on the fly
    res = client.get("/api/v1/inspections/insp-ana-1/reports/download?format=csv", headers=get_auth_headers(eng))
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "Inspection ID" in res.text
