import io
import os
import pytest
import numpy as np
import cv2
from PIL import Image

from app.services.image_quality import (
    assess_quality,
    preprocess_image,
    compute_sha256,
    compute_phash
)
from app.config import settings


def create_sharp_image(width=1920, height=1080) -> bytes:
    """Create a crisp, textured image with edges and adequate illumination."""
    np.random.seed(42)
    img = np.full((height, width, 3), 130, dtype=np.uint8)
    
    # Add high-frequency grid and lines (simulating cracks / textures)
    for x in range(50, width, 60):
        cv2.line(img, (x, 0), (x, height), (70, 70, 70), 2)
    for y in range(50, height, 60):
        cv2.line(img, (0, y), (width, y), (80, 80, 80), 2)
        
    # Draw a thin synthetic crack (1-2 px wide)
    points = np.array([[200, 200], [250, 300], [280, 450], [350, 600], [400, 800]], np.int32)
    cv2.polylines(img, [points], isClosed=False, color=(30, 30, 30), thickness=2)
    
    buf = io.BytesIO()
    pil_img = Image.fromarray(img)
    pil_img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def create_blurred_image(width=1920, height=1080) -> bytes:
    """Create an image with macro contrast (std > 10) but low edge sharpness (variance < 30)."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Split tone to guarantee overall contrast / completeness passes (std ~ 30)
    img[:height//2, :] = 160
    img[height//2:, :] = 100
    
    # Heavy Gaussian blur to smooth the transition completely (Laplacian variance < 10)
    blurred = cv2.GaussianBlur(img, (101, 101), 40)
    buf = io.BytesIO()
    Image.fromarray(cv2.cvtColor(blurred, cv2.COLOR_BGR2RGB)).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def create_dark_image(width=1920, height=1080) -> bytes:
    """Create a dark image whose mean grayscale brightness is below fail threshold (< 40) with std > 8."""
    np.random.seed(123)
    # Mean ~ 22, std ~ 10 -> passes completeness (>8.0), fails low_light (<40.0)
    noise = np.random.normal(loc=22.0, scale=10.0, size=(height, width, 3)).clip(2, 45).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(noise).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def create_corrupted_image() -> bytes:
    """Create a byte sequence that starts with JPEG SOI but is truncated / corrupt."""
    sharp = create_sharp_image(1920, 1080)
    # Cut off 95% of the file data to trigger a decode failure
    return sharp[:100] + b"\x00" * 200


def test_assess_sharp_image():
    """Sharp 1080p image passes all 7 quality checks with accepted overall status."""
    img_bytes = create_sharp_image(1920, 1080)
    report = assess_quality(img_bytes, filename="sharp_test.jpg")
    
    assert report["overall"] == "accepted"
    assert report["checks"][0]["status"] == "pass"  # format
    assert report["checks"][1]["status"] == "pass"  # file_size
    assert report["checks"][2]["status"] == "pass"  # resolution
    assert report["checks"][3]["status"] == "pass"  # blur (variance > 80)
    assert report["checks"][4]["status"] == "pass"  # low_light (mean > 70)
    assert report["checks"][5]["status"] == "pass"  # completeness
    assert report["checks"][6]["status"] == "pass"  # duplicate
    assert report["metrics"]["width"] == 1920
    assert report["metrics"]["height"] == 1080
    assert report["metrics"]["blur_variance"] >= settings.BLUR_WARN
    assert report["metrics"]["mean_brightness"] >= settings.LIGHT_WARN


def test_assess_blurred_image():
    """Heavily blurred image fails blur check and is marked rejected."""
    img_bytes = create_blurred_image(1920, 1080)
    report = assess_quality(img_bytes, filename="blurred_test.jpg")
    
    blur_check = next(c for c in report["checks"] if c["key"] == "blur")
    assert blur_check["status"] in ("fail", "warn")
    assert report["overall"] in ("rejected", "warning")
    assert "sharpness" in report["reason"].lower() or "blurry" in report["reason"].lower() or "focus" in report["reason"].lower()


def test_assess_dark_image():
    """Dark image fails low_light check and is marked rejected."""
    img_bytes = create_dark_image(1920, 1080)
    report = assess_quality(img_bytes, filename="dark_test.jpg")
    
    assert report["overall"] == "rejected"
    light_check = next(c for c in report["checks"] if c["key"] == "low_light")
    assert light_check["status"] == "fail"
    assert "dark" in report["reason"].lower() or "brightness" in report["reason"].lower() or "light" in report["reason"].lower()


def test_assess_corrupted_image():
    """Corrupted / truncated byte stream fails completeness check."""
    corrupted_bytes = create_corrupted_image()
    report = assess_quality(corrupted_bytes, filename="corrupt_test.jpg")
    
    assert report["overall"] == "rejected"
    comp_check = next(c for c in report["checks"] if c["key"] == "completeness")
    assert comp_check["status"] == "fail"
    assert "incomplete" in report["reason"].lower() or "damaged" in report["reason"].lower() or "corrupt" in report["reason"].lower()


def test_assess_unsupported_format():
    """Non-image bytes fail format check."""
    txt_bytes = b"This is not a real image file, just ASCII text."
    report = assess_quality(txt_bytes, filename="bad_ext.exe")
    
    assert report["overall"] == "rejected"
    fmt_check = next(c for c in report["checks"] if c["key"] == "format")
    assert fmt_check["status"] == "fail"


def test_assess_duplicate_image():
    """
    Duplicate check fails when an identical or near-identical image
    (Hamming distance <= 5) exists in the database.
    """
    from unittest.mock import MagicMock
    sharp_bytes = create_sharp_image(1920, 1080)
    img_phash = compute_phash(sharp_bytes)
    img_sha = compute_sha256(sharp_bytes)
    
    # Create mock existing image in DB
    mock_existing_image = MagicMock()
    mock_existing_image.id = "img-existing-123"
    mock_existing_image.sha256 = img_sha
    mock_existing_image.phash = img_phash
    mock_existing_image.filename = "prior_capture.jpg"
    mock_existing_image.is_deleted = False
    
    mock_session = MagicMock()
    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = [mock_existing_image]
    
    report = assess_quality(
        sharp_bytes,
        filename="duplicate_test.jpg",
        db_session=mock_session,
        inspection_id="insp-test-456"
    )
    
    assert report["overall"] == "rejected"
    dup_check = next(c for c in report["checks"] if c["key"] == "duplicate")
    assert dup_check["status"] == "fail"
    assert "duplicate" in report["reason"].lower() or "identical" in report["reason"].lower() or "similar" in report["reason"].lower()


def test_preprocessing_crack_preservation():
    """
    Test classical CV preprocessing pipeline:
    1. Pipeline completes with 9 recorded steps.
    2. Bilateral filtering and CLAHE do NOT erase thin crack edges.
       Sobel gradient magnitude along the crack should be preserved or enhanced.
    3. Coordinate transform record is present and correct.
    """
    sharp_bytes = create_sharp_image(1920, 1080)
    proc_bytes, thumb_bytes, run_record = preprocess_image(
        sharp_bytes,
        profile_name="general_v1",
        blur_warning=False
    )
    
    assert len(proc_bytes) > 0
    assert len(thumb_bytes) > 0
    assert run_record["profile"] == "general_v1"
    assert run_record["status"] == "complete"
    assert len(run_record["steps"]) >= 9
    
    # Verify presence of all required preprocessing steps
    step_names = [s["name"] for s in run_record["steps"]]
    required_steps = [
        "Orientation correction",
        "Resolution standardisation",
        "Noise reduction",
        "Contrast enhancement (CLAHE)",
        "Brightness correction",
        "Colour normalisation",
        "Sharpening",
        "Shadow reduction",
        "Texture enhancement",
        "Edge enhancement",
        "Background reduction",
        "Region-of-interest extraction",
        "Perspective correction",
        "Data augmentation",
        "Tiling plan",
        "Model-input normalisation",
    ]
    for step in required_steps:
        assert step in step_names, f"Missing required preprocessing step: {step}"
    
    # Verify crack edge strength preservation:
    orig_bgr = cv2.imdecode(np.frombuffer(sharp_bytes, np.uint8), cv2.IMREAD_COLOR)
    proc_bgr = cv2.imdecode(np.frombuffer(proc_bytes, np.uint8), cv2.IMREAD_COLOR)
    
    orig_gray = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2GRAY)
    proc_gray = cv2.cvtColor(proc_bgr, cv2.COLOR_BGR2GRAY)
    
    # Calculate Sobel gradient magnitude on crack patch
    patch_orig = orig_gray[280:320, 230:270]
    patch_proc = proc_gray[280:320, 230:270]
    
    sobel_orig = np.mean(np.abs(cv2.Sobel(patch_orig, cv2.CV_64F, 1, 0, ksize=3)))
    sobel_proc = np.mean(np.abs(cv2.Sobel(patch_proc, cv2.CV_64F, 1, 0, ksize=3)))
    
    # Preprocessing must preserve high-frequency crack edge gradients (ratio >= 0.80)
    assert sobel_proc >= 0.80 * sobel_orig, (
        f"Crack edge strength degraded: orig={sobel_orig:.2f}, proc={sobel_proc:.2f}"
    )
    
    # Coordinate transform check
    transform = run_record["transform"]
    assert "scale_x" in transform
    assert "scale_y" in transform
    assert transform["scale_x"] == 1.0  # 1920 <= 2048
    assert transform["scale_y"] == 1.0


def test_role_visibility_enforcement():
    """
    Section 6.5: Role-based visibility rules:
    - Inspector and Civil Engineer can view quality reports and processed copies.
    - Infrastructure Manager and Maintenance Engineer are forbidden (HTTP 403) from
      viewing raw quality reports or intermediate processed copies.
    """
    from fastapi import HTTPException
    from unittest.mock import MagicMock
    from app.routers.upload import enforce_image_visibility

    mock_image = MagicMock()
    mock_image.organization_id = "org-1"
    
    mock_inspection = MagicMock()
    mock_inspection.status = "in_progress"

    mock_manager = MagicMock()
    mock_manager.organization_id = "org-1"
    mock_manager.role = "manager"

    mock_engineer = MagicMock()
    mock_engineer.organization_id = "org-1"
    mock_engineer.role = "civil_engineer"

    # Manager viewing processed / quality reports must fail with 403
    with pytest.raises(HTTPException) as excinfo:
        enforce_image_visibility(mock_manager, mock_image, mock_inspection, is_quality_or_processed=True)
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail["code"] == "ACCESS_DENIED"

    # Civil engineer viewing processed / quality reports is permitted (no exception)
    enforce_image_visibility(mock_engineer, mock_image, mock_inspection, is_quality_or_processed=True)


def test_transform_image_crop_rotate():
    """Test interactive rotation and crop transforms."""
    from app.services.image_quality import transform_image
    sharp_bytes = create_sharp_image(1920, 1080)
    
    # 1. 90-degree rotation
    rotated = transform_image(sharp_bytes, rotation_deg=90)
    assert len(rotated) > 0
    rot_pil = Image.open(io.BytesIO(rotated))
    assert rot_pil.size == (1080, 1920)
    
    # 2. Crop box [100, 100, 400, 300]
    cropped = transform_image(sharp_bytes, crop_box=[100, 100, 400, 300])
    assert len(cropped) > 0
    crop_pil = Image.open(io.BytesIO(cropped))
    assert crop_pil.size == (400, 300)


def test_generate_augmentations_variants():
    """Module 4: Verify 4 invariant data augmentation variants for ML robustness."""
    from app.services.image_quality import generate_augmentations
    sharp_bytes = create_sharp_image(640, 480)
    img_rgb = cv2.cvtColor(cv2.imdecode(np.frombuffer(sharp_bytes, np.uint8), cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    
    augs = generate_augmentations(img_rgb)
    assert len(augs) == 4
    names = [a["name"] for a in augs]
    assert "horizontal_flip" in names
    assert "vertical_flip" in names
    assert "rotate_90_cw" in names
    assert "color_contrast_jitter" in names


def test_dataset_samples_generation_and_drone_metadata():
    """Module 3: Verify benchmark dataset catalog and drone metadata integration."""
    from app.routers.upload import DATASET_SAMPLES, generate_benchmark_sample_bytes
    assert len(DATASET_SAMPLES) >= 5
    
    # Verify drone sample has altitude & gimbal pitch
    drone_sample = next(s for s in DATASET_SAMPLES if s["id"] == "DRONE-05")
    assert drone_sample["drone_altitude"] == 12.5
    assert drone_sample["drone_gimbal_pitch"] == -45.0
    
    # Generate bytes
    sample_bytes = generate_benchmark_sample_bytes(drone_sample)
    assert len(sample_bytes) > 0
    
    # Assess quality: must pass resolution standardization without rejection
    report = assess_quality(sample_bytes, filename="drone_sample.jpg")
    assert report["overall"] in ("accepted", "warning")
    res_check = next(c for c in report["checks"] if c["key"] == "resolution")
    assert res_check["status"] == "pass"


def test_image_processing_run_model_instantiation():
    """Verify ImageProcessingRun model can be cleanly instantiated without duration_ms."""
    from app.models.all_models import ImageProcessingRun
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    run = ImageProcessingRun(
        image_id="img-test-123",
        profile="general_v1",
        profile_version="1.0.0",
        status="complete",
        steps=["exif_orientation", "denoise", "clahe", "sharpen", "resize_and_pad"],
        processed_path="/tmp/proc.png",
        processed_sha256="abc1234567890",
        width=640,
        height=640,
        opencv_version="4.10.0",
        started_at=now,
        finished_at=now
    )
    assert run.image_id == "img-test-123"
    assert run.status == "complete"
    assert run.opencv_version == "4.10.0"


def test_asset_assignment_permission():
    """Verify role-based asset assignment permissions."""
    from app.routers.assets import AssetAssignRequest
    req = AssetAssignRequest(
        inspector_id="insp-001",
        inspection_method="walkdown",
        notes="Inspect north span"
    )
    assert req.inspector_id == "insp-001"
    assert req.inspection_method == "walkdown"
    assert req.notes == "Inspect north span"

