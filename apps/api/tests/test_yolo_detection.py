import os
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.yolo_detector import get_yolo_detector
from app.services.classifier import get_classifier
from app.services.image_quality import preprocess_image

client = TestClient(app)

def test_yolo_detector_loads():
    detector = get_yolo_detector()
    assert detector is not None
    assert detector.is_loaded is True
    assert detector.model is not None


def test_yolo_detect_on_synthetic_or_real():
    detector = get_yolo_detector()

    # Create synthetic test surface with dark crack line
    img = Image.new("RGB", (600, 600), color=(180, 175, 170))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    # Draw crack-like jagged line
    draw.line([(50, 50), (120, 180), (280, 310), (450, 480)], fill=(20, 15, 10), width=6)

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    proc_bytes, _, _ = preprocess_image(buf.getvalue(), "test_sample.jpg", "image/jpeg")

    out_ann = os.path.join(os.getcwd(), "storage", "yolo", "test_synthetic_ann.jpg")
    out_thumb = os.path.join(os.getcwd(), "storage", "thumbnails", "test_synthetic_thumb.jpg")

    res = detector.detect(
        image_input=proc_bytes,
        conf=0.05,
        save_annotated_path=out_ann,
        save_thumbnail_path=out_thumb,
        resnet_confidence=0.92
    )

    assert res["success"] is True
    assert "detections" in res
    assert os.path.exists(out_ann)
    assert os.path.exists(out_thumb)

    # Clean up test artifacts
    if os.path.exists(out_ann):
        os.remove(out_ann)
    if os.path.exists(out_thumb):
        os.remove(out_thumb)
