"""
Unit Tests for InfraScan Damage Severity Assessment Engine
==========================================================
Tests:
1. Mode A (Calibrated Physical Scale):
   - Minor: Peak width < 3.0 mm AND density < 2.0%
   - Moderate: Peak width 3.0 - 5.0 mm OR density 2.0% - 5.0%
   - Severe: Peak width > 5.0 - 8.0 mm OR density 5.0% - 9.0% OR branch count > 10
   - Critical: Peak width > 8.0 mm OR density > 9.0% OR branch count > 50 OR exposed rebar
2. Mode B (Uncalibrated Scale-Invariant PDF §10 Mode):
   - No Visible Damage: 0.0% density
   - Minor: density < 0.5%, R < 0.015, branches < 5
   - Moderate: density 0.5% - 2.5%, or R 0.015 - 0.045
   - Severe: density 2.5% - 9.0% (user adjusted +1%), or R 0.045 - 0.090, or branch count > 10
   - Critical: density > 9.0% (user adjusted +1%), or R >= 0.090, or branches > 50
3. Batch Aggregation:
   - Worst-case controlling defect selection
   - Session aggregate density calculation
   - Multi-photo distribution counts
4. Governance:
   - Mandatory civil engineering disclaimer
   - requires_engineer_review flag
"""

import pytest
from app.services.damage_assessment import (
    assess_photo_damage_severity,
    assess_batch_damage_severity,
    ENGINEERING_DISCLAIMER
)


def test_calibrated_severity_boundaries():
    """Tests calibrated evaluation against specified boundaries."""
    # Sound concrete (no cracks)
    sound = assess_photo_damage_severity({
        "has_cracks": False,
        "crack_count": 0,
        "is_calibrated": True,
        "mm_per_pixel": 0.25
    })
    assert sound["severity_code"] == "none"
    assert sound["requires_engineer_review"] is True

    # Minor: Peak width < 3.0 mm and density < 2.0%
    minor = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 1,
        "maximum_crack_width_px": 8.0,
        "surface_area_px": 1000000,
        "crack_area_px": 5000,
        "crack_density_pct": 0.5,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # 8.0 * 0.25 = 2.0 mm (< 3.0 mm)
    })
    assert minor["severity_code"] == "minor"
    assert minor["peak_width_mm"] == 2.0

    # Moderate via width: 3.0 mm <= w <= 5.0 mm
    mod_w = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 2,
        "maximum_crack_width_px": 16.0,
        "surface_area_px": 1000000,
        "crack_area_px": 12000,
        "crack_density_pct": 1.2,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # 16.0 * 0.25 = 4.0 mm
    })
    assert mod_w["severity_code"] == "moderate"

    # Moderate via density: density between 2.0% and 5.0%
    mod_d = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 2,
        "maximum_crack_width_px": 8.0,
        "surface_area_px": 1000000,
        "crack_area_px": 35000,
        "crack_density_pct": 3.5,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # width = 2.0 mm (minor), but density = 3.5% (moderate)
    })
    assert mod_d["severity_code"] == "moderate"

    # Severe via width: > 5.0 mm <= 8.0 mm
    sev_w = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 3,
        "maximum_crack_width_px": 28.0,
        "surface_area_px": 1000000,
        "crack_area_px": 15000,
        "crack_density_pct": 1.5,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # 28.0 * 0.25 = 7.0 mm
    })
    assert sev_w["severity_code"] == "severe"

    # Severe via density: 5.0% - 9.0%
    sev_d = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 5,
        "maximum_crack_width_px": 12.0,
        "surface_area_px": 1000000,
        "crack_area_px": 75000,
        "crack_density_pct": 7.5,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # width = 3.0 mm (moderate), but density = 7.5% (severe)
    })
    assert sev_d["severity_code"] == "severe"

    # Severe via branching: branches > 10
    sev_b = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 4,
        "maximum_crack_width_px": 8.0,
        "surface_area_px": 1000000,
        "crack_area_px": 10000,
        "crack_density_pct": 1.0,
        "total_branch_count": 14,
        "is_calibrated": True,
        "mm_per_pixel": 0.25
    })
    assert sev_b["severity_code"] == "severe"

    # Critical via width: > 8.0 mm
    crit_w = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 1,
        "maximum_crack_width_px": 40.0,
        "surface_area_px": 1000000,
        "crack_area_px": 20000,
        "crack_density_pct": 2.0,
        "is_calibrated": True,
        "mm_per_pixel": 0.25  # 40.0 * 0.25 = 10.0 mm (> 8.0 mm)
    })
    assert crit_w["severity_code"] == "critical"

    # Critical via density: > 9.0% (with user's +1% adjustment)
    crit_d = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 10,
        "maximum_crack_width_px": 10.0,
        "surface_area_px": 1000000,
        "crack_area_px": 95000,
        "crack_density_pct": 9.5,
        "is_calibrated": True,
        "mm_per_pixel": 0.25
    })
    assert crit_d["severity_code"] == "critical"

    # Critical via extensive alligator branches > 50
    crit_b = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 12,
        "maximum_crack_width_px": 12.0,
        "surface_area_px": 1000000,
        "crack_area_px": 30000,
        "crack_density_pct": 3.0,
        "total_branch_count": 75,
        "is_calibrated": True,
        "mm_per_pixel": 0.25
    })
    assert crit_b["severity_code"] == "critical"


