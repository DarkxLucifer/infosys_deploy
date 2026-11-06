import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck, AlertTriangle, FileCheck,
  Download, Sparkles, ChevronDown, ArrowRight
} from "lucide-react";
import { api, type EngineerDashboardPayload } from "@/lib/api";
import { InspectionPipelineBoard } from "@/components/dashboard/inspection-pipeline-board";
import { RecentAiClassificationsFeed } from "@/components/dashboard/recent-ai-classifications-feed";

const DATE_RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
];

export function CivilEngineerDashboard() {
  const [data, setData] = useState<EngineerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("30d");

  const loadData = async () => {
    try {
      const res = await api.getEngineerDashboard();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRange]);

  const handleExportCsv = async () => {
    const csvContent = await api.exportDashboardCsv("engineer", selectedRange);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `infrascan-engineer-findings-${selectedRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  const kpis = data.kpis || { awaitingReview: 0, reviewedConfirmed: 0, reviewedCorrected: 0, reviewedRejected: 0, avgAiConfidence: 0, correctionRate: 0 };
  const reviewQueue = Array.isArray(data.reviewQueue) ? data.reviewQueue : [];
  const crackTypeCounts = Array.isArray(data.crackTypeCounts) ? data.crackTypeCounts : [];
  const selectedAssetMeasurements = data.selectedAssetMeasurements || {
    assetCode: "INF-001",
    assetName: "Infrastructure Asset",
    latestInspectionDate: "N/A",
    previousInspectionDate: "N/A",
    latestLength: { value: 0, unit: "px" as const, isCalibrated: false, label: "0 px" },
    latestMaxWidth: { value: 0, unit: "px" as const, isCalibrated: false, label: "0 px" },
    previousLength: { value: 0, unit: "px" as const, isCalibrated: false, label: "0 px" },
    previousMaxWidth: { value: 0, unit: "px" as const, isCalibrated: false, label: "0 px" },
    progression: { canCompare: false, changeText: "No previous comparison baseline", warningNotice: null },
  };

  return (
    <div className="space-y-6">
      {/* Header (Astrix Pattern: Title, Subtitle, Date-Range Dropdown, Export Button) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Engineering review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review AI findings and read condition history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date-range dropdown */}
          <div className="relative">
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="h-10 px-3.5 pr-8 rounded-lg border border-input bg-card text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring transition-colors appearance-none cursor-pointer"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {/* Primary Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-4 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metric Cards (Astrix Card Style) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Awaiting my review */}
        <Link
          to="/app/review?status=needs_review"
          className="p-5 rounded-xl border border-border bg-card hover:border-primary/60 transition-all shadow-xs block group"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Awaiting my review</span>
            <div className="size-7 rounded-lg bg-warning-soft text-warning flex items-center justify-center">
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground group-hover:text-primary transition-colors">
            {kpis.awaitingReview}
          </div>
          <p className="text-[11px] text-warning font-medium mt-1">Pending engineer verification</p>
        </Link>

        {/* Card 2: Reviewed this period (confirmed / corrected / rejected) */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Reviewed this period</span>
            <div className="size-7 rounded-lg bg-success-soft text-success flex items-center justify-center">
              <ShieldCheck className="size-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-success" title="Confirmed">{kpis.reviewedConfirmed}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xl font-bold font-mono text-primary" title="Corrected">{kpis.reviewedCorrected}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xl font-bold font-mono text-destructive" title="Rejected">{kpis.reviewedRejected}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Confirmed · Corrected · Rejected
          </p>
        </div>

        {/* Card 3: Average AI confidence */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Average AI confidence</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <Sparkles className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {kpis.avgAiConfidence}%
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">On confirmed AI detections</p>
        </div>

        {/* Card 4: Correction rate */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Correction rate</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <FileCheck className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {kpis.correctionRate}%
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Share corrected or rejected</p>
        </div>
      </div>

      {/* Real Inspection Pipeline Board (Section 3.7) */}
      <InspectionPipelineBoard />

      {/* Live AI Photo Classifications Stream */}
      <RecentAiClassificationsFeed
        items={data.recentAiClassifications || []}
        title="Live AI Photo Classifications"
        subtitle="Recent field photographs classified by InfraScan Model v1.0 (ResNet50)"
      />

      {/* Review Queue (Astrix "Live Classification Stream" analogue) */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Review Queue stream</h2>
            <p className="text-xs text-muted-foreground">AI findings awaiting engineer sign-off</p>
          </div>
          <Link
            to="/app/review"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <span>See all</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Asset</th>
                <th className="py-2.5 px-4 font-semibold">Method & Inspector</th>
                <th className="py-2.5 px-4 font-semibold">Photos</th>
                <th className="py-2.5 px-4 font-semibold">Damage Severity</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Date</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reviewQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No active or pending inspections in review queue.
                  </td>
                </tr>
              ) : (
                reviewQueue.slice(0, 10).map((item) => {
                  const statusKey = item.status || "pending_review";
                  const statusLabel =
                    statusKey === "pending_review" ? "Pending Review" :
                    statusKey === "images_uploaded" ? "Images Uploaded" :
                    statusKey === "in_review" ? "In Review" :
                    statusKey === "reviewed" ? "Reviewed" :
                    statusKey === "assigned" ? "Assigned" :
                    statusKey === "in_progress" ? "In Progress" : statusKey;

                  const statusColor =
                    statusKey === "pending_review" || statusKey === "in_review"
                      ? "bg-warning-soft text-warning"
                      : statusKey === "images_uploaded"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : statusKey === "reviewed" || statusKey === "completed"
                      ? "bg-success-soft text-success"
                      : "bg-secondary text-foreground";

                  const sev = (item.highestProposedSeverity || "minor").toLowerCase();
                  const sevLabel =
                    sev === "critical" ? "Critical" :
                    sev === "severe" ? "Severe" :
                    sev === "moderate" ? "Moderate" : "Minor";

                  return (
                    <tr key={item.inspectionId} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link to={`/app/assets/${item.assetCode}`} className="font-semibold text-primary hover:underline">
                            {item.assetCode}
                          </Link>
                          <Link to={`/app/inspections/${item.inspectionId}`} className="text-muted-foreground hover:text-foreground hover:underline text-xs truncate max-w-44 inline-block">
                            · {item.assetName}
                          </Link>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-foreground capitalize">{item.method || "Walkdown"}</div>
                        <div className="text-[11px] text-muted-foreground">{item.inspectorName || "Field Inspector"}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-medium">
                        {item.imagesCount !== undefined ? `${item.imagesCount} photo(s)` : `${item.findingsCount} finding(s)`}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono uppercase font-bold border border-foreground/30 bg-background text-foreground">
                          {sevLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground font-mono">{item.date}</td>
                      <td className="py-2.5 px-4 text-right">
                        <Link
                          to={`/app/review/${item.inspectionId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-semibold text-[11px] transition-all shadow-xs"
                        >
                          <span>Review</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Damage Severity Distribution Breakdown (AASHTO / ASTM & PDF §10) */}
      <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Damage Severity Distribution</h2>
            <p className="text-xs text-muted-foreground">Portfolio-wide crack opening & structural distress classification</p>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">AASHTO / ASTM C856 & PDF §10</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-background border border-foreground/30 shadow-xs">
            <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">Critical</span>
            <span className="text-xl font-bold font-mono text-foreground">{data.severityDistribution?.aiProposed?.critical || 0}</span>
            <span className="text-[10px] text-muted-foreground block">&gt; 8.0 mm / &gt; 9% density</span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-foreground/30 shadow-xs">
            <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">Severe</span>
            <span className="text-xl font-bold font-mono text-foreground">{data.severityDistribution?.aiProposed?.severe || 0}</span>
            <span className="text-[10px] text-muted-foreground block">5.0 - 8.0 mm / 5 - 9% density</span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-foreground/30 shadow-xs">
            <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">Moderate</span>
            <span className="text-xl font-bold font-mono text-foreground">{data.severityDistribution?.aiProposed?.moderate || 0}</span>
            <span className="text-[10px] text-muted-foreground block">3.0 - 5.0 mm / 2 - 5% density</span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-foreground/30 shadow-xs">
            <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">Minor</span>
            <span className="text-xl font-bold font-mono text-foreground">{data.severityDistribution?.aiProposed?.minor || 0}</span>
            <span className="text-[10px] text-muted-foreground block">&lt; 3.0 mm / &lt; 2% density</span>
          </div>
        </div>
      </div>

      {/* Grid: Damage Analysis & Crack Measurements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Damage Analysis: Counts by crack type (horizontal bar) */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-foreground">Damage analysis by crack type</h2>
          <div className="space-y-3">
            {crackTypeCounts.map((c) => (
              <div key={`${c.code}-${c.type}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{c.type}</span>
                  <span className="font-mono text-muted-foreground">{c.count} findings</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, c.count * 8)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Crack Measurements (Rule 0.5: px vs mm) */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Crack measurements</h2>
              <p className="text-xs text-muted-foreground">{selectedAssetMeasurements.assetCode} - {selectedAssetMeasurements.assetName}</p>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {selectedAssetMeasurements.latestInspectionDate}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-muted/60 border border-border">
              <span className="text-muted-foreground">Latest Crack Length</span>
              <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                {selectedAssetMeasurements.latestLength.label}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/60 border border-border">
              <span className="text-muted-foreground">Latest Max Width</span>
              <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                {selectedAssetMeasurements.latestMaxWidth.label}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs space-y-1">
            <div className="font-semibold text-primary">Progression Tracking:</div>
            <p className="text-foreground">
              {selectedAssetMeasurements.progression.changeText}
            </p>
            {selectedAssetMeasurements.progression.warningNotice && (
              <p className="text-[11px] text-muted-foreground italic">
                {selectedAssetMeasurements.progression.warningNotice}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
