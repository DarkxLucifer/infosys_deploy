"""
InfraScan Crack Geometry Extraction Engine
===========================================
Deterministic computer vision service for extracting engineering geometry
from trained U-Net binary crack segmentation masks:
- Overall surface area, crack coverage %, unaffected surface %
- Connected components analysis (CR-001, CR-002, ...)
- Skeletonization and rigorous centerline length (orthogonal & diagonal weighting)
- Euclidean Distance Transform for local crack thickness (mean, median, max)
- PCA dominant orientation in [0, 180 degrees)
- Bounding box, centroid, perimeter, branch junctions
- Physical calibration scaling (mm, mm²) when optical calibration is present
- High-definition engineering visualization overlay with HUD metrics
"""

import os
import math
import logging
from typing import Dict, Any, Optional, Tuple, List, Union
from pathlib import Path
import cv2
import numpy as np
from skimage.morphology import skeletonize

logger = logging.getLogger("infrascan.geometry")

SQRT2 = math.sqrt(2.0)

# 4 forward offsets to count each 8-connected undirected edge exactly once
_FORWARD_EDGE_OFFSETS = [
    (0, 1, 1.0),
    (1, 0, 1.0),
    (1, 1, SQRT2),
    (1, -1, SQRT2),
]

_ALL_8_OFFSETS = [
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1)
]


