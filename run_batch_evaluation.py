import sys, os, io, time, base64
from pathlib import Path
import cv2
import numpy as np

# Ensure project app modules are reachable
sys.path.insert(0, r"d:\project\aiml prime\project\infosys\apps\api")

from app.services.classifier import get_classifier
from app.services.yolo_detector import get_yolo_detector
from app.services.image_quality import preprocess_image

def image_to_base64_thumbnail(img_bgr, max_dim=480, quality=85):
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
    print("=" * 70)
    print("Initializing InfraScan Two-Stage AI Model Services...")
    print("=" * 70)

    clf = get_classifier()
    print(f"ResNet-18 Classifier: loaded={clf.is_loaded}, engine={clf.engine_type}")

    yolo = get_yolo_detector()
    print(f"YOLO Detector: loaded={yolo.is_loaded}, model={yolo.model_path.name if yolo.model_path else 'None'}")

    img_dir = Path(r"C:\Users\yashr\Downloads\crcack")
    all_files = sorted(list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.png")) + list(img_dir.glob("*.jpeg")))

    # Filter out any generated outputs
    image_files = [f for f in all_files if not f.name.startswith("annotated_") and not f.name.startswith("proc_") and not f.name.endswith(".html")]

    print(f"Found {len(image_files)} test images in {img_dir}")
    print("-" * 70)

    results_data = []

    for idx, img_path in enumerate(image_files, 1):
        print(f"[{idx}/{len(image_files)}] Processing: {img_path.name}...")
        with open(img_path, "rb") as f:
            raw_bytes = f.read()

        orig_bgr = cv2.imread(str(img_path))
        if orig_bgr is None:
            # Try from bytes via cv2.imdecode
            nparr = np.frombuffer(raw_bytes, np.uint8)
            orig_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        h, w = orig_bgr.shape[:2]

        # Step 1: Classical CV Preprocessing
        t0 = time.time()
        proc_bytes, thumb_bytes, run_record = preprocess_image(raw_bytes, profile_name="general_v1")
        proc_nparr = np.frombuffer(proc_bytes, np.uint8)
        proc_bgr = cv2.imdecode(proc_nparr, cv2.IMREAD_COLOR)
        proc_time = (time.time() - t0) * 1000

        # Save temporary preprocessed image for model inference
        temp_proc_path = img_dir / f"temp_proc_{img_path.stem}.png"
        with open(temp_proc_path, "wb") as f:
            f.write(proc_bytes)

        # Step 2: Stage 1 ResNet-18 Multi-Scale Spatial Classifier
        t1 = time.time()
        clf_pred = clf.predict(str(temp_proc_path))
        clf_time = (time.time() - t1) * 1000

        p_crack = float(clf_pred.get("crack_probability", 0.0))
        p_uncracked = float(clf_pred.get("uncracked_probability", 1.0 - p_crack))
        threshold = 0.80
        is_crack_stage1 = bool(p_crack >= threshold)

        # Step 3: Stage 2 YOLOv8 Defect Localizer (runs at 768px on preprocessed image)
        t2 = time.time()
        # Even if below threshold, let's also run YOLO detection so the user can inspect both models
        yolo_annotated_path = img_dir / f"annotated_yolo_{img_path.stem}.jpg"
        yolo_res = yolo.detect(
            image_input=str(temp_proc_path),
            conf=0.08,
            imgsz=768,
            save_annotated_path=str(yolo_annotated_path),
            resnet_confidence=p_crack
        )
        yolo_time = (time.time() - t2) * 1000

        # Read the annotated image
        annotated_bgr = cv2.imread(str(yolo_annotated_path))
        if annotated_bgr is None:
            annotated_bgr = proc_bgr

        # Clean up temp preprocessed file
        try:
            if temp_proc_path.exists():
                temp_proc_path.unlink()
        except Exception:
            pass

        # Convert to Base64 thumbnails for standalone HTML rendering
        orig_b64 = image_to_base64_thumbnail(orig_bgr, max_dim=500)
        proc_b64 = image_to_base64_thumbnail(proc_bgr, max_dim=500)
        ann_b64 = image_to_base64_thumbnail(annotated_bgr, max_dim=500)

        det_count = yolo_res.get("detections_count", 0)
        primary_defect = yolo_res.get("primary_defect", "None")

        item_result = {
            "index": idx,
            "filename": img_path.name,
            "width": w,
            "height": h,
            "filesize_kb": round(len(raw_bytes) / 1024, 1),
            "proc_time_ms": round(proc_time, 1),
            "clf_time_ms": round(clf_time, 1),
            "yolo_time_ms": round(yolo_time, 1),
            "total_time_ms": round(proc_time + clf_time + yolo_time, 1),
            "stage1_p_crack": p_crack,
            "stage1_p_uncracked": p_uncracked,
            "stage1_decision": "Cracked" if is_crack_stage1 else "Uncracked",
            "stage1_is_crack": is_crack_stage1,
            "threshold": threshold,
            "yolo_detections_count": det_count,
            "yolo_primary_defect": primary_defect,
            "yolo_detections": yolo_res.get("detections", []),
            "orig_b64": orig_b64,
            "proc_b64": proc_b64,
            "ann_b64": ann_b64,
        }
        results_data.append(item_result)

        print(f"   -> Stage 1 ResNet-18: {p_crack*100:.1f}% Crack | Decision: {'CRACK (>=80%)' if is_crack_stage1 else 'UNCRACKED (<80%)'}")
        print(f"   -> Stage 2 YOLOv8: {det_count} defect zone(s) | Primary: {primary_defect}")
        for b in yolo_res.get("detections", []):
            print(f"      * {b.get('label')} ({b.get('confidence', 0)*100:.1f}%) box={b.get('box')}")
        print()

    print("=" * 70)
    print("Generating Interactive HTML Scratchpad Report...")
    print("=" * 70)

    # Build rich HTML report
    html_content = generate_html_report(results_data)

    out_paths = [
        img_dir / "scratchpad_crack_lab.html",
        Path(r"C:\Users\yashr\.gemini\antigravity\brain\b449842a-e58f-443a-a909-79fe6640ed03\scratchpad_crack_lab.html"),
        Path(r"d:\project\aiml prime\project\infosys\scratchpad_crack_lab.html")
    ]

    for p in out_paths:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"Saved Scratchpad: {p}")
        except Exception as e:
            print(f"Error saving to {p}: {e}")

    print("\nBatch testing complete successfully.")

