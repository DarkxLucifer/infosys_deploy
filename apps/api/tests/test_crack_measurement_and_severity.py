"""
InfraScan Crack Measurement & Damage Severity Assessment Unit Tests
===================================================================
Tests compliance with ASTM/AASHTO crack-width severity classification boundaries:
- Below 1 mm: Hairline
- 1 mm to below 3 mm: Minor
- 3 mm to 5 mm: Moderate
- Above 5 mm: Severe

Also tests optical calibration calculation, pixel-to-millimetre conversion,
missing calibration handling, empty segmentation masks, and controlling metric selection.
"""

import pytest
import math
import numpy as np
import cv2

from app.services.crack_geometry import (
    classify_crack_severity,
    extract_crack_geometry,
    compute_crack_widths,
    compute_skeleton_centerline,
)


def test_optical_calibration_formula():
    """Formula: mm_per_pixel = known_length_mm / reference_length_pixels"""
    known_length_mm = 100.0
    reference_length_pixels = 400.0
    mm_per_pixel = known_length_mm / reference_length_pixels
    assert mm_per_pixel == 0.25

    # Euclidean distance from two endpoints
    p1 = [100.0, 150.0]
    p2 = [420.0, 390.0]
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    pixel_dist = math.sqrt(dx * dx + dy * dy)  # sqrt(320^2 + 240^2) = sqrt(102400 + 57600) = sqrt(160000) = 400.0
    assert pixel_dist == 400.0

    calculated_scale = known_length_mm / pixel_dist
    assert calculated_scale == 0.25


def test_crack_width_severity_boundaries():
    """
    Exact boundaries from FEATURES_AND_IMPLEMENTATION.md:
    - Below 1 mm: Hairline (< 1.0 mm)
    - 1 mm to below 3 mm: Minor (1.0 mm <= width < 3.0 mm)
    - 3 mm to 5 mm: Moderate (3.0 mm <= width <= 5.0 mm)
    - Above 5 mm: Severe (> 5.0 mm)
    """
    # Hairline cases (< 1.0 mm)
    res_05 = classify_crack_severity(0.5, metric="maximum")
    assert res_05["category"] == "Hairline"
    assert res_05["category_code"] == "hairline"

    res_099 = classify_crack_severity(0.99, metric="maximum")
    assert res_099["category"] == "Hairline"

    # Minor boundary: exactly 1.0 mm to below 3.0 mm
    res_10 = classify_crack_severity(1.0, metric="maximum")
    assert res_10["category"] == "Minor"
    assert res_10["category_code"] == "minor"

    res_25 = classify_crack_severity(2.5, metric="maximum")
    assert res_25["category"] == "Minor"

    res_299 = classify_crack_severity(2.99, metric="maximum")
    assert res_299["category"] == "Minor"

    # Moderate boundary: 3.0 mm to 5.0 mm (inclusive)
    res_30 = classify_crack_severity(3.0, metric="maximum")
    assert res_30["category"] == "Moderate"
    assert res_30["category_code"] == "moderate"

    res_42 = classify_crack_severity(4.2, metric="maximum")
    assert res_42["category"] == "Moderate"

    res_50 = classify_crack_severity(5.0, metric="maximum")
    assert res_50["category"] == "Moderate"

    # Severe boundary: above 5.0 mm
    res_501 = classify_crack_severity(5.01, metric="maximum")
    assert res_501["category"] == "Severe"
    assert res_501["category_code"] == "severe"

    res_120 = classify_crack_severity(12.0, metric="maximum")
    assert res_120["category"] == "Severe"


def test_uncalibrated_never_assigned_millimetre_classification():
    """Uncalibrated images (mm_per_pixel is None or 0) must NEVER be assigned mm severity."""
    res_uncal = classify_crack_severity(None, metric="maximum", has_cracks=True)
    assert res_uncal["category"] == "Uncalibrated"
    assert res_uncal["category_code"] == "uncalibrated"
    assert res_uncal["is_calibrated"] is False
    assert res_uncal["controlling_width_mm"] is None
    assert "Uncalibrated" in res_uncal["warning"]


