"""
InfraScan Explainable AI (XAI) Service
======================================
Provides visual explanations for deep learning crack and damage predictions:
1. Grad-CAM (Gradient-Weighted Class Activation Mapping)
2. Grad-CAM++ (Generalized CAM with 2nd & 3rd order gradient weights for fine cracks)
3. Spatial Feature Attention Maps (L2 activation norm across convolutional channels)
4. Saliency Maps (Input-space gradient attribution magnitude)

Reference:
- InfraScan Specification PDF Section 12 (Page 15) & Section 18 (Page 21)
- Selvaraju et al., "Grad-CAM: Visual Explanations from Deep Networks", ICCV 2017
- Chattopadhay et al., "Grad-CAM++: Generalized Gradient-based Visual Explanations", WACV 2018
"""

import os
import io
import json
import logging
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Union, List, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models
from PIL import Image

from app.config import settings

logger = logging.getLogger("infrascan.xai")

# Thread lock for safe GPU/CPU backward passes
_XAI_LOCK = threading.Lock()
_XAI_INSTANCE = None

COLORMAPS = {
    "turbo": cv2.COLORMAP_TURBO,
    "jet": cv2.COLORMAP_JET,
    "plasma": cv2.COLORMAP_PLASMA,
    "viridis": cv2.COLORMAP_VIRIDIS,
    "inferno": cv2.COLORMAP_INFERNO,
}


