from typing import Dict, Any, List, Optional

def evaluate_priority(
    severity: str,
    asset_importance: str = "medium",
    asset_type: str = "bridge",
    progression_rate_pct: Optional[float] = None,
    previous_findings_count: int = 0,
    risk_factors: Optional[List[str]] = None,
    rule: Optional[Dict[str, Any]] = None,
    suggested_action: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates maintenance priority using the configurable priority rule engine.
    Produces a recommended priority (e.g. urgent_engineering_review, high, medium, low, routine_monitoring)
    along with factor breakdown and suggested remediation task.
    """
    weights = (rule and rule.get("weights")) or {
        "severity": 0.40,
        "importance": 0.25,
        "progression": 0.15,
        "history": 0.10,
        "asset_type": 0.10
    }
    risk_multipliers = (rule and rule.get("risk_factors")) or {
        "coastal_corrosion": 1.2,
        "heavy_freight_route": 1.3,
        "seismic_zone": 1.15
    }
    rule_version = (rule and rule.get("version")) or "v1.0-default"

    factors_breakdown: List[Dict[str, Any]] = []

    # 1. Severity Factor (0-4)
    sev_map = {
        "critical": 4.0,
        "severe": 3.2,
        "moderate": 2.2,
        "minor": 1.2,
        "no_visible_damage": 0.5
    }
    sev_score = sev_map.get(severity.lower(), 2.0)
    sev_weight = float(weights.get("severity", 0.40))
    factors_breakdown.append({
        "factor": "Reviewed Severity",
        "input_value": severity.capitalize(),
        "contribution": f"Score {sev_score} / 4.0",
        "weight_pct": f"{int(sev_weight * 100)}%",
        "score": sev_score,
        "weighted_score": round(sev_score * sev_weight, 3)
    })

    # 2. Asset Importance Factor (0-4)
    imp_map = {
        "critical": 4.0,
        "high": 3.0,
        "medium": 2.0,
        "low": 1.0
    }
    imp_score = imp_map.get(asset_importance.lower(), 2.0)
    imp_weight = float(weights.get("importance", 0.25))
    factors_breakdown.append({
        "factor": "Asset Criticality",
        "input_value": asset_importance.capitalize(),
        "contribution": f"Infrastructure tier score {imp_score} / 4.0",
        "weight_pct": f"{int(imp_weight * 100)}%",
        "score": imp_score,
        "weighted_score": round(imp_score * imp_weight, 3)
    })

    # 3. Progression Factor (0-4)
    prog_weight = float(weights.get("progression", 0.15))
    if progression_rate_pct is not None:
        if progression_rate_pct > 25.0:
            prog_score = 4.0
            prog_desc = f"+{progression_rate_pct:.1f}% growth (Rapid)"
        elif progression_rate_pct > 10.0:
            prog_score = 3.0
            prog_desc = f"+{progression_rate_pct:.1f}% growth (Active)"
        elif progression_rate_pct > 2.0:
            prog_score = 2.0
            prog_desc = f"+{progression_rate_pct:.1f}% growth (Slow)"
        else:
            prog_score = 1.0
            prog_desc = "Stable (< 2% change)"
    else:
        prog_score = 1.5
        prog_desc = "Baseline inspection (No comparison)"

    factors_breakdown.append({
        "factor": "Progression Rate",
        "input_value": f"{progression_rate_pct:.1f}%" if progression_rate_pct is not None else "Baseline",
        "contribution": prog_desc,
        "weight_pct": f"{int(prog_weight * 100)}%",
        "score": prog_score,
        "weighted_score": round(prog_score * prog_weight, 3)
    })

    # 4. History / Prior Defects Factor (0-4)
    hist_weight = float(weights.get("history", 0.10))
    if previous_findings_count > 5:
        hist_score = 3.5
        hist_desc = f"{previous_findings_count} prior findings (Recurrent)"
    elif previous_findings_count > 0:
        hist_score = 2.2
        hist_desc = f"{previous_findings_count} prior findings"
    else:
        hist_score = 1.0
        hist_desc = "No prior defect records"

    factors_breakdown.append({
        "factor": "Defect History",
        "input_value": str(previous_findings_count),
        "contribution": hist_desc,
        "weight_pct": f"{int(hist_weight * 100)}%",
        "score": hist_score,
        "weighted_score": round(hist_score * hist_weight, 3)
    })

    # 5. Asset Type Factor (0-4)
    type_weight = float(weights.get("asset_type", 0.10))
    type_map = {
        "bridge": 3.5,
        "dam": 3.8,
        "tunnel": 3.3,
        "pier": 3.0,
        "retaining-wall": 2.5,
        "building": 2.0,
        "road": 1.8,
        "culvert": 1.8
    }
    type_score = type_map.get(asset_type.lower(), 2.0)
    factors_breakdown.append({
        "factor": "Asset Structure Type",
        "input_value": asset_type.capitalize(),
        "contribution": f"Risk rating score {type_score} / 4.0",
        "weight_pct": f"{int(type_weight * 100)}%",
        "score": type_score,
        "weighted_score": round(type_score * type_weight, 3)
    })

    # Base weighted score
    base_score = sum(f["weighted_score"] for f in factors_breakdown)

    # Risk factor multiplier
    total_multiplier = 1.0
    applied_risks = []
    if risk_factors:
        for rf in risk_factors:
            if rf in risk_multipliers:
                mult = float(risk_multipliers[rf])
                total_multiplier *= mult
                applied_risks.append(f"{rf} (x{mult})")

    final_score = base_score * total_multiplier

    # Priority mapping
    if final_score >= 3.4 or (severity == "critical" and imp_score >= 3.0):
        recommended = "urgent_engineering_review"
    elif final_score >= 2.6:
        recommended = "high"
    elif final_score >= 1.8:
        recommended = "medium"
    elif final_score >= 1.2:
        recommended = "low"
    else:
        recommended = "routine_monitoring"

    explanation = (
        f"Weighted priority score: {final_score:.2f} (Base: {base_score:.2f}"
        + (f", Multipliers: {', '.join(applied_risks)}" if applied_risks else "")
        + f"). Priority tier: {recommended.replace('_', ' ').title()}."
    )

    return {
        "recommended_priority": recommended,
        "score": round(final_score, 2),
        "factors": factors_breakdown,
        "applied_risks": applied_risks,
        "explanation": explanation,
        "suggested_action": suggested_action,
        "rule_version": rule_version,
        "is_development_default": True
    }
