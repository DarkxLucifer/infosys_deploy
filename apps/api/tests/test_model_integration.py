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
    Detection, Measurement
)
from app.security.jwt import create_access_token
from app.services.classifier import get_classifier, ResNet50CrackClassifier

# Dedicated SQLite test database
TEST_DB_URL = "sqlite:///./test_model_integration.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    ensure_schema_upgrades(test_engine)

    db = TestingSessionLocal()
    org = Organization(id="org-infrascan", name="Civil Infrastructure Authority")
    db.add(org)
    db.commit()
    db.close()

    yield

    app.dependency_overrides.pop(get_db, None)
    try:
        if os.path.exists("./test_model_integration.db"):
            os.remove("./test_model_integration.db")
    except Exception:
        pass

def create_user(db, email: str, role: str, org_id="org-infrascan"):
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
    token = create_access_token({
        "sub": u.id,
        "email": u.email,
        "role": u.role,
        "org_id": u.organization_id
    })
    u._auth_headers = {"Authorization": f"Bearer {token}"}
    return u

def get_auth_headers(user: User):
    if hasattr(user, "_auth_headers"):
        return user._auth_headers
    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "org_id": user.organization_id
    })
    return {"Authorization": f"Bearer {token}"}

def create_test_asset(db, asset_id: str, name: str, asset_type: str = "bridge", org_id="org-infrascan"):
    asset = Asset(
        id=asset_id,
        organization_id=org_id,
        name=name,
        asset_type=asset_type,
        address="100 Highway Infrastructure Road",
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
    db.refresh(asset)
    return asset

def create_test_inspection(db, asset_id: str, inspector_id: str, status: str = "in_progress", notes: str = "Survey inspection", org_id="org-infrascan"):
    now = datetime.now(timezone.utc)
    insp = Inspection(
        organization_id=org_id,
        asset_id=asset_id,
        inspector_id=inspector_id,
        inspection_date=now,
        due_date=now + timedelta(days=7),
        status=status,
        notes=notes
    )
    db.add(insp)
    db.commit()
    db.refresh(insp)
    return insp

def create_test_image_bytes(width=640, height=480, color=(128, 128, 128)):
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def create_textured_image_bytes(width=640, height=480):
    import numpy as np
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    for i in range(0, height, 16):
        arr[i:i+8, :, :] = 190
    for j in range(0, width, 16):
        arr[:, j:j+8, :] = 130
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

client = TestClient(app)

# ---------------------------------------------------------------------------
# 1. Direct Model Classifier Unit & Fallback Tests
# ---------------------------------------------------------------------------

def test_resnet50_classifier_direct_inference():
    clf = get_classifier()
    assert clf.is_loaded, f"Model failed to load. Error: {clf.load_error}"
    assert "InfraScan" in clf.model_name
    assert "1.0" in clf.version
    assert clf.labels == ["Uncracked", "Cracked"]
    assert abs(clf.decision_threshold - 0.80) < 1e-4

    test_bytes = create_textured_image_bytes(width=300, height=300)
    result = clf.predict(test_bytes)

    assert result is not None
    assert result["success"] is True
    assert "has_crack" in result
    assert result["predicted_class"] in ["Cracked", "Uncracked"]
    assert "crack_probability" in result
    assert "uncracked_probability" in result
    prob_sum = result["crack_probability"] + result["uncracked_probability"]
    assert abs(prob_sum - 1.0) < 1e-2
    assert result["threshold"] == round(clf.decision_threshold, 6)
    assert result["model_name"] == clf.model_name

def test_classifier_graceful_missing_model_fallback():
    missing_clf = ResNet50CrackClassifier(model_dir="C:/non_existent_model_directory_12345")
    assert not missing_clf.is_loaded
    assert missing_clf.load_error is not None

    test_bytes = create_test_image_bytes()
    pred = missing_clf.predict(test_bytes)
    assert pred is not None
    assert pred["success"] is False
    assert pred["status"] == "model_not_loaded"

# ---------------------------------------------------------------------------
# 2. Model Health & Metadata API Endpoint
# ---------------------------------------------------------------------------

def test_active_model_api_endpoint():
    db = TestingSessionLocal()
    inspector = create_user(db, "model_inspector@infra.gov", "inspector")
    db.close()

    res = client.get("/api/v1/models/active", headers=get_auth_headers(inspector))
    assert res.status_code == 200
    data = res.json()

    assert "InfraScan" in data["model_name"]
    assert "1.0" in data["model_version"]
    assert data["is_loaded"] is True
    assert "binary_crack_classification" in data["supported_tasks"]
    assert data["decision_threshold"] > 0

# ---------------------------------------------------------------------------
# 3. Photo Upload, Quality Checks & Corrupted File Handling
# ---------------------------------------------------------------------------

def test_photo_upload_and_quality_inspection():
    db = TestingSessionLocal()
    inspector = create_user(db, "upload_insp@infra.gov", "inspector")
    asset = create_test_asset(db, "INF-BRIDGE-701", "Columbia River Overpass Pier 4", "bridge")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Pier 4 East Face Survey")
    insp_id = insp.id
    db.close()

    # 1. Upload valid photograph
    valid_bytes = create_textured_image_bytes(800, 600)
    res_valid = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": ("pier4_face_01.jpg", valid_bytes, "image/jpeg")},
        data={"source": "Digital camera", "allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    assert res_valid.status_code == 201
    valid_img = res_valid.json()
    assert valid_img["id"] is not None
    qr = valid_img.get("qualityReport") or valid_img.get("quality_report")
    assert qr is not None
    assert any(c["key"] == "blur" for c in qr["checks"])
    assert "blur_variance" in qr.get("metrics", {})

    # 2. Upload corrupted image file - verify it fails cleanly without taking down the pipeline
    corrupted_bytes = b"NOT_A_VALID_JPEG_HEADER_CORRUPTED_BYTES"
    res_corrupt = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": ("broken_photo.jpg", corrupted_bytes, "image/jpeg")},
        data={"source": "Digital camera"},
        headers=get_auth_headers(inspector)
    )
    assert res_corrupt.status_code in (400, 422)

# ---------------------------------------------------------------------------
# 4. Single-Photo AI Analysis & DB Persistence
# ---------------------------------------------------------------------------

def test_single_photo_ai_analysis():
    db = TestingSessionLocal()
    inspector = create_user(db, "single_ai@infra.gov", "inspector")
    asset = create_test_asset(db, "INF-ROAD-102", "State Route 12 Culvert", "road")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Culvert Inspection")
    insp_id = insp.id

    valid_bytes = create_textured_image_bytes(640, 480)
    res_up = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": ("culvert_wall.jpg", valid_bytes, "image/jpeg")},
        data={"source": "smartphone", "allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    img_id = res_up.json()["id"]
    db.close()

    # Trigger single-image AI analysis
    res_ai = client.post(
        f"/api/v1/inspections/{insp_id}/images/{img_id}/analyze",
        headers=get_auth_headers(inspector)
    )
    assert res_ai.status_code == 200
    ai_data = res_ai.json()
    pred = ai_data.get("prediction") or ai_data
    assert pred["has_crack"] in [True, False]
    assert "InfraScan" in pred["model_name"]
    assert "crack_probability" in pred

    # Check persistence in database Detection table
    db = TestingSessionLocal()
    detections = db.query(Detection).filter(Detection.image_id == img_id).all()
    assert len(detections) >= 1
    det = detections[0]
    assert det.source == "ai_model"
    assert "InfraScan" in det.model_id
    assert det.confidence is not None
    db.close()

# ---------------------------------------------------------------------------
# 5. Per-Photo Manual Review, Classification Override & Notes
# ---------------------------------------------------------------------------

def test_per_photo_manual_review_override():
    db = TestingSessionLocal()
    inspector = create_user(db, "override_insp@infra.gov", "inspector")
    asset = create_test_asset(db, "INF-TUNNEL-5", "Metro Tunnel 5", "tunnel")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Tunnel Survey")

    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("lining_joint.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    img_id = res_up.json()["id"]
    db.close()

    # Inspector manual review override
    res_rev = client.post(
        f"/api/v1/inspections/{insp.id}/images/{img_id}/review",
        json={
            "decision": "manual_review",
            "manual_classification": "no_crack",
            "override_reason": "Expansion joint sealant discoloration only, no structural cracking.",
            "notes": "Verified at close range with torch."
        },
        headers=get_auth_headers(inspector)
    )
    assert res_rev.status_code == 200
    review_resp = res_rev.json()
    manual_data = review_resp.get("manualReview") or review_resp.get("manual_review") or {}
    assert manual_data.get("manual_classification") == "no_crack"
    assert manual_data.get("override_reason") == "Expansion joint sealant discoloration only, no structural cracking."
    assert "inspector" in (manual_data.get("reviewer_name") or "").lower() or len(manual_data.get("reviewer_name", "")) > 0

# ---------------------------------------------------------------------------
# 6. Manual Defect Bounding Box Annotation (Strictly Separate from AI)
# ---------------------------------------------------------------------------

def test_manual_bounding_box_annotation():
    db = TestingSessionLocal()
    inspector = create_user(db, "annotator@infra.gov", "inspector")
    asset = create_test_asset(db, "INF-PIER-99", "Pier 99", "bridge")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Pier 99 Survey")

    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("pier99.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    img_id = res_up.json()["id"]
    db.close()

    # Save manual annotation
    res_ann = client.post(
        f"/api/v1/inspections/{insp.id}/images/{img_id}/annotations",
        json={
            "defect_type": "longitudinal_crack",
            "severity": "severe",
            "bbox": {
                "x": 120.0,
                "y": 80.0,
                "w": 250.0,
                "h": 140.0
            },
            "notes": "Spalling observed around hairline crack"
        },
        headers=get_auth_headers(inspector)
    )
    assert res_ann.status_code in (200, 201)
    ann = res_ann.json()
    assert ann["source"] == "inspector_manual"
    assert ann["defect_type"] == "longitudinal_crack"
    assert ann["severity"] == "severe"

    # Confirm in database that confidence is None (NOT fabricated AI confidence)
    db = TestingSessionLocal()
    db_ann = db.query(Detection).filter(Detection.id == ann["id"]).first()
    assert db_ann.source == "inspector_manual"
    assert db_ann.confidence is None
    db.close()

# ---------------------------------------------------------------------------
# 7. Photo Replacement Workflow (Clears Old Detections)
# ---------------------------------------------------------------------------

def test_photo_replacement_clears_stale_detections():
    db = TestingSessionLocal()
    inspector = create_user(db, "replacer@infra.gov", "inspector")
    asset = create_test_asset(db, "INF-DECK-1", "Deck 1", "bridge")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Deck Survey")

    res_up = client.post(
        f"/api/v1/inspections/{insp.id}/images",
        files={"file": ("deck_blurry.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    img_id = res_up.json()["id"]

    # Trigger AI analysis on old image
    client.post(f"/api/v1/inspections/{insp.id}/images/{img_id}/analyze", headers=get_auth_headers(inspector))
    old_dets = db.query(Detection).filter(Detection.image_id == img_id).all()
    assert len(old_dets) >= 1
    db.close()

    # Replace with sharp image
    sharp_bytes = create_textured_image_bytes(1024, 768)
    res_replace = client.post(
        f"/api/v1/inspections/{insp.id}/images/{img_id}/replace",
        files={"file": ("deck_sharp.jpg", sharp_bytes, "image/jpeg")},
        data={"allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    assert res_replace.status_code == 200

    # Verify old detections were purged to prevent attaching stale results to replacement image
    db = TestingSessionLocal()
    fresh_dets = db.query(Detection).filter(Detection.image_id == img_id).all()
    assert len(fresh_dets) == 0
    db.close()

# ---------------------------------------------------------------------------
# 8. Inspection Submission, Full AI Pipeline, and Review Queue
# ---------------------------------------------------------------------------

def test_submit_inspection_triggers_ai_and_populates_review_queue():
    db = TestingSessionLocal()
    inspector = create_user(db, "pipeline_insp@infra.gov", "inspector")
    engineer = create_user(db, "lead_eng@infra.gov", "civil-engineer")
    asset = create_test_asset(db, "INF-BRIDGE-900", "Highland Viaduct", "bridge")

    insp = create_test_inspection(db, asset.id, inspector.id, status="in_progress", notes="Highland Viaduct Deck")

    # Upload two photographs
    for i in range(2):
        client.post(
            f"/api/v1/inspections/{insp.id}/images",
            files={"file": (f"frame_{i}.jpg", create_textured_image_bytes(500, 500), "image/jpeg")},
            data={"allow_warning": "true"},
            headers=get_auth_headers(inspector)
        )
    db.close()

    # Submit inspection for review
    res_sub = client.post(f"/api/v1/inspections/{insp.id}/submit", headers=get_auth_headers(inspector))
    assert res_sub.status_code == 200
    insp_data = res_sub.json()
    assert insp_data["status"] == "pending_review"
    assert (insp_data.get("analysisStatus") == "completed" or insp_data.get("analysis_status") == "completed")

    # Verify review queue contains the inspection with real model confidence
    res_queue = client.get("/api/v1/review-queue", headers=get_auth_headers(engineer))
    assert res_queue.status_code == 200
    queue_data = res_queue.json()
    matching = [item for item in queue_data["items"] if item["id"] == insp.id]
    assert len(matching) == 1
    assert matching[0]["status"] == "needs_review"

# ---------------------------------------------------------------------------
# 9. Role-Based Permissions & Civil Engineer Sign-off
# ---------------------------------------------------------------------------

def test_role_permissions_and_engineer_sign_off():
    db = TestingSessionLocal()
    inspector = create_user(db, "perm_insp@infra.gov", "inspector")
    engineer = create_user(db, "cert_eng@infra.gov", "civil-engineer")
    asset = create_test_asset(db, "INF-SIGN-1", "Signoff Bridge", "bridge")

    insp = create_test_inspection(
        db,
        asset.id,
        inspector.id,
        status="in_progress",
        notes="Signoff Survey"
    )
    insp_id = insp.id
    db.close()

    # Upload photo so image_id is available for finding
    res_up = client.post(
        f"/api/v1/inspections/{insp_id}/images",
        files={"file": ("signoff_photo.jpg", create_textured_image_bytes(), "image/jpeg")},
        data={"allow_warning": "true"},
        headers=get_auth_headers(inspector)
    )
    img_id = res_up.json()["id"]

    # Add verified finding so engineering verification gate is satisfied
    db_verify = TestingSessionLocal()
    det = Detection(
        inspection_id=insp_id,
        image_id=img_id,
        source="engineer_manual",
        defect_type="no_visible_damage",
        geometry={"type": "no_defect"},
        severity="no_visible_damage",
        created_by=engineer.id,
        verified_by=engineer.id,
        verified_at=datetime.now(timezone.utc),
        notes="Clean inspection confirmed by engineer"
    )
    db_verify.add(det)
    db_verify.commit()
    db_verify.close()

    # 1. Inspector CANNOT sign off (must return 403 Forbidden)
    res_insp_sign = client.post(f"/api/v1/inspections/{insp_id}/sign-off", headers=get_auth_headers(inspector))
    assert res_insp_sign.status_code == 403

    # 2. Civil Engineer CAN sign off
    res_eng_sign = client.post(f"/api/v1/inspections/{insp_id}/sign-off", headers=get_auth_headers(engineer))
    assert res_eng_sign.status_code == 200
    assert res_eng_sign.json()["status"] == "reviewed"
