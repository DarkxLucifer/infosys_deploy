import {
  damageClasses,
  fmtDate,
  fmtDateTime,
  reportKindLabels,
  severityOrder,
  workOrderStatusLabels,
  type Asset,
  type GeneratedReport,
  type Inspection,
  type Settings,
  type WorkOrder,
} from "@/store/app";

/* ------------------------------------------------------------------ */
/* Minimal single-font PDF builder                                     */
/* ------------------------------------------------------------------ */

function toAscii(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pageStream(lines: string[]): string {
  const usable = lines.slice(0, 56);
  let out = "BT\n/F1 10 Tf\n12.5 TL\n46 756 Td\n";
  for (const line of usable) {
    out += `(${pdfEscape(toAscii(line))}) Tj T*\n`;
  }
  out += "ET";
  return out;
}

function buildPdf(linePages: string[][]): Blob {
  const pages = linePages.map((lines) => pageStream(lines));
  const totalObjects = 3 + pages.length * 2;
  const objects: { n: number; body: string }[] = [
    { n: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    {
      n: 2,
      body: `<< /Type /Pages /Kids [${pages
        .map((_, index) => `${4 + index * 2} 0 R`)
        .join(" ")}] /Count ${pages.length} >>`,
    },
    {
      n: 3,
      body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    },
  ];

  pages.forEach((stream, index) => {
    const pageObj = 4 + index * 2;
    objects.push({
      n: pageObj,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObj + 1} 0 R >>`,
    });
    objects.push({
      n: pageObj + 1,
      body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets[object.n] = pdf.length;
    pdf += `${object.n} 0 obj\n${object.body}\nendobj\n`;
  }
  const startXref = pdf.length;
  pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= totalObjects; number += 1) {
    pdf += `${String(offsets[number] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

/* ------------------------------------------------------------------ */
/* CSV / JSON content                                                  */
/* ------------------------------------------------------------------ */

function csvEscape(value: string): string {
  const text = toAscii(String(value));
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Context assembly                                                    */
/* ------------------------------------------------------------------ */

export type ReportContext = {
  assets: Asset[];
  inspections: Inspection[];
  workOrders: WorkOrder[];
  settings: Settings;
  userName: string;
};

export function buildReportBlob(
  report: GeneratedReport,
  context: ReportContext,
): Blob {
  const assetById = (id: string) =>
    context.assets.find((asset) => asset.id === id);
  /* a report scoped to one inspection, or register-wide */
  const scoped = report.inspectionId
    ? context.inspections.filter((item) => item.id === report.inspectionId)
    : context.inspections;

  const header = [
    context.settings.orgName.toUpperCase(),
    "AI-POWERED CRACK AND DAMAGE ASSESSMENT",
    "",
    `Report:     ${report.id}`,
    `Title:      ${report.title}`,
    `Kind:       ${reportKindLabels[report.kind]}`,
    `Generated:  ${fmtDateTime(report.createdAt)} by ${context.userName}`,
    `Model:      traceable to installed registry (see inference metadata)`,
    "=".repeat(78),
    "",
  ];

  if (report.kind === "integrity") {
    const lines: string[] = [];
    for (const inspection of scoped) {
      const asset = assetById(inspection.assetId);
      lines.push(`INSPECTION ${inspection.id} - ${inspection.title}`);
      lines.push(`  Asset:        ${inspection.assetId} - ${asset?.name ?? ""}`);
      lines.push(`  Kind:         ${asset?.kind ?? "-"} / ${asset?.material ?? ""}`);
      lines.push(`  Method:       ${inspection.method}, inspector ${inspection.inspector}`);
      lines.push(`  Started:      ${fmtDateTime(inspection.startedAt)}`);
      lines.push(`  Completed:    ${inspection.completedAt ? fmtDateTime(inspection.completedAt) : "in progress"}`);
      lines.push(`  Status:       ${inspection.status}`);
      lines.push(`  Model:        ${inspection.modelVersion}`);
      if (inspection.findings.length === 0) {
        lines.push("  Findings:     none detected");
      } else {
        lines.push(`  Findings:     ${inspection.findings.length}`);
        const sorted = [...inspection.findings].sort(
          (a, b) =>
            severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity),
        );
        for (const finding of sorted) {
          const definition = damageClasses[finding.classCode];
          lines.push(
            `  - ${finding.id} ${finding.classCode} ${definition.label} (frame ${finding.frameId})`,
          );
          lines.push(
            `    confidence ${Math.round(finding.confidence * 100)}%, severity ${finding.severity}, width ${finding.measurements.widthMm} mm (${finding.measurements.widthPx} px), length ${finding.measurements.lengthPx} px`,
          );
          lines.push(
            `    review: ${finding.review}${finding.reviewedBy ? ` by ${finding.reviewedBy}` : ""}${finding.note ? ` - "${finding.note}"` : ""}`,
          );
        }
      }
      lines.push("");
    }
    lines.push("=".repeat(78));
    lines.push("Safety boundary: AI priorities are recommendations.");
    lines.push("A qualified civil engineer must validate all severity classes");
    lines.push("before repair work orders are committed to the asset owner.");

    return buildPdf([
      header,
      lines.slice(0, 52),
      lines.slice(52, 104),
      lines.slice(104, 156),
      lines.slice(156, 208),
      lines.slice(208, 260),
      lines.slice(260, 312),
      lines.slice(312, 364),
      lines.slice(364, 420),
    ].filter((page) => page.length > 0));
  }

  if (report.kind === "audit") {
    const rows: string[] = [
      "inspection_id,asset_id,asset_name,title,method,inspector,started_at,status,frames,findings,top_severity",
    ];
    const sortedInspections = [...scoped].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
    for (const inspection of sortedInspections) {
      const asset = assetById(inspection.assetId);
      const top =
        [...inspection.findings].sort(
          (a, b) =>
            severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity),
        )[0]?.severity ?? "none";
      rows.push(
        [
          inspection.id,
          inspection.assetId,
          asset?.name ?? "",
          inspection.title,
          inspection.method,
          inspection.inspector,
          inspection.startedAt,
          inspection.status,
          String(inspection.frames.length),
          String(inspection.findings.length),
          top,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    return new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  }

  if (report.kind === "findings") {
    const payload = {
      organisation: context.settings.orgName,
      exportId: report.id,
      generatedAt: report.createdAt,
      generatedBy: context.userName,
      scope: report.inspectionId ?? "register",
      findingCount: scoped.reduce(
        (count, inspection) => count + inspection.findings.length,
        0,
      ),
      inspections: scoped.map((inspection) => ({
        inspectionId: inspection.id,
        assetId: inspection.assetId,
        status: inspection.status,
        modelVersion: inspection.modelVersion,
        frames: inspection.frames.map((scene) => ({
          id: scene.id,
          label: scene.label,
          capturedAt: scene.capturedAt,
          method: scene.method,
        })),
        findings: inspection.findings.map((finding) => ({
          id: finding.id,
          frameId: finding.frameId,
          classCode: finding.classCode,
          classLabel: damageClasses[finding.classCode].label,
          confidence: finding.confidence,
          severity: finding.severity,
          bboxPercent: finding.bbox,
          measurements: finding.measurements,
          review: finding.review,
          reviewedBy: finding.reviewedBy ?? null,
          note: finding.note ?? null,
          addedByModel: finding.addedByModel,
        })),
      })),
    };
    return new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
  }

  /* maintenance summary */
  const lines: string[] = ["WORK ORDERS (maintenance pipeline)", ""];
  const sortedOrders = [...context.workOrders].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  for (const order of sortedOrders) {
    const asset = assetById(order.assetId);
    lines.push(
      `${order.id} - ${order.title}`,
      `  Asset:      ${order.assetId} - ${asset?.name ?? ""}`,
      `  Priority:   ${order.priority} | Status: ${workOrderStatusLabels[order.status]}`,
      `  Due:        ${fmtDate(order.dueDate)} | Assignee: ${order.assignee}`,
      `  Source:     ${order.source}${order.findingRef ? ` (ref ${order.findingRef})` : ""}`,
      "",
    );
  }
  lines.push("=".repeat(78));
  lines.push(
    `Open orders: ${context.workOrders.filter((order) => order.status !== "closed").length} of ${context.workOrders.length}`,
  );
  lines.push("Safety boundary: AI priorities are recommendations.");
  lines.push("A qualified engineer must validate repairs before work begins.");

  return buildPdf([
    header,
    lines.slice(0, 52),
    lines.slice(52, 104),
    lines.slice(104, 160),
  ].filter((page) => page.length > 0));
}

export function reportFilename(report: GeneratedReport): string {
  const extension = report.format;
  const slug = report.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${report.id}-${slug}.${extension}`;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
