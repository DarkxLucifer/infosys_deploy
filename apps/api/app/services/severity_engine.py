from typing import Dict, Any, List, Optional

def evaluate_severity(
    measurement: Dict[str, Any],
    defect_type: str,
    material: str = "concrete",
    rule: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates defect severity using the configurable rule engine.
    Produces a recommended severity with detailed factor breakdown and explanation table.
    """
    weights = (rule and rule.get("weights")) or {
        "crack_width": 0.35,
        "crack_length": 0.20,
        "crack_density": 0.20,
        "damage_type": 0.15,
        "material": 0.10
    }
    thresholds = (rule and rule.get("thresholds")) or {
        "width_mm": {"minor": 1.0, "moderate": 3.0, "severe": 6.0, "critical": 10.0},
        "length_mm": {"minor": 500, "moderate": 1500, "severe": 3000, "critical": 5000},
        "density_pct": {"minor": 1.0, "moderate": 5.0, "severe": 10.0, "critical": 20.0}
    }
    rule_version = (rule and rule.get("version")) or "v1.0-default"

    calibrated = measurement.get("calibrated", False)
    unit = measurement.get("unit", "px")
    avg_w = float(measurement.get("avg_width", 1.0))
    max_w = float(measurement.get("max_width", avg_w))
    length = float(measurement.get("length", 0.0))
    density = measurement.get("density")
    density_val = float(density) if density is not None else 0.0

    factors_breakdown: List[Dict[str, Any]] = []

    # 1. Width Factor (0-4 score: 1=minor, 2=moderate, 3=severe, 4=critical)
    effective_w = max_w
    if calibrated and unit == "mm":
        w_thresh = thresholds.get("width_mm", {})
        if effective_w < w_thresh.get("minor", 1.0):
            w_score = 1.0
            w_desc = f"< {w_thresh.get('minor')}mm (Minor)"
        elif effective_w < w_thresh.get("moderate", 3.0):
            w_score = 2.0
            w_desc = f"{w_thresh.get('minor')}-{w_thresh.get('moderate')}mm (Moderate)"
        elif effective_w < w_thresh.get("severe", 6.0):
            w_score = 3.0
            w_desc = f"{w_thresh.get('moderate')}-{w_thresh.get('severe')}mm (Severe)"
        else:
            w_score = 4.0
            w_desc = f"> {w_thresh.get('severe')}mm (Critical)"
        w_val_str = f"{effective_w:.2f} mm"
    else:
        # Uncalibrated pixel thresholds
        if effective_w < 5.0:
            w_score = 1.0
            w_desc = "< 5.0 px (Minor, uncalibrated)"
        elif effective_w < 15.0:
            w_score = 2.0
            w_desc = "5-15 px (Moderate, uncalibrated)"
        elif effective_w < 30.0:
            w_score = 3.0
            w_desc = "15-30 px (Severe, uncalibrated)"
        else:
            w_score = 4.0
            w_desc = "> 30 px (Critical, uncalibrated)"
        w_val_str = f"{effective_w:.1f} px (not calibrated)"

    w_weight = float(weights.get("crack_width", 0.35))
    factors_breakdown.append({
        "factor": "Crack Width",
        "measured_value": w_val_str,
        "rule_threshold": w_desc,
        "weight_pct": f"{int(w_weight * 100)}%",
        "score": w_score,
        "weighted_score": round(w_score * w_weight, 3)
    })

    # 2. Length Factor
    if calibrated and unit == "mm":
        l_thresh = thresholds.get("length_mm", {})
        if length < l_thresh.get("minor", 500):
            l_score = 1.0
            l_desc = f"< {l_thresh.get('minor')}mm (Minor)"
        elif length < l_thresh.get("moderate", 1500):
            l_score = 2.0
            l_desc = f"{l_thresh.get('minor')}-{l_thresh.get('moderate')}mm (Moderate)"
        elif length < l_thresh.get("severe", 3000):
            l_score = 3.0
            l_desc = f"{l_thresh.get('moderate')}-{l_thresh.get('severe')}mm (Severe)"
        else:
            l_score = 4.0
            l_desc = f"> {l_thresh.get('severe')}mm (Critical)"
        l_val_str = f"{length:.1f} mm"
    else:
        if length < 200:
            l_score = 1.0
            l_desc = "< 200 px"
        elif length < 600:
            l_score = 2.0
            l_desc = "200-600 px"
        elif length < 1200:
            l_score = 3.0
            l_desc = "600-1200 px"
        else:
            l_score = 4.0
            l_desc = "> 1200 px"
        l_val_str = f"{length:.0f} px (not calibrated)"

    l_weight = float(weights.get("crack_length", 0.20))
    factors_breakdown.append({
        "factor": "Crack Length",
        "measured_value": l_val_str,
        "rule_threshold": l_desc,
        "weight_pct": f"{int(l_weight * 100)}%",
        "score": l_score,
        "weighted_score": round(l_score * l_weight, 3)
    })

    # 3. Density Factor
    d_weight = float(weights.get("crack_density", 0.20))
    if density is not None:
        d_thresh = thresholds.get("density_pct", {})
        if density_val < d_thresh.get("minor", 1.0):
            d_score = 1.0
            d_desc = "< 1.0% (Minor)"
        elif density_val < d_thresh.get("moderate", 5.0):
            d_score = 2.0
            d_desc = "1.0 - 5.0% (Moderate)"
        elif density_val < d_thresh.get("severe", 10.0):
            d_score = 3.0
            d_desc = "5.0 - 10.0% (Severe)"
        else:
            d_score = 4.0
            d_desc = "> 10.0% (Critical)"
        d_val_str = f"{density_val:.2f}%"
    else:
        d_score = l_score * 0.8  # Proxy from length when ROI uncalibrated
        d_desc = "ROI surface not defined; proxy estimated"
        d_val_str = "N/A"

    factors_breakdown.append({
        "factor": "Crack Density (ROI)",
        "measured_value": d_val_str,
        "rule_threshold": d_desc,
        "weight_pct": f"{int(d_weight * 100)}%",
        "score": round(d_score, 1),
        "weighted_score": round(d_score * d_weight, 3)
    })

    # 4. Damage Type Factor
    dt_weight = float(weights.get("damage_type", 0.15))
    dt_normalized = defect_type.lower()
    if dt_normalized in ["exposed_reinforcement", "spalling_active", "potholes_structural"]:
        dt_score = 4.0
        dt_desc = "High structural impact type"
    elif dt_normalized in ["alligator", "spalling", "transverse"]:
        dt_score = 3.0
        dt_desc = "Significant fatigue or tensile strain"
    elif dt_normalized in ["longitudinal", "diagonal", "corrosion"]:
        dt_score = 2.0
        dt_desc = "Moderate stress propagation"
    else:
        dt_score = 1.0
        dt_desc = "Superficial / hairline"

    factors_breakdown.append({
        "factor": "Damage Taxonomy",
        "measured_value": defect_type,
        "rule_threshold": dt_desc,
        "weight_pct": f"{int(dt_weight * 100)}%",
        "score": dt_score,
        "weighted_score": round(dt_score * dt_weight, 3)
    })

    # 5. Material Factor
    m_weight = float(weights.get("material", 0.10))
    mat_normalized = material.lower()
    if "prestressed" in mat_normalized or "composite" in mat_normalized:
        m_score = 3.5
        m_desc = "High sensitivity material"
    elif "reinforced" in mat_normalized or "concrete" in mat_normalized:
        m_score = 2.5
        m_desc = "Standard reinforced concrete"
    elif "asphalt" in mat_normalized or "bitumen" in mat_normalized:
        m_score = 2.0
        m_desc = "Flexible pavement surface"
    else:
        m_score = 2.0
        m_desc = "Masonry or general substrate"

    factors_breakdown.append({
        "factor": "Substrate Material",
        "measured_value": material,
        "rule_threshold": m_desc,
        "weight_pct": f"{int(m_weight * 100)}%",
        "score": m_score,
        "weighted_score": round(m_score * m_weight, 3)
    })

    # Total weighted score
    total_score = sum(f["weighted_score"] for f in factors_breakdown)

    if total_score < 1.6:
        recommended = "minor"
    elif total_score < 2.6:
        recommended = "moderate"
    elif total_score < 3.4:
        recommended = "severe"
    else:
        recommended = "critical"

    explanation = (
        f"Evaluated weighted factor score of {total_score:.2f} using rule set {rule_version}. "
        f"Primary governing factor: Crack Width ({w_val_str}, {w_desc}). "
        f"Severity recommendation: {recommended.upper()}."
    )

    return {
        "recommended_severity": recommended,
        "score": round(total_score, 2),
        "factors": factors_breakdown,
        "explanation": explanation,
        "rule_version": rule_version,
        "is_development_default": True
    }
