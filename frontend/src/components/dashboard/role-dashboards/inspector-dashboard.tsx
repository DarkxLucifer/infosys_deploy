import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Calendar, Clock, AlertTriangle,
  Download, ChevronDown, Layers, Upload, Camera, Plus
} from "lucide-react";
import { api, type InspectorDashboardPayload } from "@/lib/api";
import { InspectionPipelineBoard } from "@/components/dashboard/inspection-pipeline-board";

const DATE_RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
];

export function InspectorDashboard() {
  const [data, setData] = useState<InspectorDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("30d");
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const loadData = async () => {
    try {
      const res = await api.getInspectorDashboard();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRange]);

  const handleExportCsv = async () => {
    const csvContent = await api.exportDashboardCsv("inspector", selectedRange);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `infrascan-inspector-${selectedRange}.csv`);
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
      </div>
    );
  }

  const myInspections = Array.isArray(data.myInspections) ? data.myInspections : [];
  const paginatedInspections = myInspections.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(myInspections.length / pageSize));
  const kpis = data.kpis || { assigned: 0, pending: 0, defectsPendingReview: 0, highPriority: 0 };
  const uploadQuality = data.uploadQuality || { uploadedThisWeek: 0, rejectedCount: 0, topRejectionReason: "None" };
  const pendingReview = Array.isArray(data.pendingReview) ? data.pendingReview : [];

  return (
    <div className="space-y-6">
      {/* Header (Astrix Pattern: Title, Subtitle, Date-Range Dropdown, Export Button) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My inspections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What to inspect and what is waiting for review.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="h-10 px-3.5 pr-8 rounded-lg border border-input bg-card text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          </div>

          <Link
            to="/app/inspections/new"
            className="h-10 px-4 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Camera className="size-3.5" />
            <span>New inspection / Upload</span>
          </Link>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-3.5 rounded-lg bg-secondary hover:bg-secondary/80 active:scale-[0.99] text-foreground border border-border text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Cards: Assigned, Pending, Defects, High */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Assigned */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Assigned</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <Calendar className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{kpis.assigned}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Scheduled or in progress</p>
        </div>

        {/* Card 2: Pending */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Pending</span>
            <div className="size-7 rounded-lg bg-warning-soft text-warning flex items-center justify-center">
              <Clock className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{kpis.pending}</div>
          <p className="text-[11px] text-warning font-medium mt-1">Pending engineer review</p>
        </div>

        {/* Card 3: Defects (AI suggestion, pending review) */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Defects</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <Layers className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{kpis.defectsPendingReview}</div>
          <p className="text-[11px] text-muted-foreground mt-1">AI suggestion, pending review</p>
        </div>

        {/* Card 4: High */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">High</span>
            <div className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{kpis.highPriority}</div>
          <p className="text-[11px] text-destructive font-medium mt-1">Severe or Critical findings</p>
        </div>
      </div>

      {/* Real Inspection Pipeline Board (Section 3.7) */}
      <InspectionPipelineBoard />

      {/* My Inspections Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">My inspections table</h2>
            <p className="text-xs text-muted-foreground">Assigned infrastructure surveys</p>
          </div>
          <Link to="/app/inspections" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Asset Code & Name</th>
                <th className="py-2.5 px-4 font-semibold">Type</th>
                <th className="py-2.5 px-4 font-semibold">Inspection Date</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Images Uploaded</th>
                <th className="py-2.5 px-4 font-semibold">Due Date</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedInspections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Camera className="size-8 text-muted-foreground/60 stroke-[1.5]" />
                      <p className="text-xs font-medium">No assigned inspections found for this period.</p>
                      <Link
                        to="/app/inspections/new"
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        <Plus className="size-3.5" />
                        <span>Schedule new inspection & upload images</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedInspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-4">
                      <Link to={`/app/inspections/${insp.id}`} className="hover:underline">
                        <div className="font-semibold text-foreground">{insp.asset_code}</div>
                        <div className="text-[11px] text-muted-foreground">{insp.asset_name}</div>
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 uppercase font-mono text-[11px] text-muted-foreground">
                      {insp.asset_type}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{insp.date}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          insp.status === "completed" || insp.status === "reviewed"
                            ? "bg-success-soft text-success"
                            : insp.status === "pending_review"
                            ? "bg-warning-soft text-warning"
                            : "bg-secondary text-primary"
                        }`}
                      >
                        {insp.status === "pending_review" ? "Pending review" : insp.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{insp.images_uploaded_count}</td>
                    <td className="py-2.5 px-4 font-mono text-muted-foreground">{insp.next_due_date}</td>
                    <td className="py-2.5 px-4 text-right">
                      <Link
                        to={`/app/inspections/${insp.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-colors"
                      >
                        <Upload className="size-3" />
                        <span>Upload / View</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-2.5 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-2.5 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Pending Review List & Upload Validation Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Engineer Review List with Days Waiting */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-foreground">Pending engineer review list</h2>
          <div className="divide-y divide-border text-xs">
            {pendingReview.map((p) => (
              <div key={p.inspectionId} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{p.assetCode} - {p.assetName}</div>
                  <div className="text-[11px] text-muted-foreground">Assigned: {p.reviewerName}</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-warning">{p.daysWaiting} days</span>
                  <div className="text-[10px] text-muted-foreground">waiting</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Uploaded Images Validation Summary */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-foreground">Uploaded images quality check</h2>
          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div className="p-3 rounded-lg bg-muted/60 border border-border">
              <span className="text-muted-foreground">Uploaded This Period</span>
              <div className="text-xl font-bold font-mono text-foreground mt-0.5">
                {uploadQuality.uploadedThisWeek}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <span className="text-destructive font-medium">Validation Rejected</span>
              <div className="text-xl font-bold font-mono text-destructive mt-0.5">
                {uploadQuality.rejectedCount}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <strong>Most common rejection reason:</strong> {uploadQuality.topRejectionReason} (checked: blur, low light, duplicate, resolution)
          </div>
        </div>
      </div>
    </div>
  );
}
