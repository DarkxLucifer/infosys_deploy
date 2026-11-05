"""
InfraScan YOLO Defect Detection Service (v1.2 - 768px)
======================================================
Deep learning defect localizer for structural concrete and pavement.
Accepts preprocessed photographs from the classical CV pipeline when
the ResNet-18 multi-scale classifier detects a structural crack (>= 80% threshold).
Detects bounding boxes, defect types (Longitudinal, Transverse, Alligator, Pothole),
generates annotated result images, and persists detection records.
"""

import os
import io
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union, Tuple
import numpy as np
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger("infrascan.yolo")

# Civil engineering defect taxonomy matching model classes
DEFECT_CLASSES = {
    0: {
        "code": "D00_longitudinal_crack",
        "name": "Longitudinal Crack",
        "defect_type": "longitudinal_crack",
        "color_rgb": (245, 158, 11),  # Amber
        "color_hex": "#F59E0B"
    },
    1: {
        "code": "D10_transverse_crack",
        "name": "Transverse Crack",
        "defect_type": "transverse_crack",
        "color_rgb": (14, 165, 233),  # Cyan
        "color_hex": "#0EA5E9"
    },
    2: {
        "code": "D20_alligator_crack",
        "name": "Alligator Crack",
        "defect_type": "alligator_crack",
        "color_rgb": (239, 68, 68),   # Rose Red
        "color_hex": "#EF4444"
    },
    3: {
        "code": "D40_pothole",
        "name": "Pothole / Spalling",
        "defect_type": "pothole",
        "color_rgb": (168, 85, 247),  # Purple
        "color_hex": "#A855F7"
    }
}

DEFAULT_MODEL_PATHS = [
    Path(r"d:\project\aiml prime\project\infosys\storage\models\infrascan_yolo_v1_2_crack_best.pt"),
    Path(os.path.join(os.getcwd(), "storage", "models", "infrascan_yolo_v1_2_crack_best.pt")),
    Path(r"C:\Users\yashr\Downloads\infrascan_yolo_v1_2_gpu_fast_accuracy_768-20261029T134420Z-1-001\infrascan_yolo_v1_2_gpu_fast_accuracy_768\weights\best.pt")
]


