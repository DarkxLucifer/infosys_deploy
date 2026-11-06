"""
InfraScan Damage Severity Assessment Engine
============================================
Implements civil infrastructure damage severity assessment adhering to:
- AASHTO / ASTM C856 crack opening classifications
- InfraScan Engineering Specification & PDF Module 10 (Crack Density & Scale Invariance)
- Multi-factor structural appraisal: crack width, crack density, defect morphology, branch count, spalling/rebar

Two operational evaluation pathways:
1. Calibrated Physical Scale (mm):
   - Minor: Peak width < 3.0 mm (Hairline < 1.0 mm, Minor 1.0 - < 3.0 mm) with crack density < 2.0%
   - Moderate: Peak width 3.0 mm - 5.0 mm, or crack density 2.0% - 5.0%
   - Severe: Peak width > 5.0 mm - 8.0 mm, or crack density 5.0% - 9.0%, or branch count > 10
   - Critical: Peak width > 8.0 mm, or crack density > 9.0%, or branch count > 50, or spalling with exposed rebar

2. Uncalibrated Scale-Invariant Mode (PDF §10 / Module 10 Page 12):
   - Never invents fictitious mm dimensions when uncalibrated.
   - Evaluates structural severity via Crack Density (% surface area), Relative Peak Thickness Ratio R,
     defect classification (e.g., alligator fatigue networks, spalling), and topological branch complexity.
   - Minor: Density < 0.5%, R < 0.015, branches < 5
   - Moderate: Density 0.5% - 2.5%, or R 0.015 - 0.045, branches < 10
   - Severe: Density 2.5% - 9.0%, or R 0.045 - 0.090, or branch count > 10
   - Critical: Density > 9.0%, or R >= 0.090, or branch count > 50, or spalling / exposed rebar

All assessments are governed as Civil Engineering Decision Support and subject to licensed engineer sign-off.
"""

from typing import Dict, Any, List, Optional, Union
import logging

logger = logging.getLogger("infrascan.damage_assessment")

ENGINEERING_DISCLAIMER = (
    "Automated optical measurement and severity categories are provided as civil engineering "
    "decision support. Final structural appraisal requires qualified civil engineer validation."
)

SEVERITY_ORDER = {
    "none": 0,
    "minor": 1,
    "moderate": 2,
    "severe": 3,
    "critical": 4,
}

PRIORITY_MAPPING = {
    "critical": {
        "code": "urgent_engineering_review",
        "label": "Urgent Engineering Review",
        "action_window": "Immediate (Within 24-48 Hours)",
        "action": "Immediate structural engineer inspection & consideration of load / traffic restrictions."
    },
    "severe": {
        "code": "high",
        "label": "High Priority",
        "action_window": "High Priority (Within 14-30 Days)",
        "action": "Civil engineering structural inspection, non-destructive testing, and repair scheduling."
    },
    "moderate": {
        "code": "medium",
        "label": "Medium Priority",
        "action_window": "Scheduled Maintenance (Within 60-90 Days)",
        "action": "Scheduled crack sealing, epoxy injection, and protective sealant application."
    },
    "minor": {
        "code": "low",
        "label": "Low Priority",
        "action_window": "Preventative Monitoring",
        "action": "Surface cleaning, moisture prevention, and routine monitoring in next inspection cycle."
    },
    "none": {
        "code": "routine_monitoring",
        "label": "Routine Monitoring",
        "action_window": "Standard Annual Cycle",
        "action": "Sound concrete surface. No immediate maintenance intervention required."
    }
}