def test_empty_segmentation_mask_handling():
    """Empty mask (sound surface with 0 crack pixels) returns category 'None' without division by zero."""
    res_empty = classify_crack_severity(0.0, metric="maximum", has_cracks=False)
    assert res_empty["category"] == "None"
    assert res_empty["category_code"] == "none"
    assert res_empty["controlling_width_mm"] == 0.0

    # Geometry extraction on an empty mask (synthetic 200x200 black image & mask)
    img = np.full((200, 200, 3), 128, dtype=np.uint8)
    mask = np.zeros((200, 200), dtype=np.uint8)

    geo = extract_crack_geometry(
        original_image=img,
        binary_mask=mask,
        mm_per_pixel=0.25,
        generate_visualization=False
    )
    assert geo["success"] is True
    summary = geo["summary"]
    assert summary["crack_count"] == 0
    assert summary["total_crack_area_px"] == 0
    assert summary["crack_coverage_pct"] == 0.0
    assert summary["severity_assessment"]["category"] == "None"
    assert summary["severity_assessment"]["category_code"] == "none"


def test_pixel_to_millimetre_conversion_in_geometry_extraction():
    """Validates geometry extraction with known synthetic crack under calibrated optical scale."""
    img = np.full((300, 300, 3), 120, dtype=np.uint8)
    mask = np.zeros((300, 300), dtype=np.uint8)
    # Draw a 100-pixel vertical crack with width ~10 pixels
    cv2.line(mask, (150, 100), (150, 200), 255, thickness=10)

    # 1. Calibrated execution: 0.25 mm/pixel
    geo_cal = extract_crack_geometry(
        original_image=img,
        binary_mask=mask,
        mm_per_pixel=0.25,
        width_metric="maximum",
        generate_visualization=False
    )
    assert geo_cal["success"] is True
    summary_cal = geo_cal["summary"]
    assert summary_cal["is_calibrated"] is True
    assert summary_cal["mm_per_pixel"] == 0.25
    assert summary_cal["unit"] == "mm"

    # Pixel measurements exist
    assert summary_cal["total_crack_length_px"] > 0
    assert summary_cal["maximum_crack_width_px"] > 0
    assert summary_cal["total_crack_area_px"] > 0

    # Millimetre measurements are exactly converted
    expected_len_mm = round(summary_cal["total_crack_length_px"] * 0.25, 2)
    assert summary_cal["total_crack_length_mm"] == expected_len_mm

    expected_max_w_mm = round(summary_cal["maximum_crack_width_px"] * 0.25, 2)
    assert summary_cal["maximum_crack_width_mm"] == expected_max_w_mm

    expected_area_mm2 = round(summary_cal["total_crack_area_px"] * (0.25 ** 2), 2)
    assert summary_cal["total_crack_area_mm2"] == expected_area_mm2

    # Severity classification is populated
    sev = summary_cal["severity_assessment"]
    assert sev["is_calibrated"] is True
    assert sev["category"] in ["Hairline", "Minor", "Moderate", "Severe"]
    assert sev["requires_engineer_review"] is True

    # 2. Uncalibrated execution (same mask, mm_per_pixel=None)
    geo_uncal = extract_crack_geometry(
        original_image=img,
        binary_mask=mask,
        mm_per_pixel=None,
        generate_visualization=False
    )
    summary_uncal = geo_uncal["summary"]
    assert summary_uncal["is_calibrated"] is False
    assert summary_uncal["unit"] == "px"
    assert summary_uncal["total_crack_length_mm"] is None
    assert summary_uncal["maximum_crack_width_mm"] is None
    assert summary_uncal["total_crack_area_mm2"] is None
    assert summary_uncal["severity_assessment"]["category"] == "Uncalibrated"


