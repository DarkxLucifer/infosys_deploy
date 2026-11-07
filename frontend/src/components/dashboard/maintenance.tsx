import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Plus, Search, CheckCircle2, AlertTriangle, ShieldCheck, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkOrderStatusBadge } from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { useAppStore } from "@/store/app";
import { api } from "@/lib/api";
import {
  ComplianceNote,
  EmptyState,
  PageHeader,
  PageShell,
  StatCard,
} from "./page-shell";

export interface LiveWorkOrder {
  id: string;
  assetId: string;
  assetName: string;
  inspectionId?: string | null;
  findingId?: string | null;
  action: string;
  priority: string;
  status: "unassigned" | "open" | "in_progress" | "closed";
  assigneeId?: string | null;
  assigneeName?: string | null;
  team?: string | null;
  dueDate?: string | null;
  repairWindow?: string | null;
  closedNote?: string | null;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  unassigned: "Unassigned",
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
};

function formatPriorityBadge(priority: string) {
  const p = (priority || "medium").toLowerCase();
  switch (p) {
    case "urgent_engineering_review":
    case "critical":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/30">
          <AlertTriangle className="size-3" />
          <span>Urgent Review</span>
        </span>
      );
    case "high":
    case "severe":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
          <span>High Priority</span>
        </span>
      );
    case "medium":
    case "moderate":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/30">
          <span>Medium Priority</span>
        </span>
      );
    case "low":
    case "minor":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
          <span>Low Priority</span>
        </span>
      );
    case "routine_monitoring":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
          <ShieldCheck className="size-3" />
          <span>Routine</span>
        </span>
      );
  }
}

