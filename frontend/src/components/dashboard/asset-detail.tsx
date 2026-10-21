import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Ruler, ScanLine, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ConditionBadge,
  InspectionStatusBadge,
  SeverityBadge,
  WorkOrderStatusBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import {
  assetKindLabels,
  fmtDate,
  fmtDateTime,
  severityOrder,
  useAppStore,
} from "@/store/app";
import type { AssetCondition, AssetKind, Severity } from "@/store/app";
import {
  ComplianceNote,
  EmptyState,
  MetaItem,
  PageHeader,
  PageShell,
  StatCard,
} from "./page-shell";

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const { state, assetById, updateAsset } = useAppStore();
  const { navigate } = useDashboardNavigation();
  const [editOpen, setEditOpen] = useState(false);

  const [dbAsset, setDbAsset] = useState<any | null>(null);
  const [dbInspections, setDbInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.getAsset(assetId).catch(() => null),
      api.getInspections({ asset_id: assetId }).catch(() => ({ items: [] })),
    ]).then(([resAsset, resInspections]) => {
      if (!mounted) return;
      if (resAsset) setDbAsset(resAsset);
      if (resInspections?.items) setDbInspections(resInspections.items);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [assetId]);

  const storeAsset = assetById(assetId);

  const asset = useMemo(() => {
    if (dbAsset) {
      return {
        id: dbAsset.id,
        name: dbAsset.name,
        kind: (dbAsset.assetType?.toLowerCase() || "bridge") as any,
        condition: (dbAsset.importance === "critical"
          ? "critical"
          : dbAsset.importance === "high"
          ? "poor"
          : "fair") as AssetCondition,
        location:
          dbAsset.address ||
          (dbAsset.latitude
            ? `${dbAsset.latitude.toFixed(4)}, ${dbAsset.longitude?.toFixed(4)}`
            : "Site coordinates"),
        builtYear: dbAsset.constructionYear || 2018,
        material: dbAsset.material || "Reinforced Concrete",
        spanLengthM: 120,
        lastInspection: dbAsset.createdAt || new Date().toISOString(),
        notes: dbAsset.notes || "",
      };
    }
    return storeAsset;
  }, [dbAsset, storeAsset]);

  const assetInspections = useMemo(() => {
    const list: any[] = [];
    if (dbInspections.length > 0) {
      for (const d of dbInspections) {
        list.push({
          id: d.id,
          title: d.title || `Inspection ${d.id}`,
          assetId: d.assetId || assetId,
          inspector: d.inspectorId || "Inspector",
          method: "walkdown",
          status:
            d.status === "in_progress" || d.status === "images_uploaded"
              ? "in-progress"
              : d.status === "pending_review" || d.status === "submitted"
              ? "awaiting-review"
              : d.status === "reviewed"
              ? "reviewed"
              : "in-progress",
          startedAt: d.inspectionDate || d.createdAt,
          findings: [],
        });
      }
    }
    const storeItems = state.inspections.filter((inspection) => inspection.assetId === assetId);
    for (const si of storeItems) {
      if (!list.some((li) => li.id === si.id)) {
        list.push(si);
      }
    }
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [dbInspections, state.inspections, assetId]);

  const assetWorkOrders = useMemo(
    () =>
      state.workOrders.filter(
        (order) => order.assetId === assetId && order.status !== "closed",
      ),
    [state.workOrders, assetId],
  );

  const recentFindings = useMemo(() => {
    const all = assetInspections.flatMap((inspection) =>
      (inspection.findings || []).map((finding: any) => ({ finding, inspection })),
    );
    const rank = (severity: Severity) => severityOrder.indexOf(severity);
    return all
      .sort((a, b) => rank(b.finding.severity) - rank(a.finding.severity))
      .slice(0, 6);
  }, [assetInspections]);

  if (loading && !asset) {
    return (
      <PageShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  if (!asset) {
    return (
      <PageShell>
        <EmptyState
          title={`Asset ${assetId} is not in the register`}
          description="It may have been removed, or the link is from an older demo session."
          action={
            <Button onClick={() => navigate("/dashboard/assets")}>
              Back to asset register
            </Button>
          }
        />
      </PageShell>
    );
  }

  const pendingFindings = assetInspections.reduce(
    (sum, inspection) =>
      sum + (inspection.findings || []).filter((finding: any) => finding.review === "pending").length,
    0,
  );
  const criticalFindings = assetInspections.reduce(
    (sum, inspection) =>
      sum +
      (inspection.findings || []).filter((finding: any) => finding.severity === "critical" || finding.severity === "high")
        .length,
    0,
  );

  const kindLabel = assetKindLabels[asset.kind as AssetKind] || asset.kind;

  return (
    <PageShell wide>
      <PageHeader
        backHref="/dashboard/assets"
        backLabel="Asset register"
        eyebrow={assetId}
        title={asset.name}
        description={`${kindLabel} · ${asset.material}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit details
            </Button>
            <Button onClick={() => navigate(`/dashboard/inspections/new?asset=${asset.id}`)}>
              <ScanLine className="size-4" />
              New inspection
            </Button>
          </>
        }
      />

      <div className="mb-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Condition" value={<ConditionBadge condition={asset.condition} />} hint="Updated after each review" />
        <StatCard label="Inspections" value={assetInspections.length} hint="Lifetime on this asset" />
        <StatCard
          label="Findings pending review"
          value={pendingFindings}
          tone={pendingFindings > 0 ? "warning" : "success"}
          hint="Awaiting engineer validation"
        />
        <StatCard
          label="High & critical findings"
          value={criticalFindings}
          tone={criticalFindings > 0 ? "danger" : "default"}
          hint="Across all inspections"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 xl:col-span-1">
          <h2 className="text-sm font-semibold">Asset record</h2>
          <div className="mt-4 grid gap-4">
            <MetaItem label="Type" value={kindLabel} />
            <MetaItem label="Material" value={asset.material} />
            <MetaItem
              label="Location"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {asset.location}
                </span>
              }
            />
            <MetaItem
              label="Built"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  {asset.builtYear}
                </span>
              }
            />
            {asset.spanLengthM ? (
              <MetaItem
                label="Span length"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="size-3.5 text-muted-foreground" />
                    {asset.spanLengthM.toLocaleString()} m
                  </span>
                }
              />
            ) : null}
            <MetaItem label="Last inspection" value={fmtDate(asset.lastInspection)} />
          </div>
          {asset.notes ? (
            <div className="mt-5 rounded-xl bg-muted/60 px-3.5 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Watch notes
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {asset.notes}
              </p>
            </div>
          ) : null}
        </div>

        <div className="xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b bg-secondary/40 px-5 py-3">
              <h2 className="text-sm font-semibold">Open work orders</h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg text-muted-foreground"
                onClick={() => navigate("/dashboard/maintenance")}
              >
                Maintenance board
              </Button>
            </div>
            {assetWorkOrders.length === 0 ? (
              <div className="px-5 py-6 text-xs text-muted-foreground">
                No open work orders for this asset. Critical findings raise orders during
                engineer review.
              </div>
            ) : (
              <div className="divide-y">
                {assetWorkOrders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                    <span className="font-mono text-[13px] font-semibold text-primary">
                      {order.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{order.title}</span>
                    <WorkOrderStatusBadge status={order.status} />
                    <span className="text-xs text-muted-foreground">
                      Due {fmtDate(order.dueDate)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-secondary/40 px-5 py-3">
              <h2 className="text-sm font-semibold">Top recent findings</h2>
            </div>
            {recentFindings.length === 0 ? (
              <div className="px-5 py-6 text-xs text-muted-foreground">
                No findings recorded yet. Run an inspection to populate the analysis.
              </div>
            ) : (
              <div className="divide-y">
                {recentFindings.map(({ finding, inspection }) => (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => navigate(`/dashboard/analysis/${inspection.id}?finding=${finding.id}`)}
                    className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left hover:bg-muted/40"
                  >
                    <SeverityBadge severity={finding.severity} />
                    <span className="text-sm font-semibold">{finding.classCode}</span>
                    <span className="flex-1 truncate text-sm text-muted-foreground">
                      {inspection.id} · {fmtDateTime(inspection.startedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Crack width {finding.measurements.widthMm} mm
                    </span>
                    <InspectionStatusBadge status={inspection.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-secondary/40 px-5 py-3">
          <h2 className="text-sm font-semibold">Inspection history</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/20">
              <TableHead className="pl-5">Inspection</TableHead>
              <TableHead className="hidden md:table-cell">Title</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="hidden sm:table-cell">Inspector</TableHead>
              <TableHead className="hidden lg:table-cell">Started</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assetInspections.map((inspection) => (
              <TableRow key={inspection.id}>
                <TableCell className="pl-5 font-mono text-[13px] font-semibold text-primary">
                  {inspection.id}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate md:table-cell">
                  {inspection.title}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {inspection.method}
                </TableCell>
                <TableCell className="hidden text-xs sm:table-cell">
                  {inspection.inspector}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {fmtDateTime(inspection.startedAt)}
                </TableCell>
                <TableCell className="tabular-nums">{inspection.findings.length}</TableCell>
                <TableCell>
                  <InspectionStatusBadge status={inspection.status} />
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() =>
                      navigate(
                        inspection.status === "in-progress"
                          ? `/dashboard/inspections/${inspection.id}`
                          : `/dashboard/analysis/${inspection.id}`,
                      )
                    }
                  >
                    {inspection.status === "in-progress" ? "Prepare" : "Review"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ComplianceNote className="mt-4" />

      <EditAssetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        assetId={asset.id}
        name={asset.name}
        condition={asset.condition}
        notes={asset.notes ?? ""}
        onSave={(condition, notes) => {
          updateAsset(asset.id, { condition, notes: notes || undefined });
          setEditOpen(false);
          toast.success("Asset updated", {
            description: `${asset.id} · condition set to ${condition}.`,
          });
        }}
      />
    </PageShell>
  );
}

function EditAssetDialog({
  open,
  onOpenChange,
  assetId,
  name,
  condition,
  notes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  name: string;
  condition: AssetCondition;
  notes: string;
  onSave: (condition: AssetCondition, notes: string) => void;
}) {
  const [nextCondition, setNextCondition] = useState<AssetCondition>(condition);
  const [nextNotes, setNextNotes] = useState(notes);

  /* re-sync the form every time the dialog opens */
  useEffect(() => {
    if (open) {
      setNextCondition(condition);
      setNextNotes(notes);
    }
  }, [open, condition, notes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {assetId}</DialogTitle>
          <DialogDescription>
            Survey supervisors keep the recorded condition and watch notes current between
            AI inspection passes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3.5 py-3">
            <span className="text-sm font-medium">{name}</span>
          </div>
          <div className="grid gap-1.5">
            <Label>Recorded condition</Label>
            <Select
              value={nextCondition}
              onValueChange={(value) => setNextCondition(value as AssetCondition)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="fair">Fair</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Watch notes</Label>
            <Textarea
              value={nextNotes}
              onChange={(event) => setNextNotes(event.target.value)}
              className="min-h-24 rounded-lg"
              placeholder="Watch points, survey pattern, known defects…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(nextCondition, nextNotes.trim())}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
