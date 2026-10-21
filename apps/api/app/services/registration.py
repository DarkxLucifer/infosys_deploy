import os
import cv2
import numpy as np
from typing import Dict, Any, Optional, Tuple

def compare_inspections_opencv(
    image_path_1: str,
    image_path_2: str,
    measurements_1: Optional[Dict[str, Any]] = None,
    measurements_2: Optional[Dict[str, Any]] = None,
    inlier_threshold: float = 0.30
) -> Dict[str, Any]:
    """
    Performs classical OpenCV feature matching and RANSAC homography estimation
    between two inspection images of the same asset structure.
    Determines if images are strictly comparable before calculating progression percentages.
    """
    if not os.path.exists(image_path_1) or not os.path.exists(image_path_2):
        return {
            "comparable": False,
            "inlier_ratio": 0.0,
            "reason": "One or both image files not found on disk",
            "changes": None
        }

    img1 = cv2.imread(image_path_1, cv2.IMREAD_GRAYSCALE)
    img2 = cv2.imread(image_path_2, cv2.IMREAD_GRAYSCALE)

    if img1 is None or img2 is None:
        return {
            "comparable": False,
            "inlier_ratio": 0.0,
            "reason": "Unable to decode image files via OpenCV",
            "changes": None
        }

    # Use ORB detector for fast and invariant feature matching
    orb = cv2.ORB_create(nfeatures=1500)
    kp1, des1 = orb.detectAndCompute(img1, None)
    kp2, des2 = orb.detectAndCompute(img2, None)

    if des1 is None or des2 is None or len(kp1) < 10 or len(kp2) < 10:
        return {
            "comparable": False,
            "inlier_ratio": 0.0,
            "reason": "Insufficient detectable feature keypoints in one or both inspection images.",
            "changes": None
        }

    # Brute-force matcher with Hamming distance
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    matches = bf.knnMatch(des1, des2, k=2)

    # Lowe's ratio test
    good_matches = []
    for m, n in matches:
        if m.distance < 0.75 * n.distance:
            good_matches.append(m)

    if len(good_matches) < 8:
        return {
            "comparable": False,
            "inlier_ratio": 0.0,
            "total_matches": len(good_matches),
            "reason": f"Only {len(good_matches)} good feature matches found (minimum 8 required for RANSAC homography).",
            "changes": None
        }

    src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if H is None or mask is None:
        return {
            "comparable": False,
            "inlier_ratio": 0.0,
            "reason": "RANSAC failed to converge on a valid homography matrix.",
            "changes": None
        }

    inliers = int(np.sum(mask))
    inlier_ratio = round(inliers / len(good_matches), 3)

    is_comparable = inlier_ratio >= inlier_threshold

    changes = None
    if is_comparable and measurements_1 and measurements_2:
        # Check calibration comparability
        cal1 = measurements_1.get("calibrated", False)
        cal2 = measurements_2.get("calibrated", False)

        len1 = float(measurements_1.get("length", 0.0))
        len2 = float(measurements_2.get("length", 0.0))
        w1 = float(measurements_1.get("avg_width", 0.0))
        w2 = float(measurements_2.get("avg_width", 0.0))
        a1 = float(measurements_1.get("area", 0.0))
        a2 = float(measurements_2.get("area", 0.0))

        if cal1 and cal2:
            len_pct = round(((len2 - len1) / len1) * 100.0, 1) if len1 > 0 else 0.0
            w_pct = round(((w2 - w1) / w1) * 100.0, 1) if w1 > 0 else 0.0
            a_pct = round(((a2 - a1) / a1) * 100.0, 1) if a1 > 0 else 0.0
            changes = {
                "calibrated": True,
                "length_change_pct": len_pct,
                "width_change_pct": w_pct,
                "area_change_pct": a_pct,
                "unit": "mm",
                "summary": f"Length: {len1}mm -> {len2}mm ({len_pct:+0.1f}%), Avg Width: {w1}mm -> {w2}mm ({w_pct:+0.1f}%)"
            }
        else:
            changes = {
                "calibrated": False,
                "summary": "Images aligned successfully, but one or both inspections lack scale calibration. Measurements compared in raw pixel coordinates only; no physical change percentage certified."
            }

    return {
        "comparable": is_comparable,
        "inlier_ratio": inlier_ratio,
        "inliers_count": inliers,
        "total_matches": len(good_matches),
        "homography_matrix": H.tolist() if H is not None else None,
        "reason": "Feature matching and RANSAC alignment passed comparability gate." if is_comparable else f"Inlier ratio ({inlier_ratio:.2f}) fell below comparability threshold ({inlier_threshold:.2f}). Perspective distortion exceeds certified comparison tolerances.",
        "changes": changes
    }
