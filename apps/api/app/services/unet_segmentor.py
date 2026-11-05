import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import cv2
import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger("infrascan.unet")

class DoubleConv(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class UNet(nn.Module):
    def __init__(self, in_channels: int = 3, base_channels: int = 16, num_classes: int = 1):
        super().__init__()
        b = base_channels
        self.enc1 = DoubleConv(in_channels, b)
        self.enc2 = DoubleConv(b, b * 2)
        self.enc3 = DoubleConv(b * 2, b * 4)
        self.enc4 = DoubleConv(b * 4, b * 8)
        self.pool = nn.MaxPool2d(2)

        self.bottleneck = DoubleConv(b * 8, b * 16)

        self.up4 = nn.ConvTranspose2d(b * 16, b * 8, kernel_size=2, stride=2)
        self.dec4 = DoubleConv(b * 16, b * 8)

        self.up3 = nn.ConvTranspose2d(b * 8, b * 4, kernel_size=2, stride=2)
        self.dec3 = DoubleConv(b * 8, b * 4)

        self.up2 = nn.ConvTranspose2d(b * 4, b * 2, kernel_size=2, stride=2)
        self.dec2 = DoubleConv(b * 4, b * 2)

        self.up1 = nn.ConvTranspose2d(b * 2, b, kernel_size=2, stride=2)
        self.dec1 = DoubleConv(b * 2, b)

        self.head = nn.Conv2d(b, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))

        b = self.bottleneck(self.pool(e4))

        d4 = self.up4(b)
        d4 = self.dec4(torch.cat([d4, e4], dim=1))

        d3 = self.up3(d4)
        d3 = self.dec3(torch.cat([d3, e3], dim=1))

        d2 = self.up2(d3)
        d2 = self.dec2(torch.cat([d2, e2], dim=1))

        d1 = self.up1(d2)
        d1 = self.dec1(torch.cat([d1, e1], dim=1))

        return self.head(d1)


