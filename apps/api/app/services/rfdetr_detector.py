"""
InfraScan RF-DETR Crack & Defect Detection Service
===================================================
Model: dronefreak/rdd2022-rfdetr-medium (checkpoint_best_total.pth)
Architecture: RF-DETR Medium with DINOv2 backbone for RDD2022 Road & Infrastructure Damage.
Classes:
  0: Longitudinal Crack (D00)
  1: Transverse Crack (D10)
  2: Alligator Crack (D20)
  3: Pothole / Spalling (D40)

Workflow:
  1. Primary Stage 2 detector when ResNet-18 classifies an image as crack (prob >= 80%).
  2. If RF-DETR detects defect bounding boxes, it generates labeled defect overlays and metadata.
  3. If RF-DETR detects 0 defects on a crack-classified image, system falls back to UNet (best_model.pth).
"""

import os
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
import numpy as np
import cv2
from PIL import Image

logger = logging.getLogger("infrascan.rfdetr")

DEFECT_CLASSES = {
    0: {
        "code": "D00",
        "name": "Longitudinal Crack",
        "defect_type": "longitudinal_crack",
        "color_bgr": (11, 158, 245),   # Amber/Orange
        "color_hex": "#F59E0B"
    },
    1: {
        "code": "D10",
        "name": "Transverse Crack",
        "defect_type": "transverse_crack",
        "color_bgr": (233, 165, 14),   # Cyan/Sky
        "color_hex": "#0EA5E9"
    },
    2: {
        "code": "D20",
        "name": "Alligator Crack",
        "defect_type": "alligator_crack",
        "color_bgr": (68, 68, 239),    # Crimson/Red
        "color_hex": "#EF4444"
    },
    3: {
        "code": "D40",
        "name": "Pothole / Spalling",
        "defect_type": "pothole",
        "color_bgr": (247, 85, 168),   # Purple/Violet
        "color_hex": "#A855F7"
    }
}