def test_controlling_metric_configurable_selection():
    """Verify that the controlling width metric ('maximum' vs 'average') can be configured and tracked."""
    img = np.full((300, 300, 3), 120, dtype=np.uint8)
    mask = np.zeros((300, 300), dtype=np.uint8)
    # Tapered crack: narrow at top (thickness 2), wide at bottom (thickness 20)
    for y in range(50, 250):
        t = int(2 + (y - 50) * (18 / 200))
        cv2.line(mask, (150 - t // 2, y), (150 + t // 2, y), 255, 1)

    scale = 0.20  # 0.20 mm/px -> max thickness ~20px * 0.2 = ~4mm (Moderate)
    geo_max = extract_crack_geometry(
        original_image=img,
        binary_mask=mask,
        mm_per_pixel=scale,
        width_metric="maximum",
        generate_visualization=False
    )
    geo_avg = extract_crack_geometry(
        original_image=img,
        binary_mask=mask,
        mm_per_pixel=scale,
        width_metric="average",
        generate_visualization=False
    )

    sum_max = geo_max["summary"]
    sum_avg = geo_avg["summary"]

    assert sum_max["width_metric_controlling"] == "maximum"
    assert sum_avg["width_metric_controlling"] == "average"

    # Both metrics are exposed for engineering inspection
    assert sum_max["severity_assessment"]["category_by_max_width"] is not None
    assert sum_max["severity_assessment"]["category_by_avg_width"] is not None


def test_optical_calibration_api_lifecycle():
    """Tests the full API calibration lifecycle: calibrate -> verify mm metrics & severity -> reset."""
    from fastapi.testclient import TestClient
    from datetime import datetime, timezone, timedelta
    from app.main import app
    from app.database import SessionLocal
    from app.models.all_models import User, Organization, Asset, Inspection, InspectionImage, Detection, Measurement
    from app.security.jwt import create_access_token
    import os

    client = TestClient(app)
    db = SessionLocal()

    org = db.query(Organization).first()
    if not org:
        org = Organization(id="org-cal-test", name="Cal Org", slug="cal-org")
        db.add(org)
        db.commit()

    engineer = db.query(User).filter(User.role == "engineer", User.organization_id == org.id).first()
    if not engineer:
        engineer = User(
            id="eng-cal-test",
            organization_id=org.id,
            email="eng_cal@test.com",
            hashed_password="hash",
            role="engineer",
            full_name="Engineer Cal Test",
            status="active"
        )
        db.add(engineer)
        db.commit()

    token = create_access_token(
        data={"sub": engineer.id, "email": engineer.email, "role": engineer.role, "org": engineer.organization_id},
        expires_delta=timedelta(hours=2)
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Create temporary inspection & image
    now = datetime.now(timezone.utc)
    insp = Inspection(
        id=f"insp-cal-{int(now.timestamp())}",
        organization_id=org.id,
        asset_id="ASSET-CAL",
        inspector_id=engineer.id,
        inspection_date=now,
        due_date=now + timedelta(days=7),
        status="in_progress"
    )
    db.add(insp)
    db.commit()

    # Create a synthetic image on disk
    os.makedirs("storage/uploads", exist_ok=True)
    os.makedirs("storage/unet", exist_ok=True)
    dummy_img_path = os.path.join(os.getcwd(), "storage", "uploads", f"test_cal_{insp.id}.jpg")
    cv2.imwrite(dummy_img_path, np.full((300, 300, 3), 150, dtype=np.uint8))

    # Create a synthetic UNet crack mask on disk (crack width ~8px -> 8 * 0.25 = 2.0 mm -> Minor)
    dummy_mask_path = os.path.join(os.getcwd(), "storage", "unet", f"img-cal-{insp.id}_mask.png")
    mask = np.zeros((300, 300), dtype=np.uint8)
    cv2.line(mask, (150, 50), (150, 250), 255, thickness=8)
    cv2.imwrite(dummy_mask_path, mask)

    image = InspectionImage(
        id=f"img-cal-{insp.id}",
        organization_id=org.id,
        inspection_id=insp.id,
        uploader_id=engineer.id,
        filename="test_crack.jpg",
        original_path=dummy_img_path,
        sha256="dummy_sha256_cal",
        phash="0000000000000000",
        width=300,
        height=300,
        file_size=1024,
        status="valid",
        quality_status="accepted",
        processing_status="complete",
        quality_report={"overall": "accepted", "checks": []}
    )
    db.add(image)
    db.commit()

    try:
        # Step 1: Calibrate via manual reference line (e.g. 100mm = 400px -> 0.25 mm/px)
        cal_payload = {
            "method": "manual_line",
            "reference_line_length_mm": 100.0,
            "pixel_length": 400.0,
            "reference_p1": [50.0, 50.0],
            "reference_p2": [450.0, 50.0],
            "width_metric": "maximum"
        }
        res_cal = client.post(f"/api/v1/inspections/{insp.id}/images/{image.id}/calibrate", json=cal_payload, headers=headers)
        assert res_cal.status_code == 200, res_cal.text
        cal_data = res_cal.json()
        assert cal_data["status"] == "calibrated"
        assert cal_data["calibration"]["mm_per_pixel"] == 0.25
        assert cal_data["calibration"]["calibrated"] is True

        # Verify geometry and severity were returned
        assert "crack_geometry" in cal_data
        geo = cal_data["crack_geometry"]
        assert geo["summary"]["is_calibrated"] is True
        assert geo["summary"]["mm_per_pixel"] == 0.25
        assert geo["summary"]["maximum_crack_width_mm"] is not None
        assert geo["summary"]["total_crack_length_mm"] is not None

        # Verify crack severity assessment is populated
        sev = geo["summary"]["severity_assessment"]
        assert sev["category"] in ["Hairline", "Minor", "Moderate", "Severe"]
        assert sev["is_calibrated"] is True

        # Step 2: Query GET /images/{image_id}/geometry
        res_get_geo = client.get(f"/api/v1/images/{image.id}/geometry", headers=headers)
        assert res_get_geo.status_code == 200
        get_geo_data = res_get_geo.json()
        assert get_geo_data["summary"]["is_calibrated"] is True
        assert get_geo_data["summary"]["maximum_crack_width_mm"] is not None

        # Step 3: Direct scale apply & convert via POST /images/{image_id}/geometry
        res_post_geo = client.post(
            f"/api/v1/images/{image.id}/geometry",
            json={"force_recompute": True, "mm_per_pixel": 0.5, "width_metric": "average"},
            headers=headers
        )
        assert res_post_geo.status_code == 200, res_post_geo.text
        post_geo_data = res_post_geo.json()
        assert post_geo_data["summary"]["is_calibrated"] is True
        assert post_geo_data["summary"]["mm_per_pixel"] == 0.5
        assert post_geo_data["summary"]["controlling_metric"] == "average"

        # Verify scale persisted in database image row
        db.refresh(image)
        assert image.calibration is not None
        assert image.calibration["mm_per_pixel"] == 0.5
        assert image.calibration["width_metric"] == "average"

        # Step 4: Reset calibration via DELETE
        res_del = client.delete(f"/api/v1/images/{image.id}/calibration", headers=headers)
        assert res_del.status_code == 200
        del_data = res_del.json()
        assert del_data["status"] == "uncalibrated"
        assert del_data["calibration"] is None
        assert del_data["crack_geometry"]["summary"]["is_calibrated"] is False
        assert del_data["crack_geometry"]["summary"]["maximum_crack_width_mm"] is None
        assert del_data["crack_geometry"]["summary"]["severity_assessment"]["category"] == "Uncalibrated"

        # Step 5: Post empty payload should succeed
        res_empty = client.post(
            f"/api/v1/images/{image.id}/geometry",
            json={},
            headers=headers
        )
        assert res_empty.status_code == 200

    finally:
        # Cleanup test files
        for p in [dummy_img_path, dummy_mask_path]:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
        db.close()
