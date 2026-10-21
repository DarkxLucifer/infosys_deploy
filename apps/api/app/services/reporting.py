import os
import csv
import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import openpyxl

REPORT_STORAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "reports"))
os.makedirs(REPORT_STORAGE_DIR, exist_ok=True)

MANDATORY_DISCLAIMER = (
    "NOTICE & DISCLAIMER: InfraScan Structural Analysis System. "
    "All findings, defect classifications, and dimensional measurements recorded in this certified report "
    "were established and verified by a licensed Civil Engineer. "
    "AI analysis: not connected / not applicable. No AI model predictions or confidence scores were utilized."
)

def compute_file_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def generate_inspection_pdf_report(
    inspection_data: Dict[str, Any],
    findings_data: List[Dict[str, Any]],
    priority_data: Optional[Dict[str, Any]] = None,
    output_filename: Optional[str] = None
) -> Dict[str, Any]:
    """Generates a professional engineering PDF report using ReportLab."""
    insp_id = inspection_data.get("id", "INSP-001")
    asset = inspection_data.get("asset", {})
    inspector = inspection_data.get("inspector", {})
    reviewer = inspection_data.get("reviewer", {})

    if not output_filename:
        output_filename = f"report_{insp_id}_{int(datetime.now(timezone.utc).timestamp())}.pdf"
    filepath = os.path.join(REPORT_STORAGE_DIR, output_filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=12
    )
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=14,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155")
    )
    disclaimer_style = ParagraphStyle(
        'DisclaimerText',
        parent=styles['Normal'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748B"),
        alignment=1 # Center
    )

    elements = []

    # Title & Header
    elements.append(Paragraph("INFRASCAN STRUCTURAL INSPECTION REPORT", title_style))
    elements.append(Paragraph(f"Official Engineering Review Record | Inspection ID: <b>{insp_id}</b>", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0EA5E9"), spaceAfter=14))

    # Meta grid: Asset & Inspection Personnel
    signoff_date_str = inspection_data.get("reviewed_at") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    meta_data = [
        [
            Paragraph(f"<b>Asset ID:</b> {asset.get('id', 'N/A')}", body_style),
            Paragraph(f"<b>Asset Name:</b> {asset.get('name', 'N/A')}", body_style)
        ],
        [
            Paragraph(f"<b>Structure Type:</b> {asset.get('asset_type', 'N/A').capitalize()}", body_style),
            Paragraph(f"<b>Material:</b> {asset.get('material', 'N/A')}", body_style)
        ],
        [
            Paragraph(f"<b>Region:</b> {asset.get('region', 'Central')}", body_style),
            Paragraph(f"<b>Location:</b> {asset.get('address', 'N/A')}", body_style)
        ],
        [
            Paragraph(f"<b>Field Inspector:</b> {inspector.get('name', 'N/A')} ({inspector.get('email', '')})", body_style),
            Paragraph(f"<b>Lead Civil Engineer:</b> {reviewer.get('name', 'Licensed Engineer')} ({reviewer.get('email', '')})", body_style)
        ],
        [
            Paragraph(f"<b>Inspection Date:</b> {inspection_data.get('inspection_date', 'N/A')}", body_style),
            Paragraph(f"<b>Sign-off Timestamp:</b> {signoff_date_str}", body_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[260, 270])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(meta_table)

    # Findings Section
    elements.append(Paragraph("1. Engineer Verified Findings & Measurements", h2_style))
    
    findings_headers = [
        Paragraph("<b>Finding ID</b>", body_style),
        Paragraph("<b>Defect Type</b>", body_style),
        Paragraph("<b>Dimensions</b>", body_style),
        Paragraph("<b>Uncertainty</b>", body_style),
        Paragraph("<b>Severity</b>", body_style),
        Paragraph("<b>Source</b>", body_style)
    ]
    table_rows = [findings_headers]

    if not findings_data:
        table_rows.append([
            Paragraph("No defects recorded by engineer", body_style),
            Paragraph("-", body_style),
            Paragraph("-", body_style),
            Paragraph("-", body_style),
            Paragraph("No visible damage", body_style),
            Paragraph("Engineer manual", body_style)
        ])
    else:
        for f in findings_data:
            m = f.get("measurement", {})
            unit = m.get("unit", "px")
            cal = m.get("calibrated", False)
            unc = f"±{m.get('uncertainty')} mm" if (cal and m.get("uncertainty")) else "(not calibrated)"
            
            dim_str = f"L: {m.get('length', 0)}{unit}, W: {m.get('avg_width', 0)}{unit}"
            if m.get("area"):
                dim_str += f", A: {m.get('area')}{unit}²"
            
            table_rows.append([
                Paragraph(f.get("id", "F-01")[:8], body_style),
                Paragraph(f.get("defect_type", "crack").replace("_", " ").title(), body_style),
                Paragraph(dim_str, body_style),
                Paragraph(unc, body_style),
                Paragraph(f.get("severity", "moderate").upper(), body_style),
                Paragraph("Engineer annotation", body_style)
            ])

    findings_table = Table(table_rows, colWidths=[80, 100, 160, 90, 60, 90])
    findings_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(findings_table)

    # Priority Recommendation Section
    elements.append(Paragraph("2. Maintenance Priority Recommendation", h2_style))
    prio_str = (priority_data and (priority_data.get("confirmed") or priority_data.get("recommended"))) or "Routine Monitoring"
    action_str = (priority_data and priority_data.get("suggested_action")) or "Routine monitoring and scheduled periodic re-inspection."
    
    prio_data = [
        [Paragraph(f"<b>Recommended Action Priority:</b> {prio_str.replace('_', ' ').upper()}", body_style)],
        [Paragraph(f"<b>Suggested Remediation Action:</b> {action_str}", body_style)]
    ]
    prio_table = Table(prio_data, colWidths=[530])
    prio_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(prio_table)

    # Disclaimer Footer
    elements.append(Spacer(1, 30))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#94A3B8"), spaceAfter=10))
    elements.append(Paragraph(MANDATORY_DISCLAIMER, disclaimer_style))

    doc.build(elements)
    checksum = compute_file_sha256(filepath)
    return {"format": "pdf", "path": filepath, "filename": output_filename, "checksum": checksum}

def generate_inspection_csv_report(
    inspection_data: Dict[str, Any],
    findings_data: List[Dict[str, Any]],
    output_filename: Optional[str] = None
) -> Dict[str, Any]:
    """Generates tabular CSV report of findings."""
    insp_id = inspection_data.get("id", "INSP-001")
    if not output_filename:
        output_filename = f"report_{insp_id}_{int(datetime.now(timezone.utc).timestamp())}.csv"
    filepath = os.path.join(REPORT_STORAGE_DIR, output_filename)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Inspection ID", insp_id])
        writer.writerow(["Asset ID", inspection_data.get("asset", {}).get("id", "")])
        writer.writerow(["Asset Name", inspection_data.get("asset", {}).get("name", "")])
        writer.writerow(["Status", inspection_data.get("status", "")])
        writer.writerow(["Reviewed At", inspection_data.get("reviewed_at", "")])
        writer.writerow(["Disclaimer", MANDATORY_DISCLAIMER])
        writer.writerow([])
        writer.writerow([
            "Finding ID", "Defect Type", "Source", "Length", "Avg Width",
            "Max Width", "Area", "Density %", "Unit", "Calibrated", "Uncertainty mm", "Severity", "Notes"
        ])
        for fd in findings_data:
            m = fd.get("measurement", {})
            writer.writerow([
                fd.get("id", ""),
                fd.get("defect_type", ""),
                "Engineer annotation",
                m.get("length", ""),
                m.get("avg_width", ""),
                m.get("max_width", ""),
                m.get("area", ""),
                m.get("density", ""),
                m.get("unit", "px"),
                m.get("calibrated", False),
                m.get("uncertainty", ""),
                fd.get("severity", ""),
                fd.get("notes", "")
            ])

    checksum = compute_file_sha256(filepath)
    return {"format": "csv", "path": filepath, "filename": output_filename, "checksum": checksum}

def generate_inspection_xlsx_report(
    inspection_data: Dict[str, Any],
    findings_data: List[Dict[str, Any]],
    output_filename: Optional[str] = None
) -> Dict[str, Any]:
    """Generates multi-sheet Excel workbook report."""
    insp_id = inspection_data.get("id", "INSP-001")
    if not output_filename:
        output_filename = f"report_{insp_id}_{int(datetime.now(timezone.utc).timestamp())}.xlsx"
    filepath = os.path.join(REPORT_STORAGE_DIR, output_filename)

    wb = openpyxl.Workbook()
    # Sheet 1: Overview
    ws_ov = wb.active
    ws_ov.title = "Inspection Overview"
    ws_ov.append(["InfraScan Structural Inspection Report"])
    ws_ov.append(["Inspection ID", insp_id])
    ws_ov.append(["Asset ID", inspection_data.get("asset", {}).get("id", "")])
    ws_ov.append(["Asset Name", inspection_data.get("asset", {}).get("name", "")])
    ws_ov.append(["Structure Type", inspection_data.get("asset", {}).get("asset_type", "")])
    ws_ov.append(["Reviewed At", inspection_data.get("reviewed_at", "")])
    ws_ov.append(["AI Analysis Status", "Not connected / Not applicable"])
    ws_ov.append(["Disclaimer", MANDATORY_DISCLAIMER])

    # Sheet 2: Findings
    ws_find = wb.create_sheet(title="Findings & Measurements")
    ws_find.append([
        "Finding ID", "Defect Type", "Source", "Length", "Avg Width",
        "Max Width", "Area", "Density %", "Unit", "Calibrated", "Uncertainty mm", "Severity", "Notes"
    ])
    for fd in findings_data:
        m = fd.get("measurement", {})
        ws_find.append([
            fd.get("id", ""),
            fd.get("defect_type", ""),
            "Engineer annotation",
            m.get("length", 0.0),
            m.get("avg_width", 0.0),
            m.get("max_width", 0.0),
            m.get("area", 0.0),
            m.get("density", ""),
            m.get("unit", "px"),
            m.get("calibrated", False),
            m.get("uncertainty", ""),
            fd.get("severity", ""),
            fd.get("notes", "")
        ])

    wb.save(filepath)
    checksum = compute_file_sha256(filepath)
    return {"format": "xlsx", "path": filepath, "filename": output_filename, "checksum": checksum}

def generate_inspection_json_report(
    inspection_data: Dict[str, Any],
    findings_data: List[Dict[str, Any]],
    priority_data: Optional[Dict[str, Any]] = None,
    output_filename: Optional[str] = None
) -> Dict[str, Any]:
    """Generates complete machine-readable JSON report with signatures and disclaimer."""
    insp_id = inspection_data.get("id", "INSP-001")
    if not output_filename:
        output_filename = f"report_{insp_id}_{int(datetime.now(timezone.utc).timestamp())}.json"
    filepath = os.path.join(REPORT_STORAGE_DIR, output_filename)

    payload = {
        "report_metadata": {
            "system": "InfraScan",
            "version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ai_analysis": "not_connected",
            "disclaimer": MANDATORY_DISCLAIMER
        },
        "inspection": inspection_data,
        "findings": findings_data,
        "maintenance_priority": priority_data
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    checksum = compute_file_sha256(filepath)
    return {"format": "json", "path": filepath, "filename": output_filename, "checksum": checksum}
