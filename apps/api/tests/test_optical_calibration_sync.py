import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, ensure_schema_upgrades
from app.main import app
from app.models.all_models import User, Organization, Asset, Inspection, InspectionImage
from app.security.jwt import create_access_token

TEST_DB_URL = "sqlite:///./test_calib_sync.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    ensure_schema_upgrades(test_engine)
    yield
    app.dependency_overrides.pop(get_db, None)
    try:
        if os.path.exists("./test_calib_sync.db"):
            os.remove("./test_calib_sync.db")
    except Exception:
        pass


def test_optical_calibration_lifecycle_and_cache_invalidation():
    db = TestingSessionLocal()
    org = Organization(id="test-org-calib", name="Test Calib Org")
    db.add(org)

    user = User(
        id="user-calib-insp",
        email="calib_inspector@example.com",
        name="Calib Inspector",
        organization_id=org.id,
        role="inspector",
        status="active"
    )
    db.add(user)

    asset = Asset(
        id="ASSET-CALIB-01",
        organization_id=org.id,
        name="Calib Test Asset",
        asset_type="bridge",
        address="123 Test St",
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

    inspection = Inspection(
        id="INSP-CALIB-01",
        asset_id=asset.id,
        organization_id=org.id,
        inspector_id=user.id,
        status="pending_review",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(inspection)
    db.commit()

    token = create_access_token(data={"sub": user.id, "email": user.email, "role": user.role, "org_id": org.id})
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    # 1. Create a test image
    img = InspectionImage(
        id="IMG-CALIB-TEST-1",
        inspection_id=inspection.id,
        organization_id=org.id,
        uploader_id=user.id,
        filename="crack_sample.jpg",
        original_path="dummy_crack_path.jpg",
        file_size=204800,
        sha256="testsha256calib1",
        phash="1010101010101010",
        width=1000,
        height=1000,
        quality_status="accepted",
        processing_status="complete",
        quality_report={
            "ai_classification": {
                "crack_probability": 0.95,
                "threshold": 0.80,
                "predicted_class": "Cracked"
            },
            "crack_geometry": {
                "success": True,
                "summary": {
                    "is_calibrated": False,
                    "mm_per_pixel": None,
                    "crack_coverage_pct": 3.5,
                    "maximum_crack_width_px": 50.0,
                    "crack_severity_category": "Uncalibrated",
                    "crack_severity_code": "uncalibrated"
                }
            }
        }
    )
    db.add(img)
    db.commit()

    # 2. Before calibration, GET /images/{id}/geometry returns uncalibrated
    resp_pre = client.get(f"/api/v1/images/{img.id}/geometry", headers=headers)
    assert resp_pre.status_code == 200
    pre_geo = resp_pre.json()
    assert pre_geo["summary"]["is_calibrated"] is False

    # 3. Apply point marker optical calibration: 50 mm across 200 px line -> 0.25 mm/px
    calib_payload = {
        "method": "manual_line",
        "reference_line_length_mm": 50.0,
        "pixel_length": 200.0,
        "reference_p1": [100.0, 100.0],
        "reference_p2": [300.0, 100.0],
        "width_metric": "maximum"
    }
    resp_calib = client.post(f"/api/v1/images/{img.id}/calibration", json=calib_payload, headers=headers)
    assert resp_calib.status_code == 200
    calib_res = resp_calib.json()
    assert calib_res["status"] == "calibrated"
    assert calib_res["calibration"]["calibrated"] is True
    assert calib_res["calibration"]["mm_per_pixel"] == 0.25

    # 4. Check that GET /images/{id} returns calibration and qualityReport["calibration"]
    resp_details = client.get(f"/api/v1/images/{img.id}", headers=headers)
    assert resp_details.status_code == 200
    details = resp_details.json()
    assert details["calibration"] is not None
    assert details["calibration"]["calibrated"] is True
    assert details["calibration"]["mm_per_pixel"] == 0.25
    assert details["qualityReport"]["calibration"]["calibrated"] is True

    # 5. Check GET /images/{id}/geometry returns calibrated geometry
    resp_post = client.get(f"/api/v1/images/{img.id}/geometry", headers=headers)
    assert resp_post.status_code == 200
    post_geo = resp_post.json()
    assert post_geo["summary"]["is_calibrated"] is True
    assert post_geo["summary"]["mm_per_pixel"] == 0.25

    # 6. Delete calibration resets to uncalibrated
    resp_del = client.delete(f"/api/v1/images/{img.id}/calibration", headers=headers)
    assert resp_del.status_code == 200
    del_res = resp_del.json()
    assert del_res["status"] == "uncalibrated"

    # Verify image details no longer has calibration
    resp_details_del = client.get(f"/api/v1/images/{img.id}", headers=headers)
    assert resp_details_del.status_code == 200
    assert resp_details_del.json()["calibration"] is None
