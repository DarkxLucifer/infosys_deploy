import hashlib
import io
from typing import Dict, Any, List, Tuple
from PIL import Image
import numpy as np
import cv2

PROFILES: Dict[str, List[Dict[str, Any]]] = {
    "standard_crack_enhancement": [
        {"step": "resize", "params": {"target_width": 1024, "target_height": 1024}},
        {"step": "noise_reduction", "params": {"ksize": 3, "sigma": 0.8}},
        {"step": "clahe", "params": {"clip_limit": 2.5, "tile_grid_size": 8}},
        {"step": "sharpen", "params": {"strength": 1.2}},
    ],
    "high_contrast_pavement": [
        {"step": "resize", "params": {"target_width": 800, "target_height": 800}},
        {"step": "brightness_correction", "params": {"gamma": 1.2}},
        {"step": "clahe", "params": {"clip_limit": 4.0, "tile_grid_size": 4}},
        {"step": "edge_enhancement", "params": {"weight": 0.3}},
    ],
    "segmentation_benchmark_tile": [
        {"step": "resize", "params": {"target_width": 1024, "target_height": 1024}},
        {"step": "clahe", "params": {"clip_limit": 2.0, "tile_grid_size": 8}},
        {"step": "tile_overlap", "params": {"tile_size": 512, "overlap": 64}},
    ]
}

def apply_clahe(img_rgb: np.ndarray, clip_limit: float = 2.0, grid_size: int = 8) -> np.ndarray:
    lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid_size, grid_size))
    l_clahe = clahe.apply(l)
    merged = cv2.merge((l_clahe, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)

def apply_sharpen(img_rgb: np.ndarray, strength: float = 1.0) -> np.ndarray:
    blurred = cv2.GaussianBlur(img_rgb, (0, 0), 3)
    sharpened = cv2.addWeighted(img_rgb, 1.0 + strength, blurred, -strength, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)

def apply_brightness_gamma(img_rgb: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    inv_gamma = 1.0 / max(gamma, 0.01)
    table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
    return cv2.LUT(img_rgb, table)

def apply_noise_reduction(img_rgb: np.ndarray, ksize: int = 3, sigma: float = 0.8) -> np.ndarray:
    return cv2.GaussianBlur(img_rgb, (ksize, ksize), sigma)

def apply_edge_enhancement(img_rgb: np.ndarray, weight: float = 0.2) -> np.ndarray:
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
    blended = cv2.addWeighted(img_rgb, 1.0, edges_rgb, weight, 0)
    return np.clip(blended, 0, 255).astype(np.uint8)

def apply_perspective_correction(img_rgb: np.ndarray, corners: List[List[float]]) -> np.ndarray:
    pts1 = np.float32(corners)
    width = int(max(np.linalg.norm(pts1[0] - pts1[1]), np.linalg.norm(pts1[2] - pts1[3])))
    height = int(max(np.linalg.norm(pts1[0] - pts1[3]), np.linalg.norm(pts1[1] - pts1[2])))
    pts2 = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    return cv2.warpPerspective(img_rgb, matrix, (width, height))

def run_preprocessing_pipeline(
    image_bytes: bytes,
    profile_name: str = "standard_crack_enhancement",
    custom_steps: List[Dict[str, Any]] = None
) -> Tuple[bytes, str, List[Dict[str, Any]]]:
    """
    Executes a deterministic, byte-reproducible preprocessing pipeline (Phase 4, K1-K3).
    Returns (processed_png_bytes, sha256_checksum, steps_record).
    """
    steps = custom_steps or PROFILES.get(profile_name, PROFILES["standard_crack_enhancement"])

    # Load image deterministically
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    np_img = np.array(pil_img)

    steps_record = []

    for step_cfg in steps:
        step_name = step_cfg["step"]
        params = step_cfg.get("params", {})

        if step_name == "resize":
            w = params.get("target_width", np_img.shape[1])
            h = params.get("target_height", np_img.shape[0])
            np_img = cv2.resize(np_img, (w, h), interpolation=cv2.INTER_AREA)
            steps_record.append({"step": "resize", "params": {"width": w, "height": h}})

        elif step_name == "noise_reduction":
            ksize = params.get("ksize", 3)
            sigma = params.get("sigma", 0.8)
            np_img = apply_noise_reduction(np_img, ksize, sigma)
            steps_record.append({"step": "noise_reduction", "params": {"ksize": ksize, "sigma": sigma}})

        elif step_name == "clahe":
            clip = params.get("clip_limit", 2.0)
            grid = params.get("tile_grid_size", 8)
            np_img = apply_clahe(np_img, clip, grid)
            steps_record.append({"step": "clahe", "params": {"clip_limit": clip, "tile_grid_size": grid}})

        elif step_name == "sharpen":
            strength = params.get("strength", 1.0)
            np_img = apply_sharpen(np_img, strength)
            steps_record.append({"step": "sharpen", "params": {"strength": strength}})

        elif step_name == "brightness_correction":
            gamma = params.get("gamma", 1.0)
            np_img = apply_brightness_gamma(np_img, gamma)
            steps_record.append({"step": "brightness_correction", "params": {"gamma": gamma}})

        elif step_name == "edge_enhancement":
            weight = params.get("weight", 0.2)
            np_img = apply_edge_enhancement(np_img, weight)
            steps_record.append({"step": "edge_enhancement", "params": {"weight": weight}})

        elif step_name == "perspective_correction":
            corners = params.get("corners")
            if corners and len(corners) == 4:
                np_img = apply_perspective_correction(np_img, corners)
                steps_record.append({"step": "perspective_correction", "params": {"corners": corners}})

        elif step_name == "tile_overlap":
            # Deterministic tiling verification step
            tile_size = params.get("tile_size", 512)
            steps_record.append({"step": "tile_overlap", "params": {"tile_size": tile_size, "overlap": params.get("overlap", 64)}})

    # Encode to PNG with constant compression level for deterministic, byte-identical output
    out_pil = Image.fromarray(np_img)
    buf = io.BytesIO()
    out_pil.save(buf, format="PNG", optimize=False)
    processed_bytes = buf.getvalue()

    checksum = hashlib.sha256(processed_bytes).hexdigest()
    return processed_bytes, checksum, steps_record