class UNetCrackSegmentor:
    """
    InfraScan UNet Pixel-Level Crack Segmentation Engine:
    - Trained on rimvydasrub/crackseg9k (Validation Dice: 75.14%)
    - Input size: 384x384
    - Output: High-resolution binary mask, crack area %, width & length metrics, neon visual overlay
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = None
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.is_loaded = False
        self.config = {}
        self.metrics = {}

        candidate_paths = [
            model_path,
            os.path.join(os.path.dirname(__file__), "..", "..", "storage", "models", "infrascan_unet_crackseg9k_best.pth"),
            r"C:\Users\yashr\Downloads\best_model.pth",
        ]

        for p in candidate_paths:
            if p and os.path.exists(p):
                self.model_path = Path(p)
                break

        if self.model_path and self.model_path.exists():
            self._load_model()
        else:
            logger.warning("UNet model checkpoint not found in candidate paths.")

    def _load_model(self):
        try:
            logger.info("Loading UNet crack segmentation model from %s on %s...", self.model_path, self.device)
            ckpt = torch.load(str(self.model_path), map_location=self.device)
            self.config = ckpt.get("config", {})
            self.metrics = ckpt.get("validation_metrics", {})
            base_ch = self.config.get("base_channels", 16)

            self.model = UNet(in_channels=3, base_channels=base_ch, num_classes=1)
            self.model.load_state_dict(ckpt["model_state_dict"])
            self.model.to(self.device)
            self.model.eval()
            self.is_loaded = True
            logger.info("Successfully loaded UNet model (Dice: %.2f%%, Base Channels: %d)", self.metrics.get("dice", 0.7514) * 100, base_ch)
        except Exception as e:
            logger.error("Failed to load UNet model: %s", e)
            self.is_loaded = False

    def segment(
        self,
        image_input,
        threshold: float = 0.5,
        save_overlay_path: Optional[str] = None,
        save_mask_path: Optional[str] = None,
        mm_per_pixel: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Runs pixel-level crack segmentation on image_input (filepath, bytes, or ndarray).
        Returns crack mask, area %, width, length, and generates visual overlay.
        """
        if not self.is_loaded or self.model is None:
            return {"success": False, "error": "UNet model not loaded"}

        # Read input
        if isinstance(image_input, (str, Path)):
            img_bgr = cv2.imread(str(image_input))
        elif isinstance(image_input, bytes):
            nparr = np.frombuffer(image_input, np.uint8)
            img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        elif isinstance(image_input, np.ndarray):
            img_bgr = image_input.copy()
        else:
            return {"success": False, "error": "Invalid image input"}

        if img_bgr is None:
            return {"success": False, "error": "Could not decode image"}

        orig_h, orig_w = img_bgr.shape[:2]
        img_size = self.config.get("image_size", 384)

        # Preprocessing: RGB, Resize to 384x384, ImageNet normalization
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        resized_rgb = cv2.resize(img_rgb, (img_size, img_size), interpolation=cv2.INTER_LINEAR)

        tensor = torch.from_numpy(resized_rgb).permute(2, 0, 1).float() / 255.0
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        tensor_norm = (tensor - mean) / std
        tensor_input = tensor_norm.unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor_input)
            prob_384 = torch.sigmoid(logits).squeeze().cpu().numpy()

        # Resize probability map back to original dimensions
        prob_orig = cv2.resize(prob_384, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
        binary_mask = (prob_orig >= threshold).astype(np.uint8) * 255

        # Quantitative Metrics Computation
        total_pixels = orig_w * orig_h
        crack_pixels = int(np.count_nonzero(binary_mask))
        crack_area_pct = round((crack_pixels / total_pixels) * 100, 2)
        has_crack = crack_pixels > 50

        # Mean confidence on segmented crack region
        mean_crack_conf = round(float(prob_orig[binary_mask > 0].mean()), 4) if crack_pixels > 0 else 0.0

        # Max width & length estimation via Distance Transform & Contours
        max_width_px = 0.0
        total_length_px = 0.0
        num_components = 0

        if crack_pixels > 0:
            dist_transform = cv2.distanceTransform(binary_mask, cv2.DIST_L2, 5)
            max_width_px = round(float(dist_transform.max() * 2.0), 1)  # Diameter/Thickness

            # Connected components / contours
            contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            num_components = len(contours)
            for cnt in contours:
                total_length_px += cv2.arcLength(cnt, closed=False) / 2.0
            total_length_px = round(float(total_length_px), 1)

        # Scale with mm_per_pixel calibration if available
        max_width_mm = round(max_width_px * mm_per_pixel, 2) if mm_per_pixel else None
        total_length_mm = round(total_length_px * mm_per_pixel, 1) if mm_per_pixel else None

        # Visual Overlay Generation (Neon Red / Crimson Crack Mask on Original Surface)
        overlay_bgr = img_bgr.copy()
        if crack_pixels > 0:
            # Create neon crimson colored mask (BGR: [30, 30, 240])
            color_mask = np.zeros_like(img_bgr)
            color_mask[binary_mask > 0] = [20, 20, 245]  # Bright neon red

            # Blend with 55% transparency on crack pixels
            mask_bool = binary_mask > 0
            overlay_bgr[mask_bool] = cv2.addWeighted(img_bgr[mask_bool], 0.45, color_mask[mask_bool], 0.55, 0)

            # Draw crisp yellow/gold contour borders around crack boundaries for high contrast
            contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(overlay_bgr, contours, -1, (0, 235, 255), 1, cv2.LINE_AA)

        # Overlay Info Badge (Top-left HUD)
        hud_h = 42
        hud_bg = np.zeros((hud_h, orig_w, 3), dtype=np.uint8)
        hud_bg[:] = (18, 18, 22)
        cv2.rectangle(hud_bg, (0, 0), (orig_w, hud_h), (35, 35, 45), 1)

        tag_txt = f"UNet CrackSeg9k | Area: {crack_area_pct}% ({crack_pixels:,} px) | Max Width: {max_width_px}px | Mean Conf: {mean_crack_conf*100:.1f}%"
        cv2.putText(hud_bg, tag_txt, (14, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 240, 240), 2, cv2.LINE_AA)
        final_overlay = np.vstack([hud_bg, overlay_bgr])

        # Save files if requested
        if save_overlay_path:
            os.makedirs(os.path.dirname(os.path.abspath(save_overlay_path)), exist_ok=True)
            cv2.imwrite(str(save_overlay_path), final_overlay, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

        if save_mask_path:
            os.makedirs(os.path.dirname(os.path.abspath(save_mask_path)), exist_ok=True)
            cv2.imwrite(str(save_mask_path), binary_mask)

        return {
            "success": True,
            "has_crack": has_crack,
            "crack_area_pct": crack_area_pct,
            "crack_pixels": crack_pixels,
            "total_pixels": total_pixels,
            "mean_crack_confidence": mean_crack_conf,
            "max_width_px": max_width_px,
            "max_width_mm": max_width_mm,
            "total_length_px": total_length_px,
            "total_length_mm": total_length_mm,
            "components_count": num_components,
            "threshold": threshold,
            "model_version": "UNet-CrackSeg9k-384",
            "validation_dice": self.metrics.get("dice", 0.7514),
            "overlay_path": save_overlay_path,
            "mask_path": save_mask_path,
        }


# Global Singleton Instance
_unet_instance: Optional[UNetCrackSegmentor] = None

def get_unet_segmentor() -> UNetCrackSegmentor:
    global _unet_instance
    if _unet_instance is None:
        _unet_instance = UNetCrackSegmentor()
    return _unet_instance