def test_uncalibrated_scale_invariant_mode():
    """Tests scale-invariant density & morphology evaluation when optical calibration is missing."""
    # Uncalibrated minor: density < 0.5%
    uncal_minor = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 1,
        "maximum_crack_width_px": 10.0,
        "image_width": 2000,
        "image_height": 2000,
        "surface_area_px": 4000000,
        "crack_area_px": 16000,
        "crack_density_pct": 0.4,
        "total_branch_count": 2,
        "is_calibrated": False
    })
    assert uncal_minor["is_calibrated"] is False
    assert uncal_minor["severity_code"] == "minor"
    assert uncal_minor["peak_width_mm"] is None
    assert uncal_minor["basis"] == "scale_invariant_density_and_morphology"

    # Uncalibrated moderate: density 0.5% - 2.5%
    uncal_mod = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 3,
        "maximum_crack_width_px": 20.0,
        "image_width": 2000,
        "image_height": 2000,
        "surface_area_px": 4000000,
        "crack_area_px": 60000,
        "crack_density_pct": 1.5,
        "total_branch_count": 4,
        "is_calibrated": False
    })
    assert uncal_mod["severity_code"] == "moderate"

    # Uncalibrated severe: density 2.5% - 9.0% (user adjusted)
    uncal_sev = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 16,
        "maximum_crack_width_px": 50.0,
        "image_width": 2000,
        "image_height": 2000,
        "surface_area_px": 4000000,
        "crack_area_px": 240000,
        "crack_density_pct": 6.0,
        "total_branch_count": 18,
        "is_calibrated": False
    })
    assert uncal_sev["severity_code"] == "severe"

    # Uncalibrated critical: density > 9.0% (user adjusted)
    uncal_crit = assess_photo_damage_severity({
        "has_cracks": True,
        "crack_count": 30,
        "maximum_crack_width_px": 90.0,
        "image_width": 2000,
        "image_height": 2000,
        "surface_area_px": 4000000,
        "crack_area_px": 450000,
        "crack_density_pct": 11.25,
        "total_branch_count": 65,
        "is_calibrated": False
    })
    assert uncal_crit["severity_code"] == "critical"
    assert uncal_crit["priority"]["code"] == "urgent_engineering_review"


def test_defect_override_exposed_rebar():
    """Tests that exposed rebar or spalling escalates directly to Critical."""
    res = assess_photo_damage_severity(
        {
            "has_cracks": True,
            "crack_count": 1,
            "maximum_crack_width_px": 15.0,
            "crack_density_pct": 0.8,
            "is_calibrated": True,
            "mm_per_pixel": 0.25
        },
        defect_type="exposed_reinforcement"
    )
    assert res["severity_code"] == "critical"
    assert "Rebar" in res["controlling_factor"]


def test_batch_aggregation():
    """Tests batch aggregation of multiple photos in a session."""
    photos = [
        {
            "id": "p-1",
            "name": "Wall_01.jpg",
            "crackGeometry": {
                "summary": {
                    "has_cracks": True,
                    "crack_count": 1,
                    "crack_coverage_pct": 0.4,
                    "total_crack_area_pixels": 4000,
                    "total_surface_area_pixels": 1000000,
                    "maximum_crack_width_px": 6.0,
                    "is_calibrated": False
                }
            }
        },
        {
            "id": "p-2",
            "name": "Column_North.jpg",
            "calibration": {
                "is_calibrated": True,
                "scale_factor_mm_per_pixel": 0.25
            },
            "crackGeometry": {
                "summary": {
                    "has_cracks": True,
                    "crack_count": 4,
                    "crack_coverage_pct": 5.8,
                    "total_crack_area_pixels": 58000,
                    "total_surface_area_pixels": 1000000,
                    "maximum_crack_width_px": 28.0,  # 28 * 0.25 = 7.0 mm (Severe)
                    "maximum_crack_width_mm": 7.0,
                    "is_calibrated": True,
                    "calibration_mm_per_pixel": 0.25,
                    "total_branch_count": 14
                }
            }
        },
        {
            "id": "p-3",
            "name": "Beam_03.jpg",
            "aiClassification": {
                "has_crack": False
            }
        }
    ]

    batch_res = assess_batch_damage_severity(photos)
    assert batch_res["total_photos"] == 3
    assert batch_res["overall_severity_code"] == "severe"
    assert batch_res["severity_distribution"]["severe"] == 1
    assert batch_res["severity_distribution"]["minor"] == 1
    assert batch_res["severity_distribution"]["none"] == 1
    assert batch_res["controlling_finding"]["photo_id"] == "p-2"
    assert batch_res["controlling_finding"]["peak_width_mm"] == 7.0
    assert batch_res["calibrated_count"] == 1
    assert batch_res["uncalibrated_count"] == 2
    assert batch_res["requires_engineer_review"] is True
    assert ENGINEERING_DISCLAIMER in batch_res["disclaimer"]