export function MaintenancePage() {
  const { navigate } = useDashboardNavigation();
  const [workOrders, setWorkOrders] = useState<LiveWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedOrderToClose, setSelectedOrderToClose] = useState<LiveWorkOrder | null>(null);
  const [closureNote, setClosureNote] = useState("");

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getWorkOrders();
      setWorkOrders(res);
    } catch (e) {
      console.warn("Failed to load work orders:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const isOverdue = (order: LiveWorkOrder): boolean => {
    if (order.status === "closed" || !order.dueDate) return false;
    return new Date(order.dueDate).getTime() < Date.now();
  };

  const dueWithinDays = (order: LiveWorkOrder, days: number): boolean => {
    if (order.status === "closed" || !order.dueDate) return false;
    const due = new Date(order.dueDate).getTime();
    return due >= Date.now() && due <= Date.now() + days * 86400000;
  };

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return workOrders
      .filter((order) => {
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        const matchesPriority = priorityFilter === "all" || order.priority === priorityFilter;
        const matchesText =
          text === "" ||
          order.id.toLowerCase().includes(text) ||
          order.action.toLowerCase().includes(text) ||
          order.assetId.toLowerCase().includes(text) ||
          (order.team && order.team.toLowerCase().includes(text)) ||
          (order.assigneeName && order.assigneeName.toLowerCase().includes(text));
        return matchesStatus && matchesPriority && matchesText;
      })
      .sort((a, b) => {
        const priorityWeight: Record<string, number> = {
          urgent_engineering_review: 0,
          high: 1,
          medium: 2,
          low: 3,
          routine_monitoring: 4,
        };
        const wa = priorityWeight[a.priority] ?? 5;
        const wb = priorityWeight[b.priority] ?? 5;
        if (a.status === "closed" && b.status !== "closed") return 1;
        if (b.status === "closed" && a.status !== "closed") return -1;
        if (wa !== wb) return wa - wb;
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return dueA - dueB;
      });
  }, [workOrders, query, statusFilter]);

  const openCount = workOrders.filter((order) => order.status !== "closed").length;
  const urgentCount = workOrders.filter(
    (order) => (order.priority === "urgent_engineering_review" || order.priority === "high") && order.status !== "closed",
  ).length;
  const soonCount = workOrders.filter((order) => dueWithinDays(order, 7)).length;
  const overdueCount = workOrders.filter(isOverdue).length;

  const handleStatusChange = async (order: LiveWorkOrder, newStatus: string) => {
    if (newStatus === "closed") {
      setSelectedOrderToClose(order);
      setClosureNote("");
      setCloseDialogOpen(true);
      return;
    }

    try {
      await api.transitionWorkOrder(order.id, { to_status: newStatus });
      toast.success(`${order.id} → ${statusLabels[newStatus] || newStatus}`);
      loadOrders();
    } catch (e: any) {
      toast.error(e.message || "Failed to update work order status");
    }
  };

  const handleConfirmClose = async () => {
    if (!selectedOrderToClose) return;
    if (!closureNote.trim()) {
      toast.error("A resolution note is required when closing a work order (per §16 & MNT-4).");
      return;
    }

    try {
      await api.transitionWorkOrder(selectedOrderToClose.id, {
        to_status: "closed",
        note: closureNote.trim(),
      });
      toast.success(`${selectedOrderToClose.id} resolved and closed!`);
      setCloseDialogOpen(false);
      setSelectedOrderToClose(null);
      loadOrders();
    } catch (e: any) {
      toast.error(e.message || "Failed to close work order");
    }
  };

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Maintenance Prioritization & Workflow"
        title="Maintenance Board"
        description="Active repair orders categorized by 5-tier engineering priority. Move each order through Unassigned → Open → In Progress → Closed with verified site remediation."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            New Work Order
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Work Orders" value={openCount} hint={`${workOrders.length} total across portfolio`} />
        <StatCard
          label="Urgent & High Priority"
          value={urgentCount}
          tone={urgentCount > 0 ? "danger" : "success"}
          hint="Requires expedited intervention"
        />
        <StatCard
          label="Due Within 7 Days"
          value={soonCount}
          tone={soonCount > 0 ? "warning" : "success"}
          hint="Scheduled maintenance SLA window"
        />
        <StatCard
          label="Overdue Orders"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "success"}
          hint="Exceeded engineering resolution SLA"
        />
      </div>

      {overdueCount > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft/60 px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-xs leading-relaxed text-destructive">
            {overdueCount} work order{overdueCount === 1 ? "" : "s"} overdue. Review crew assignment or
            record site repair verification notes to close.
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order, asset, action, crew…"
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value)}
        >
          <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(value) => setPriorityFilter(value)}
        >
          <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent_engineering_review">Urgent Review</SelectItem>
            <SelectItem value="high">High Priority</SelectItem>
            <SelectItem value="medium">Medium Priority</SelectItem>
            <SelectItem value="low">Low Priority</SelectItem>
            <SelectItem value="routine_monitoring">Routine</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-xl border border-border bg-muted/40 p-0.5 ml-auto sm:ml-0">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === "table" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="size-3.5" />
            <span>Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === "kanban" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-3.5" />
            <span>Board</span>
          </button>
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {workOrders.length} orders
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
          Loading live maintenance work orders from database...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No work orders match"
          description="Sign off an inspection in the engineer review queue to automatically generate a prioritized repair work order."
        />
      ) : viewMode === "kanban" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(["unassigned", "open", "in_progress", "closed"] as const).map((colStatus) => {
            const colOrders = rows.filter((o) => o.status === colStatus);
            const colTitle = statusLabels[colStatus] || colStatus;
            return (
              <div key={colStatus} className="flex flex-col rounded-2xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                  <span className="text-xs font-bold text-foreground">{colTitle}</span>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {colOrders.length}
                  </span>
                </div>
                <div className="space-y-2.5 overflow-y-auto max-h-[620px]">
                  {colOrders.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-muted-foreground border border-dashed rounded-xl bg-card/40">
                      No {colTitle.toLowerCase()} orders
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const overdue = isOverdue(order);
                      return (
                        <div
                          key={order.id}
                          className="rounded-xl border bg-card p-3 space-y-2 shadow-xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-primary">{order.id}</span>
                            {formatPriorityBadge(order.priority)}
                          </div>
                          <div className="text-xs font-semibold text-foreground">
                            <button
                              type="button"
                              className="hover:text-primary hover:underline text-left"
                              onClick={() => navigate(`/app/assets/${order.assetId}`)}
                            >
                              {order.assetName || order.assetId}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{order.action}</p>
                          <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50">
                            <span className="truncate max-w-[130px]" title={order.team || "Crew"}>
                              {order.team || "Civil Crew"}
                            </span>
                            <span className={`font-mono tabular-nums ${overdue ? "text-destructive font-bold" : ""}`}>
                              {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "TBD"}
                            </span>
                          </div>
                          {colStatus !== "closed" ? (
                            <div className="pt-1 flex items-center justify-end gap-1">
                              {colStatus === "unassigned" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] font-semibold"
                                  onClick={() => handleStatusChange(order, "open")}
                                >
                                  Assign & Open
                                </Button>
                              ) : colStatus === "open" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] font-semibold"
                                  onClick={() => handleStatusChange(order, "in_progress")}
                                >
                                  Start Work
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] font-semibold text-success hover:text-success"
                                  onClick={() => handleStatusChange(order, "closed")}
                                >
                                  Resolve & Close
                                </Button>
                              )}
                            </div>
                          ) : order.closedNote ? (
                            <p className="text-[10px] text-muted-foreground line-clamp-1 italic">
                              Note: {order.closedNote}
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 text-xs">
                <TableHead className="pl-5 font-semibold">Order ID</TableHead>
                <TableHead className="font-semibold">Asset</TableHead>
                <TableHead className="font-semibold">Prescribed Repair Action</TableHead>
                <TableHead className="font-semibold">Priority Tier</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold hidden lg:table-cell">Assigned Crew</TableHead>
                <TableHead className="font-semibold">Resolution Due</TableHead>
                <TableHead className="pr-5 text-right font-semibold">Workflow</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => {
                const overdue = isOverdue(order);
                const orderStatus = order.status === "in_progress" ? "in-progress" : order.status;

                return (
                  <TableRow key={order.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="pl-5 font-mono text-[13px] font-bold text-primary">
                      {order.id}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-foreground hover:text-primary hover:underline text-xs"
                        onClick={() => navigate(`/app/assets/${order.assetId}`)}
                      >
                        {order.assetId}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs font-medium text-foreground">
                      {order.action}
                    </TableCell>
                    <TableCell>
                      {formatPriorityBadge(order.priority)}
                    </TableCell>
                    <TableCell>
                      <WorkOrderStatusBadge status={orderStatus as any} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {order.team || order.assigneeName || "Civil Maintenance"}
                    </TableCell>
                    <TableCell
                      className={`text-xs tabular-nums font-mono ${overdue ? "font-bold text-destructive" : "text-muted-foreground"}`}
                    >
                      {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : "TBD"}
                      {overdue ? " (Overdue)" : ""}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {order.status === "closed" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                          <CheckCircle2 className="size-3.5" />
                          <span>Resolved</span>
                        </span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold">
                              Advance
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs">Transition state</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={order.status}
                              onValueChange={(value) => handleStatusChange(order, value)}
                            >
                              <DropdownMenuRadioItem value="open" disabled={order.status === "open"}>
                                Open (Assigned)
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="in_progress" disabled={order.status === "in_progress"}>
                                In progress (Crew mobilized)
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="closed" className="text-success font-semibold">
                                Close (Resolve with note)
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ComplianceNote className="mt-4" />

      {/* Closure Verification Dialog (Mandatory Note per Section 16 & MNT-4) */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success" />
              <span>Resolve & Close Work Order {selectedOrderToClose?.id}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provide technician remediation details (materials used, seal verification, and sign-off) to finalize the work order resolution.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground">Asset: {selectedOrderToClose?.assetId}</div>
              <div className="text-muted-foreground">{selectedOrderToClose?.action}</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closure-note" className="text-xs font-semibold">
                Remediation Resolution Note <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="closure-note"
                rows={3}
                value={closureNote}
                onChange={(e) => setClosureNote(e.target.value)}
                placeholder="e.g., Epoxy pressure injection completed to ACI 503R specifications. Surface sealed with elastomeric polyurethane. On-site sonic hammer testing confirms defect stabilization."
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmClose}>
              <CheckCircle2 className="size-4 mr-1" />
              Confirm Closure & Record Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={() => {
          setCreateOpen(false);
          loadOrders();
        }}
      />
    </PageShell>
  );
}

function CreateWorkOrderDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { state } = useAppStore();
  const [action, setAction] = useState("");
  const [assetId, setAssetId] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [team, setTeam] = useState("Structural Injection Crew");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetsList, setAssetsList] = useState<any[]>(state.assets || []);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      api.getAssets()
        .then((res) => {
          if (Array.isArray(res) && res.length > 0) setAssetsList(res);
        })
        .catch(() => {});

      api.getRepairTemplates()
        .then((res) => {
          if (Array.isArray(res) && res.length > 0) setTemplates(res);
        })
        .catch(() => {});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Maintenance Work Order</DialogTitle>
          <DialogDescription className="text-xs">
            Initiate a remediation work order adhering to InfraScan Section 16 maintenance prioritization standards.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 py-1 text-xs">
          {templates.length > 0 ? (
            <div className="grid gap-1">
              <Label className="font-semibold text-muted-foreground flex items-center justify-between">
                <span>Standard Repair Template (§16)</span>
                <span className="font-normal text-[10px]">Autofills action & priority</span>
              </Label>
              <Select
                onValueChange={(val) => {
                  const tmpl = templates.find((t) => t.id === val || t.damageType === val);
                  if (tmpl) {
                    setAction(tmpl.suggestedAction);
                    if (tmpl.priority) setPriority(tmpl.priority);
                    const crewMap: Record<string, string> = {
                      longitudinal: "Structural Injection Crew",
                      transverse: "Bridge Maintenance Specialists",
                      alligator: "Pavement & Road Crew",
                      spalling: "Concrete Repair Team",
                      exposed_reinforcement: "Heavy Structural Crew",
                      corrosion: "Durability Specialists",
                      potholes: "Road Maintenance Crew",
                      water_leakage: "Waterproofing Specialists",
                      hairline: "Routine Survey Crew",
                    };
                    if (crewMap[tmpl.damageType]) setTeam(crewMap[tmpl.damageType]);
                  }
                }}
              >
                <SelectTrigger className="rounded-lg h-8 text-xs">
                  <SelectValue placeholder="Choose engineering template (e.g. Epoxy, Patching)…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.damageType.toUpperCase()} · {t.suggestedAction.slice(0, 42)}…
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1">
            <Label htmlFor="new-wo-action" className="font-semibold">Prescribed Repair Action</Label>
            <Input
              id="new-wo-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Epoxy pressure injection & elastomeric surface sealing"
              className="rounded-lg h-9 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="font-semibold">Asset</Label>
            <Select value={assetId} onValueChange={(val) => setAssetId(val)}>
              <SelectTrigger className="rounded-lg h-9 text-xs">
                <SelectValue placeholder="Select infrastructure asset…" />
              </SelectTrigger>
              <SelectContent>
                {assetsList.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.id} · {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="font-semibold">Priority Tier</Label>
              <Select value={priority} onValueChange={(val) => setPriority(val)}>
                <SelectTrigger className="rounded-lg h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent_engineering_review">Urgent Engineering Review</SelectItem>
                  <SelectItem value="high">High Priority</SelectItem>
                  <SelectItem value="medium">Medium Priority</SelectItem>
                  <SelectItem value="low">Low Priority</SelectItem>
                  <SelectItem value="routine_monitoring">Routine Monitoring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-wo-due" className="font-semibold">SLA Due Date</Label>
              <Input
                id="new-wo-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg h-9 text-xs"
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-wo-team" className="font-semibold">Assigned Maintenance Crew</Label>
            <Input
              id="new-wo-team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="e.g. Structural Injection Crew"
              className="rounded-lg h-9 text-xs"
            />
          </div>
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={async () => {
              if (action.trim().length < 5) {
                setError("Provide an engineering repair action (5+ characters).");
                return;
              }
              if (!assetId) {
                setError("Select an infrastructure asset.");
                return;
              }
              setError(null);
              setIsSubmitting(true);
              try {
                await api.createWorkOrder({
                  asset_id: assetId,
                  action: action.trim(),
                  priority,
                  team: team.trim(),
                  due_date: dueDate ? new Date(dueDate).toISOString() : null,
                });
                toast.success("Maintenance work order created and recorded in database.");
                onDone();
              } catch (e: any) {
                setError(e.message || "Failed to create work order.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <Plus className="size-4 mr-1" />
            Create Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