def generate_html_report(results):
    total = len(results)
    cracked_count = sum(1 for r in results if r["stage1_is_crack"])
    uncracked_count = total - cracked_count
    total_boxes = sum(r["yolo_detections_count"] for r in results)
    avg_latency = round(sum(r["total_time_ms"] for r in results) / max(total, 1), 1)

    cards_html = []
    for r in results:
        is_crack = r["stage1_is_crack"]
        p_pct = r["stage1_p_crack"] * 100
        box_count = r["yolo_detections_count"]

        # Badges
        stage1_badge = f"""
            <span class="badge {'badge-crack' if is_crack else 'badge-uncrack'}">
                {('CRACK DETECTED' if is_crack else 'UNCRACKED')} &bull; {p_pct:.1f}%
            </span>
        """
        threshold_badge = f"""
            <span class="badge badge-meta">Threshold: &ge;80%</span>
        """
        yolo_badge = f"""
            <span class="badge {'badge-yolo' if box_count > 0 else 'badge-none'}">
                YOLO: {box_count} Defect Zone{'s' if box_count != 1 else ''}
            </span>
        """

        # Bounding boxes list
        boxes_list_html = ""
        if r["yolo_detections"]:
            boxes_items = []
            for b in r["yolo_detections"]:
                color = b.get("color_hex", "#EF4444")
                boxes_items.append(f"""
                    <div class="box-row" style="border-left: 3px solid {color};">
                        <div class="box-header">
                            <span class="box-dot" style="background:{color};"></span>
                            <strong>{b.get('label')}</strong> <span class="box-code">({b.get('code')})</span>
                        </div>
                        <div class="box-meta">
                            <span>Box: [{', '.join(str(round(x, 1)) for x in b.get('box', []))}]</span>
                            <span class="box-conf" style="color:{color};">{b.get('confidence', 0)*100:.1f}% conf</span>
                        </div>
                    </div>
                """)
            boxes_list_html = "".join(boxes_items)
        else:
            boxes_list_html = '<div class="no-boxes">No YOLO defect bounding boxes identified at current threshold.</div>'

        card = f"""
        <div class="card" id="card-{r['index']}">
            <div class="card-header">
                <div class="card-title-group">
                    <span class="card-index">#{r['index']}</span>
                    <h3 class="card-filename" title="{r['filename']}">{r['filename']}</h3>
                    <span class="file-dims">{r['width']}&times;{r['height']} px &bull; {r['filesize_kb']} KB</span>
                </div>
                <div class="badges-row">
                    {stage1_badge}
                    {threshold_badge}
                    {yolo_badge}
                </div>
            </div>

            <div class="card-body">
                <!-- Viewer with Segmented Switcher -->
                <div class="viewer-container">
                    <div class="view-switcher" data-card="{r['index']}">
                        <button type="button" class="tab-btn active" onclick="switchView({r['index']}, 'ann', this)">
                            YOLO Detection {f'({box_count})' if box_count > 0 else ''}
                        </button>
                        <button type="button" class="tab-btn" onclick="switchView({r['index']}, 'proc', this)">
                            Preprocessed CV
                        </button>
                        <button type="button" class="tab-btn" onclick="switchView({r['index']}, 'orig', this)">
                            Original Raw
                        </button>
                    </div>

                    <div class="image-stage">
                        <img id="img-{r['index']}-ann" src="{r['ann_b64']}" class="stage-img active" alt="YOLO Detection">
                        <img id="img-{r['index']}-proc" src="{r['proc_b64']}" class="stage-img" alt="Preprocessed">
                        <img id="img-{r['index']}-orig" src="{r['orig_b64']}" class="stage-img" alt="Original">
                    </div>
                </div>

                <!-- Analysis Details -->
                <div class="details-panel">
                    <h4 class="panel-section-title">Two-Stage AI Model Outputs</h4>

                    <div class="metrics-grid">
                        <div class="metric-card">
                            <span class="metric-label">Stage 1 Class</span>
                            <span class="metric-val {'text-crack' if is_crack else 'text-uncrack'}">{r['stage1_decision']}</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">Crack Probability</span>
                            <span class="metric-val">{p_pct:.2f}%</span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">80% Gate Rule</span>
                            <span class="metric-val {'text-crack' if is_crack else 'text-muted'}">
                                {'&ge; 80% (PASS)' if is_crack else '< 80% (SOUND)'}
                            </span>
                        </div>
                        <div class="metric-card">
                            <span class="metric-label">YOLO Defect Zones</span>
                            <span class="metric-val text-yolo">{box_count}</span>
                        </div>
                    </div>

                    <div class="boxes-container">
                        <span class="boxes-title">Stage 2 Localized Defects ({box_count}):</span>
                        <div class="boxes-scroll">
                            {boxes_list_html}
                        </div>
                    </div>

                    <div class="latency-strip">
                        <span>Latency: Preprocess {r['proc_time_ms']}ms &bull; ResNet-18 {r['clf_time_ms']}ms &bull; YOLOv8 {r['yolo_time_ms']}ms &bull; <strong>Total: {r['total_time_ms']}ms</strong></span>
                    </div>
                </div>
            </div>
        </div>
        """
        cards_html.append(card)

    cards_joined = "\n".join(cards_html)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InfraScan AI Scratchpad — Test Images in crcack</title>
    <style>
        :root {{
            --bg: #09090b;
            --card-bg: #121217;
            --border: #27272a;
            --border-hover: #3f3f46;
            --text-main: #f4f4f5;
            --text-muted: #a1a1aa;
            --primary: #3b82f6;
            --rose: #f43f5e;
            --rose-bg: rgba(244, 63, 94, 0.15);
            --emerald: #10b981;
            --emerald-bg: rgba(16, 185, 129, 0.15);
            --amber: #f59e0b;
            --amber-bg: rgba(245, 158, 11, 0.15);
            --indigo: #6366f1;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            background: var(--bg);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 9999px;
            background: #1e1b4b;
            color: #a5b4fc;
            border: 1px solid #4338ca;
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
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
        .card:hover {{
            border-color: var(--border-hover);
        }}
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
        .card-title-group {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .card-index {{
            font-size: 12px;
            font-weight: 700;
            color: var(--primary);
            font-family: monospace;
        }}
        .card-filename {{
            font-size: 15px;
            font-weight: 700;
            max-width: 380px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }}
        .file-dims {{
            font-size: 12px;
            color: var(--text-muted);
            font-family: monospace;
        }}
        .badges-row {{
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }}
        .badge {{
            font-size: 11px;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 6px;
            border: 1px solid transparent;
        }}
        .badge-crack {{
            background: var(--rose-bg);
            color: #fda4af;
            border-color: rgba(244, 63, 94, 0.4);
        }}
        .badge-uncrack {{
            background: var(--emerald-bg);
            color: #6ee7b7;
            border-color: rgba(16, 185, 129, 0.4);
        }}
        .badge-meta {{
            background: #18181b;
            color: #d4d4d8;
            border-color: #3f3f46;
        }}
        .badge-yolo {{
            background: rgba(244, 63, 94, 0.2);
            color: #ff6b81;
            border-color: rgba(244, 63, 94, 0.6);
        }}
        .badge-none {{
            background: #18181b;
            color: #71717a;
            border-color: #27272a;
        }}
        .card-body {{
            display: grid;
            grid-template-columns: 1.15fr 1fr;
            gap: 20px;
            padding: 20px;
        }}
        @media (max-width: 960px) {{
            .card-body {{ grid-template-columns: 1fr; }}
        }}
        .viewer-container {{
            display: flex;
            flex-direction: column;
            gap: 10px;
        }}
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
            padding: 5px 12px;
            font-size: 12px;
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
        .tab-btn:hover:not(.active) {{
            color: #fff;
        }}
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
        .stage-img {{
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: none;
        }}
        .stage-img.active {{
            display: block;
        }}
        .details-panel {{
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 14px;
        }}
        .panel-section-title {{
            font-size: 13px;
            font-weight: 700;
            color: var(--text-main);
            letter-spacing: 0.02em;
        }}
        .metrics-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }}
        .metric-card {{
            background: #18181b;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 14px;
        }}
        .metric-label {{
            font-size: 10px;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.04em;
            display: block;
        }}
        .metric-val {{
            font-size: 16px;
            font-weight: 700;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            margin-top: 2px;
            display: block;
        }}
        .text-crack {{ color: #fb7185; }}
        .text-uncrack {{ color: #34d399; }}
        .text-yolo {{ color: #f43f5e; }}
        .text-muted {{ color: #71717a; }}
        .boxes-container {{
            background: #18181b;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }}
        .boxes-title {{
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }}
        .boxes-scroll {{
            max-height: 160px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }}
        .box-row {{
            background: rgba(255, 255, 255, 0.03);
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            font-family: monospace;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }}
        .box-header {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .box-dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }}
        .box-code {{
            color: var(--text-muted);
            font-size: 10px;
        }}
        .box-meta {{
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--text-muted);
        }}
        .box-conf {{
            font-weight: 700;
        }}
        .no-boxes {{
            font-size: 11px;
            color: #71717a;
            font-style: italic;
            padding: 6px 0;
        }}
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
                    <span>InfraScan AI Scratchpad</span>
                    <span class="pill-tag">Two-Stage Deep Learning Lab</span>
                </h1>
                <p>Testing real image dataset in <code>C:\\Users\\yashr\\Downloads\\crcack</code> with ResNet-18 Multi-Scale Spatial Classifier (80% gate) &amp; YOLOv8 Defect Localizer (768px).</p>
            </div>
            <div>
                <span class="badge badge-meta">Generated: 2026-10-29</span>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-label">Total Images Analyzed</span>
                <span class="stat-val">{total}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Stage 1: Cracked (&ge;80%)</span>
                <span class="stat-val text-crack">{cracked_count}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Stage 1: Uncracked (&lt;80%)</span>
                <span class="stat-val text-uncrack">{uncracked_count}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Total Defect Zones (YOLO)</span>
                <span class="stat-val text-yolo">{total_boxes}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Avg Pipeline Latency</span>
                <span class="stat-val">{avg_latency} ms</span>
            </div>
        </div>
    </header>

    <main class="container">
        {cards_joined}
    </main>

    <script>
        function switchView(cardIdx, mode, btn) {{
            const card = document.getElementById('card-' + cardIdx);
            if (!card) return;

            // Switch button active class
            const btns = card.querySelectorAll('.tab-btn');
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch image
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
