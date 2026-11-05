import os
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Union, List
import numpy as np
from PIL import Image
import io

from app.config import settings

logger = logging.getLogger("infrascan.classifier")

# Default metadata and contract for ResNet-18
DEFAULT_METADATA = {
    "model_name": "InfraScan Concrete Crack Classifier (ResNet-18)",
    "version": "1.0.0",
    "project_model_version": "v1.0",
    "architecture": "resnet18",
    "classes": ["Uncracked", "Cracked"],
    "decision_threshold": 0.80,
    "input": {
        "size": [224, 224],
        "channels": 3,
        "resize": "bilinear to 224x224, no crop",
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225]
    },
    "supported_tasks": ["binary_crack_classification"],
    "unsupported_tasks": ["yolo_detection", "unet_segmentation"]
}

class CrackClassifier:
    """
    InfraScan Model v1.0 — Crack Classification Service (ResNet-18).
    Wraps the trained ResNet-18 model (ONNX Runtime, TorchScript, or PyTorch fallback).
    Includes Multi-Scale Spatial Preprocessing to reliably detect fine hairline cracks.
    """

    def __init__(self, model_dir: Optional[str] = None):
        if model_dir is not None:
            self.model_dir = Path(model_dir)
            self._allow_fallback = False
        else:
            candidate_dirs = [
                Path(getattr(settings, "MODEL_DIR", "")) if getattr(settings, "MODEL_DIR", None) else None,
                Path(r"d:\project\aiml prime\project\infosys\storage\models"),
                Path(r"C:\Users\yashr\Downloads\infrascan_crack_results\models"),
                Path(r"C:\Users\yashr\Downloads\checkpoints-20261028T135647Z-1-001\checkpoints")
            ]
            self.model_dir = next((d for d in candidate_dirs if d and d.exists()), Path(r"d:\project\aiml prime\project\infosys\storage\models"))
            self._allow_fallback = True

        # Primary filenames
        model_name = getattr(settings, "MODEL_FILENAME", "infrascan_crack_resnet18.onnx")
        ts_name = getattr(settings, "TORCHSCRIPT_FILENAME", "infrascan_crack_resnet18_torchscript.pt")
        meta_name = getattr(settings, "METADATA_FILENAME", "model_metadata.json")

        self.onnx_path = self.model_dir / model_name
        self.torchscript_path = self.model_dir / ts_name
        self.metadata_path = self.model_dir / meta_name

        self.metadata = DEFAULT_METADATA.copy()
        self.is_loaded = False
        self.engine_type: Optional[str] = None
        self.session = None
        self.torch_model = None
        self.error_message: Optional[str] = None

        self._load_metadata()
        self._load_model()

    @property
    def model_name(self) -> str:
        return self.metadata.get("model_name", "InfraScan Model v1.0 (ResNet18)")

    @property
    def version(self) -> str:
        return self.metadata.get("project_model_version", "v1.0")

    @property
    def labels(self) -> List[str]:
        return self.metadata.get("classes", ["Uncracked", "Cracked"])

    @property
    def decision_threshold(self) -> float:
        return float(self.metadata.get("decision_threshold", 0.80))

    @property
    def load_error(self) -> Optional[str]:
        return self.error_message

    def _load_metadata(self):
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    self.metadata.update(loaded)
                logger.info("Loaded model metadata from %s", self.metadata_path)
            except Exception as e:
                logger.warning("Failed to parse metadata file %s: %s. Using defaults.", self.metadata_path, e)
        else:
            logger.info("Metadata file not found at %s. Using embedded defaults.", self.metadata_path)

    def _load_model(self):
        if not self._allow_fallback and not self.model_dir.exists():
            self.is_loaded = False
            self.error_message = f"Model directory not found: {self.model_dir}"
            return

        # 1. Search candidate paths for ONNX file
        if self._allow_fallback:
            candidate_onnx = [
                self.onnx_path,
                self.model_dir / "infrascan_crack_resnet18.onnx",
                Path(r"d:\project\aiml prime\project\infosys\storage\models\infrascan_crack_resnet18.onnx"),
                Path(r"C:\Users\yashr\Downloads\infrascan_crack_results\models\infrascan_crack_resnet18.onnx"),
                self.model_dir / "infrascan_crack_resnet50.onnx",
                Path(r"C:\Users\yashr\Downloads\infrascan_crack_results\models\infrascan_crack_resnet50.onnx")
            ]
        else:
            candidate_onnx = [self.onnx_path, self.model_dir / "infrascan_crack_resnet18.onnx"]

        for op in candidate_onnx:
            if op.exists():
                try:
                    import onnxruntime as ort
                    opts = ort.SessionOptions()
                    opts.intra_op_num_threads = 2
                    providers = ["CPUExecutionProvider"]
                    if "CUDAExecutionProvider" in ort.get_available_providers():
                        providers.insert(0, "CUDAExecutionProvider")

                    self.session = ort.InferenceSession(str(op), sess_options=opts, providers=providers)
                    self.engine_type = "onnx"
                    self.onnx_path = op
                    self.is_loaded = True
                    self.error_message = None
                    logger.info("Successfully loaded ONNX model from %s using %s", op, providers)
                    return
                except Exception as e:
                    logger.warning("Failed to load ONNX model (%s): %s. Attempting fallback.", op, e)
                    self.error_message = f"ONNX load error: {e}"

        # 2. Try TorchScript fallback
        if self._allow_fallback:
            candidate_ts = [
                self.torchscript_path,
                self.model_dir / "infrascan_crack_resnet18_torchscript.pt",
                Path(r"d:\project\aiml prime\project\infosys\storage\models\infrascan_crack_resnet18_torchscript.pt"),
                Path(r"C:\Users\yashr\Downloads\infrascan_crack_results\models\infrascan_crack_resnet18_torchscript.pt")
            ]
        else:
            candidate_ts = [self.torchscript_path, self.model_dir / "infrascan_crack_resnet18_torchscript.pt"]

        for tp in candidate_ts:
            if tp.exists():
                try:
                    import torch
                    self.torch_model = torch.jit.load(str(tp), map_location=torch.device("cpu"))
                    self.torch_model.eval()
                    self.engine_type = "torchscript"
                    self.torchscript_path = tp
                    self.is_loaded = True
                    self.error_message = None
                    logger.info("Successfully loaded TorchScript model from %s", tp)
                    return
                except Exception as e:
                    logger.error("Failed to load TorchScript model (%s): %s", tp, e)
                    self.error_message = f"TorchScript load error: {e}"

        # 3. Direct PyTorch model with state_dict
        if self._allow_fallback:
            candidate_weights = [
                self.model_dir / "infrascan_crack_resnet18_weights.pth",
                self.model_dir / "resnet18_best.pth",
                Path(r"C:\Users\yashr\Downloads\checkpoints-20261028T135647Z-1-001\checkpoints\resnet18_best.pth")
            ]
        else:
            candidate_weights = [self.model_dir / "infrascan_crack_resnet18_weights.pth", self.model_dir / "resnet18_best.pth"]

        for wp in candidate_weights:
            if wp.exists():
                try:
                    import torch
                    import torch.nn as nn
                    from torchvision import models
                    m = models.resnet18(weights=None)
                    m.fc = nn.Sequential(nn.Dropout(0.2), nn.Linear(512, 2))
                    ckpt = torch.load(wp, map_location="cpu")
                    state = ckpt["model"] if isinstance(ckpt, dict) and "model" in ckpt else ckpt
                    m.load_state_dict(state)
                    m.eval()
                    self.torch_model = m
                    self.engine_type = "pytorch"
                    self.is_loaded = True
                    self.error_message = None
                    logger.info("Successfully loaded PyTorch ResNet-18 model from %s", wp)
                    return
                except Exception as e:
                    logger.error("Failed to load PyTorch weights (%s): %s", wp, e)

        logger.error("No valid model file could be loaded from %s", self.model_dir)
        self.is_loaded = False
        if not self.error_message:
            self.error_message = f"Model files not found in {self.model_dir}"

    def preprocess_image(self, image_input: Union[str, Path, bytes, Image.Image, np.ndarray]) -> np.ndarray:
        """
        Applies standard ImageNet preprocessing:
        - Bilinear resize to 224x224 (no distortion cropping)
        - Convert to RGB
        - Scale to [0, 1]
        - Normalize with ImageNet mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225]
        - Output tensor shape: (1, 3, 224, 224) float32
        """
        if isinstance(image_input, (str, Path)):
            img = Image.open(str(image_input))
        elif isinstance(image_input, bytes):
            img = Image.open(io.BytesIO(image_input))
        elif isinstance(image_input, np.ndarray):
            if image_input.ndim == 3 and image_input.shape[2] == 3:
                import cv2
                rgb = cv2.cvtColor(image_input, cv2.COLOR_BGR2RGB)
                img = Image.fromarray(rgb)
            else:
                img = Image.fromarray(image_input)
        elif isinstance(image_input, Image.Image):
            img = image_input
        else:
            raise ValueError(f"Unsupported image input type: {type(image_input)}")

        if img.mode != "RGB":
            img = img.convert("RGB")

        # Bilinear resize to 224x224
        img_resized = img.resize((224, 224), Image.BILINEAR)

        arr = np.array(img_resized, dtype=np.float32) / 255.0  # (224, 224, 3)

        mean = np.array(self.metadata["input"]["mean"], dtype=np.float32)
        std = np.array(self.metadata["input"]["std"], dtype=np.float32)

        norm_arr = (arr - mean) / std
        # Transpose to (3, 224, 224) then add batch dimension (1, 3, 224, 224)
        tensor = np.transpose(norm_arr, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0).astype(np.float32)
        return tensor

    def predict(self, image_input: Union[str, Path, bytes, Image.Image, np.ndarray]) -> Dict[str, Any]:
        """
        Runs multi-scale spatial inference on an image and returns classification probabilities and decision.
        """
        threshold = float(self.metadata.get("decision_threshold", 0.80))
        model_name = self.metadata.get("model_name", "InfraScan Concrete Crack Classifier (ResNet-18)")
        version = self.metadata.get("project_model_version", "v1.0")

        if not self.is_loaded:
            return {
                "success": False,
                "has_crack": False,
                "predicted_class": "Uncertain",
                "confidence": 0.0,
                "crack_probability": 0.0,
                "uncracked_probability": 0.0,
                "threshold": threshold,
                "model_name": model_name,
                "model_version": version,
                "engine": None,
                "status": "model_not_loaded",
                "error": self.error_message or "Model is not loaded"
            }

        try:
            # Multi-scale spatial inspection: full image + center focus + central bands
            base_img = None
            if isinstance(image_input, (str, Path)):
                base_img = Image.open(str(image_input))
            elif isinstance(image_input, bytes):
                base_img = Image.open(io.BytesIO(image_input))
            elif isinstance(image_input, np.ndarray):
                if image_input.ndim == 3 and image_input.shape[2] == 3:
                    import cv2
                    rgb = cv2.cvtColor(image_input, cv2.COLOR_BGR2RGB)
                    base_img = Image.fromarray(rgb)
                else:
                    base_img = Image.fromarray(image_input)
            elif isinstance(image_input, Image.Image):
                base_img = image_input

            if base_img is not None:
                if base_img.mode != "RGB":
                    base_img = base_img.convert("RGB")
                w, h = base_img.size

                # Multi-scale inspection: Global + Center focus + Horizontal band + Vertical band
                patches = [
                    base_img,
                    base_img.crop((int(w * 0.12), int(h * 0.12), int(w * 0.88), int(h * 0.88))),
                    base_img.crop((0, int(h * 0.20), w, int(h * 0.80))),
                    base_img.crop((int(w * 0.20), 0, int(w * 0.80), h)),
                ]
            else:
                patches = [image_input]

            all_p_cracked = []
            all_p_uncracked = []

            for p in patches:
                tensor = self.preprocess_image(p)

                if self.engine_type == "onnx" and self.session is not None:
                    input_name = self.session.get_inputs()[0].name
                    outputs = self.session.run(None, {input_name: tensor})
                    logits = outputs[0][0]  # shape (2,)
                elif self.engine_type in ("torchscript", "pytorch") and self.torch_model is not None:
                    import torch
                    with torch.no_grad():
                        inp = torch.from_numpy(tensor)
                        out = self.torch_model(inp)
                        logits = out.cpu().numpy()[0]
                else:
                    raise RuntimeError("No active model inference engine found.")

                # Softmax calculation: Index 0 is Uncracked, Index 1 is Cracked
                e_x = np.exp(logits - np.max(logits))
                probs = e_x / e_x.sum(axis=0)
                all_p_uncracked.append(float(probs[0]))
                all_p_cracked.append(float(probs[1]))

            # Maximal crack response across scales
            p_cracked = max(all_p_cracked)
            idx_max = all_p_cracked.index(p_cracked)
            p_uncracked = all_p_uncracked[idx_max]

            # Positive crack decision when p_cracked >= calibrated threshold
            has_crack = bool(p_cracked >= threshold)
            predicted_class = "Cracked" if has_crack else "Uncracked"
            confidence = float(p_cracked if has_crack else p_uncracked)

            return {
                "success": True,
                "has_crack": has_crack,
                "predicted_class": predicted_class,
                "confidence": round(confidence, 4),
                "crack_probability": round(p_cracked, 4),
                "uncracked_probability": round(p_uncracked, 4),
                "threshold": round(threshold, 6),
                "model_name": model_name,
                "model_version": version,
                "engine": self.engine_type,
                "status": "completed",
                "error": None
            }

        except Exception as e:
            logger.exception("Error running ResNet18 inference: %s", e)
            return {
                "success": False,
                "has_crack": False,
                "predicted_class": "Uncertain",
                "confidence": 0.0,
                "crack_probability": 0.0,
                "uncracked_probability": 0.0,
                "threshold": threshold,
                "model_name": model_name,
                "model_version": version,
                "engine": self.engine_type,
                "status": "failed",
                "error": str(e)
            }

    def get_status(self) -> Dict[str, Any]:
        """Returns the current model status and supported tasks."""
        return {
            "model_name": self.metadata.get("model_name", "InfraScan Concrete Crack Classifier (ResNet-18)"),
            "model_version": self.metadata.get("project_model_version", "v1.0"),
            "full_version": self.metadata.get("version", "1.0.0"),
            "architecture": self.metadata.get("architecture", "resnet18"),
            "is_loaded": self.is_loaded,
            "engine": self.engine_type,
            "model_dir": str(self.model_dir),
            "decision_threshold": float(self.metadata.get("decision_threshold", 0.80)),
            "supported_tasks": ["binary_crack_classification"],
            "future_tasks": {
                "yolo_detection": "v1.2 (Weights not loaded)",
                "unet_segmentation": "v2.0 (Weights not loaded)"
            },
            "classes": self.metadata.get("classes", ["Uncracked", "Cracked"]),
            "error": self.error_message
        }


# Aliases for backward compatibility
ResNet18CrackClassifier = CrackClassifier
ResNet50CrackClassifier = CrackClassifier

# Global classifier instance
_classifier_instance: Optional[CrackClassifier] = None

def get_classifier() -> CrackClassifier:
    """Singleton getter for the classifier service."""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = CrackClassifier()
    return _classifier_instance
