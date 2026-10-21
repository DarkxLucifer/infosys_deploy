import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { InspectionStatusBadge, SeverityBadge } from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { inspectionMethodLabels, useAppStore } from "@/store/app";
import type { Inspection, InspectionStatus, Severity } from "@/store/app";
import { EmptyState, PageHeader, PageShell } from "./page-shell";

type StatusFilter = "all" | InspectionStatus;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "in-progress", label: "In progress" },
  { value: "processing", label: "Processing" },
  { value: "awaiting-review", label: "Awaiting review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "escalated", label: "Escalated" },
];

const severityRank: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function topSeverity(inspection: Inspection): Severity | null {
  let best: Severity | null = null;
  for (const finding of inspection.findings) {
    if (!best || severityRank[finding.severity] > severityRank[best]) {
      best = finding.severity;
    }
  }
  return best;
}

export function InspectionsPage() {
  const { state, assetById } = useAppStore();
  const { navigate } = useDashboardNavigation();
  const [liveInspections, setLiveInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchLiveInspections = async () => {
    try {
      const res = await api.getInspections();
      if (res && Array.isArray(res.items)) {
        setLiveInspections(res.items);
      }
    } catch (e) {
      console.warn("Failed to fetch live inspections, fallback to store:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveInspections();
  }, []);

  const combinedInspections = useMemo(() => {
    if (liveInspections.length === 0) return state.inspections;
    const dbMapped: Inspection[] = liveInspections.map((i: any) => ({
      id: i.id,
      title: `${i.assetName || "Asset"} Inspection`,
      assetId: i.assetId,
      inspector: i.inspectorName || "Assigned Inspector",
      startedAt: i.inspectionDate || i.createdAt,
      method: "drone",
      status: (i.status === "pending_review" ? "awaiting-review" : i.status === "in_progress" ? "in-progress" : i.status === "reviewed" ? "reviewed" : "in-progress") as InspectionStatus,
      modelVersion: "v2.4",
      progress: 100,
      frames: [],
      findings: [],
    }));
    const liveIds = new Set(dbMapped.map((i) => i.id));
    const extra = state.inspections.filter((i) => !liveIds.has(i.id));
    return [...dbMapped, ...extra];
  }, [liveInspections, state.inspections]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return [...combinedInspections]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .filter((inspection) => {
        const matchesStatus =
          statusFilter === "all" || inspection.status === statusFilter;
        const asset = assetById(inspection.assetId);
        const matchesText =
          text === "" ||
          inspection.id.toLowerCase().includes(text) ||
          inspection.title.toLowerCase().includes(text) ||
          inspection.inspector.toLowerCase().includes(text) ||
          inspection.assetId.toLowerCase().includes(text) ||
          (asset?.name ?? "").toLowerCase().includes(text);
        return matchesStatus && matchesText;
      });
  }, [combinedInspections, query, statusFilter, assetById]);

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Field surveys"
        title="Inspections"
        description="Capture sessions across the network. Once an inspection is submitted, the AI pass runs segmentation, measurement and severity scoring automatically."
        actions={
          <Button onClick={() => navigate("/dashboard/inspections/new")}>
            <Plus className="size-4" />
            New inspection
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inspection, asset, inspector…"
            className="h-9 rounded-xl pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="h-9 w-44 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
          {loading && <Loader2 className="size-3 animate-spin text-primary" />}
          {rows.length} of {combinedInspections.length} inspections
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No inspections match"
          description="Adjust the filters, or start a new capture session."
          action={
            <Button onClick={() => navigate("/dashboard/inspections/new")}>
              <Plus className="size-4" />
              New inspection
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead className="pl-5">Inspection</TableHead>
                <TableHead className="hidden lg:table-cell">Asset</TableHead>
                <TableHead className="hidden xl:table-cell">Method</TableHead>
                <TableHead className="hidden md:table-cell">Inspector</TableHead>
                <TableHead>Frames</TableHead>
                <TableHead>Top severity</TableHead>
                <TableHead className="hidden xl:table-cell">Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inspection) => {
                const asset = assetById(inspection.assetId);
                const severity = topSeverity(inspection);
                return (
                  <TableRow
                    key={inspection.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/dashboard/inspections/${inspection.id}`)}
                  >
                    <TableCell className="pl-5">
                      <div className="font-mono text-[13px] font-semibold text-primary">
                        {inspection.id}
                      </div>
                      <div className="max-w-56 truncate text-xs text-muted-foreground xl:hidden">
                        {inspection.title}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="font-medium">{inspection.assetId}</div>
                      <div className="max-w-52 truncate text-xs text-muted-foreground">
                        {asset?.name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                      {inspectionMethodLabels[inspection.method]}
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {inspection.inspector}
                    </TableCell>
                    <TableCell className="tabular-nums">{inspection.frames.length}</TableCell>
                    <TableCell>
                      {severity ? (
                        <SeverityBadge severity={severity} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                      {new Date(inspection.startedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <InspectionStatusBadge status={inspection.status} />
                    </TableCell>
                    <TableCell className="pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        onClick={() =>
                          navigate(
                            inspection.status === "awaiting-review" ||
                              inspection.status === "escalated"
                              ? `/dashboard/analysis/${inspection.id}`
                              : `/dashboard/inspections/${inspection.id}`,
                          )
                        }
                      >
                        {inspection.status === "awaiting-review" || inspection.status === "escalated"
                          ? "Review"
                          : inspection.status === "in-progress"
                            ? "Prepare"
                            : "Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
