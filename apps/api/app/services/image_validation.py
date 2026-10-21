import hashlib
import io
import math
from typing import Dict, Any, Tuple
from PIL import Image, ImageStat
import numpy as np
import cv2

def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def compute_phash(img: Image.Image, hash_size: int = 8) -> str:
    """Computes a 64-bit difference hash (dHash) for perceptual duplicate detection."""
    resized = img.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    pixels = list(resized.getdata())
    difference = []
    for row in range(hash_size):
        for col in range(hash_size):
            pixel_left = pixels[row * (hash_size + 1) + col]
            pixel_right = pixels[row * (hash_size + 1) + col + 1]
            difference.append(pixel_left > pixel_right)
    decimal_val = 0
    hex_str = []
    for index, val in enumerate(difference):
        if val:
            decimal_val += 2 ** (index % 4)
        if (index % 4) == 3:
            hex_str.append(hex(decimal_val)[2:])
            decimal_val = 0
    return "".join(hex_str)

def validate_inspection_image(
    file_bytes: bytes,
    filename: str,
    max_size_mb: int = 50,
    min_res: int = 100,
    blur_threshold: float = 100.0,
    low_light_threshold: float = 40.0
) -> Tuple[bool, str, Dict[str, Any], Image.Image | None]:
    """
    Validates inspection images against Phase 3 (Checks J4, J6) quality & abuse standards:
    - Format / MIME / extension
    - Abuse rejection (zero-byte, non-image, path traversal, zip bombs)
    - Blur check via Laplacian variance
    - Low-light check via mean luminance
    - Completeness check via pixel variance
    """
    if not file_bytes or len(file_bytes) == 0:
        return False, "rejected", {
            "error": "EMPTY_FILE",
            "message": "Uploaded file is zero bytes."
        }, None

    if len(file_bytes) > max_size_mb * 1024 * 1024:
        return False, "rejected", {
            "error": "FILE_TOO_LARGE",
            "message": f"File exceeds maximum allowed size of {max_size_mb} MB.",
            "measured": len(file_bytes),
            "threshold": max_size_mb * 1024 * 1024
        }, None

    # Sanitize filename / path traversal
    if ".." in filename or "/" in filename or "\\" in filename or "<" in filename or ">" in filename:
        return False, "rejected", {
            "error": "INVALID_FILENAME",
            "message": "Filename contains invalid path traversal or script characters."
        }, None

    # Magic byte check
    is_valid_header = (
        file_bytes.startswith(b"\xff\xd8\xff") or  # JPEG
        file_bytes.startswith(b"\x89PNG\r\n\x1a\n") or  # PNG
        file_bytes.startswith(b"RIFF") and b"WEBP" in file_bytes[:16]  # WebP
    )
    if not is_valid_header:
        return False, "rejected", {
            "error": "INVALID_IMAGE_HEADER",
            "message": "File does not contain a valid JPEG, PNG, or WebP magic header."
        }, None

    # Attempt to open with PIL
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()  # Check for corruption
        # Re-open for actual processing after verify()
        img = Image.open(io.BytesIO(file_bytes))
        img.load()
    except Exception as e:
        return False, "rejected", {
            "error": "CORRUPT_IMAGE",
            "message": f"Image file is corrupt or unreadable: {str(e)}"
        }, None

    width, height = img.size
    if width < min_res or height < min_res:
        return False, "rejected", {
            "error": "RESOLUTION_TOO_LOW",
            "message": f"Image resolution ({width}x{height}) is below minimum requirement of {min_res}x{min_res}.",
            "measured": f"{width}x{height}",
            "threshold": f"{min_res}x{min_res}"
        }, None

    # Convert to OpenCV numpy array for photometric and blur calculations
    np_img = np.array(img.convert("RGB"))
    gray = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

    # 1. Blur detection via Laplacian variance
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurred = laplacian_var < blur_threshold

    # 2. Low-light check via mean luminance
    mean_luminance = float(np.mean(gray))
    is_low_light = mean_luminance < low_light_threshold

    # 3. Completeness check (mostly blank or uniform pixel values)
    pixel_std = float(np.std(gray))
    is_incomplete = pixel_std < 5.0

    metrics = {
        "width": width,
        "height": height,
        "file_size": len(file_bytes),
        "blur_laplacian_var": round(laplacian_var, 2),
        "blur_threshold": blur_threshold,
        "mean_luminance": round(mean_luminance, 2),
        "low_light_threshold": low_light_threshold,
        "pixel_std_dev": round(pixel_std, 2),
        "is_blurred": is_blurred,
        "is_low_light": is_low_light,
        "is_incomplete": is_incomplete,
    }

    if is_incomplete:
        return False, "rejected", {
            **metrics,
            "error": "IMAGE_INCOMPLETE",
            "message": "Image is blank, uniform, or truncated."
        }, img

    if is_blurred and is_low_light:
        return False, "rejected", {
            **metrics,
            "error": "QUALITY_DEFECT_MULTIPLE",
            "message": f"Image is both severely blurred (score {round(laplacian_var, 1)} < {blur_threshold}) and underexposed (luminance {round(mean_luminance, 1)} < {low_light_threshold})."
        }, img

    if is_blurred:
        return True, "warned", {
            **metrics,
            "warning": "BLUR_DETECTED",
            "message": f"Image exhibits blur (Laplacian score {round(laplacian_var, 1)} < threshold {blur_threshold}). Requires confirmation."
        }, img

    if is_low_light:
        return True, "warned", {
            **metrics,
            "warning": "LOW_LIGHT_DETECTED",
            "message": f"Image has low luminance ({round(mean_luminance, 1)} < threshold {low_light_threshold}). Requires confirmation."
        }, img

    return True, "valid", metrics, img