class ExplainableAIService:
    """
    Computes visual explainability representations for InfraScan's ResNet-18
    crack classification model and multi-stage damage pipeline.
    """

    def __init__(self, model_dir: Optional[str] = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[nn.Module] = None
        self.is_loaded = False
        self.error_message: Optional[str] = None
        self.model_dir = Path(model_dir) if model_dir else Path(r"d:\project\aiml prime\project\infosys\storage\models")
        self._load_model()

    def _load_model(self):
        """Loads ResNet-18 model weights for gradient-based backpropagation."""
        candidate_paths = [
            self.model_dir / "infrascan_crack_resnet18_weights.pth",
            Path(getattr(settings, "STORAGE_DIR", "storage")) / "models" / "infrascan_crack_resnet18_weights.pth",
            Path("storage/models/infrascan_crack_resnet18_weights.pth"),
            Path("/app/storage/models/infrascan_crack_resnet18_weights.pth"),
            Path(r"d:\project\aiml prime\project\infosys\storage\models\infrascan_crack_resnet18_weights.pth"),
            Path(r"d:\project\aiml prime\project\infosys_deploy\storage\models\infrascan_crack_resnet18_weights.pth"),
            Path(r"d:\project\aiml prime\project\hf_space_infrascan\storage\models\infrascan_crack_resnet18_weights.pth"),
            Path(r"C:\Users\yashr\Downloads\infrascan_crack_results\models\infrascan_crack_resnet18_weights.pth"),
            Path(r"C:\Users\yashr\Downloads\checkpoints-20261028T135647Z-1-001\checkpoints\resnet18_best.pth")
        ]

        model_path = next((p for p in candidate_paths if p.exists()), None)
        if not model_path:
            logger.warning("ResNet-18 weights file not found for XAI. Checked: %s", [str(p) for p in candidate_paths])
            self.is_loaded = False
            self.error_message = "ResNet-18 weights file not found"
            return

        try:
            m = models.resnet18(weights=None)
            m.fc = nn.Sequential(nn.Dropout(0.2), nn.Linear(512, 2))
            ckpt = torch.load(str(model_path), map_location=self.device)
            state = ckpt["model"] if isinstance(ckpt, dict) and "model" in ckpt else ckpt
            m.load_state_dict(state)
            m.to(self.device)
            m.eval()
            self.model = m
            self.is_loaded = True
            self.error_message = None
            logger.info("Successfully loaded ResNet-18 for Explainable AI from %s on %s", model_path, self.device)
        except Exception as exc:
            logger.error("Failed to load ResNet-18 for XAI: %s", exc)
            self.model = None
            self.is_loaded = False
            self.error_message = str(exc)

    def _preprocess(self, img_np: np.ndarray) -> Tuple[torch.Tensor, Tuple[int, int]]:
        """
        Standard ImageNet preprocessing:
        - Resize to 224x224
        - Normalize with ImageNet mean/std
        - Retain original (H, W) for upscale projection
        """
        orig_h, orig_w = img_np.shape[:2]
        resized = cv2.resize(img_np, (224, 224), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB) if resized.ndim == 3 and resized.shape[2] == 3 else resized
        norm = (rgb.astype(np.float32) / 255.0 - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = torch.from_numpy(norm.transpose(2, 0, 1)).unsqueeze(0).to(self.device)
        return tensor, (orig_h, orig_w)

    def generate_xai_maps(
        self,
        image_input: Union[str, Path, np.ndarray, Image.Image],
        target_class: Optional[int] = None,
        colormap_name: str = "turbo",
        alpha: float = 0.55
    ) -> Dict[str, Any]:
        """
        Generates Grad-CAM, Grad-CAM++, Spatial Attention, and Saliency maps
        along with engineering attribution metrics.
        """
        # Load image into BGR numpy array
        if isinstance(image_input, (str, Path)):
            img_bgr = cv2.imread(str(image_input))
            if img_bgr is None:
                raise ValueError(f"Could not load image from {image_input}")
        elif isinstance(image_input, np.ndarray):
            img_bgr = image_input.copy()
        elif isinstance(image_input, Image.Image):
            rgb = np.array(image_input.convert("RGB"))
            img_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        else:
            raise ValueError(f"Unsupported image type: {type(image_input)}")

        orig_h, orig_w = img_bgr.shape[:2]
        tensor, _ = self._preprocess(img_bgr)
        tensor.requires_grad_(True)

        if not self.is_loaded or self.model is None:
            # Fallback heuristic maps if weights are unavailable
            return self._generate_fallback_xai(img_bgr, orig_h, orig_w, colormap_name, alpha)

        cm = COLORMAPS.get(colormap_name.lower(), cv2.COLORMAP_TURBO)

        with _XAI_LOCK:
            activations = {}
            gradients = {}

            def fwd_hook(name):
                def hook(module, inp, out):
                    activations[name] = out
                return hook

            def bwd_hook(name):
                def hook(module, grad_in, grad_out):
                    gradients[name] = grad_out[0]
                return hook

            # Hook ResNet-18 layer3 (14x14 intermediate features) and layer4 (7x7 semantic bottleneck)
            h_fwd_l3 = self.model.layer3.register_forward_hook(fwd_hook("layer3"))
            h_fwd_l4 = self.model.layer4.register_forward_hook(fwd_hook("layer4"))
            h_bwd_l4 = self.model.layer4.register_full_backward_hook(bwd_hook("layer4"))

            try:
                self.model.zero_grad()
                logits = self.model(tensor)
                probs = F.softmax(logits, dim=1).detach().cpu().numpy()[0]
                pred_class_idx = int(np.argmax(probs))

                # Dynamic class targeting:
                # If target_class is specified, use it. Otherwise, explain the predicted class
                chosen_class = pred_class_idx if target_class is None else target_class
                score = logits[0, chosen_class]
                score.backward(retain_graph=True)

                g = gradients.get("layer4")
                a4 = activations.get("layer4")
                a3 = activations.get("layer3")

                # 1. Grad-CAM (Selvaraju et al., 2017)
                # Global average pooled gradients define coarse feature channel importance over layer4 (7x7)
                if g is not None and a4 is not None:
                    alpha_k = g.mean(dim=(2, 3), keepdim=True)
                    cam = (alpha_k * a4).sum(dim=1, keepdim=True)
                    cam_pos = F.relu(cam)
                    if cam_pos.max() <= 0:
                        cam_pos = torch.abs(cam)
                    cam_resized = F.interpolate(cam_pos, size=(orig_h, orig_w), mode="bilinear", align_corners=False)
                    gradcam_raw = cam_resized[0, 0].detach().cpu().numpy()
                    if gradcam_raw.max() > gradcam_raw.min():
                        gradcam_norm = (gradcam_raw - gradcam_raw.min()) / (gradcam_raw.max() - gradcam_raw.min() + 1e-8)
                    else:
                        gradcam_norm = np.zeros((orig_h, orig_w), dtype=np.float32)
                else:
                    gradcam_norm = np.zeros((orig_h, orig_w), dtype=np.float32)

                # 2. Grad-CAM++ (Chattopadhay et al., 2018)
                # High-order 2nd and 3rd analytical derivatives with exponential percentile focus
                # Isolates fine-grained fracture epicenters and multiple defect loci
                if g is not None and a4 is not None:
                    g2 = g.pow(2)
                    g3 = g.pow(3)
                    denom = 2 * g2 + (a4 * g3).sum(dim=(2, 3), keepdim=True)
                    denom = torch.where(denom != 0.0, denom, 1e-7 * torch.ones_like(denom))
                    w_pp = g2 / denom
                    alpha_pp = (w_pp * F.relu(g)).sum(dim=(2, 3), keepdim=True)
                    cam_pp = (alpha_pp * a4).sum(dim=1, keepdim=True)
                    cam_pp_pos = F.relu(cam_pp)
                    if cam_pp_pos.max() <= 0:
                        cam_pp_pos = torch.abs(cam_pp)
                    cam_pp_resized = F.interpolate(cam_pp_pos, size=(orig_h, orig_w), mode="bilinear", align_corners=False)
                    gradcam_pp_raw = cam_pp_resized[0, 0].detach().cpu().numpy()
                    if gradcam_pp_raw.max() > gradcam_pp_raw.min():
                        # Contrast-sharpening: focus tightly on the 95th percentile fracture loci
                        p95 = np.percentile(gradcam_pp_raw, 95)
                        gpp_scaled = np.clip(gradcam_pp_raw / (p95 + 1e-8), 0.0, 1.0) ** 1.8
                        gradcam_pp_norm = (gpp_scaled - gpp_scaled.min()) / (gpp_scaled.max() - gpp_scaled.min() + 1e-8)
                    else:
                        gradcam_pp_norm = np.zeros((orig_h, orig_w), dtype=np.float32)
                else:
                    gradcam_pp_norm = np.zeros((orig_h, orig_w), dtype=np.float32)

                # 3. Spatial Attention Map (Zagoruyko & Komodakis, 2016)
                # Multi-scale convolutional feature activation energy:
                # Combines Layer 3 (14x14, 256ch - edge & surface texture) with Layer 4 (7x7, 512ch - semantic context)
                if a3 is not None and a4 is not None:
                    attn3 = torch.norm(a3, p=2, dim=1, keepdim=True)
                    attn3_up = F.interpolate(attn3, size=(orig_h, orig_w), mode="bilinear", align_corners=False)[0, 0].detach().cpu().numpy()
                    attn3_norm = (attn3_up - attn3_up.min()) / (attn3_up.max() - attn3_up.min() + 1e-8)

                    attn4 = torch.norm(a4, p=2, dim=1, keepdim=True)
                    attn4_up = F.interpolate(attn4, size=(orig_h, orig_w), mode="bilinear", align_corners=False)[0, 0].detach().cpu().numpy()
                    attn4_norm = (attn4_up - attn4_up.min()) / (attn4_up.max() - attn4_up.min() + 1e-8)

                    multi_attn = 0.55 * attn3_norm + 0.45 * attn4_norm
                    attn_norm = (multi_attn - multi_attn.min()) / (multi_attn.max() - multi_attn.min() + 1e-8)
                elif a4 is not None:
                    attn4 = torch.norm(a4, p=2, dim=1, keepdim=True)
                    attn4_up = F.interpolate(attn4, size=(orig_h, orig_w), mode="bilinear", align_corners=False)[0, 0].detach().cpu().numpy()
                    attn_norm = (attn4_up - attn4_up.min()) / (attn4_up.max() - attn4_up.min() + 1e-8)
                else:
                    attn_norm = np.zeros((orig_h, orig_w), dtype=np.float32)

                # 4. Saliency Map (Simonyan et al., 2013 / Edge-Preserving Gradient Magnitude)
                # Full input-space gradient |dY/dX| with 98th-percentile contrast normalization & bilateral filtering
                if tensor.grad is not None:
                    sal_raw, _ = torch.max(tensor.grad.data.abs(), dim=1)
                    sal_resized = F.interpolate(sal_raw.unsqueeze(1), size=(orig_h, orig_w), mode="bilinear", align_corners=False)[0, 0].detach().cpu().numpy()
                    p98 = np.percentile(sal_resized, 98)
                    sal_clamped = np.clip(sal_resized / (p98 + 1e-8), 0.0, 1.0)
                    sal_filtered = cv2.bilateralFilter((sal_clamped * 255).astype(np.uint8), 9, 75, 75).astype(np.float32) / 255.0
                    if sal_filtered.max() > sal_filtered.min():
                        saliency_norm = (sal_filtered - sal_filtered.min()) / (sal_filtered.max() - sal_filtered.min() + 1e-8)
                    else:
                        saliency_norm = np.zeros((orig_h, orig_w), dtype=np.float32)
                else:
                    saliency_norm = np.zeros((orig_h, orig_w), dtype=np.float32)

            finally:
                h_fwd_l3.remove()
                h_fwd_l4.remove()
                h_bwd_l4.remove()

        # Generate pure heatmaps and blended overlays
        cm_name = colormap_name.lower()
        cm = COLORMAPS.get(cm_name, cv2.COLORMAP_TURBO)

        pure_heatmaps = {}
        blended_overlays = {}
        for method_name, norm_map in [
            ("gradcam", gradcam_norm),
            ("gradcam_pp", gradcam_pp_norm),
            ("attention", attn_norm),
            ("saliency", saliency_norm),
        ]:
            pure_heat = cv2.applyColorMap(np.uint8(255 * norm_map), cm)
            blend_heat = cv2.addWeighted(img_bgr, 1.0 - alpha, pure_heat, alpha, 0)
            pure_heatmaps[method_name] = pure_heat
            blended_overlays[method_name] = blend_heat

        # Quantitative Metrics
        hotspot_threshold = 0.55
        hotspot_pixels = int(np.sum(gradcam_norm >= hotspot_threshold))
        total_pixels = orig_h * orig_w
        hotspot_pct = round((hotspot_pixels / total_pixels) * 100.0, 2)

        crack_prob = float(probs[1]) if len(probs) > 1 else 0.0
        uncracked_prob = float(probs[0]) if len(probs) > 0 else 1.0

        is_crack = crack_prob >= 0.80 or pred_class_idx == 1
        summary = (
            f"The AI model identified critical fracture patterns with {crack_prob * 100:.1f}% confidence. "
            f"Attribution heatmap isolates {hotspot_pct}% of surface area as primary decision driver."
            if is_crack else
            f"Surface screened as sound concrete ({uncracked_prob * 100:.1f}% confidence). "
            f"Activation heatmap shows diffuse low-intensity background response ({hotspot_pct}% hotspot density)."
        )

        return {
            "success": True,
            "target_class": "Cracked" if chosen_class == 1 else "Uncracked",
            "predicted_class": "Cracked" if is_crack else "Uncracked",
            "crack_probability": round(crack_prob, 4),
            "uncracked_probability": round(uncracked_prob, 4),
            "confidence": round(max(crack_prob, uncracked_prob), 4),
            "colormap": cm_name,
            "hotspot_percentage": hotspot_pct,
            "explanation_summary": summary,
            "maps": {
                "gradcam": gradcam_norm,
                "gradcam_pp": gradcam_pp_norm,
                "attention": attn_norm,
                "saliency": saliency_norm,
            },
            "pure_heatmaps": pure_heatmaps,
            "overlays": blended_overlays
        }

    def _generate_fallback_xai(
        self,
        img_bgr: np.ndarray,
        orig_h: int,
        orig_w: int,
        colormap_name: str,
        alpha: float
    ) -> Dict[str, Any]:
        """
        Differentiated classical computer-vision heuristic fallback
        when PyTorch weights are unavailable. Each method produces a distinct visual identity.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enh = clahe.apply(gray)

        # Base gradient magnitude via Sobel
        sobelx = cv2.Sobel(enh, cv2.CV_32F, 1, 0, ksize=3)
        sobely = cv2.Sobel(enh, cv2.CV_32F, 0, 1, ksize=3)
        grad_mag = np.sqrt(sobelx**2 + sobely**2)
        grad_norm = (grad_mag - grad_mag.min()) / (grad_mag.max() - grad_mag.min() + 1e-8)

        # 1. Fallback Saliency: High-resolution edge lines preserving thin fracture paths
        sal_filtered = cv2.bilateralFilter((grad_norm * 255).astype(np.uint8), 7, 50, 50).astype(np.float32) / 255.0
        sal_norm = (sal_filtered - sal_filtered.min()) / (sal_filtered.max() - sal_filtered.min() + 1e-8)

        # 2. Fallback Grad-CAM: Macro low-frequency receptive field heatmap (broad Gaussian blur)
        kernel_sz = max(31, (min(orig_h, orig_w) // 16) | 1)
        gc_blur = cv2.GaussianBlur(grad_norm, (kernel_sz, kernel_sz), 0)
        gc_norm = (gc_blur - gc_blur.min()) / (gc_blur.max() - gc_blur.min() + 1e-8)

        # 3. Fallback Grad-CAM++: High-contrast focal core (squared power curve over 90th percentile)
        p90 = np.percentile(gc_norm, 90)
        gcpp_sharp = np.clip(gc_norm / (p90 + 1e-8), 0.0, 1.0) ** 2.2
        gcpp_norm = (gcpp_sharp - gcpp_sharp.min()) / (gcpp_sharp.max() - gcpp_sharp.min() + 1e-8)

        # 4. Fallback Spatial Attention: Multi-scale structural variance (Sobel gradient + Laplacian texture)
        lap = np.abs(cv2.Laplacian(enh, cv2.CV_32F, ksize=3))
        lap_norm = (lap - lap.min()) / (lap.max() - lap.min() + 1e-8)
        attn_combo = 0.5 * grad_norm + 0.5 * lap_norm
        attn_blur = cv2.GaussianBlur(attn_combo, (15, 15), 0)
        attn_norm = (attn_blur - attn_blur.min()) / (attn_blur.max() - attn_blur.min() + 1e-8)

        cm = COLORMAPS.get(colormap_name.lower(), cv2.COLORMAP_TURBO)
        pure_heatmaps = {}
        blended_overlays = {}

        for m_name, m_map in [
            ("gradcam", gc_norm),
            ("gradcam_pp", gcpp_norm),
            ("attention", attn_norm),
            ("saliency", sal_norm),
        ]:
            pure_heat = cv2.applyColorMap(np.uint8(255 * m_map), cm)
            blend_heat = cv2.addWeighted(img_bgr, 1.0 - alpha, pure_heat, alpha, 0)
            pure_heatmaps[m_name] = pure_heat
            blended_overlays[m_name] = blend_heat

        return {
            "success": True,
            "target_class": "Fallback CV Saliency",
            "predicted_class": "Visual Gradient",
            "crack_probability": 0.50,
            "uncracked_probability": 0.50,
            "confidence": 0.50,
            "colormap": colormap_name,
            "hotspot_percentage": 10.0,
            "explanation_summary": "Differentiated classical computer-vision heuristic explainability maps generated.",
            "maps": {
                "gradcam": gc_norm,
                "gradcam_pp": gcpp_norm,
                "attention": attn_norm,
                "saliency": sal_norm,
            },
            "pure_heatmaps": pure_heatmaps,
            "overlays": blended_overlays,
        }

    def save_xai_artifacts(
        self,
        image_id: str,
        image_input: Union[str, Path, np.ndarray, Image.Image],
        output_dir: Union[str, Path],
        colormap_name: str = "turbo"
    ) -> Dict[str, Any]:
        """
        Executes XAI inference, persists generated JPEG overlays to storage,
        and returns file paths and metadata.
        """
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        cm_name = (colormap_name or "turbo").lower()
        res = self.generate_xai_maps(image_input=image_input, colormap_name=cm_name)

        artifacts = {}
        # Save pure heatmaps
        for method_name, pure_bgr in res.get("pure_heatmaps", {}).items():
            dest_pure = out_path / f"{image_id}_{method_name}_{cm_name}_pure.jpg"
            cv2.imwrite(str(dest_pure), pure_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            artifacts[f"{method_name}_pure"] = str(dest_pure)

        # Save blended overlays
        for method_name, overlay_bgr in res.get("overlays", {}).items():
            dest_blend = out_path / f"{image_id}_{method_name}_{cm_name}_blend.jpg"
            cv2.imwrite(str(dest_blend), overlay_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            artifacts[f"{method_name}_blend"] = str(dest_blend)

            # Default alias for backwards compatibility
            dest_default = out_path / f"{image_id}_{method_name}.jpg"
            cv2.imwrite(str(dest_default), overlay_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            artifacts[method_name] = str(dest_default)

        # Save metadata summary
        meta = {
            "image_id": image_id,
            "target_class": res["target_class"],
            "predicted_class": res["predicted_class"],
            "crack_probability": res["crack_probability"],
            "confidence": res["confidence"],
            "hotspot_percentage": res["hotspot_percentage"],
            "explanation_summary": res["explanation_summary"],
            "colormap": cm_name,
            "files": {k: f"{image_id}_{k}.jpg" for k in artifacts.keys()}
        }
        meta_file = out_path / f"{image_id}_xai.json"
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        res["artifact_files"] = artifacts
        res["metadata_file"] = str(meta_file)
        return res


def get_xai_service() -> ExplainableAIService:
    """Returns singleton ExplainableAIService instance."""
    global _XAI_INSTANCE
    if _XAI_INSTANCE is None:
        _XAI_INSTANCE = ExplainableAIService()
    return _XAI_INSTANCE
