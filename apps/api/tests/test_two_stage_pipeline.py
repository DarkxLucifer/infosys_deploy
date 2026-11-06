import os
import io
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db, SessionLocal
from app.models.all_models import User, Organization, Asset, Inspection, InspectionImage, Detection
from app.security.jwt import create_access_token

client = TestClient(app)

def test_two_stage_resnet18_and_yolo_pipeline():
    db = SessionLocal()
    org = db.query(Organization).first()
    if not org:
        org = Organization(id="org-test-yolo", name="Test Org", slug="test-org")
        db.add(org)
        db.commit()

    inspector = db.query(User).filter(User.role == "inspector", User.organization_id == org.id).first()
    if not inspector:
        inspector = User(
            id="insp-yolo-test",
            organization_id=org.id,
            email="insp_yolo@test.com",
            hashed_password="hash",
            role="inspector",
            full_name="Inspector YOLO Test",
            status="active"
        )
        db.add(inspector)
        db.commit()

    asset = db.query(Asset).filter(Asset.organization_id == org.id).first()
    if not asset:
        asset = Asset(
            id="ASSET-YOLO",
            organization_id=org.id,
            name="Test Bridge YOLO",
            asset_type="bridge",
            address="Highway 1",
            latitude=18.52,
            longitude=73.85,
            construction_year=2010,
            material="Reinforced concrete",
            department="Roads",
            importance="High",
            inspection_frequency="Annual"
        )
        db.add(asset)
        db.commit()

    import uuid
    insp_id = f"insp-yolo-{uuid.uuid4().hex[:8]}"
    insp = Inspection(
        id=insp_id,
        organization_id=org.id,
        asset_id=asset.id,
        inspector_id=inspector.id,
        inspection_date=datetime.now(timezone.utc),
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
        status="in_progress"
    )
    db.add(insp)
    db.commit()

    token = create_access_token({"sub": inspector.id, "email": inspector.email, "role": inspector.role, "org_id": org.id})
    headers = {"Authorization": f"Bearer {token}"}

    crack_path = r"C:\Users\yashr\Downloads\crcack\crack.jpg"
    if os.path.exists(crack_path):
        with open(crack_path, "rb") as fp:
            file_bytes = fp.read()
    else:
        from PIL import Image, ImageDraw
        im = Image.new("RGB", (600, 600), color=(170, 165, 160))
        d = ImageDraw.Draw(im)
        d.line([(50, 50), (200, 220), (350, 360), (520, 500)], fill=(15, 10, 5), width=7)
        b = io.BytesIO()
        im.save(b, format="JPEG")
        file_bytes = b.getvalue()

    # Step 1: Upload image
    res = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": (f"crack_upload_{uuid.uuid4().hex[:6]}.jpg", file_bytes, "image/jpeg")},
        headers=headers
    )
    assert res.status_code in (200, 201), f"Upload failed: {res.text}"
    data = res.json()
    image_id = data["id"]

    # Verify response structure
    assert "previewUrl" in data
    assert "originalUrl" in data
    assert "aiClassification" in data
    ai_clf = data["aiClassification"]
    assert ai_clf is not None

    print(f"\nClassification result: class={ai_clf.get('predicted_class')}, crack_prob={ai_clf.get('crack_probability')}")

    # If classified as crack (as crack.jpg is):
    if ai_clf.get("has_crack") or ai_clf.get("crack_probability", 0) >= 0.80:
        has_stage2 = bool(data.get("hasRfdetr") or data.get("hasUnet") or data.get("hasYolo"))
        assert has_stage2 is True, f"Expected Stage 2 model (RF-DETR, UNet, or YOLO) to run: {data}"

        # Test variant delivery: 'processed' should return the defect detection/segmentation image
        res_proc = client.get(f"/api/v1/images/{image_id}/file?variant=processed", headers=headers)
        assert res_proc.status_code == 200
        assert res_proc.headers["content-type"] in ("image/jpeg", "image/png")

        # Test variant 'unet' or 'rfdetr'
        if data.get("hasUnet"):
            res_unet = client.get(f"/api/v1/images/{image_id}/file?variant=unet", headers=headers)
            assert res_unet.status_code == 200
        if data.get("hasRfdetr"):
            res_rfdetr = client.get(f"/api/v1/images/{image_id}/file?variant=rfdetr", headers=headers)
            assert res_rfdetr.status_code == 200

        # Test variant 'original'
        res_orig = client.get(f"/api/v1/images/{image_id}/file?variant=original", headers=headers)
        assert res_orig.status_code == 200

    db.close()
