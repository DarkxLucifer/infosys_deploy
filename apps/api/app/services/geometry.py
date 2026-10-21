import math
from typing import List, Dict, Any, Optional, Tuple

def euclidean_distance(p1: List[float], p2: List[float]) -> float:
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)

def calculate_polyline_length(points: List[List[float]]) -> float:
    """Calculates path length of a polyline in pixels."""
    if not points or len(points) < 2:
        return 0.0
    total = 0.0
    for i in range(len(points) - 1):
        total += euclidean_distance(points[i], points[i + 1])
    return round(total, 2)

def calculate_polygon_area(points: List[List[float]]) -> float:
    """Calculates enclosed area of a polygon using the Shoelace formula."""
    if not points or len(points) < 3:
        return 0.0
    n = len(points)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return round(abs(area) / 2.0, 2)

def calculate_width_metrics(width_segments: Optional[List[List[List[float]]]] = None, default_width: float = 1.0) -> Tuple[float, float]:
    """
    Computes avg_width and max_width from cross-section line segments.
    Each width segment is [[x1, y1], [x2, y2]].
    """
    if not width_segments or len(width_segments) == 0:
        return round(default_width, 2), round(default_width, 2)
    
    lengths = [euclidean_distance(seg[0], seg[1]) for seg in width_segments if len(seg) >= 2]
    if not lengths:
        return round(default_width, 2), round(default_width, 2)
    
    avg_w = sum(lengths) / len(lengths)
    max_w = max(lengths)
    return round(avg_w, 2), round(max_w, 2)

def calculate_orientation(points: List[List[float]]) -> float:
    """
    Computes primary angle of orientation in degrees [0, 180).
    0 = horizontal, 90 = vertical.
    """
    if not points or len(points) < 2:
        return 0.0
    dx = points[-1][0] - points[0][0]
    dy = points[-1][1] - points[0][1]
    angle_rad = math.atan2(abs(dy), abs(dx))
    angle_deg = math.degrees(angle_rad)
    return round(angle_deg % 180.0, 1)

def rule_based_crack_suggestion(orientation: float, branching: int = 0, is_polygon: bool = False) -> str:
    """
    Deterministic rule-based crack type suggestion from geometry alone.
    Always clearly identified as 'Rule-based suggestion', never AI.
    """
    if is_polygon:
        return "spalling"
    if branching >= 3:
        return "alligator"
    if orientation <= 25 or orientation >= 155:
        return "transverse"
    if 65 <= orientation <= 115:
        return "longitudinal"
    return "diagonal"

def process_geometry_and_measure(geometry: Dict[str, Any], calibration: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Computes rigorous server-side measurements from geometry coordinates.
    Calibrated measurements return mm and mm^2 with physical uncertainty.
    Uncalibrated measurements return px and px^2 with uncertainty=None.
    """
    geom_type = geometry.get("type", "crack_polyline")
    points = geometry.get("points", [])
    width_segments = geometry.get("width_segments", [])
    roi_points = geometry.get("roi_points", [])
    branching = int(geometry.get("branching", 0))

    mm_val = calibration.get("mm_per_pixel") or calibration.get("mm_per_px") if calibration else None
    calibrated = bool(calibration and mm_val)
    mm_per_px = float(mm_val) if calibrated else None

    if geom_type == "damage_polygon":
        px_area = calculate_polygon_area(points)
        px_length = calculate_polyline_length(points + [points[0]] if points else [])
        avg_w = math.sqrt(px_area) if px_area > 0 else 1.0
        max_w = avg_w
        orientation = calculate_orientation(points)
        suggestion = rule_based_crack_suggestion(orientation, branching, is_polygon=True)
    else:
        # polyline crack
        px_length = calculate_polyline_length(points)
        avg_w, max_w = calculate_width_metrics(width_segments)
        px_area = round(px_length * avg_w, 2)
        orientation = calculate_orientation(points)
        suggestion = rule_based_crack_suggestion(orientation, branching, is_polygon=False)

    # ROI and Crack Density
    density = None
    if roi_points and len(roi_points) >= 3:
        roi_px_area = calculate_polygon_area(roi_points)
        if roi_px_area > 0:
            density = round((px_area / roi_px_area) * 100.0, 2)

    # Unit conversion and uncertainty
    if calibrated and mm_per_px:
        unit = "mm"
        length_val = round(px_length * mm_per_px, 2)
        avg_w_val = round(avg_w * mm_per_px, 2)
        max_w_val = round(max_w * mm_per_px, 2)
        area_val = round(px_area * (mm_per_px ** 2), 2)
        # Uncertainty: +/- (0.5px * mm_per_px + reference tolerance)
        ref_tol = float(calibration.get("uncertainty", 0.1))
        uncertainty_val = round(0.5 * mm_per_px + ref_tol, 3)
    else:
        unit = "px"
        length_val = px_length
        avg_w_val = avg_w
        max_w_val = max_w
        area_val = px_area
        uncertainty_val = None

    return {
        "length": length_val,
        "avg_width": avg_w_val,
        "max_width": max_w_val,
        "area": area_val,
        "orientation": orientation,
        "branching": branching,
        "continuity": 1.0 if branching == 0 else round(1.0 / (branching + 1), 2),
        "density": density,
        "unit": unit,
        "calibrated": calibrated,
        "uncertainty": uncertainty_val,
        "rule_suggestion": suggestion
    }
