import sys, os, io, time, base64
from pathlib import Path
import cv2
import numpy as np

# Ensure project modules are accessible
sys.path.insert(0, r"d:\project\aiml prime\project\infosys\apps\api")

from app.services.classifier import get_classifier
from app.services.yolo_detector import get_yolo_detector
from app.services.unet_segmentor import get_unet_segmentor
from app.services.image_quality import preprocess_image

def image_to_base64_thumbnail(img_bgr, max_dim=500, quality=85):
    h, w = img_bgr.shape[:2]
    scale = max_dim / max(h, w)
    if scale < 1.0:
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = img_bgr
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, buffer = cv2.imencode('.jpg', resized, encode_param)
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

def main():
    print("=" * 75)
    print("Initializing Multi-Modal AI Inspection Suite (ResNet-18 + YOLOv8 + UNet)...")
    print("=" * 75)

    clf = get_classifier()
    print(f"ResNet-18 Classifier: loaded={clf.is_loaded}")

    yolo = get_yolo_detector()
    print(f"YOLO Detector: loaded={yolo.is_loaded}")

    unet = get_unet_segmentor()
    print(f"UNet Crack Segmentor: loaded={unet.is_loaded}, Dice={unet.metrics.get('dice', 0.7514)*100:.2f}%")

    img_dir = Path(r"C:\Users\yashr\Downloads\crcack")
    out_dir_brain = Path(r"C:\Users\yashr\.gemini\antigravity\brain\b449842a-e58f-443a-a909-79fe6640ed03\images")
    out_dir_local = img_dir / "unet_outputs"
    out_dir_brain.mkdir(parents=True, exist_ok=True)
    out_dir_local.mkdir(parents=True, exist_ok=True)

    all_files = sorted(list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.png")) + list(img_dir.glob("*.jpeg")))
    image_files = [f for f in all_files if not f.name.startswith("annotated_") and not f.name.startswith("temp_") and not f.name.startswith("comparison_") and not f.name.endswith(".html")]

    print(f"Processing {len(image_files)} images with UNet Crack Segmentation...")
    print("-" * 75)

    results = []

    for idx, img_path in enumerate(image_files, 1):
        print(f"[{idx:02d}/{len(image_files)}] Analyzing {img_path.name}...")
        orig_bgr = cv2.imread(str(img_path))
        if orig_bgr is None:
            continue
        h, w = orig_bgr.shape[:2]

        with open(img_path, "rb") as f:
            raw_bytes = f.read()

        # Step 1: Classical Preprocessing
        proc_bytes, _, _ = preprocess_image(raw_bytes, profile_name="general_v1")
        temp_proc_path = img_dir / f"temp_proc_{img_path.stem}.png"
        with open(temp_proc_path, "wb") as f:
            f.write(proc_bytes)

        # Step 2: ResNet-18 Multi-Scale Spatial Classifier
        clf_pred = clf.predict(str(temp_proc_path))
        p_crack = float(clf_pred.get("crack_probability", 0.0))
        is_crack_stage1 = bool(p_crack >= 0.80)

        # Step 3: YOLOv8 Bounding Box Localizer
        yolo_ann_path = out_dir_local / f"yolo_{img_path.stem}.jpg"
        yolo_res = yolo.detect(
            image_input=str(temp_proc_path),
            conf=0.08,
            imgsz=768,
            save_annotated_path=str(yolo_ann_path),
            resnet_confidence=p_crack
        )
        yolo_bgr = cv2.imread(str(yolo_ann_path))
        if yolo_bgr is None:
            yolo_bgr = orig_bgr.copy()

        # Step 4: UNet Pixel-Level Crack Segmentation (best_model.pth)
        t_unet = time.time()
        unet_overlay_path = out_dir_local / f"unet_overlay_{img_path.stem}.jpg"
        unet_mask_path = out_dir_local / f"unet_mask_{img_path.stem}.png"

        unet_res = unet.segment(
            image_input=orig_bgr,
            threshold=0.5,
            save_overlay_path=str(unet_overlay_path),
            save_mask_path=str(unet_mask_path)
        )
        unet_time_ms = round((time.time() - t_unet) * 1000, 1)

        # Read generated UNet images
        unet_overlay_bgr = cv2.imread(str(unet_overlay_path))
        if unet_overlay_bgr is None:
            unet_overlay_bgr = orig_bgr.copy()
        unet_mask_bgr = cv2.imread(str(unet_mask_path))
        if unet_mask_bgr is None:
            unet_mask_bgr = np.zeros_like(orig_bgr)

        # Clean temp file
        try:
            if temp_proc_path.exists():
                temp_proc_path.unlink()
        except Exception:
            pass

        # Build Side-by-Side 3-Way Composite: [ ORIGINAL | UNET SEGMENTATION | YOLO DETECTION ]
        target_h = 380
        orig_w_scaled = int(w * (target_h / h))
        orig_small = cv2.resize(orig_bgr, (orig_w_scaled, target_h), interpolation=cv2.INTER_AREA)

        # UNet overlay image (strip HUD for panel)
        unet_body = unet_overlay_bgr[42:, :] if unet_overlay_bgr.shape[0] > 42 else unet_overlay_bgr
        unet_w_scaled = int(unet_body.shape[1] * (target_h / unet_body.shape[0]))
        unet_small = cv2.resize(unet_body, (unet_w_scaled, target_h), interpolation=cv2.INTER_AREA)

        yolo_w_scaled = int(yolo_bgr.shape[1] * (target_h / yolo_bgr.shape[0]))
        yolo_small = cv2.resize(yolo_bgr, (yolo_w_scaled, target_h), interpolation=cv2.INTER_AREA)

        # Add headers
        def add_hdr(img, text, color=(240, 240, 240), bg=(20, 20, 20)):
            hdr = np.full((32, img.shape[1], 3), bg, dtype=np.uint8)
            cv2.putText(hdr, text, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
            return np.vstack([hdr, img])

        p1 = add_hdr(orig_small, f"1. ORIGINAL ({orig_w_scaled}x{target_h})", (200, 200, 200), (25, 25, 25))
        p2 = add_hdr(unet_small, f"2. UNET CRACK MASK ({unet_res.get('crack_area_pct', 0)}% AREA)", (100, 230, 255), (20, 20, 45))
        p3 = add_hdr(yolo_small, f"3. YOLO DEFECTS ({yolo_res.get('detections_count', 0)} ZONES)", (120, 150, 255), (45, 20, 25))

        divider = np.full((target_h + 32, 4, 3), (50, 50, 50), dtype=np.uint8)
        comp_strip = np.hstack([p1, divider, p2, divider, p3])

        # Bottom info footer
        foot_h = 32
        foot = np.full((foot_h, comp_strip.shape[1], 3), (12, 12, 16), dtype=np.uint8)
        foot_txt = (
            f"ResNet-18: {p_crack*100:.1f}% ({'CRACK' if is_crack_stage1 else 'SOUND'}) | "
            f"UNet: {unet_res.get('crack_area_pct', 0)}% Surface Area, Max Width: {unet_res.get('max_width_px', 0)}px, Len: {unet_res.get('total_length_px', 0)}px | "
            f"YOLO: {yolo_res.get('detections_count', 0)} boxes ({yolo_res.get('primary_defect', 'None')})"
        )
        cv2.putText(foot, foot_txt, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 255, 220), 1, cv2.LINE_AA)
        final_tri_card = np.vstack([comp_strip, foot])

        # Save composite to brain images directory
        comp_card_name = f"unet_tri_comparison_{idx}_{img_path.stem}.jpg"
        comp_card_path = out_dir_brain / comp_card_name
        cv2.imwrite(str(comp_card_path), final_tri_card, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

        # Also save unet overlay directly in brain directory for direct embedding
        brain_unet_overlay_path = out_dir_brain / f"unet_overlay_{idx}_{img_path.stem}.jpg"
        cv2.imwrite(str(brain_unet_overlay_path), unet_overlay_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

        # Base64 thumbnails for HTML
        orig_b64 = image_to_base64_thumbnail(orig_bgr, max_dim=500)
        unet_overlay_b64 = image_to_base64_thumbnail(unet_overlay_bgr, max_dim=500)
        unet_mask_b64 = image_to_base64_thumbnail(unet_mask_bgr, max_dim=500)
        yolo_b64 = image_to_base64_thumbnail(yolo_bgr, max_dim=500)

        record = {
            "index": idx,
            "filename": img_path.name,
            "width": w,
            "height": h,
            "p_crack": p_crack,
            "is_crack_stage1": is_crack_stage1,
            "unet_crack_area_pct": unet_res.get("crack_area_pct", 0.0),
            "unet_crack_pixels": unet_res.get("crack_pixels", 0),
            "unet_max_width_px": unet_res.get("max_width_px", 0.0),
            "unet_total_length_px": unet_res.get("total_length_px", 0.0),
            "unet_mean_conf": unet_res.get("mean_crack_confidence", 0.0),
            "unet_components": unet_res.get("components_count", 0),
            "unet_time_ms": unet_time_ms,
            "yolo_count": yolo_res.get("detections_count", 0),
            "yolo_primary": yolo_res.get("primary_defect", "None"),
            "yolo_detections": yolo_res.get("detections", []),
            "orig_b64": orig_b64,
            "unet_overlay_b64": unet_overlay_b64,
            "unet_mask_b64": unet_mask_b64,
            "yolo_b64": yolo_b64,
            "comp_card_name": comp_card_name,
        }
        results.append(record)

        print(f"   -> ResNet-18: {p_crack*100:.1f}% Crack")
        print(f"   -> UNet (best_model.pth): {unet_res.get('crack_area_pct', 0)}% Area ({unet_res.get('crack_pixels', 0):,} px) | Max Width: {unet_res.get('max_width_px', 0)}px | Len: {unet_res.get('total_length_px', 0)}px")
        print(f"   -> YOLOv8: {yolo_res.get('detections_count', 0)} boxes ({yolo_res.get('primary_defect', 'None')})")
        print(f"   -> Saved: {comp_card_name}\n")

    # Generate rich HTML scratchpad
    html = build_unet_scratchpad_html(results)

    save_destinations = [
        img_dir / "scratchpad_unet_lab.html",
        Path(r"C:\Users\yashr\.gemini\antigravity\brain\b449842a-e58f-443a-a909-79fe6640ed03\scratchpad_unet_lab.html"),
        Path(r"d:\project\aiml prime\project\infosys\scratchpad_unet_lab.html")
    ]

    for p in save_destinations:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"Saved UNet Scratchpad to: {p}")
        except Exception as e:
            print(f"Failed saving to {p}: {e}")

    print("\nAll UNet evaluations and scratchpads created successfully.")

def build_unet_scratchpad_html(results):
    total = len(results)
    cracked_stg1 = sum(1 for r in results if r["is_crack_stage1"])
    unet_cracked = sum(1 for r in results if r["unet_crack_area_pct"] > 0.05)
    total_yolo = sum(r["yolo_count"] for r in results)
    avg_unet_area = round(sum(r["unet_crack_area_pct"] for r in results if r["is_crack_stage1"]) / max(cracked_stg1, 1), 2)

    cards = []
    for r in results:
        is_crack = r["is_crack_stage1"]
        p_pct = r["p_crack"] * 100
        area = r["unet_crack_area_pct"]
        yolo_cnt = r["yolo_count"]

        badge_stg1 = f'<span class="badge {"badge-crack" if is_crack else "badge-uncrack"}">{"CRACK" if is_crack else "UNCRACKED"} &bull; {p_pct:.1f}%</span>'
        badge_unet = f'<span class="badge badge-unet">UNet Area: {area}% ({r["unet_crack_pixels"]:,} px)</span>'
        badge_yolo = f'<span class="badge {"badge-yolo" if yolo_cnt > 0 else "badge-none"}">YOLO: {yolo_cnt} Defects</span>'

        card = f"""
        <div class="card" id="card-{r['index']}">
            <div class="card-header">
                <div class="card-title-group">
                    <span class="card-index">#{r['index']}</span>
                    <h3 class="card-filename" title="{r['filename']}">{r['filename']}</h3>
                    <span class="file-dims">{r['width']}&times;{r['height']} px</span>
                </div>
                <div class="badges-row">
                    {badge_stg1}
                    {badge_unet}
                    {badge_yolo}
                </div>
            </div>

            <div class="card-body">
                <div class="viewer-container">
                    <div class="view-switcher" data-card="{r['index']}">
                        <button type="button" class="tab-btn active" onclick="switchView({r['index']}, 'unet-overlay', this)">
                            UNet Mask Overlay
                        </button>
                        <button type="button" class="tab-btn" onclick="switchView({r['index']}, 'unet-mask', this)">
                            Binary Mask
                        </button>
                        <button type="button" class="tab-btn" onclick="switchView({r['index']}, 'yolo', this)">
                            YOLO Detection ({yolo_cnt})
                        </button>
                        <button type="button" class="tab-btn" onclick="switchView({r['index']}, 'orig', this)">
                            Original Raw
                        </button>
                    </div>

                    <div class="image-stage">
                        <img id="img-{r['index']}-unet-overlay" src="{r['unet_overlay_b64']}" class="stage-img active" alt="UNet Overlay">
                        <img id="img-{r['index']}-unet-mask" src="{r['unet_mask_b64']}" class="stage-img" alt="Binary Mask">
                        <img id="img-{r['index']}-yolo" src="{r['yolo_b64']}" class="stage-img" alt="YOLO Detection">
                        <img id="img-{r['index']}-orig" src="{r['orig_b64']}" class="stage-img" alt="Original">
                    </div>
                </div>

                <div class="details-panel">
                    <h4 class="panel-section-title">UNet Pixel Segmentation Metrics (best_model.pth)</h4>

                    <div class="metrics-grid">
                        <div class="metric-card">
                            <span class="metric-label">Crack Area %</span>
                            <span class="metric-val text-unet">{area}%</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">Max Width / Thickness</span>
                            <span class="metric-val">{r['unet_max_width_px']} px</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">Total Crack Length</span>
                            <span class="metric-val">{r['unet_total_length_px']} px</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">Mean Pixel Confidence</span>
                            <span class="metric-val">{r['unet_mean_conf']*100:.1f}%</span>
                        </div>
                    </div>

                    <div class="unet-stats-box">
                        <div class="stat-line">
                            <span class="line-label">Pixel Count:</span>
                            <span class="line-val"><strong>{r['unet_crack_pixels']:,}</strong> of {r['width']*r['height']:,} px</span>
                        </div>
                        <div class="stat-line">
                            <span class="line-label">Connected Fragments:</span>
                            <span class="line-val">{r['unet_components']} crack components</span>
                        </div>
                        <div class="stat-line">
                            <span class="line-label">Model Benchmark:</span>
                            <span class="line-val">rimvydasrub/crackseg9k &bull; Val Dice: <strong>75.14%</strong> (IoU: 60.18%)</span>
                        </div>
                        <div class="stat-line">
                            <span class="line-label">Cross-Validation:</span>
                            <span class="line-val">Stage 1 ResNet-18: <strong>{p_pct:.1f}%</strong> | Stage 2 YOLOv8: <strong>{yolo_cnt}</strong> boxes</span>
                        </div>
                    </div>

                    <div class="latency-strip">
                        <span>UNet Inference: {r['unet_time_ms']} ms &bull; Resolution: 384&times;384px &bull; Threshold: 0.50</span>
                    </div>
                </div>
            </div>
        </div>
        """
        cards.append(card)

    cards_html = "\n".join(cards)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InfraScan UNet Crack Segmentation Scratchpad</title>
    <style>
        :root {{
            --bg: #09090b;
            --card-bg: #121217;
            --border: #27272a;
            --border-hover: #3f3f46;
            --text-main: #f4f4f5;
            --text-muted: #a1a1aa;
            --primary: #3b82f6;
            --cyan: #06b6d4;
            --cyan-bg: rgba(6, 182, 212, 0.15);
            --rose: #f43f5e;
            --rose-bg: rgba(244, 63, 94, 0.15);
            --emerald: #10b981;
            --emerald-bg: rgba(16, 185, 129, 0.15);
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            background: var(--bg);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 24px;
            line-height: 1.5;
        }}
        .header {{
            max-width: 1400px;
            margin: 0 auto 24px auto;
            border-bottom: 1px solid var(--border);
            padding-bottom: 20px;
        }}
        .header-top {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }}
        .header h1 {{
            font-size: 24px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .pill-tag {{
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            background: #164e63;
            color: #67e8f9;
            border: 1px solid #0891b2;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}
        .header p {{
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 6px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-top: 18px;
        }}
        .stat-card {{
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 14px 18px;
        }}
        .stat-label {{
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.05em;
            display: block;
        }}
        .stat-val {{
            font-size: 24px;
            font-weight: 800;
            font-family: ui-monospace, SFMono-Regular, monospace;
            margin-top: 2px;
            display: block;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }}
        .card {{
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            transition: border-color 0.2s;
        }}
        .card:hover {{ border-color: var(--border-hover); }}
        .card-header {{
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.02);
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
        }}
        .card-title-group {{ display: flex; align-items: center; gap: 12px; }}
        .card-index {{ font-size: 12px; font-weight: 700; color: var(--cyan); font-family: monospace; }}
        .card-filename {{ font-size: 15px; font-weight: 700; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
        .file-dims {{ font-size: 12px; color: var(--text-muted); font-family: monospace; }}
        .badges-row {{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }}
        .badge {{ font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; border: 1px solid transparent; }}
        .badge-crack {{ background: var(--rose-bg); color: #fda4af; border-color: rgba(244, 63, 94, 0.4); }}
        .badge-uncrack {{ background: var(--emerald-bg); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.4); }}
        .badge-unet {{ background: var(--cyan-bg); color: #67e8f9; border-color: rgba(6, 182, 212, 0.4); }}
        .badge-yolo {{ background: rgba(244, 63, 94, 0.2); color: #ff6b81; border-color: rgba(244, 63, 94, 0.6); }}
        .badge-none {{ background: #18181b; color: #71717a; border-color: #27272a; }}
        .card-body {{
            display: grid;
            grid-template-columns: 1.15fr 1fr;
            gap: 20px;
            padding: 20px;
        }}
        @media (max-width: 960px) {{
            .card-body {{ grid-template-columns: 1fr; }}
        }}
        .viewer-container {{ display: flex; flex-direction: column; gap: 10px; }}
        .view-switcher {{
            display: inline-flex;
            background: #18181b;
            border: 1px solid var(--border);
            padding: 3px;
            border-radius: 8px;
            width: fit-content;
            gap: 4px;
        }}
        .tab-btn {{
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 5px 11px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .tab-btn.active {{
            background: #27272a;
            color: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }}
        .tab-btn:hover:not(.active) {{ color: #fff; }}
        .image-stage {{
            position: relative;
            aspect-ratio: 16/10;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .stage-img {{ width: 100%; height: 100%; object-fit: contain; display: none; }}
        .stage-img.active {{ display: block; }}
        .details-panel {{ display: flex; flex-direction: column; justify-content: space-between; gap: 14px; }}
        .panel-section-title {{ font-size: 13px; font-weight: 700; color: var(--text-main); }}
        .metrics-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }}
        .metric-card {{ background: #18181b; border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }}
        .metric-label {{ font-size: 10px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.04em; display: block; }}
        .metric-val {{ font-size: 16px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, monospace; margin-top: 2px; display: block; }}
        .text-unet {{ color: #22d3ee; }}
        .text-yolo {{ color: #f43f5e; }}
        .unet-stats-box {{
            background: #18181b;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 11px;
        }}
        .stat-line {{ display: flex; justify-content: space-between; align-items: center; }}
        .line-label {{ color: var(--text-muted); }}
        .line-val {{ font-family: monospace; }}
        .latency-strip {{
            font-size: 10px;
            color: var(--text-muted);
            font-family: monospace;
            border-top: 1px solid var(--border);
            padding-top: 8px;
        }}
    </style>
</head>
<body>
    <header class="header">
        <div class="header-top">
            <div>
                <h1>
                    <span>InfraScan UNet Crack Segmentation Scratchpad</span>
                    <span class="pill-tag">best_model.pth (Dice 75.14%)</span>
                </h1>
                <p>Pixel-level structural crack segmentation evaluation across test dataset in <code>C:\\Users\\yashr\\Downloads\\crcack</code> using UNet (CrackSeg9k, 384&times;384px).</p>
            </div>
            <div>
                <span class="badge badge-unet">Model: best_model.pth (7.46 MB)</span>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-label">Total Images Analyzed</span>
                <span class="stat-val">{total}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">UNet Positive Crack Masks</span>
                <span class="stat-val text-unet">{unet_cracked} / {total}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Avg Crack Surface Area</span>
                <span class="stat-val text-unet">{avg_unet_area}%</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Validation Dice Score</span>
                <span class="stat-val text-unet">75.14%</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Total YOLO Defect Zones</span>
                <span class="stat-val text-yolo">{total_yolo}</span>
            </div>
        </div>
    </header>

    <main class="container">
        {cards_html}
    </main>

    <script>
        function switchView(cardIdx, mode, btn) {{
            const card = document.getElementById('card-' + cardIdx);
            if (!card) return;

            const btns = card.querySelectorAll('.tab-btn');
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const imgs = card.querySelectorAll('.stage-img');
            imgs.forEach(img => img.classList.remove('active'));

            const targetImg = document.getElementById('img-' + cardIdx + '-' + mode);
            if (targetImg) targetImg.classList.add('active');
        }}
    </script>
</body>
</html>
"""

if __name__ == "__main__":
    main()