class YoloCrackDetector:
    """
    Two-stage AI component: Runs YOLO crack and defect detection on preprocessed imagery.
    Produces clean visual overlays and structured bounding box metrics.
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        self.model_path = None
        self.model = None
        self.is_loaded = False
        self.error_message: Optional[str] = None

        if model_path:
            p = Path(model_path)
            if p.exists():
                self.model_path = p

        if not self.model_path:
            for candidate in DEFAULT_MODEL_PATHS:
                if candidate.exists():
                    self.model_path = candidate
                    break

        self._load_model()

    def _load_model(self):
        if not self.model_path or not self.model_path.exists():
            self.error_message = f"YOLO model weights not found at candidate paths: {DEFAULT_MODEL_PATHS}"
            logger.warning(self.error_message)
            return

        try:
            from ultralytics import YOLO
            self.model = YOLO(str(self.model_path))
            self.is_loaded = True
            logger.info("Successfully loaded YOLO crack detection model from %s", self.model_path)
        except Exception as exc:
            self.error_message = f"Failed to load YOLO model: {exc}"
            logger.error(self.error_message, exc_info=True)

    def detect(
        self,
        image_input: Union[str, Path, bytes, Image.Image],
        conf: float = 0.08,
        imgsz: int = 768,
        save_annotated_path: Optional[Union[str, Path]] = None,
        save_thumbnail_path: Optional[Union[str, Path]] = None,
        resnet_confidence: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Runs YOLO defect detection on the given image.
        Generates annotated result images with highlighted defect bounding boxes.
        """
        # Load PIL image
        pil_img = self._load_pil_image(image_input)
        if pil_img is None:
            return {
                "success": False,
                "error": "Failed to load input image for YOLO detection",
                "detections": [],
                "detections_count": 0
            }

        orig_w, orig_h = pil_img.size

        # If model is not loaded, generate graceful fallback response
        if not self.is_loaded or self.model is None:
            return self._build_fallback_result(
                pil_img,
                save_annotated_path,
                save_thumbnail_path,
                resnet_confidence,
                "YOLO model not loaded"
            )

        try:
            # First pass with specified confidence
            results = self.model.predict(
                source=pil_img,
                conf=conf,
                imgsz=imgsz,
                verbose=False
            )

            raw_boxes = results[0].boxes if (results and len(results) > 0) else []

            # If 0 detections and conf > 0.04, do secondary sensitive pass
            if len(raw_boxes) == 0 and conf > 0.04:
                results_fallback = self.model.predict(
                    source=pil_img,
                    conf=0.04,
                    imgsz=imgsz,
                    verbose=False
                )
                if results_fallback and len(results_fallback) > 0:
                    raw_boxes = results_fallback[0].boxes

            parsed_detections: List[Dict[str, Any]] = []

            for b in raw_boxes:
                cls_id = int(b.cls[0].item()) if hasattr(b.cls[0], "item") else int(b.cls[0])
                score = float(b.conf[0].item()) if hasattr(b.conf[0], "item") else float(b.conf[0])
                coords = b.xyxy[0].tolist()
                x1 = max(0.0, min(float(coords[0]), float(orig_w)))
                y1 = max(0.0, min(float(coords[1]), float(orig_h)))
                x2 = max(0.0, min(float(coords[2]), float(orig_w)))
                y2 = max(0.0, min(float(coords[3]), float(orig_h)))

                meta = DEFECT_CLASSES.get(cls_id, {
                    "code": f"D{cls_id:02d}_crack",
                    "name": self.model.names.get(cls_id, f"Defect-{cls_id}"),
                    "defect_type": "crack",
                    "color_rgb": (239, 68, 68),
                    "color_hex": "#EF4444"
                })

                parsed_detections.append({
                    "class_id": cls_id,
                    "code": meta["code"],
                    "label": meta["name"],
                    "defect_type": meta["defect_type"],
                    "confidence": round(score, 4),
                    "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    "box_normalized": [
                        round(x1 / orig_w, 4),
                        round(y1 / orig_h, 4),
                        round(x2 / orig_w, 4),
                        round(y2 / orig_h, 4)
                    ],
                    "width_px": round(x2 - x1, 1),
                    "height_px": round(y2 - y1, 1),
                    "color_hex": meta["color_hex"],
                    "color_rgb": meta["color_rgb"]
                })

            # Sort by confidence descending
            parsed_detections.sort(key=lambda d: d["confidence"], reverse=True)

            # Generate visual annotated image
            annotated_img = self._draw_annotations(
                pil_img,
                parsed_detections,
                resnet_confidence=resnet_confidence
            )

            # Save annotated full resolution and thumbnail
            saved_ann_path = None
            saved_thumb_path = None

            if save_annotated_path:
                save_p = Path(save_annotated_path)
                save_p.parent.mkdir(parents=True, exist_ok=True)
                annotated_img.save(str(save_p), format="JPEG", quality=92)
                saved_ann_path = str(save_p)

            if save_thumbnail_path:
                thumb_p = Path(save_thumbnail_path)
                thumb_p.parent.mkdir(parents=True, exist_ok=True)
                thumb_img = annotated_img.copy()
                thumb_img.thumbnail((480, 480), Image.Resampling.LANCZOS)
                thumb_img.save(str(thumb_p), format="JPEG", quality=85)
                saved_thumb_path = str(thumb_p)

            # Aggregate stats
            counts: Dict[str, int] = {}
            for d in parsed_detections:
                counts[d["label"]] = counts.get(d["label"], 0) + 1

            return {
                "success": True,
                "model_name": "InfraScan YOLO Crack Detector v1.2",
                "model_version": "v1.2-768",
                "image_width": orig_w,
                "image_height": orig_h,
                "detections_count": len(parsed_detections),
                "detections": parsed_detections,
                "counts_by_type": counts,
                "primary_defect": parsed_detections[0]["label"] if parsed_detections else "Crack Region",
                "annotated_path": saved_ann_path,
                "thumbnail_path": saved_thumb_path
            }

        except Exception as exc:
            logger.error("YOLO detection error: %s", exc, exc_info=True)
            return self._build_fallback_result(
                pil_img,
                save_annotated_path,
                save_thumbnail_path,
                resnet_confidence,
                str(exc)
            )

    def _draw_annotations(
        self,
        base_img: Image.Image,
        detections: List[Dict[str, Any]],
        resnet_confidence: Optional[float] = None
    ) -> Image.Image:
        """
        Draws professional civil-engineering visual annotations:
        - Semi-transparent colored highlight fills for detected defect areas
        - High-contrast colored bounding box borders
        - Distinct label tags with class name and confidence score
        - Top status watermark indicating YOLO & ResNet verification
        """
        annotated = base_img.convert("RGBA")
        overlay = Image.new("RGBA", annotated.size, (0, 0, 0, 0))
        draw_overlay = ImageDraw.Draw(overlay)
        draw_final = ImageDraw.Draw(annotated)

        w, h = base_img.size
        line_thickness = max(3, int(min(w, h) / 220))
        font_size = max(13, int(min(w, h) / 38))

        try:
            # Attempt to load standard system truetype font, fallback to default
            font = ImageFont.truetype("arial.ttf", font_size)
            header_font = ImageFont.truetype("arialbd.ttf", max(14, int(font_size * 1.05)))
        except Exception:
            font = ImageFont.load_default()
            header_font = font

        # If detections are present, draw each defect box
        if detections:
            for det in detections:
                box = det["box"]
                x1, y1, x2, y2 = box[0], box[1], box[2], box[3]
                rgb = det.get("color_rgb", (239, 68, 68))

                # 1. Semi-transparent fill in overlay
                draw_overlay.rectangle(
                    [x1, y1, x2, y2],
                    fill=(rgb[0], rgb[1], rgb[2], 35)  # ~14% opacity
                )

                # 2. Outer box border
                draw_overlay.rectangle(
                    [x1, y1, x2, y2],
                    outline=(rgb[0], rgb[1], rgb[2], 240),
                    width=line_thickness
                )

                # 3. Label tag header pill
                conf_pct = int(round(det["confidence"] * 100))
                label_text = f"{det['label']} {conf_pct}%"

                # Measure label text size
                bbox = font.getbbox(label_text) if hasattr(font, "getbbox") else (0, 0, len(label_text) * 8, font_size)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]

                tag_x1 = x1
                tag_y1 = max(0, y1 - th - 10)
                tag_x2 = tag_x1 + tw + 14
                tag_y2 = tag_y1 + th + 10

                # Pill background
                draw_overlay.rectangle(
                    [tag_x1, tag_y1, tag_x2, tag_y2],
                    fill=(rgb[0], rgb[1], rgb[2], 230),
                    outline=(0, 0, 0, 180),
                    width=1
                )

                # Pill text
                draw_overlay.text(
                    (tag_x1 + 7, tag_y1 + 4),
                    label_text,
                    fill=(255, 255, 255, 255),
                    font=font
                )

        else:
            # ResNet-18 detected crack (>=80%) but YOLO boxes were below cutoff:
            # Highlight whole surface defect zone
            conf_str = f" ({resnet_confidence:.1%})" if resnet_confidence else ""
            notice_text = f"AI Crack Defect Verified by ResNet-18{conf_str}"
            
            # Subtle amber/rose warning frame
            frame_margin = max(8, int(min(w, h) * 0.02))
            draw_overlay.rectangle(
                [frame_margin, frame_margin, w - frame_margin, h - frame_margin],
                outline=(245, 158, 11, 230),
                width=line_thickness + 1
            )
            draw_overlay.rectangle(
                [frame_margin, frame_margin, w - frame_margin, h - frame_margin],
                fill=(245, 158, 11, 25)
            )

            # Defect badge
            bbox = header_font.getbbox(notice_text) if hasattr(header_font, "getbbox") else (0, 0, len(notice_text) * 9, font_size)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            bx1 = frame_margin + 12
            by1 = frame_margin + 12
            draw_overlay.rectangle(
                [bx1, by1, bx1 + tw + 18, by1 + th + 12],
                fill=(225, 29, 72, 230),
                outline=(255, 255, 255, 200),
                width=1
            )
            draw_overlay.text(
                (bx1 + 9, by1 + 5),
                notice_text,
                fill=(255, 255, 255, 255),
                font=header_font
            )

        # Composite overlay
        annotated = Image.alpha_composite(annotated, overlay)

        # Add top banner watermark
        watermark_bar = Image.new("RGBA", (w, max(26, int(h * 0.045))), (0, 0, 0, 190))
        wm_draw = ImageDraw.Draw(watermark_bar)
        det_count = len(detections)
        wm_text = f"InfraScan YOLOv8 Crack Detection — {det_count} defect zone{'s' if det_count != 1 else ''} mapped"
        try:
            wm_font = ImageFont.truetype("arial.ttf", max(11, int(watermark_bar.height * 0.55)))
        except Exception:
            wm_font = font
        wm_draw.text((10, int((watermark_bar.height - 14) / 2)), wm_text, fill=(255, 255, 255, 240), font=wm_font)

        annotated.paste(watermark_bar, (0, h - watermark_bar.height), watermark_bar)

        return annotated.convert("RGB")

    def _build_fallback_result(
        self,
        pil_img: Image.Image,
        save_annotated_path: Optional[Union[str, Path]],
        save_thumbnail_path: Optional[Union[str, Path]],
        resnet_confidence: Optional[float],
        reason: str
    ) -> Dict[str, Any]:
        """Draws indicator and saves image when YOLO inference encounters error."""
        annotated_img = self._draw_annotations(pil_img, [], resnet_confidence=resnet_confidence)
        saved_ann_path = None
        saved_thumb_path = None

        if save_annotated_path:
            save_p = Path(save_annotated_path)
            save_p.parent.mkdir(parents=True, exist_ok=True)
            annotated_img.save(str(save_p), format="JPEG", quality=90)
            saved_ann_path = str(save_p)

        if save_thumbnail_path:
            thumb_p = Path(save_thumbnail_path)
            thumb_p.parent.mkdir(parents=True, exist_ok=True)
            thumb_img = annotated_img.copy()
            thumb_img.thumbnail((480, 480), Image.Resampling.LANCZOS)
            thumb_img.save(str(thumb_p), format="JPEG", quality=85)
            saved_thumb_path = str(thumb_p)

        return {
            "success": True,
            "model_name": "InfraScan YOLO Crack Detector v1.2",
            "model_version": "v1.2-768",
            "image_width": pil_img.size[0],
            "image_height": pil_img.size[1],
            "detections_count": 0,
            "detections": [],
            "counts_by_type": {},
            "primary_defect": "Crack Region",
            "note": f"Fallback: {reason}",
            "annotated_path": saved_ann_path,
            "thumbnail_path": saved_thumb_path
        }

    def _load_pil_image(self, image_input: Union[str, Path, bytes, Image.Image]) -> Optional[Image.Image]:
        try:
            if isinstance(image_input, Image.Image):
                return image_input.convert("RGB")
            elif isinstance(image_input, (str, Path)):
                p = Path(image_input)
                if p.exists():
                    return Image.open(p).convert("RGB")
            elif isinstance(image_input, (bytes, bytearray)):
                return Image.open(io.BytesIO(image_input)).convert("RGB")
        except Exception as exc:
            logger.error("Failed to convert image input to PIL: %s", exc)
        return None


# Global singleton instance
_GLOBAL_YOLO_DETECTOR: Optional[YoloCrackDetector] = None

def get_yolo_detector() -> YoloCrackDetector:
    """Returns the singleton YoloCrackDetector instance."""
    global _GLOBAL_YOLO_DETECTOR
    if _GLOBAL_YOLO_DETECTOR is None:
        _GLOBAL_YOLO_DETECTOR = YoloCrackDetector()
    return _GLOBAL_YOLO_DETECTOR