def assess_photo_damage_severity(
    metrics: Dict[str, Any],
    calibration: Optional[Dict[str, Any]] = None,
    defect_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates damage severity for a single inspection photograph.
    
    Supports:
    - Mode A: Calibrated (physical width in mm, length in mm, area in mm², density %)
    - Mode B: Uncalibrated (crack density %, relative thickness ratio R, branch count, defect morphology)
    """
    has_cracks = metrics.get("has_cracks", True)
    crack_count = metrics.get("crack_count", 0)
    crack_area_px = float(metrics.get("crack_area_px", 0.0) or 0.0)
    surface_area_px = float(metrics.get("surface_area_px", 0.0) or 0.0)
    
    # Calculate density
    density_pct = float(metrics.get("crack_density_pct", 0.0) or metrics.get("crack_coverage_pct", 0.0) or 0.0)
    if density_pct <= 0.0 and surface_area_px > 0 and crack_area_px > 0:
        density_pct = (crack_area_px / surface_area_px) * 100.0

    avg_w_px = float(metrics.get("average_crack_width_px", 0.0) or metrics.get("avg_width_px", 0.0) or 0.0)
    max_w_px = float(metrics.get("maximum_crack_width_px", 0.0) or metrics.get("max_width_px", 0.0) or 0.0)
    total_len_px = float(metrics.get("total_crack_length_px", 0.0) or metrics.get("length_px", 0.0) or 0.0)
    total_branches = int(metrics.get("total_branch_count", 0) or metrics.get("branches", 0) or 0)
    
    # Image frame bounds for relative thickness
    img_w = metrics.get("image_width") or metrics.get("width")
    img_h = metrics.get("image_height") or metrics.get("height")
    min_dim = min(float(img_w), float(img_h)) if (img_w and img_h) else None
    rel_thickness = (max_w_px / min_dim) if (min_dim and min_dim > 0) else None

    # Check calibration
    is_calibrated = False
    mm_per_pixel = None
    if calibration and calibration.get("is_calibrated"):
        is_calibrated = True
        mm_per_pixel = calibration.get("scale_factor_mm_per_pixel") or calibration.get("mm_per_pixel")
    elif metrics.get("is_calibrated"):
        is_calibrated = True
        mm_per_pixel = metrics.get("mm_per_pixel") or metrics.get("scale_factor_mm_per_pixel")

    # Severe structural defect escalation override (e.g. spalling or exposed rebar)
    defect_lower = (defect_type or "").lower()
    if "rebar" in defect_lower or "exposed_reinforcement" in defect_lower or "spalling_active" in defect_lower:
        return {
            "severity": "Critical / Requires Urgent Engineering Review",
            "severity_code": "critical",
            "severity_level": 4,
            "is_calibrated": is_calibrated,
            "basis": "defect_morphology_override",
            "controlling_factor": "Exposed Reinforcing Steel (Rebar)" if "rebar" in defect_lower or "exposed_reinforcement" in defect_lower else "Active Structural Spalling",
            "controlling_value": "Critical Structural Distress",
            "density_pct": round(density_pct, 3),
            "crack_count": max(1, crack_count),
            "peak_width_mm": round(max_w_px * mm_per_pixel, 2) if (is_calibrated and mm_per_pixel) else None,
            "peak_width_px": round(max_w_px, 1),
            "total_branches": total_branches,
            "priority": PRIORITY_MAPPING["critical"],
            "requires_engineer_review": True,
            "disclaimer": ENGINEERING_DISCLAIMER
        }

    # If crack_count is 0 and crack_area_px == 0, surface is sound
    if not has_cracks or (crack_count == 0 and crack_area_px <= 0):
        return {
            "severity": "No Visible Damage",
            "severity_code": "none",
            "severity_level": 0,
            "is_calibrated": is_calibrated,
            "basis": "sound_surface",
            "controlling_factor": "Zero crack detections",
            "controlling_value": "0.0% coverage",
            "density_pct": 0.0,
            "crack_count": 0,
            "peak_width_mm": 0.0 if is_calibrated else None,
            "peak_width_px": 0.0,
            "total_branches": 0,
            "priority": PRIORITY_MAPPING["none"],
            "requires_engineer_review": True,
            "disclaimer": ENGINEERING_DISCLAIMER
        }

    # Mode A: Calibrated Physical Measurements
    if is_calibrated and mm_per_pixel and mm_per_pixel > 0:
        max_w_mm = float(metrics.get("maximum_crack_width_mm", 0.0) or (max_w_px * mm_per_pixel))
        avg_w_mm = float(metrics.get("average_crack_width_mm", 0.0) or (avg_w_px * mm_per_pixel))
        
        reasons: List[str] = []
        sev_code = "minor"
        controlling_factor = "Crack Width"
        controlling_value = f"{max_w_mm:.2f} mm"

        # Check Critical boundaries:
        # Peak crack width > 8.0 mm, or crack density > 9.0%, or branch count > 50, or spalling
        if max_w_mm > 8.0:
            sev_code = "critical"
            controlling_factor = "Peak Crack Opening"
            controlling_value = f"{max_w_mm:.2f} mm (> 8.0 mm threshold)"
            reasons.append(f"Peak crack width {max_w_mm:.2f} mm exceeds 8.0 mm critical threshold")
        elif density_pct > 9.0:
            sev_code = "critical"
            controlling_factor = "Crack Density"
            controlling_value = f"{density_pct:.2f}% (> 9.0% threshold)"
            reasons.append(f"Crack surface density {density_pct:.2f}% exceeds 9.0% critical threshold")
        elif total_branches > 50:
            sev_code = "critical"
            controlling_factor = "Extensive Alligator Fatigue"
            controlling_value = f"{total_branches} branches"
            reasons.append(f"Network complexity with {total_branches} junctions indicates advanced fatigue disintegration")
        # Check Severe boundaries:
        # Peak crack width > 5.0 mm - 8.0 mm, or crack density 5.0% - 9.0%, or branch count > 10
        elif max_w_mm > 5.0:
            sev_code = "severe"
            controlling_factor = "Peak Crack Opening"
            controlling_value = f"{max_w_mm:.2f} mm (> 5.0 mm threshold)"
            reasons.append(f"Peak crack width {max_w_mm:.2f} mm exceeds 5.0 mm severe boundary")
        elif density_pct > 5.0:
            sev_code = "severe"
            controlling_factor = "Crack Density"
            controlling_value = f"{density_pct:.2f}% (> 5.0% threshold)"
            reasons.append(f"Crack surface density {density_pct:.2f}% exceeds 5.0% severe boundary")
        elif total_branches > 10:
            sev_code = "severe"
            controlling_factor = "Interconnected Fatigue Cracking"
            controlling_value = f"{total_branches} branches"
            reasons.append(f"Multi-branch interconnected crack network ({total_branches} junctions)")
        # Check Moderate boundaries:
        # Peak crack width 3.0 mm - 5.0 mm, or crack density 2.0% - 5.0%
        elif max_w_mm >= 3.0:
            sev_code = "moderate"
            controlling_factor = "Peak Crack Opening"
            controlling_value = f"{max_w_mm:.2f} mm (3.0 - 5.0 mm)"
            reasons.append(f"Peak crack width {max_w_mm:.2f} mm falls in 3.0 - 5.0 mm moderate category")
        elif density_pct >= 2.0:
            sev_code = "moderate"
            controlling_factor = "Crack Density"
            controlling_value = f"{density_pct:.2f}% (2.0 - 5.0%)"
            reasons.append(f"Crack surface density {density_pct:.2f}% falls in 2.0 - 5.0% moderate category")
        # Minor boundaries:
        # Peak crack width < 3.0 mm with crack density < 2.0%
        else:
            sev_code = "minor"
            controlling_factor = "Hairline / Minor Opening"
            controlling_value = f"{max_w_mm:.2f} mm"
            reasons.append(f"Peak width {max_w_mm:.2f} mm < 3.0 mm and crack density {density_pct:.2f}% < 2.0%")

        severity_title = {
            "minor": "Minor Damage",
            "moderate": "Moderate Damage",
            "severe": "Severe Damage",
            "critical": "Critical / Requires Urgent Engineering Review"
        }[sev_code]

        return {
            "severity": severity_title,
            "severity_code": sev_code,
            "severity_level": SEVERITY_ORDER[sev_code],
            "is_calibrated": True,
            "basis": "calibrated_physical_scale",
            "controlling_factor": controlling_factor,
            "controlling_value": controlling_value,
            "density_pct": round(density_pct, 3),
            "crack_count": crack_count,
            "peak_width_mm": round(max_w_mm, 2),
            "average_width_mm": round(avg_w_mm, 2),
            "peak_width_px": round(max_w_px, 1),
            "average_width_px": round(avg_w_px, 1),
            "total_length_px": round(total_len_px, 1),
            "total_branches": total_branches,
            "reasons": reasons,
            "priority": PRIORITY_MAPPING[sev_code],
            "requires_engineer_review": True,
            "disclaimer": ENGINEERING_DISCLAIMER
        }

    # Mode B: Uncalibrated Scale-Invariant Assessment (PDF §10 / Module 10 Page 12)
    reasons = []
    sev_code = "minor"
    controlling_factor = "Crack Density"
    controlling_value = f"{density_pct:.2f}%"

    # Critical conditions for uncalibrated:
    # Density > 9.0%, or Relative Thickness R >= 0.090 (9% of frame), or branches > 50
    if density_pct > 9.0:
        sev_code = "critical"
        controlling_factor = "Crack Density"
        controlling_value = f"{density_pct:.2f}% (> 9.0%)"
        reasons.append(f"Surface crack density {density_pct:.2f}% exceeds 9.0% threshold (PDF §10)")
    elif rel_thickness is not None and rel_thickness >= 0.090:
        sev_code = "critical"
        controlling_factor = "Relative Thickness Ratio"
        controlling_value = f"{rel_thickness * 100:.1f}% of frame"
        reasons.append(f"Relative crack opening represents {rel_thickness * 100:.1f}% of field of view")
    elif total_branches > 50:
        sev_code = "critical"
        controlling_factor = "Extensive Alligator Network"
        controlling_value = f"{total_branches} branches"
        reasons.append(f"Severe alligator cracking with {total_branches} junctions indicates advanced degradation")
    # Severe conditions for uncalibrated:
    # Density 2.5% - 9.0%, or Relative Thickness 0.045 - 0.090, or branches > 10
    elif density_pct >= 2.5:
        sev_code = "severe"
        controlling_factor = "Crack Density"
        controlling_value = f"{density_pct:.2f}% (2.5 - 9.0%)"
        reasons.append(f"Crack surface density {density_pct:.2f}% indicates severe structural fissure network")
    elif rel_thickness is not None and rel_thickness >= 0.045:
        sev_code = "severe"
        controlling_factor = "Relative Thickness Ratio"
        controlling_value = f"{rel_thickness * 100:.1f}% of frame"
        reasons.append(f"Relative peak crack width ({rel_thickness * 100:.1f}% of frame) indicates deep opening")
    elif total_branches > 10:
        sev_code = "severe"
        controlling_factor = "Interconnected Crack Branches"
        controlling_value = f"{total_branches} branches"
        reasons.append(f"Interconnected fatigue network with {total_branches} branch junctions")
    # Moderate conditions for uncalibrated:
    # Density 0.5% - 2.5%, or Relative Thickness 0.015 - 0.045, or branches < 10
    elif density_pct >= 0.5:
        sev_code = "moderate"
        controlling_factor = "Crack Density"
        controlling_value = f"{density_pct:.2f}% (0.5 - 2.5%)"
        reasons.append(f"Crack surface density {density_pct:.2f}% indicates moderate concrete distress")
    elif rel_thickness is not None and rel_thickness >= 0.015:
        sev_code = "moderate"
        controlling_factor = "Relative Thickness Ratio"
        controlling_value = f"{rel_thickness * 100:.1f}% of frame"
        reasons.append(f"Relative opening ({rel_thickness * 100:.1f}% of frame) indicates moderate fissure")
    # Minor conditions:
    else:
        sev_code = "minor"
        controlling_factor = "Superficial / Hairline Fissure"
        controlling_value = f"{density_pct:.2f}% (< 0.5%)"
        reasons.append(f"Low surface coverage ({density_pct:.2f}%) and narrow relative profile")

    severity_title = {
        "minor": "Minor Damage",
        "moderate": "Moderate Damage",
        "severe": "Severe Damage",
        "critical": "Critical / Requires Urgent Engineering Review"
    }[sev_code]

    return {
        "severity": severity_title,
        "severity_code": sev_code,
        "severity_level": SEVERITY_ORDER[sev_code],
        "is_calibrated": False,
        "basis": "scale_invariant_density_and_morphology",
        "controlling_factor": controlling_factor,
        "controlling_value": controlling_value,
        "density_pct": round(density_pct, 3),
        "crack_count": crack_count,
        "peak_width_mm": None,
        "average_width_mm": None,
        "peak_width_px": round(max_w_px, 1),
        "average_width_px": round(avg_w_px, 1),
        "total_length_px": round(total_len_px, 1),
        "relative_thickness_ratio": round(rel_thickness, 4) if rel_thickness is not None else None,
        "total_branches": total_branches,
        "reasons": reasons,
        "priority": PRIORITY_MAPPING[sev_code],
        "requires_engineer_review": True,
        "disclaimer": ENGINEERING_DISCLAIMER,
        "uncalibrated_notice": (
            "Evaluated via scale-invariant crack density and morphological profile (PDF §10). "
            "Millimetre dimensions require optical scale calibration."
        )
    }


def assess_batch_damage_severity(photos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregates damage severity assessment across all photos uploaded in a session or inspection.
    
    Returns:
    - Overall severity category (worst-case finding)
    - Controlling photo details (the photo driving the highest severity)
    - Aggregate crack density across the entire batch
    - Batch severity distribution breakdown
    - Recommended maintenance priority action
    """
    if not photos:
        return {
            "overall_severity": "No Visible Damage",
            "overall_severity_code": "none",
            "overall_severity_level": 0,
            "total_photos": 0,
            "analyzed_photos": 0,
            "calibrated_count": 0,
            "uncalibrated_count": 0,
            "aggregate_density_pct": 0.0,
            "total_crack_count": 0,
            "total_crack_area_px": 0,
            "total_surface_area_px": 0,
            "severity_distribution": {
                "critical": 0,
                "severe": 0,
                "moderate": 0,
                "minor": 0,
                "none": 0
            },
            "controlling_finding": None,
            "priority": PRIORITY_MAPPING["none"],
            "requires_engineer_review": True,
            "disclaimer": ENGINEERING_DISCLAIMER
        }

    total_photos = len(photos)
    analyzed_count = 0
    calibrated_count = 0
    uncalibrated_count = 0

    sum_crack_area_px = 0.0
    sum_surface_area_px = 0.0
    sum_crack_count = 0
    sum_length_px = 0.0

    distribution = {
        "critical": 0,
        "severe": 0,
        "moderate": 0,
        "minor": 0,
        "none": 0
    }

    worst_level = -1
    worst_assessment: Optional[Dict[str, Any]] = None
    controlling_photo_info: Optional[Dict[str, Any]] = None

    for photo in photos:
        # Extract geometry metrics from photo object
        geo = photo.get("crackGeometry") or photo.get("crack_geometry") or {}
        summary = geo.get("summary", {}) if isinstance(geo, dict) else {}
        
        # Also check quality_report or qualityReport
        qr = photo.get("quality_report") or photo.get("qualityReport") or {}
        if not summary and isinstance(qr, dict) and qr.get("crack_geometry"):
            summary = qr["crack_geometry"].get("summary", {})
            
        calib = photo.get("calibration") or {}
        defect_type = photo.get("activeStage2Model") or photo.get("defect_type")

        # Synthesize metrics dictionary
        photo_metrics = {
            "has_cracks": summary.get("has_cracks", summary.get("crack_count", 0) > 0),
            "crack_count": summary.get("crack_count", 0),
            "crack_area_px": summary.get("total_crack_area_pixels") or summary.get("crack_area_px", 0.0),
            "surface_area_px": summary.get("total_surface_area_pixels") or summary.get("surface_area_px", 0.0),
            "crack_density_pct": summary.get("crack_coverage_pct") or summary.get("crack_density_pct", 0.0),
            "maximum_crack_width_px": summary.get("maximum_crack_width_px", 0.0),
            "average_crack_width_px": summary.get("average_crack_width_px", 0.0),
            "maximum_crack_width_mm": summary.get("maximum_crack_width_mm"),
            "average_crack_width_mm": summary.get("average_crack_width_mm"),
            "total_crack_length_px": summary.get("total_crack_length_px", 0.0),
            "total_branch_count": summary.get("total_branch_count", 0),
            "image_width": photo.get("width") or (photo.get("gps", {}) if isinstance(photo.get("gps"), dict) else {}).get("width"),
            "image_height": photo.get("height"),
            "is_calibrated": summary.get("is_calibrated") or calib.get("is_calibrated", False),
            "mm_per_pixel": calib.get("scale_factor_mm_per_pixel") or summary.get("calibration_mm_per_pixel")
        }

        # If summary was not present, check whether this photo has AI crack classification
        ai_cls = photo.get("aiClassification") or photo.get("ai_classification") or {}
        has_crack_pred = ai_cls.get("has_crack") if isinstance(ai_cls, dict) else None
        if not summary and has_crack_pred is False:
            photo_metrics["has_cracks"] = False
            photo_metrics["crack_count"] = 0

        # Assess individual photo
        single_assessment = assess_photo_damage_severity(photo_metrics, calibration=calib, defect_type=defect_type)
        analyzed_count += 1
        
        if single_assessment["is_calibrated"]:
            calibrated_count += 1
        else:
            uncalibrated_count += 1

        c_area = float(photo_metrics["crack_area_px"] or 0.0)
        s_area = float(photo_metrics["surface_area_px"] or 0.0)
        sum_crack_area_px += c_area
        sum_surface_area_px += s_area
        sum_crack_count += int(photo_metrics["crack_count"] or 0)
        sum_length_px += float(photo_metrics["total_crack_length_px"] or 0.0)

        code = single_assessment["severity_code"]
        if code in distribution:
            distribution[code] += 1
        else:
            distribution["none"] += 1

        level = single_assessment["severity_level"]
        if level > worst_level:
            worst_level = level
            worst_assessment = single_assessment
            controlling_photo_info = {
                "photo_id": photo.get("id"),
                "photo_name": photo.get("name", "Unnamed Photo"),
                "severity": single_assessment["severity"],
                "severity_code": code,
                "controlling_factor": single_assessment["controlling_factor"],
                "controlling_value": single_assessment["controlling_value"],
                "density_pct": single_assessment["density_pct"],
                "peak_width_mm": single_assessment.get("peak_width_mm"),
                "peak_width_px": single_assessment.get("peak_width_px"),
                "is_calibrated": single_assessment["is_calibrated"]
            }

    if not worst_assessment:
        worst_assessment = assess_photo_damage_severity({"has_cracks": False})
        worst_level = 0

    # Batch density
    batch_density = 0.0
    if sum_surface_area_px > 0 and sum_crack_area_px > 0:
        batch_density = round((sum_crack_area_px / sum_surface_area_px) * 100.0, 3)
    elif worst_assessment:
        batch_density = worst_assessment.get("density_pct", 0.0)

    overall_code = worst_assessment["severity_code"]
    priority = PRIORITY_MAPPING.get(overall_code, PRIORITY_MAPPING["none"])

    # Determine batch evaluation basis description
    if calibrated_count > 0 and uncalibrated_count == 0:
        basis_mode = "calibrated_physical_scale"
        basis_label = "Calibrated Physical Scale (mm)"
    elif calibrated_count > 0 and uncalibrated_count > 0:
        basis_mode = "mixed_calibration"
        basis_label = f"Mixed Scale ({calibrated_count} Calibrated / {uncalibrated_count} Density Mode)"
    else:
        basis_mode = "scale_invariant_density_and_morphology"
        basis_label = "Crack Density & Defect Morphology (PDF §10)"

    return {
        "overall_severity": worst_assessment["severity"],
        "overall_severity_code": overall_code,
        "overall_severity_level": worst_level,
        "total_photos": total_photos,
        "analyzed_photos": analyzed_count,
        "calibrated_count": calibrated_count,
        "uncalibrated_count": uncalibrated_count,
        "basis_mode": basis_mode,
        "basis_label": basis_label,
        "aggregate_density_pct": batch_density,
        "total_crack_count": sum_crack_count,
        "total_crack_area_px": round(sum_crack_area_px, 1),
        "total_crack_length_px": round(sum_length_px, 1),
        "severity_distribution": distribution,
        "controlling_finding": controlling_photo_info,
        "priority": priority,
        "requires_engineer_review": True,
        "disclaimer": ENGINEERING_DISCLAIMER
    }