class RFDETRCrackDetector:
    """
    Singleton service for RDD2022 RF-DETR Medium defect detection.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = None
        self.model = None
        self.is_loaded = False
        self.error_message: Optional[str] = None

        candidate_paths = [
            model_path,
            os.path.join(os.path.dirname(__file__), "..", "..", "storage", "models", "rdd2022_rfdetr_medium_best.pth"),
            r"C:\Users\yashr\AppData\Local\Temp\rfdetr_test\checkpoint_best_total.pth",
        ]

        for p in candidate_paths:
            if p and os.path.exists(p):
                self.model_path = Path(p)
                break

        if not self.model_path or not self.model_path.exists():
            # Try HF hub download
            try:
                from huggingface_hub import hf_hub_download
                logger.info("Attempting HF download for rdd2022-rfdetr-medium checkpoint...")
                downloaded = hf_hub_download(
                    repo_id="dronefreak/rdd2022-rfdetr-medium",
                    filename="checkpoint_best_total.pth"
                )
                if downloaded and os.path.exists(downloaded):
                    self.model_path = Path(downloaded)
            except Exception as e:
                logger.warning("Could not download RF-DETR from HF Hub: %s", e)

        if self.model_path and self.model_path.exists():
            self._load_model()
        else:
            self.error_message = "RF-DETR weights checkpoint not found."
            logger.warning(self.error_message)

    def _load_model(self):
        try:
            logger.info("Loading RF-DETR Medium from %s...", self.model_path)
            import rfdetr
            import torch
            self.model = rfdetr.RFDETRMedium(
                pretrain_weights=str(self.model_path),
                num_classes=4
            )
            # Optimize for high-throughput GPU inference with FP16 Tensor Cores
            if torch.cuda.is_available():
                try:
                    self.model.inference(compile=False, dtype="float16")
                    logger.info("RF-DETR Medium optimized with FP16 Tensor Cores on GPU.")
                except Exception as opt_err:
                    logger.warning("RF-DETR FP16 optimization skipped: %s", opt_err)
            self.is_loaded = True
            logger.info("RF-DETR Medium loaded successfully.")
        except Exception as e:
            self.error_message = f"Failed to instantiate RFDETRMedium: {e}"
            logger.error(self.error_message)
            self.is_loaded = False

    def detect(
        self,
        image_input: Union[str, Path, bytes, np.ndarray, Image.Image],
        threshold: float = 0.20,
        save_annotated_path: Optional[str] = None,
        save_thumbnail_path: Optional[str] = None,
        resnet_confidence: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Executes RF-DETR Medium defect detection on image_input.
        Returns defect bounding boxes, classes, and saves annotated visual image if requested.
        """
        if not self.is_loaded or self.model is None:
            return {
                "success": False,
                "error": self.error_message or "RF-DETR model not loaded",
                "has_defect": False,
                "num_detections": 0,
                "detections": [],
                "fallback_to_unet": True
            }

        t0 = time.perf_counter()

        # Resolve image to a format RF-DETR expects (filepath or PIL Image)
        img_for_inference = None
        orig_bgr = None

        if isinstance(image_input, (str, Path)):
            p = str(image_input)
            if not os.path.exists(p):
                return {"success": False, "error": f"Image file not found: {p}", "fallback_to_unet": True}
            img_for_inference = p
            orig_bgr = cv2.imread(p)
        elif isinstance(image_input, bytes):
            nparr = np.frombuffer(image_input, np.uint8)
            orig_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)
            img_for_inference = Image.fromarray(rgb)
        elif isinstance(image_input, np.ndarray):
            orig_bgr = image_input.copy()
            if len(orig_bgr.shape) == 2:
                orig_bgr = cv2.cvtColor(orig_bgr, cv2.COLOR_GRAY2BGR)
            rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)
            img_for_inference = Image.fromarray(rgb)
        elif isinstance(image_input, Image.Image):
            img_for_inference = image_input
            rgb = np.array(image_input.convert("RGB"))
            orig_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        else:
            return {"success": False, "error": "Unsupported image input type", "fallback_to_unet": True}

        if orig_bgr is None:
            return {"success": False, "error": "Failed to decode input image", "fallback_to_unet": True}

        h, w = orig_bgr.shape[:2]

        try:
            detections = self.model.predict(img_for_inference, threshold=threshold)
        except Exception as e:
            logger.error("RF-DETR predict failed: %s", e)
            return {
                "success": False,
                "error": f"Prediction failed: {e}",
                "has_defect": False,
                "num_detections": 0,
                "detections": [],
                "fallback_to_unet": True
            }

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)

        raw_boxes = detections.xyxy if detections.xyxy is not None else []
        raw_confs = detections.confidence if detections.confidence is not None else []
        raw_classes = detections.class_id if detections.class_id is not None else []

        num_dets = len(raw_boxes)
        det_list = []
        annotated_bgr = orig_bgr.copy()

        if num_dets > 0:
            for i in range(num_dets):
                box = raw_boxes[i]
                conf = float(raw_confs[i]) if i < len(raw_confs) else float(threshold)
                cls_id = int(raw_classes[i]) if i < len(raw_classes) else 0

                meta = DEFECT_CLASSES.get(cls_id, {
                    "code": f"D{cls_id:02d}",
                    "name": f"Crack Type {cls_id}",
                    "defect_type": "crack",
                    "color_bgr": (0, 165, 255),
                    "color_hex": "#F59E0B"
                })

                x1, y1, x2, y2 = [float(v) for v in box]
                # Clamp coordinates to image bounds
                x1 = max(0.0, min(float(w - 1), x1))
                y1 = max(0.0, min(float(h - 1), y1))
                x2 = max(0.0, min(float(w - 1), x2))
                y2 = max(0.0, min(float(h - 1), y2))

                box_w = max(1.0, x2 - x1)
                box_h = max(1.0, y2 - y1)

                det_list.append({
                    "box_id": f"RFD-{i+1:03d}",
                    "class_id": cls_id,
                    "code": meta["code"],
                    "label": meta["name"],
                    "defect_type": meta["defect_type"],
                    "confidence": round(conf, 4),
                    "confidence_pct": round(conf * 100, 1),
                    "bbox_xyxy": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    "bbox_normalized": [
                        round(x1 / w, 4),
                        round(y1 / h, 4),
                        round(box_w / w, 4),
                        round(box_h / h, 4)
                    ],
                    "color_hex": meta["color_hex"]
                })

                # Draw bounding box
                color = meta["color_bgr"]
                cv2.rectangle(annotated_bgr, (int(x1), int(y1)), (int(x2), int(y2)), color, 3)

                # Draw crisp label banner
                lbl_text = f"{meta['name']} ({round(conf * 100)}%)"
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.55
                font_thick = 2
                (tw, th), baseline = cv2.getTextSize(lbl_text, font, font_scale, font_thick)

                top_y = max(0, int(y1) - th - 8)
                cv2.rectangle(
                    annotated_bgr,
                    (int(x1), top_y),
                    (int(x1) + tw + 10, top_y + th + 8),
                    color,
                    -1
                )
                cv2.putText(
                    annotated_bgr,
                    lbl_text,
                    (int(x1) + 5, top_y + th + 3),
                    font,
                    font_scale,
                    (255, 255, 255),
                    font_thick,
                    cv2.LINE_AA
                )

            # Sort detections by confidence descending
            det_list.sort(key=lambda d: d["confidence"], reverse=True)
            primary_det = det_list[0]
            primary_defect = primary_det["defect_type"]
            primary_label = primary_det["label"]
            max_conf = primary_det["confidence"]
        else:
            primary_defect = None
            primary_label = None
            max_conf = 0.0

        # Save annotated image if requested
        if save_annotated_path and num_dets > 0:
            os.makedirs(os.path.dirname(os.path.abspath(save_annotated_path)), exist_ok=True)
            cv2.imwrite(save_annotated_path, annotated_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

        if save_thumbnail_path and num_dets > 0:
            os.makedirs(os.path.dirname(os.path.abspath(save_thumbnail_path)), exist_ok=True)
            tb_scale = 320.0 / max(h, w) if max(h, w) > 320 else 1.0
            tb_img = cv2.resize(annotated_bgr, (int(w * tb_scale), int(h * tb_scale)), interpolation=cv2.INTER_AREA)
            cv2.imwrite(save_thumbnail_path, tb_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])

        has_defect = num_dets > 0
        fallback_to_unet = not has_defect

        status_msg = (
            f"RF-DETR (rdd2022-rfdetr-medium) identified {num_dets} defect region(s) — {primary_label}."
            if has_defect
            else "RF-DETR (rdd2022-rfdetr-medium) detected 0 defect bounding boxes. Activating U-Net (best_model.pth) pixel segmentation fallback."
        )

        return {
            "success": True,
            "has_defect": has_defect,
            "num_detections": num_dets,
            "detections": det_list,
            "primary_defect": primary_defect,
            "primary_label": primary_label,
            "confidence": max_conf,
            "model_id": "rdd2022-rfdetr-medium",
            "model_name": "RDD2022 RF-DETR Medium",
            "latency_ms": latency_ms,
            "fallback_to_unet": fallback_to_unet,
            "status_message": status_msg,
            "annotated_path": save_annotated_path if (has_defect and save_annotated_path) else None
        }


# Singleton instance
_detector_instance: Optional[RFDETRCrackDetector] = None

def get_rfdetr_detector() -> RFDETRCrackDetector:
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = RFDETRCrackDetector()
    return _detector_instance

