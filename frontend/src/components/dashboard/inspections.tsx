import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Loader2, RefreshCw, CheckCircle2, Clock, AlertTriangle, Camera, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatISTDateOnly } from "@/lib/date-utils";
import { useAuth } from "@/store/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeverityBadge } from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import type { Severity } from "@/store/app";
import { EmptyState, PageHeader, PageShell } from "./page-shell";

const statusFilterOptions = [
  { value: "all", label: "All statuses" },
  { value: "assigned", label: "Assigned" },
  { value: "images_uploaded", label: "Images uploaded" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_review", label: "Awaiting review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "closed", label: "Closed" },
];

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "assigned":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
          <Clock className="size-3" />
          Assigned
        </span>
      );
    case "images_uploaded":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
          <Camera className="size-3" />
          Images Uploaded
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
          <Clock className="size-3" />
          In Progress
        </span>
      );
    case "pending_review":
    case "awaiting-review":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="size-3" />
          Awaiting Review
        </span>
      );
    case "reviewed":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="size-3" />
          Reviewed
        </span>
      );
    case "closed":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
          Closed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border capitalize">
          {status.replace(/_/g, " ")}
        </span>
      );
  }
}

export function InspectionsPage() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { user: authUser } = useAuth();
  const canReassign = ["admin", "manager", "engineer", "civil-engineer", "lead_inspector"].includes(
    (authUser?.role || "").toLowerCase()
  );
  const [selectedForReassign, setSelectedForReassign] = useState<any | null>(null);

  const fetchLiveInspections = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.getInspections({ page_size: 100 });
      if (res && Array.isArray(res.items)) {
        setInspections(res.items);
      }
    } catch (e) {
      console.warn("Failed to fetch live inspections:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveInspections();
  }, [fetchLiveInspections]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return inspections
      .filter((insp) => {
        const matchesStatus =
          statusFilter === "all" ||
          insp.status === statusFilter ||
          (statusFilter === "pending_review" && insp.status === "awaiting-review");

        const matchesText =
          text === "" ||
          insp.id.toLowerCase().includes(text) ||
          (insp.assetId || "").toLowerCase().includes(text) ||
          (insp.assetName || "").toLowerCase().includes(text) ||
          (insp.inspectorName || "").toLowerCase().includes(text) ||
          (insp.method || "").toLowerCase().includes(text);

        return matchesStatus && matchesText;
      })
      .sort((a, b) => {
        const da = new Date(a.inspectionDate || a.createdAt || 0).getTime();
        const db = new Date(b.inspectionDate || b.createdAt || 0).getTime();
        return db - da;
      });
  }, [inspections, query, statusFilter]);

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Field Surveys"
        title="Inspections"
        description="Network-wide inspection pipeline. Field photos undergo automated OpenCV quality analysis, contrast enhancement, and engineer certification."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLiveInspections(true)}
              disabled={refreshing}
              className="h-9 gap-1.5 rounded-xl text-xs font-medium"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Button
              onClick={() => navigate("/app/inspections/new")}
              className="h-9 gap-1.5 rounded-xl text-xs font-semibold"
            >
              <Plus className="size-4" />
              <span>New Inspection</span>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inspection ID, asset, inspector…"
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
          {loading && <Loader2 className="size-3 animate-spin text-primary" />}
          {rows.length} of {inspections.length} inspection records
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 p-8 rounded-2xl border border-border bg-card animate-pulse">
          <div className="h-8 bg-muted rounded-xl" />
          <div className="h-12 bg-muted rounded-xl" />
          <div className="h-12 bg-muted rounded-xl" />
          <div className="h-12 bg-muted rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No inspections found"
          description="Create a new inspection session or clear your search filters."
          action={
            <Button onClick={() => navigate("/app/inspections/new")} className="gap-1.5">
              <Plus className="size-4" />
              New inspection
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead className="pl-5 text-xs font-semibold">Inspection ID</TableHead>
                <TableHead className="text-xs font-semibold">Asset</TableHead>
                <TableHead className="hidden md:table-cell text-xs font-semibold">Method</TableHead>
                <TableHead className="hidden lg:table-cell text-xs font-semibold">Inspector</TableHead>
                <TableHead className="text-xs font-semibold text-center">Photos</TableHead>
                <TableHead className="text-xs font-semibold">Findings</TableHead>
                <TableHead className="hidden sm:table-cell text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="pr-5 text-right text-xs font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((insp) => {
                const imgCount = insp.imageCount ?? 0;
                const findingsCount = insp.findingsCount ?? 0;
                const topSev = insp.topSeverity as Severity | null;

                return (
                  <TableRow
                    key={insp.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/app/inspections/${insp.id}`)}
                  >
                    <TableCell className="pl-5">
                      <div className="font-mono text-xs font-bold text-primary">
                        {insp.id}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-xs text-foreground">
                        {insp.assetName || insp.assetId}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {insp.assetId}
                      </div>
                    </TableCell>

                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground capitalize">
                      {insp.method || "walkdown"}
                    </TableCell>

                    <TableCell className="hidden lg:table-cell text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <UserCheck className="size-3 text-primary shrink-0" />
                        <span>{insp.inspectorName || "Field Inspector"}</span>
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${imgCount > 0 ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground"}`}>
                        {imgCount} frame{imgCount !== 1 ? "s" : ""}
                      </span>
                    </TableCell>

                    <TableCell>
                      {topSev ? (
                        <SeverityBadge severity={topSev} />
                      ) : findingsCount > 0 ? (
                        <Badge variant="outline" className="text-[10px]">
                          {findingsCount} finding{findingsCount !== 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">
                      {insp.inspectionDate
                        ? formatISTDateOnly(insp.inspectionDate)
                        : "—"}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={insp.status} />
                    </TableCell>

                    <TableCell className="pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {canReassign && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 gap-1 px-2.5"
                            onClick={() => setSelectedForReassign(insp)}
                          >
                            <UserCheck className="size-3.5" />
                            <span>Reassign</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-xs font-medium"
                          onClick={() => {
                            if (insp.status === "pending_review" || insp.status === "reviewed") {
                              navigate(`/app/review/${insp.id}`);
                            } else {
                              navigate(`/app/inspections/${insp.id}`);
                            }
                          }}
                        >
                          {insp.status === "pending_review"
                            ? "Review"
                            : insp.status === "assigned"
                            ? "Capture"
                            : "Workspace"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedForReassign && (
        <ReassignInspectionDialog
          open={!!selectedForReassign}
          onOpenChange={(open) => {
            if (!open) setSelectedForReassign(null);
          }}
          inspectionId={selectedForReassign.id}
          currentInspectorId={selectedForReassign.inspectorId}
          currentInspectorName={selectedForReassign.inspectorName}
          onReassigned={() => fetchLiveInspections(true)}
        />
      )}
    </PageShell>
  );
}

function ReassignInspectionDialog({
  open,
  onOpenChange,
  inspectionId,
  currentInspectorId,
  currentInspectorName,
  onReassigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  currentInspectorId?: string;
  currentInspectorName?: string;
  onReassigned?: () => void;
}) {
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState(currentInspectorId || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api
        .getInspectors()
        .then((list) => {
          if (Array.isArray(list)) {
            setInspectors(list);
            if (currentInspectorId && list.some((i) => i.id === currentInspectorId)) {
              setSelectedId(currentInspectorId);
            } else if (list.length > 0 && !selectedId) {
              setSelectedId(list[0].id);
            }
          }
        })
        .catch(() => toast.error("Failed to load active field inspectors"))
        .finally(() => setLoading(false));
    }
  }, [open, currentInspectorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      toast.error("Please select a field inspector.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.reassignInspection(inspectionId, {
        inspector_id: selectedId,
        notes: notes.trim() || undefined,
      });
      toast.success(res.message || "Inspection successfully reassigned!");
      onReassigned?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reassign inspection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="size-4 text-primary" />
            Reassign Field Inspector
          </DialogTitle>
          <DialogDescription className="text-xs">
            Delegate survey execution and site capture for inspection {inspectionId}
            {currentInspectorName ? ` (currently ${currentInspectorName})` : ""}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="reassign-inspec-select">Assigned Field Inspector</Label>
            {loading ? (
              <div className="h-9 rounded-xl bg-muted animate-pulse" />
            ) : (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="reassign-inspec-select" className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Choose field inspector…" />
                </SelectTrigger>
                <SelectContent>
                  {inspectors.map((ins) => (
                    <SelectItem key={ins.id} value={ins.id} className="text-xs">
                      <span className="font-semibold text-foreground">{ins.name || ins.email}</span> ·{" "}
                      <span className="text-muted-foreground">{ins.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reassign-inspec-notes">Delegation / Handover Notes (optional)</Label>
            <Input
              id="reassign-inspec-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Please capture south pier cap before 3 PM…"
              className="rounded-lg text-xs"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedId}>
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  <span>Reassigning...</span>
                </>
              ) : (
                <span>Reassign Inspection</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
