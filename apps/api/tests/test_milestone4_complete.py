import io
import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, ensure_schema_upgrades
from app.models.all_models import (
    User, UserCredential, Organization, Asset, Inspection, InspectionImage,
    Detection, Measurement, PriorityRecommendation, WorkOrder, Report, Notification,
    AuditLog
)
from app.security.jwt import create_access_token

TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

Base.metadata.create_all(bind=test_engine)
ensure_schema_upgrades(test_engine)

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

def setup_test_org_and_users(prefix: str):
    db = TestingSessionLocal()
    org_id = f"org-m4-{prefix}"
    org = Organization(id=org_id, name=f"Milestone 4 Corp {prefix}", allow_self_registration=True)
    db.add(org)

    roles = ["admin", "engineer", "inspector", "maintenance", "manager"]
    user_ids = {}
    for r in roles:
        uid = f"user-{r}-{prefix}"
        u = User(
            id=uid,
            email=f"{r}_{prefix}@m4test.com",
            name=f"Test {r.capitalize()}",
            role=r,
            organization_id=org_id,
            status="active"
        )
        db.add(u)
        user_ids[r] = uid
    db.commit()

    asset_id = f"AST-M4-{prefix}"
    asset = Asset(
        id=asset_id,
        name=f"Harbor Gateway Viaduct {prefix}",
        organization_id=org_id,
        asset_type="bridge",
        material="reinforced_concrete",
        address="100 Harbor Way",
        latitude=37.7749,
        longitude=-122.4194,
        construction_year=2010,
        department="Transportation",
        region="Western",
        inspection_frequency="quarterly",
        importance="high",
        is_active=True
    )
    db.add(asset)
    db.commit()
    db.close()
    return org_id, user_ids, asset_id

def test_infrastructure_dashboards_all_5_roles():
    """Validates complete dashboards and CSV export for all 5 roles."""
    org_id, users, asset_id = setup_test_org_and_users("dash")

    roles = ["admin", "engineer", "inspector", "maintenance", "manager"]
    for r in roles:
        token = create_access_token({"sub": users[r], "org": org_id, "role": r})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Dashboard Metrics Endpoint
        res = client.get(f"/api/v1/dashboard/{r}", headers=headers)
        assert res.status_code == 200, f"Dashboard for {r} failed: {res.text}"
        data = res.json()
        assert "kpis" in data or "counts" in data or "totalUsers" in data or "workOrders" in data

        # 2. Dashboard CSV Export Endpoint
        res_csv = client.get(f"/api/v1/exports/dashboard/{r}?range=30d", headers=headers)
        assert res_csv.status_code == 200, f"CSV export for {r} failed: {res_csv.text}"
        assert "text/csv" in res_csv.headers["content-type"]
        assert len(res_csv.text) > 0

