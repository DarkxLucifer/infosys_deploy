import { useState, useEffect } from "react";
import {
  Wrench, AlertTriangle, CheckCircle2, Calendar,
  ShieldAlert, Download, ChevronDown, Clock
} from "lucide-react";
import { api, type MaintenanceDashboardPayload, type MaintenanceItem } from "@/lib/api";

const DATE_RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
];

export function MaintenanceEngineerDashboard() {
  const [data, setData] = useState<MaintenanceDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("30d");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadData = async () => {
    try {
      const res = await api.getMaintenanceDashboard();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRange]);

  const handleUpdateStatus = async (woId: string, newStatus: MaintenanceItem["status"]) => {
    if (!data) return;
    try {
      if (newStatus === "closed") {
        const note = window.prompt("Mandatory resolution note for closure (ACI / AASHTO verification):", "On-site repair executed and verified by technician.");
        if (!note || !note.trim()) return;
        await api.transitionWorkOrder(woId, { to_status: "closed", note: note.trim() });
      } else {
        await api.transitionWorkOrder(woId, { to_status: newStatus });
      }
      loadData();
    } catch (e) {
      console.warn("Status transition error:", e);
      // Optimistic update fallback
      const updated = data.workOrders.map((wo) =>
        wo.id === woId ? { ...wo, status: newStatus } : wo
      );
      setData({ ...data, workOrders: updated });
    }
  };

  const handleSetDueDate = (woId: string, newDate: string) => {
    if (!data) return;
    const updated = data.workOrders.map((wo) =>
      wo.id === woId ? { ...wo, due_date: newDate } : wo
    );
    setData({ ...data, workOrders: updated });
  };

  const handleExportCsv = async () => {
    const csvContent = await api.exportDashboardCsv("maintenance", selectedRange);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `infrascan-work-orders-${selectedRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const workOrders = Array.isArray(data.workOrders) ? data.workOrders : [];
  const kpis = data.kpis || { myOpenWorkOrders: 0, dueThisWeek: 0, overdue: 0, closedThisMonth: 0 };
  const urgentReviewBanner = data.urgentReviewBanner || { active: false, message: "", itemCount: 0 };
  const deadlineAlerts = Array.isArray(data.deadlineAlerts) ? data.deadlineAlerts : [];
  const followUpInspections = Array.isArray(data.followUpInspections) ? data.followUpInspections : [];

  const filteredOrders = statusFilter === "all"
    ? workOrders
    : workOrders.filter((wo) => wo.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header (Astrix Pattern: Title, Subtitle, Date-Range Dropdown, Export Button) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            My work orders <span className="text-xs font-mono text-muted-foreground font-normal">(assumed role)</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Repair execution, scheduling and remediation following engineer sign-off.
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

      {/* Mandatory Urgent Banner (Section 3.5.D & Section 0.5 wording rules) */}
      {urgentReviewBanner.active && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-3">
          <ShieldAlert className="size-5 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold uppercase tracking-wider block">
              Urgent engineering review requested. This is a review request, not a safety declaration.
            </span>
            <p className="leading-relaxed text-foreground">
              {urgentReviewBanner.message}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards: Open, Due this week, Overdue, Closed this month */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Open */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Open</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <Wrench className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{kpis.myOpenWorkOrders}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Pending field execution</p>
        </div>

        {/* Card 2: Due this week */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Due this week</span>
            <div className="size-7 rounded-lg bg-secondary text-primary flex items-center justify-center">
              <Calendar className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-primary">{kpis.dueThisWeek}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Active repair targets</p>
        </div>

        {/* Card 3: Overdue */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Overdue</span>
            <div className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-destructive">{kpis.overdue}</div>
          <p className="text-[11px] text-destructive font-medium mt-1">Past scheduled date</p>
        </div>

        {/* Card 4: Closed this month */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-semibold">Closed this month</span>
            <div className="size-7 rounded-lg bg-success-soft text-success flex items-center justify-center">
              <CheckCircle2 className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-success">{kpis.closedThisMonth}</div>
          <p className="text-[11px] text-success font-medium mt-1">Sign-off verified</p>
        </div>
      </div>

      {/* Main Grid: Work Order Table & Follow-up Survey Alerts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Work Order Table with Working Inline Actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Work order table</h2>
            <div className="flex gap-1.5 text-xs">
              {["all", "open", "in_progress", "closed"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                    statusFilter === st
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-foreground border-b border-border">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">WO ID</th>
                    <th className="py-2.5 px-4 font-semibold">Asset</th>
                    <th className="py-2.5 px-4 font-semibold">Action</th>
                    <th className="py-2.5 px-4 font-semibold">Priority</th>
                    <th className="py-2.5 px-4 font-semibold">Team</th>
                    <th className="py-2.5 px-4 font-semibold">Due Date</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Status Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((wo) => (
                    <tr key={wo.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-foreground">{wo.id}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-semibold text-foreground">{wo.asset_code}</span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-foreground max-w-44 truncate">
                        {wo.action}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            wo.priority === "urgent_engineering_review"
                              ? "bg-critical-soft text-critical"
                              : wo.priority === "high"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-secondary text-primary"
                          }`}
                        >
                          {wo.priority === "urgent_engineering_review" ? "Urgent Review" : wo.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{wo.assignee_team}</td>
                      <td className="py-2.5 px-4 font-mono">
                        <input
                          type="date"
                          value={wo.due_date}
                          onChange={(e) => handleSetDueDate(wo.id, e.target.value)}
                          className="bg-transparent border border-input rounded px-1.5 py-0.5 text-xs text-foreground cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <select
                          value={wo.status}
                          onChange={(e) => handleUpdateStatus(wo.id, e.target.value as MaintenanceItem["status"])}
                          className="h-7 px-2 rounded border border-input bg-card text-foreground text-[11px] font-semibold cursor-pointer"
                        >
                          <option value="unassigned">Unassigned</option>
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right (1 col): Deadline alerts & Follow-up inspections */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              Deadline Alerts (Due &le; 3 Days)
            </h3>
            <div className="space-y-2 text-xs">
              {deadlineAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded-lg border space-y-1 ${
                    alert.isOverdue
                      ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : "bg-warning-soft border-warning/30 text-warning"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{alert.id} · {alert.assetCode}</span>
                    <span className="font-mono text-[11px]">
                      {alert.isOverdue ? "OVERDUE" : `${alert.daysRemaining}d remaining`}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground leading-snug">{alert.action}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Follow-Up Inspections</h3>
            <div className="space-y-2 text-xs">
              {followUpInspections.map((f, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-muted/40 border border-border space-y-0.5">
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>{f.assetCode}</span>
                    <span className="font-mono text-muted-foreground">{f.scheduledDate}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{f.reason}</p>
                  <div className="text-[10px] text-primary">Assigned: {f.assignedInspector}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