def compute_skeleton_centerline(skel_bool: np.ndarray) -> Tuple[float, int, List[List[int]], List[List[int]]]:
    """
    Computes exact centerline length by traversing the skeleton pixel graph:
    - Distinguishes orthogonal (1.0) and diagonal (sqrt(2)) pixel steps.
    - Does NOT use bounding-box diagonals or simple Manhattan counts.
    - Detects bifurcation / branch junction points (degree >= 3).
    - Subsamples centerline points for frontend vector rendering.
    """
    r_idx, c_idx = np.where(skel_bool)
    n_pixels = len(r_idx)
    if n_pixels == 0:
        return 0.0, 0, [], []
    if n_pixels == 1:
        return 1.0, 0, [], [[int(c_idx[0]), int(r_idx[0])]]

    skel_set = set(zip(r_idx, c_idx))
    total_length = 0.0
    branch_count = 0
    branch_points = []

    for r, c in zip(r_idx, c_idx):
        # 8-neighbor count
        nbr_count = sum(1 for dr, dc in _ALL_8_OFFSETS if (r + dr, c + dc) in skel_set)
        if nbr_count >= 3:
            branch_count += 1
            branch_points.append([int(c), int(r)])

        # Edge length integration
        for dr, dc, weight in _FORWARD_EDGE_OFFSETS:
            if (r + dr, c + dc) in skel_set:
                total_length += weight

    if total_length == 0.0:
        total_length = float(n_pixels)

    # Subsample skeleton points for efficient frontend rendering (max 100 points)
    step = max(1, n_pixels // 80)
    subsampled = [[int(c_idx[k]), int(r_idx[k])] for k in range(0, n_pixels, step)]

    return round(float(total_length), 2), branch_count, branch_points, subsampled


def compute_crack_widths(comp_mask: np.ndarray, skel_bool: np.ndarray) -> Tuple[float, float, float]:
    """
    Uses Euclidean Distance Transform (cv2.DIST_L2) to compute local crack thickness.
    Along the skeleton centerline, width = 2 * distance_to_boundary.
    Returns (avg_width_px, median_width_px, max_width_px).
    """
    dist_map = cv2.distanceTransform(comp_mask, cv2.DIST_L2, 5)
    
    # Sample distances at skeleton pixels
    skel_coords = np.where(skel_bool)
    if len(skel_coords[0]) > 0:
        raw_distances = dist_map[skel_coords]
        widths = raw_distances * 2.0
    else:
        # Fallback to non-zero pixels if skeleton is degenerate
        nonzero_dists = dist_map[comp_mask > 0]
        widths = nonzero_dists * 2.0 if len(nonzero_dists) > 0 else np.array([1.0])

    if len(widths) == 0:
        return 1.0, 1.0, 1.0

    avg_w = float(np.mean(widths))
    med_w = float(np.median(widths))
    max_w = float(np.max(widths))

    return (
        round(max(1.0, avg_w), 2),
        round(max(1.0, med_w), 2),
        round(max(1.0, max_w), 2)
    )


def compute_orientation_pca(coords_xy: np.ndarray) -> float:
    """
    Computes principal orientation in degrees [0, 180) using Principal Component Analysis (PCA).
    0 deg = horizontal, 90 deg = vertical.
    """
    if len(coords_xy) < 2:
        return 0.0

    pts = coords_xy.astype(np.float64)
    mean = np.mean(pts, axis=0)
    centered = pts - mean

    cov = np.cov(centered, rowvar=False)
    if cov.shape != (2, 2):
        return 0.0

    evals, evecs = np.linalg.eigh(cov)
    principal_vec = evecs[:, np.argmax(evals)]  # [vx, vy]

    # vx along X, vy along Y
    angle_rad = math.atan2(principal_vec[1], principal_vec[0])
    deg = math.degrees(angle_rad) % 180.0
    return round(float(deg), 1)


def rule_suggest_crack_type(orientation: float, branch_count: int, length_px: float, avg_width_px: float) -> str:
    """
    Deterministic rule-based structural crack type classification based purely on geometry.
    """
    if branch_count >= 4 or (branch_count >= 2 and length_px > 300 and avg_width_px > 8):
        return "Alligator / Interconnected"
    if orientation <= 25.0 or orientation >= 155.0:
        return "Transverse (Horizontal)"
    if 65.0 <= orientation <= 115.0:
        return "Longitudinal (Vertical)"
    return "Diagonal / Oblique"


def extract_crack_geometry(
    original_image: Union[str, Path, np.ndarray],
    binary_mask: Union[str, Path, np.ndarray],
    orig_w: Optional[int] = None,
    orig_h: Optional[int] = None,
    surface_mask: Optional[Union[str, Path, np.ndarray]] = None,
    calibration: Optional[Dict[str, Any]] = None,
    mm_per_pixel: Optional[float] = None,
    min_region_area_px: int = 10,
    generate_visualization: bool = True,
    visualization_save_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Core geometry extraction function for InfraScan.

    Inputs:
    1. original_image: filepath or BGR image ndarray.
    2. binary_mask: filepath or mask ndarray (nonzero/255 = crack, 0 = background).
    3. orig_w, orig_h: optional expected width and height.
    4. surface_mask: optional mask identifying valid inspected road/concrete surface.
    5. calibration: optional dict containing mm_per_pixel and optical scale info.
    6. mm_per_pixel: optional direct physical scale.
    7. min_region_area_px: noise filtering cutoff (default 10 px).
    8. generate_visualization: whether to render the engineering HUD visualizer.
    9. visualization_save_path: path to save rendered overlay image.

    Returns:
    A complete dictionary of image-level summary metrics, individual crack measurements,
    and visualization references.
    """
    # 1. Load Original Image
    if isinstance(original_image, (str, Path)):
        img_bgr = cv2.imread(str(original_image))
    elif isinstance(original_image, np.ndarray):
        img_bgr = original_image.copy()
    else:
        raise ValueError("Invalid original_image type")

    if img_bgr is None:
        raise ValueError("Could not read original image")

    actual_h, actual_w = img_bgr.shape[:2]
    target_w = orig_w or actual_w
    target_h = orig_h or actual_h

    # 2. Load and Normalize Binary Mask
    if isinstance(binary_mask, (str, Path)):
        mask_raw = cv2.imread(str(binary_mask), cv2.IMREAD_GRAYSCALE)
    elif isinstance(binary_mask, np.ndarray):
        mask_raw = binary_mask.copy()
    else:
        raise ValueError("Invalid binary_mask type")

    if mask_raw is None:
        raise ValueError("Could not read binary mask")

    # If mask is 3-channel, convert to grayscale
    if len(mask_raw.shape) == 3:
        mask_raw = cv2.cvtColor(mask_raw, cv2.COLOR_BGR2GRAY)

    # Normalize polarity and threshold
    if mask_raw.dtype == np.float32 or mask_raw.dtype == np.float64:
        mask_bin = (mask_raw >= 0.5).astype(np.uint8) * 255
    else:
        mask_bin = (mask_raw > 127).astype(np.uint8) * 255

    # Resize mask to original photograph dimensions if needed
    if mask_bin.shape[:2] != (actual_h, actual_w):
        mask_bin = cv2.resize(mask_bin, (actual_w, actual_h), interpolation=cv2.INTER_NEAREST)

    # 3. Handle Inspected Surface Mask (if provided)
    surface_mask_bin = None
    has_surface_mask = False
    if surface_mask is not None:
        if isinstance(surface_mask, (str, Path)) and os.path.exists(str(surface_mask)):
            s_raw = cv2.imread(str(surface_mask), cv2.IMREAD_GRAYSCALE)
        elif isinstance(surface_mask, np.ndarray):
            s_raw = surface_mask
        else:
            s_raw = None

        if s_raw is not None:
            if s_raw.shape[:2] != (actual_h, actual_w):
                s_raw = cv2.resize(s_raw, (actual_w, actual_h), interpolation=cv2.INTER_NEAREST)
            surface_mask_bin = (s_raw > 127).astype(np.uint8) * 255
            has_surface_mask = True
            # Constrain crack mask to inspected surface
            mask_bin = cv2.bitwise_and(mask_bin, surface_mask_bin)

    # Surface pixel count
    if has_surface_mask and surface_mask_bin is not None:
        inspected_surface_area_px = int(np.count_nonzero(surface_mask_bin > 0))
    else:
        inspected_surface_area_px = int(actual_w * actual_h)

    # 4. Overall Surface Metrics
    total_crack_area_px = int(np.count_nonzero(mask_bin > 0))
    unaffected_surface_area_px = max(0, inspected_surface_area_px - total_crack_area_px)

    crack_coverage_pct = (
        round((total_crack_area_px / inspected_surface_area_px) * 100.0, 4)
        if inspected_surface_area_px > 0
        else 0.0
    )
    unaffected_surface_pct = round(100.0 - crack_coverage_pct, 4)

    # 5. Calibration Handling
    scale_factor = None
    if mm_per_pixel is not None and mm_per_pixel > 0:
        scale_factor = float(mm_per_pixel)
    elif calibration and isinstance(calibration, dict):
        candidate = calibration.get("mm_per_pixel") or calibration.get("mm_per_px")
        if candidate and float(candidate) > 0:
            scale_factor = float(candidate)

    is_calibrated = scale_factor is not None

    # 6. Connected Components Analysis for Individual Cracks
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_bin, connectivity=8)

    cracks: List[Dict[str, Any]] = []
    total_crack_length_px = 0.0
    all_widths_px: List[float] = []

    # Sort labels by area descending (excluding background label 0)
    candidate_labels = [
        (lbl, stats[lbl, cv2.CC_STAT_AREA])
        for lbl in range(1, num_labels)
        if stats[lbl, cv2.CC_STAT_AREA] >= min_region_area_px
    ]
    candidate_labels.sort(key=lambda item: item[1], reverse=True)

    for idx, (label_id, area_val) in enumerate(candidate_labels):
        crack_id = f"CR-{idx + 1:03d}"
        
        # Component binary mask
        comp_mask = (labels == label_id).astype(np.uint8) * 255
        
        # Bounding box & Centroid
        x = int(stats[label_id, cv2.CC_STAT_LEFT])
        y = int(stats[label_id, cv2.CC_STAT_TOP])
        w = int(stats[label_id, cv2.CC_STAT_WIDTH])
        h = int(stats[label_id, cv2.CC_STAT_HEIGHT])
        cx = round(float(centroids[label_id][0]), 1)
        cy = round(float(centroids[label_id][1]), 1)

        # Skeletonization & Centerline Length
        skel = skeletonize(comp_mask > 0)
        length_px, branch_count, branch_points, skel_points = compute_skeleton_centerline(skel)
        total_crack_length_px += length_px

        # Crack Width via Distance Transform
        avg_w_px, med_w_px, max_w_px = compute_crack_widths(comp_mask, skel)
        all_widths_px.append(avg_w_px)

        # Dominant Orientation via PCA
        coords_rc = np.argwhere(comp_mask > 0)
        # Flip to (x, y) coordinates for PCA
        coords_xy = np.column_stack([coords_rc[:, 1], coords_rc[:, 0]]) if len(coords_rc) > 0 else np.empty((0, 2))
        orientation_deg = compute_orientation_pca(coords_xy)

        # Perimeter & Simplified Contour Polygon
        contours, _ = cv2.findContours(comp_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            perimeter_px = round(float(cv2.arcLength(contours[0], True)), 2)
            # Simplify polygon for web visualization
            epsilon = max(1.0, cv2.arcLength(contours[0], True) * 0.005)
            approx = cv2.approxPolyDP(contours[0], epsilon, True)
            contour_poly = [[int(pt[0][0]), int(pt[0][1])] for pt in approx]
        else:
            perimeter_px = 0.0
            contour_poly = []

        # Rule suggestion
        suggestion = rule_suggest_crack_type(orientation_deg, branch_count, length_px, avg_w_px)

        # Physical units if calibrated
        crack_data: Dict[str, Any] = {
            "id": crack_id,
            "area_px": int(area_val),
            "length_px": length_px,
            "avg_width_px": avg_w_px,
            "median_width_px": med_w_px,
            "max_width_px": max_w_px,
            "orientation_deg": orientation_deg,
            "perimeter_px": perimeter_px,
            "branch_count": branch_count,
            "suggested_type": suggestion,
            "bbox": {"x": x, "y": y, "w": w, "h": h},
            "centroid": {"x": cx, "y": cy},
            "skeleton_points": skel_points,
            "contour_points": contour_poly,
            "branch_points": branch_points,
        }

        if is_calibrated and scale_factor:
            crack_data.update({
                "area_mm2": round(area_val * (scale_factor ** 2), 2),
                "length_mm": round(length_px * scale_factor, 2),
                "avg_width_mm": round(avg_w_px * scale_factor, 2),
                "median_width_mm": round(med_w_px * scale_factor, 2),
                "max_width_mm": round(max_w_px * scale_factor, 2),
                "perimeter_mm": round(perimeter_px * scale_factor, 2),
            })
        else:
            crack_data.update({
                "area_mm2": None,
                "length_mm": None,
                "avg_width_mm": None,
                "median_width_mm": None,
                "max_width_mm": None,
                "perimeter_mm": None,
            })

        cracks.append(crack_data)

    # 7. Aggregate Summary Metrics
    total_crack_length_px = round(total_crack_length_px, 2)
    avg_crack_width_px = round(float(np.mean(all_widths_px)), 2) if all_widths_px else 0.0
    max_crack_width_px = round(float(np.max([c["max_width_px"] for c in cracks])), 2) if cracks else 0.0

    summary: Dict[str, Any] = {
        "total_crack_area_px": total_crack_area_px,
        "inspected_surface_area_px": inspected_surface_area_px,
        "unaffected_surface_area_px": unaffected_surface_area_px,
        "crack_coverage_pct": crack_coverage_pct,
        "unaffected_surface_pct": unaffected_surface_pct,
        "crack_count": len(cracks),
        "total_crack_length_px": total_crack_length_px,
        "average_crack_width_px": avg_crack_width_px,
        "maximum_crack_width_px": max_crack_width_px,
        "has_surface_mask": has_surface_mask,
        "is_calibrated": is_calibrated,
        "mm_per_pixel": scale_factor,
        "unit": "mm" if is_calibrated else "px",
        "image_width": actual_w,
        "image_height": actual_h,
    }

    if is_calibrated and scale_factor:
        summary.update({
            "total_crack_area_mm2": round(total_crack_area_px * (scale_factor ** 2), 2),
            "inspected_surface_area_mm2": round(inspected_surface_area_px * (scale_factor ** 2), 2),
            "unaffected_surface_area_mm2": round(unaffected_surface_area_px * (scale_factor ** 2), 2),
            "total_crack_length_mm": round(total_crack_length_px * scale_factor, 2),
            "average_crack_width_mm": round(avg_crack_width_px * scale_factor, 2),
            "maximum_crack_width_mm": round(max_crack_width_px * scale_factor, 2),
        })
    else:
        summary.update({
            "total_crack_area_mm2": None,
            "inspected_surface_area_mm2": None,
            "unaffected_surface_area_mm2": None,
            "total_crack_length_mm": None,
            "average_crack_width_mm": None,
            "maximum_crack_width_mm": None,
        })

    # 8. Dedicated Geometry Visualization Generation
    visualization_path = None
    if generate_visualization:
        if visualization_save_path:
            out_path = Path(visualization_save_path)
        else:
            out_dir = Path("storage/geometry")
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / "temp_geometry_viz.jpg"

        out_path.parent.mkdir(parents=True, exist_ok=True)
        generate_geometry_visualization(
            img_bgr=img_bgr,
            crack_mask=mask_bin,
            cracks=cracks,
            summary=summary,
            save_path=str(out_path)
        )
        visualization_path = str(out_path)

    return {
        "success": True,
        "summary": summary,
        "cracks": cracks,
        "visualization_path": visualization_path,
        "version": "1.0.0-infrascan-geometry",
    }


def generate_geometry_visualization(
    img_bgr: np.ndarray,
    crack_mask: np.ndarray,
    cracks: List[Dict[str, Any]],
    summary: Dict[str, Any],
    save_path: str
) -> str:
    """
    Renders an engineering-grade visualization of crack geometry:
    - Base photo with subtle contrast.
    - Semi-transparent neon tinted mask for crack regions.
    - High-contrast electric cyan/lime centerline path.
    - Magenta dots for branching / bifurcation nodes.
    - Distinct ID badges and dimensions for each crack region.
    - Top HUD info banner summarizing primary coverage and dimensions.
    """
    canvas = img_bgr.copy()
    h, w = canvas.shape[:2]

    # Semi-transparent tinted crack region (Crimson/Coral tint)
    if np.any(crack_mask > 0):
        color_layer = np.zeros_like(canvas)
        color_layer[crack_mask > 0] = [30, 40, 230]  # Crimson red in BGR
        mask_bool = crack_mask > 0
        canvas[mask_bool] = cv2.addWeighted(canvas[mask_bool], 0.50, color_layer[mask_bool], 0.50, 0)

    # Distinct palette for individual cracks
    PALETTE = [
        (255, 220, 0),    # Cyan/Sky
        (0, 255, 128),    # Spring green
        (0, 200, 255),    # Amber/Yellow
        (255, 100, 180),  # Pink/Violet
        (100, 240, 255),  # Electric yellow
        (200, 150, 255),  # Lavender
    ]

    # Draw individual crack features
    for idx, c in enumerate(cracks):
        color = PALETTE[idx % len(PALETTE)]
        cid = c["id"]
        bbox = c["bbox"]
        cx = int(c["centroid"]["x"])
        cy = int(c["centroid"]["y"])

        # Thin bounding box
        cv2.rectangle(
            canvas,
            (bbox["x"], bbox["y"]),
            (bbox["x"] + bbox["w"], bbox["y"] + bbox["h"]),
            color,
            1,
            cv2.LINE_AA
        )

        # Draw centerline skeleton points
        skel_pts = c.get("skeleton_points", [])
        if skel_pts:
            for pt in skel_pts:
                cv2.circle(canvas, (int(pt[0]), int(pt[1])), 1, (255, 255, 255), -1)

        # Draw branch junctions
        branch_pts = c.get("branch_points", [])
        for bp in branch_pts:
            cv2.circle(canvas, (int(bp[0]), int(bp[1])), 3, (255, 0, 255), -1)

        # Draw ID Badge at centroid
        tag = f"{cid} · {c['length_px']:.0f}px · {c['avg_width_px']:.1f}px"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.42
        thickness = 1
        (tw, th), baseline = cv2.getTextSize(tag, font, font_scale, thickness)

        badge_x = max(4, min(cx - tw // 2, w - tw - 10))
        badge_y = max(th + 4, min(cy - 8, h - 8))

        # Pill background
        cv2.rectangle(
            canvas,
            (badge_x - 4, badge_y - th - 4),
            (badge_x + tw + 4, badge_y + baseline + 2),
            (20, 20, 24),
            -1
        )
        cv2.rectangle(
            canvas,
            (badge_x - 4, badge_y - th - 4),
            (badge_x + tw + 4, badge_y + baseline + 2),
            color,
            1,
            cv2.LINE_AA
        )
        cv2.putText(
            canvas,
            tag,
            (badge_x, badge_y),
            font,
            font_scale,
            (245, 245, 245),
            thickness,
            cv2.LINE_AA
        )

    # Top HUD Bar (Dark engineering dashboard banner)
    hud_h = 46
    hud = np.zeros((hud_h, w, 3), dtype=np.uint8)
    hud[:] = (18, 18, 22)
    cv2.rectangle(hud, (0, 0), (w, hud_h), (45, 45, 55), 1)

    cov_pct = summary.get("crack_coverage_pct", 0.0)
    cr_cnt = summary.get("crack_count", 0)
    tot_len = summary.get("total_crack_length_px", 0.0)
    avg_w = summary.get("average_crack_width_px", 0.0)
    is_cal = summary.get("is_calibrated", False)

    hud_title = "INFRASCAN GEOMETRY EXTRACTION"
    cv2.putText(hud, hud_title, (14, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 200), 1, cv2.LINE_AA)

    cal_label = f"Calibrated ({summary.get('mm_per_pixel')} mm/px)" if is_cal else "Image-based (px)"
    hud_metrics = (
        f"Coverage: {cov_pct:.2f}% | "
        f"Cracks: {cr_cnt} | "
        f"Total Length: {tot_len:,.1f} px | "
        f"Mean Width: {avg_w:.1f} px | "
        f"Scale: {cal_label}"
    )
    cv2.putText(hud, hud_metrics, (14, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1, cv2.LINE_AA)

    final_image = np.vstack([hud, canvas])
    cv2.imwrite(save_path, final_image, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    return save_path

