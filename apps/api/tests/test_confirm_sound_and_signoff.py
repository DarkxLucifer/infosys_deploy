import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, ensure_schema_upgrades
from app.main import app
from app.models.all_models import (
    User, Organization, Asset, Inspection, InspectionImage,
    Detection, PriorityRecommendation, WorkOrder, Notification
)
from app.security.jwt import create_access_token

TEST_DB_URL = "sqlite:///./test_sound_signoff.db"
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
        if os.path.exists("./test_sound_signoff.db"):
            os.remove("./test_sound_signoff.db")
    except Exception:
        pass

def test_confirm_sound_surface_and_signoff():
    db = TestingSessionLocal()
    org = Organization(id="org_test_sound", name="Sound Test Org")
    db.add(org)
    user = User(
        email="sound_eng@test.com",
        name="Elena Ramos, PE",
        role="civil-engineer",
        status="active",
        organization_id=org.id
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    asset = Asset(
        id="asset_sound_1",
        organization_id=org.id,
        name="River Bridge Pier 4",
        asset_type="bridge",
        address="Pier 4, River Road",
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
        id="insp_sound_1",
        organization_id=org.id,
        asset_id=asset.id,
        inspector_id=user.id,
        status="pending_review",
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(inspection)

    image = InspectionImage(
        id="img_sound_1",
        organization_id=org.id,
        inspection_id=inspection.id,
        uploader_id=user.id,
        filename="sound_concrete_01.jpg",
        original_path="dummy_sound_path.jpg",
        status="valid",
        quality_status="accepted",
        width=1920,
        height=1080,
        file_size=204800,
        sha256="testsha256sound1",
        phash="1010101010101010",
        quality_report={"resnet18_classification": {"predicted_class": "Uncracked", "confidence": 0.96}}
    )
    db.add(image)
    db.commit()

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role, "org_id": org.id})
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    # 1. Confirm Sound Surface
    res = client.post(
        f"/api/v1/inspections/{inspection.id}/images/{image.id}/confirm-sound",
        headers=headers
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "confirmed"
    assert data["verifiedBy"] == "Elena Ramos, PE"
    assert data["soundSurfaceVerified"]["verified"] is True

    # Check database detection created
    clean_det = db.query(Detection).filter(
        Detection.image_id == image.id,
        Detection.defect_type == "sound_concrete"
    ).first()
    assert clean_det is not None
    assert clean_det.severity == "no_visible_damage"

    # 2. Sign Off Inspection
    signoff_res = client.post(
        f"/api/v1/inspections/{inspection.id}/sign-off",
        json={
            "description": "Certified sound condition across survey frames.",
            "severity": "no_visible_damage",
            "auto_verify_all": True
        },
        headers=headers
    )
    assert signoff_res.status_code == 200, signoff_res.text
    signoff_data = signoff_res.json()
    assert signoff_data["status"] == "reviewed"
    assert signoff_data["reviewedBy"] == user.id

    # 3. Verify get_inspection includes reviewer details and lock status
    insp_get = client.get(f"/api/v1/inspections/{inspection.id}", headers=headers)
    assert insp_get.status_code == 200
    insp_data = insp_get.json()
    assert insp_data["status"] in ("reviewed", "reported")
    assert insp_data["isSignedOff"] is True
    assert insp_data["reviewedByName"] == "Elena Ramos, PE"

    # 4. Try unconfirming on a reviewed (locked) inspection -> must fail with 423 Locked!
    unconfirm_res = client.delete(
        f"/api/v1/inspections/{inspection.id}/images/{image.id}/confirm-sound",
        headers=headers
    )
    assert unconfirm_res.status_code == 423

    # 5. Sign off a second time -> must fail with 423 Locked (can only sign off once!)
    second_signoff = client.post(
        f"/api/v1/inspections/{inspection.id}/sign-off",
        json={"auto_verify_all": True},
        headers=headers
    )
    assert second_signoff.status_code == 423, second_signoff.text
    assert "ALREADY_SIGNED_OFF" in second_signoff.text

    # 6. Attempt submit-for-review on reviewed inspection -> must fail with 400 ALREADY_REVIEWED
    resubmit_res = client.post(
        f"/api/v1/inspections/{inspection.id}/submit-for-review",
        json={},
        headers=headers
    )
    assert resubmit_res.status_code == 400
    assert "ALREADY_REVIEWED" in resubmit_res.text

    # 7. Attempt claim on reviewed inspection -> must fail with 400 ALREADY_REVIEWED
    reclaim_res = client.post(
        f"/api/v1/inspections/{inspection.id}/claim",
        headers=headers
    )
    assert reclaim_res.status_code == 400
    assert "ALREADY_REVIEWED" in reclaim_res.text

    # 8. Verify notifications contain Indian Standard Time (IST)
    notifs = db.query(Notification).filter(Notification.organization_id == user.organization_id).all()
    assert len(notifs) > 0
    assert any("IST" in (n.message or "") for n in notifs)

    db.close()
