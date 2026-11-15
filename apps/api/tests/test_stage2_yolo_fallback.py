import os
import tempfile
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from PIL import Image

from app.routers.upload import run_and_persist_ai_classification


def _make_dummy_image_and_record():
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    Image.new("RGB", (64, 64), color=(160, 160, 160)).save(tmp.name, format="JPEG")
    tmp.close()
    img_record = SimpleNamespace(
        id="test-stage2-fallback-img",
        processed_path=tmp.name,
        original_path=tmp.name,
        quality_report={},
        thumbnail_path=tmp.name,
        calibration=None,
        width=64,
        height=64,
        inspection_id=None,
    )
    return img_record, tmp.name


def test_stage2_skips_yolo_when_rfdetr_detects_defect():
    img_record, tmp_path = _make_dummy_image_and_record()
    try:
        mock_classifier = MagicMock()
        mock_classifier.predict.return_value = {
            "success": True,
            "predicted_class": "Cracked",
            "crack_probability": 0.94,
            "threshold": 0.80,
            "has_crack": True,
        }

        mock_rfdetr = MagicMock()
        mock_rfdetr.detect.return_value = {
            "success": True,
            "has_defect": True,
            "num_detections": 1,
            "primary_defect": "longitudinal_crack",
            "primary_label": "Longitudinal Crack",
            "confidence": 0.88,
            "detections": [{"class": "longitudinal_crack", "confidence": 0.88}],
        }

        mock_yolo = MagicMock()
        mock_unet = MagicMock()
        mock_unet.segment.return_value = {"success": True, "has_crack": True, "crack_area_pct": 1.5, "crack_pixels": 60, "max_width_px": 4.0}

        with (
            patch("app.services.classifier.get_classifier", return_value=mock_classifier),
            patch("app.services.rfdetr_detector.get_rfdetr_detector", return_value=mock_rfdetr),
            patch("app.services.yolo_detector.get_yolo_detector", return_value=mock_yolo),
            patch("app.services.unet_segmentor.get_unet_segmentor", return_value=mock_unet),
            patch("app.services.crack_geometry.extract_crack_geometry", return_value={"success": True, "summary": {}}),
        ):
            pred = run_and_persist_ai_classification(
                db=MagicMock(),
                image=img_record,
                target_path=tmp_path,
                user_id="user-1",
                inspection_id=None,
            )

        mock_rfdetr.detect.assert_called_once()
        mock_yolo.detect.assert_not_called()
        assert pred is not None
        assert pred["active_stage2_model"] == "rfdetr"
        assert pred["model_fallback"] is False
        assert pred["yolo_detection"] is None
        assert img_record.quality_report["yolo_detection"] is None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_stage2_runs_yolo_fallback_when_rfdetr_finds_zero_defects():
    img_record, tmp_path = _make_dummy_image_and_record()
    try:
        mock_classifier = MagicMock()
        mock_classifier.predict.return_value = {
            "success": True,
            "predicted_class": "Cracked",
            "crack_probability": 0.91,
            "threshold": 0.80,
            "has_crack": True,
        }

        mock_rfdetr = MagicMock()
        mock_rfdetr.detect.return_value = {
            "success": True,
            "has_defect": False,
            "num_detections": 0,
            "detections": [],
        }

        mock_yolo = MagicMock()
        mock_yolo.detect.return_value = {
            "success": True,
            "has_defect": True,
            "num_detections": 1,
            "primary_defect": "transverse_crack",
            "primary_label": "Transverse Crack",
            "confidence": 0.72,
            "detections": [{"class": "transverse_crack", "confidence": 0.72}],
        }

        mock_unet = MagicMock()
        mock_unet.segment.return_value = {"success": True, "has_crack": True, "crack_area_pct": 1.2, "crack_pixels": 50, "max_width_px": 3.0}

        with (
            patch("app.services.classifier.get_classifier", return_value=mock_classifier),
            patch("app.services.rfdetr_detector.get_rfdetr_detector", return_value=mock_rfdetr),
            patch("app.services.yolo_detector.get_yolo_detector", return_value=mock_yolo),
            patch("app.services.unet_segmentor.get_unet_segmentor", return_value=mock_unet),
            patch("app.services.crack_geometry.extract_crack_geometry", return_value={"success": True, "summary": {}}),
        ):
            pred = run_and_persist_ai_classification(
                db=MagicMock(),
                image=img_record,
                target_path=tmp_path,
                user_id="user-1",
                inspection_id=None,
            )

        mock_rfdetr.detect.assert_called_once()
        mock_yolo.detect.assert_called_once()
        assert pred is not None
        assert pred["active_stage2_model"] == "unet_fallback"
        assert pred["model_fallback"] is True
        assert pred["yolo_detection"]["has_defect"] is True
        assert img_record.quality_report["yolo_detection"]["primary_defect"] == "transverse_crack"
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

