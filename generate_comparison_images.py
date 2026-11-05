import os, sys
from pathlib import Path
import cv2
import numpy as np

src_dir = Path(r"C:\Users\yashr\Downloads\crcack")
out_dir = Path(r"C:\Users\yashr\.gemini\antigravity\brain\b449842a-e58f-443a-a909-79fe6640ed03\images")
out_dir.mkdir(parents=True, exist_ok=True)

test_files = [
    ("1", "ayoub-aallagui-7dhK2f9SUDY-unsplash.jpg", "annotated_yolo_ayoub-aallagui-7dhK2f9SUDY-unsplash.jpg", "99.0%", "1 Defect (Alligator Crack 27%)"),
    ("2", "crack.jpg", "annotated_yolo_crack.jpg", "99.4%", "3 Defects (Alligator, 2 Potholes)"),
    ("3", "images (1).jpg", "annotated_yolo_images (1).jpg", "86.9%", "Crack Area (Micro-crack)"),
    ("4", "images (2).jpg", "annotated_yolo_images (2).jpg", "99.8%", "2 Defects (Pothole 53%, Alligator 10%)"),
    ("5", "michael-dziedzic-3s1DBnKShiY-unsplash.jpg", "annotated_yolo_michael-dziedzic-3s1DBnKShiY-unsplash.jpg", "12.4%", "Sound Concrete (No Defects)"),
    ("6", "mick-haupt-7Kv1Elbagcc-unsplash (1).jpg", "annotated_yolo_mick-haupt-7Kv1Elbagcc-unsplash (1).jpg", "98.4%", "1 Defect (Longitudinal Crack 9%)"),
    ("7", "mick-haupt-7Kv1Elbagcc-unsplash.jpg", "annotated_yolo_mick-haupt-7Kv1Elbagcc-unsplash.jpg", "98.4%", "1 Defect (Longitudinal Crack 9%)"),
    ("8", "Screenshot 2026-10-28 192156.png", "annotated_yolo_Screenshot 2026-10-28 192156.jpg", "99.3%", "6 Defects (2 Longitudinal, 4 Transverse)"),
    ("9", "Screenshot 2026-10-28 194158.png", "annotated_yolo_Screenshot 2026-10-28 194158.jpg", "98.8%", "2 Defects (2 Alligator Cracks)"),
    ("10", "Screenshot 2026-10-28 194231.png", "annotated_yolo_Screenshot 2026-10-28 194231.jpg", "99.7%", "8 Defects (3 Alligator, 2 Transverse, 3 Long)"),
    ("11", "Screenshot 2026-10-28 194252.png", "annotated_yolo_Screenshot 2026-10-28 194252.jpg", "99.5%", "1 Defect (Longitudinal Crack 7%)"),
    ("12", "Screenshot 2026-10-28 194326.png", "annotated_yolo_Screenshot 2026-10-28 194326.jpg", "99.9%", "5 Defects (4 Longitudinal, 1 Transverse)")
]

def add_header(img, label, color=(255, 255, 255), bg_color=(20, 20, 20)):
    h, w = img.shape[:2]
    header_h = 36
    header = np.full((header_h, w, 3), bg_color, dtype=np.uint8)
    cv2.putText(header, label, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2, cv2.LINE_AA)
    return np.vstack([header, img])

for idx, orig_name, ann_name, p_crack, det_summary in test_files:
    orig_path = src_dir / orig_name
    ann_path = src_dir / ann_name

    orig_img = cv2.imread(str(orig_path))
    ann_img = cv2.imread(str(ann_path))

    if orig_img is None or ann_img is None:
        print(f"Skipping {idx}: {orig_name}")
        continue

    # Resize to uniform height for side-by-side
    target_h = 420
    orig_w = int(orig_img.shape[1] * (target_h / orig_img.shape[0]))
    ann_w = int(ann_img.shape[1] * (target_h / ann_img.shape[0]))

    orig_resized = cv2.resize(orig_img, (orig_w, target_h), interpolation=cv2.INTER_AREA)
    ann_resized = cv2.resize(ann_img, (ann_w, target_h), interpolation=cv2.INTER_AREA)

    # Add header bars
    orig_with_header = add_header(orig_resized, f"ORIGINAL: {orig_name[:24]}", color=(220, 220, 220), bg_color=(25, 25, 25))
    ann_with_header = add_header(ann_resized, f"YOLO DETECTION (Stage 2): {det_summary}", color=(100, 220, 255), bg_color=(35, 20, 20))

    # Divider bar
    divider = np.full((target_h + 36, 6, 3), (60, 60, 60), dtype=np.uint8)

    # Combine side by side
    combined = np.hstack([orig_with_header, divider, ann_with_header])

    # Also add bottom metadata bar
    bar_h = 32
    comb_w = combined.shape[1]
    bottom_bar = np.full((bar_h, comb_w, 3), (15, 15, 15), dtype=np.uint8)
    status_txt = f"Stage 1 ResNet-18: {p_crack} Crack | Threshold: 80% | Result: {'CRACK' if float(p_crack.strip('%')) >= 80 else 'UNCRACKED'}"
    cv2.putText(bottom_bar, status_txt, (14, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (150, 255, 180) if float(p_crack.strip('%')) >= 80 else (200, 200, 200), 1, cv2.LINE_AA)
    
    final_card = np.vstack([combined, bottom_bar])

    # Save outputs
    card_filename = f"comparison_{idx}_{orig_path.stem}.jpg"
    card_path = out_dir / card_filename
    cv2.imwrite(str(card_path), final_card, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

    # Also save separate annotated copy
    ann_clean_path = out_dir / f"yolo_annotated_{idx}_{orig_path.stem}.jpg"
    cv2.imwrite(str(ann_clean_path), ann_img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

    print(f"Generated #{idx}: {card_filename} ({comb_w}x{final_card.shape[0]})")

print("All comparison images generated successfully in brain directory.")