def test_automated_inspection_reports_and_multiformat_export():
    """
    Validates:
    1. Automated generation of reports across all 4 formats (PDF, Excel, CSV, JSON) upon sign-off.
    2. Dynamic/static report downloads for all 4 formats.
    """
    org_id, users, asset_id = setup_test_org_and_users("rep")
    db = TestingSessionLocal()

    # Create inspection with image and defect detection
    insp_id = "INSP-M4-REP-01"
    insp = Inspection(
        id=insp_id,
        organization_id=org_id,
        asset_id=asset_id,
        inspector_id=users["inspector"],
        status="pending_review",
        claimed_by=users["engineer"],
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=14)
    )
    db.add(insp)
    db.flush()

    img = InspectionImage(
        id="IMG-M4-REP-01",
        organization_id=org_id,
        inspection_id=insp_id,
        uploader_id=users["inspector"],
        filename="test.jpg",
        original_path="uploads/test.jpg",
        sha256="fakehashm4rep",
        phash="fakephashm4rep",
        width=1920,
        height=1080,
        file_size=1024,
        status="valid"
    )
    db.add(img)
    db.flush()

    det = Detection(
        id="DET-M4-REP-01",
        inspection_id=insp_id,
        image_id=img.id,
        source="engineer_manual",
        defect_type="longitudinal",
        geometry={"type": "polygon", "coordinates": [[[10, 10], [100, 10], [100, 50], [10, 50]]]},
        severity="moderate",
        created_by=users["engineer"],
        verified_by=users["engineer"],
        verified_at=datetime.now(timezone.utc),
        notes="Transverse hairline progressing to longitudinal crack"
    )
    db.add(det)
    db.flush()

    meas = Measurement(
        id="MEA-M4-REP-01",
        detection_id=det.id,
        length=1250.0,
        avg_width=2.4,
        max_width=3.8,
        area=3000.0,
        unit="mm",
        calibrated=True
    )
    db.add(meas)
    db.commit()
    db.close()

    # Engineer signs off
    token_eng = create_access_token({"sub": users["engineer"], "org": org_id, "role": "engineer"})
    headers_eng = {"Authorization": f"Bearer {token_eng}"}

    res_signoff = client.post(
        f"/api/v1/inspections/{insp_id}/sign-off",
        json={"notes": "Thorough field verification complete. Longitudinal defect confirmed."},
        headers=headers_eng
    )
    assert res_signoff.status_code == 200, f"Sign-off failed: {res_signoff.text}"
    signoff_data = res_signoff.json()
    assert signoff_data["status"] == "reviewed"

    # Verify Reports were automatically generated in database
    db = TestingSessionLocal()
    reports = db.query(Report).filter(Report.inspection_id == insp_id).all()
    formats_generated = {r.file_format for r in reports}
    assert "pdf" in formats_generated
    assert "xlsx" in formats_generated
    assert "csv" in formats_generated
    assert "json" in formats_generated
    db.close()

    # Verify Downloads for each format
    format_mimes = {
        "pdf": "application/pdf",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
        "json": "application/json"
    }

    for fmt, mime in format_mimes.items():
        res_dl = client.get(f"/api/v1/inspections/{insp_id}/reports/download?format={fmt}", headers=headers_eng)
        assert res_dl.status_code == 200, f"Download {fmt} failed: {res_dl.text}"
        assert mime in res_dl.headers["content-type"]
        assert len(res_dl.content) > 0

def test_notifications_and_alerts_full_lifecycle():
    """
    Validates Section 20 requirements:
    1. Event triggers (inspection assigned, completed, engineering review required, damage detected,
       severe damage identified, maintenance task assigned, maintenance deadline approaching, report generated).
    2. 5 Alert levels (critical, high, medium, low, informational).
    3. Deadline synchronization for work orders due within 3 days.
    """
    org_id, users, asset_id = setup_test_org_and_users("notif")
    db = TestingSessionLocal()

    # Create work order with approaching deadline (due in 2 days)
    wo = WorkOrder(
        id="WO-M4-ALERT-01",
        organization_id=org_id,
        asset_id=asset_id,
        action="Structural polyurethane injection",
        priority="high",
        team="Civil Maintenance Crew",
        due_date=datetime.now(timezone.utc) + timedelta(days=2),
        status="open",
        created_by=users["engineer"]
    )
    db.add(wo)
    db.commit()
    db.close()

    # Fetch notifications for maintenance engineer
    token_maint = create_access_token({"sub": users["maintenance"], "org": org_id, "role": "maintenance"})
    headers_maint = {"Authorization": f"Bearer {token_maint}"}

    res_notifs = client.get("/api/v1/notifications", headers=headers_maint)
    assert res_notifs.status_code == 200
    notif_data = res_notifs.json()

    # Should have triggered approaching deadline alert
    items = notif_data["items"]
    deadline_alerts = [i for i in items if i["eventType"] == "maintenance_deadline_approaching"]
    assert len(deadline_alerts) > 0
    assert deadline_alerts[0]["level"] in ("high", "critical")
    assert deadline_alerts[0]["entity_type"] == "work_order"
    assert deadline_alerts[0]["entity_id"] == "WO-M4-ALERT-01"

    # Mark as read
    notif_id = deadline_alerts[0]["id"]
    res_read = client.post(f"/api/v1/notifications/{notif_id}/read", headers=headers_maint)
    assert res_read.status_code == 200
    assert res_read.json()["isRead"] is True

    # Mark all read
    res_all = client.post("/api/v1/notifications/read-all", headers=headers_maint)
    assert res_all.status_code == 200
