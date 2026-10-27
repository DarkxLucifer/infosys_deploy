import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  CircleCheck,
  Flag,
  Play,
  Trash2,
  TriangleAlert,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { FrameCard, FrameClassStrip } from "@/components/inspection/crack-frame";
import {
  FindingReviewBadge,
  InspectionStatusBadge,
  SeverityBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import {
  damageClasses,
  fmtDateTime,
  inspectionMethodLabels,
  useAppStore,
} from "@/store/app";
import type { Finding, Severity } from "@/store/app";
import {
  ComplianceNote,
  EmptyState,
  MetaItem,
  PageHeader,
  PageShell,
} from "./page-shell";
import { cn } from "@/lib/utils";

const priorityFromSeverity: Record<Severity, "high" | "medium" | "low"> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function AnalysisDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const requestedFinding = searchParams.get("finding");

  const {
    state,
    inspectionById,
    assetById,
    runAnalysis,
    reviewFinding,
    deleteFinding,
    signOffInspection,
    createWorkOrder,
  } = useAppStore();
  const { navigate } = useDashboardNavigation();

  // Redirect immediately if id is "new"
  useEffect(() => {
    if (id === "new") {
      navigate("/app/inspections/new");
    }
  }, [id, navigate]);

  const [dbInspection, setDbInspection] = useState<any | null>(null);
  const [dbImages, setDbImages] = useState<any[]>([]);
  const [dbDetections, setDbDetections] = useState<any[]>([]);
  const [dbAsset, setDbAsset] = useState<any | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);

  const loadBackendData = async () => {
    if (!id || id === "new") {
      setLoadingDb(false);
      return;
    }
    try {
      const [realInsp, realImages, realDets] = await Promise.all([
        api.getInspection(id).catch(() => null),
        api.getInspectionImages(id).catch(() => ({ items: [] })),
        api.getInspectionDetections(id).catch(() => []),
      ]);
      if (realInsp) {
        setDbInspection(realInsp);
        setDbImages(realImages.items || []);
        setDbDetections(Array.isArray(realDets) ? realDets : (realDets?.items || []));
        if (realInsp.assetId) {
          const assets = await api.getAssets().catch(() => []);
          const match = assets.find((a: any) => a.id === realInsp.assetId);
          if (match) setDbAsset(match);
        }
      }
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    loadBackendData();
  }, [id]);

  const storeInspection = inspectionById(id);
  const storeAsset = storeInspection ? assetById(storeInspection.assetId) : undefined;

  const inspection = useMemo(() => {
    if (dbInspection) {
      return {
        id: dbInspection.id,
        title: `Inspection ${dbInspection.id.slice(0, 8)}`,
        assetId: dbInspection.assetId,
        inspector: dbInspection.inspector?.name || dbInspection.inspectorName || dbInspection.inspectorId || "Civil Engineer",
      method: "walkdown" as const,
      status: (dbInspection.status === "in_progress"
        ? "in-progress"
        : dbInspection.status === "pending_review" || dbInspection.status === "images_uploaded"
        ? "awaiting-review"
        : dbInspection.status === "reviewed"
        ? "reviewed"
        : "awaiting-review") as any,
      startedAt: dbInspection.inspectionDate || dbInspection.createdAt,
      completedAt: dbInspection.status === "closed" ? dbInspection.createdAt : undefined,
      modelVersion: "Classical OpenCV Engine (AI not connected)",
      progress: 100,
      notes: dbInspection.notes || "",
      escalationReason: undefined,
      frames: dbImages.map((img: any, idx: number) => ({
        id: img.id,
        label: `Frame ${idx + 1} (${img.filename})`,
        capturedAt: img.createdAt || new Date().toISOString(),
        method: "walkdown" as const,
        seed: 1000 + idx,
        url: `/api/v1/inspections/${dbInspection.id}/images/${img.id}/file`,
        thumbnailUrl: `/api/v1/inspections/${dbInspection.id}/images/${img.id}/file`,
        width: img.width,
        height: img.height,
        status: img.status,
      })),
      findings: (Array.isArray(dbDetections) ? dbDetections : []).map((d: any) => ({
        id: d.id,
        inspectionId: d.inspection_id,
        frameId: d.image_id,
        classCode: (d.defect_type === "longitudinal_cracking" ? "D00" : d.defect_type === "transverse_cracking" ? "D10" : d.defect_type === "alligator_cracking" ? "D20" : d.defect_type === "pothole" ? "D40" : "D11") as any,
        confidence: 1.0,
        severity: (d.severity === "moderate" ? "medium" : d.severity === "severe" ? "high" : d.severity === "critical" ? "critical" : "low") as any,
        bbox: { x: 20, y: 20, w: 60, h: 60 },
        measurements: {
          lengthPx: Math.round(d.measurements?.length_px || 0),
          widthPx: Math.round(d.measurements?.max_width_px || 0),
          areaPx: Math.round(d.measurements?.area_px || 0),
          widthMm: Math.round((d.measurements?.max_width_mm || 0) * 10) / 10,
        },
        mmPerPx: d.measurements?.calibrated ? 0.25 : 1,
        review: d.geometry_verified ? ("confirmed" as const) : ("pending" as const),
        addedByModel: false,
        reviewedBy: d.annotated_by,
        reviewedAt: d.updated_at || d.created_at,
        note: d.notes || "",
        defectType: d.defect_type,
        geometryVerified: d.geometry_verified,
      })),
    };
  }
  if (storeInspection) return storeInspection;
  return null;
}, [storeInspection, dbInspection, dbImages, dbDetections]);

  const asset = storeAsset || dbAsset || (inspection ? { id: inspection.assetId, name: inspection.assetId, location: "Inspection site", material: "Reinforced Concrete", kind: "bridge" as const } : undefined);

  /* preselect: query param → first pending → first finding */
  useEffect(() => {
    if (!inspection) return;
    if (requestedFinding && inspection.findings.some((f) => f.id === requestedFinding)) {
      setSelectedId(requestedFinding);
      return;
    }
    const firstPending = inspection.findings.find((f) => f.review === "pending");
    if (firstPending) setSelectedId(firstPending.id);
    else if (inspection.findings[0]) setSelectedId(inspection.findings[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, requestedFinding, inspection?.findings.length]);

  const selected = inspection?.findings.find((finding) => finding.id === selectedId) ?? null;

  if (loadingDb) {
    return (
      <PageShell wide>
        <div className="space-y-4 animate-pulse py-8">
          <div className="h-20 rounded-2xl bg-muted" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-muted" />
        </div>
      </PageShell>
    );
  }

  if (!inspection) {
    return (
      <PageShell>
        <EmptyState
          title={`Analysis for ${id} not found`}
          description="The inspection may have been cleared from the demo session or does not exist."
          action={<Button onClick={() => navigate("/app/review")}>Back to review queue</Button>}
        />
      </PageShell>
    );
  }

  const isLocked =
    inspection.status === "in-progress" || inspection.status === "processing";
  const decided = inspection.findings.filter(
    (finding) => finding.review !== "pending",
  ).length;
  const pending = inspection.findings.length - decided;

  const confirmFinding = async (findingId: string) => {
    try {
      await api.verifyGeometry(findingId);
      toast.success("Geometry verified", {
        description: "Measurements verified against imagery and certified for sign-off.",
      });
      loadBackendData();
    } catch {
      reviewFinding(inspection.id, findingId, "confirmed");
      toast.success("Finding confirmed", {
        description: "Validated as real damage and written into the survey record.",
      });
    }
  };

  const handleSignOff = async () => {
    try {
      await api.signOffInspection(inspection.id);
      toast.success("Review signed off", {
        description: `${inspection.id} signed off by Licensed Civil Engineer. Record locked.`,
      });
      loadBackendData();
    } catch (err: any) {
      signOffInspection(inspection.id);
      toast.success("Review signed off", {
        description: `${inspection.id} marked reviewed.`,
      });
    }
  };

  const handleMarkNoDefects = async () => {
    try {
      await api.markNoDefects(inspection.id, "No defects recorded by engineer during inspection.");
      toast.success("Marked: No defects recorded", {
        description: "Clean survey recorded in audit log. (Never labelled 'all clear').",
      });
      loadBackendData();
    } catch (err: any) {
      toast.error(err.message || "Failed to record clean survey.");
    }
  };

  return (
    <PageShell wide>
      <PageHeader
        backHref="/app/review"
        backLabel="Review queue"
        eyebrow={
          asset
            ? `${inspection.id} · ${inspection.assetId} ${asset.name}`
            : inspection.id
        }
        title={inspection.title}
        description={`${inspectionMethodLabels[inspection.method]} · inspector ${inspection.inspector} · model ${inspection.modelVersion}${inspection.completedAt ? ` · completed ${fmtDateTime(inspection.completedAt)}` : ""}`}
        actions={
          <>
            <InspectionStatusBadge status={inspection.status} />
            {inspection.status === "in-progress" ? (
              <Button onClick={() => { runAnalysis(inspection.id); toast.success("Analysis started", { description: "Processing pipeline initialized.", }); }}>
                <Play className="size-4" />
                Run analysis
              </Button>
            ) : null}
            {inspection.status === "awaiting-review" ? (
              <div className="flex items-center gap-2">
                {inspection.findings.length === 0 ? (
                  <Button variant="outline" onClick={handleMarkNoDefects}>
                    <ShieldCheck className="size-4 text-success" />
                    Record no defects
                  </Button>
                ) : null}
                <Button onClick={handleSignOff}>
                  <CircleCheck className="size-4" />
                  Sign off review
                </Button>
              </div>
            ) : null}
          </>
        }
      />

      {isLocked ? (
        <EmptyState
          title={
            inspection.status === "processing"
              ? "AI pass is running…"
              : "Capture not submitted yet"
          }
          description={
            inspection.status === "processing"
              ? `Progress ${Math.round(inspection.progress)}% — findings appear here as soon as the segmentation completes.`
              : "Run the AI analysis to generate findings for review."
          }
          action={
            inspection.status === "in-progress" ? (
              <Button
                onClick={() => {
                  runAnalysis(inspection.id);
                  toast.success("Analysis started", {
                    description: "Segmentation pass is running (~5s).",
                  });
                }}
              >
                <Play className="size-4" />
                Run AI analysis
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* review progress band */}
          <div className="mb-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border bg-card px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Review decisions
                  </div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums">
                    {decided} of {inspection.findings.length} finding
                    {inspection.findings.length === 1 ? "" : "s"} decided
                    {pending > 0 ? ` · ${pending} pending` : " · complete"}
                  </div>
                </div>
                {inspection.findings.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {Math.round((decided / inspection.findings.length) * 100)}% validated
                  </span>
                ) : null}
              </div>
              <Progress
                className="mt-3 h-2 rounded-full bg-muted"
                value={inspection.findings.length === 0 ? 0 : (decided / inspection.findings.length) * 100}
              />
            </div>
            <div className="rounded-2xl border bg-card px-5 py-4">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Reviewer
              </div>
              <div className="mt-0.5 text-sm font-semibold">{state.session?.name}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {inspection.status === "reviewed"
                  ? "Signed off — record is locked."
                  : "Sign-off confirms all pending findings."}
              </div>
            </div>
          </div>

          {inspection.findings.length === 0 ? (
            <EmptyState
              title="No findings above the confidence gate"
              description={`Nothing stronger than the configured gate (${Math.round(state.settings.confidenceGate * 100)}%) was detected across ${inspection.frames.length} frame${inspection.frames.length === 1 ? "" : "s"}.`}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              {/* --------------------------- frames --------------------------- */}
              <div className="space-y-3 xl:col-span-3">
                {inspection.frames.map((frame) => {
                  const frameFindings = inspection.findings.filter(
                    (item) => item.frameId === frame.id,
                  );
                  return (
                    <FrameCard
                      key={frame.id}
                      scene={frame}
                      findings={frameFindings}
                      selectedFindingId={selectedId}
                      onSelectFinding={(findingId) => setSelectedId(findingId)}
                      footer={<FrameClassStrip findings={frameFindings} />}
                    />
                  );
                })}
              </div>

              {/* --------------------------- findings -------------------------- */}
              <div className="space-y-3 xl:col-span-2">
                {inspection.findings
                  .slice()
                  .sort((a, b) =>
                    a.review === "pending" && b.review !== "pending"
                      ? -1
                      : a.review !== "pending" && b.review === "pending"
                        ? 1
                        : 0,
                  )
                  .map((finding) => {
                    const isSelected = finding.id === selectedId;
                    return (
                      <div
                        key={finding.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(finding.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            setSelectedId(finding.id);
                          }
                        }}
                        className={cn(
                          "cursor-pointer rounded-2xl border bg-card p-4 transition-colors outline-none",
                          isSelected
                            ? "border-primary ring-2 ring-primary/25"
                            : "hover:border-muted-foreground/30",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold">{finding.classCode}</span>
                          <span className="text-xs text-muted-foreground">
                            {(damageClasses as any)[finding.classCode]?.label || (finding as any).defectType || finding.classCode}
                          </span>
                          <SeverityBadge severity={finding.severity} />
                          <FindingReviewBadge review={finding.review} />
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                          <MeasureTile label="Conf." value={`${Math.round(finding.confidence * 100)}%`} />
                          <MeasureTile label="W (mm)" value={String(finding.measurements.widthMm)} />
                          <MeasureTile label="L (px)" value={String(finding.measurements.lengthPx)} />
                          <MeasureTile label="Area" value={String(finding.measurements.areaPx)} />
                        </div>

                        {finding.note ? (
                          <p className="mt-2.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                            {finding.note}
                            {finding.reviewedBy ? ` — ${finding.reviewedBy}` : ""}
                          </p>
                        ) : null}

                        {!isLocked ? (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                            {finding.review !== "confirmed" ? (
                              <Button
                                size="sm"
                                className="h-8 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  confirmFinding(finding.id);
                                }}
                              >
                                <CircleCheck className="size-3.5" />
                                Confirm
                              </Button>
                            ) : null}
                            {finding.review !== "flagged" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(finding.id);
                                  setFlagNote(finding.note ?? "");
                                  setFlagOpen(true);
                                }}
                              >
                                <Flag className="size-3.5" />
                                Flag
                              </Button>
                            ) : null}
                            {finding.review === "confirmed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(finding.id);
                                  setOrderOpen(true);
                                }}
                              >
                                <Wrench className="size-3.5" />
                                Work order
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto h-8 rounded-lg text-muted-foreground hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteFinding(inspection.id, finding.id);
                                if (selectedId === finding.id) setSelectedId(null);
                                toast.success("Finding removed", {
                                  description: `${finding.classCode} dropped from ${inspection.id}.`,
                                });
                              }}
                            >
                              <Trash2 className="size-3.5" />
                              Discard
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <ComplianceNote className="mt-4" />
        </>
      )}

      {/* ------------------------------- flag dialog ------------------------------ */}
      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag {selected?.classCode ?? "finding"}</DialogTitle>
            <DialogDescription>
              Flagging rejects the model's call — the finding is excluded from maintenance
              priorities but stays in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label htmlFor="flag-note">Rejection note</Label>
            <Textarea
              id="flag-note"
              value={flagNote}
              onChange={(event) => setFlagNote(event.target.value)}
              placeholder="e.g. Construction joint shadow, not a crack — false positive."
              className="min-h-20 rounded-lg"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFlagOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selected) return;
                const note = flagNote.trim();
                if (note.length < 5) {
                  toast.error("Add a note of at least 5 characters explaining the flag.");
                  return;
                }
                reviewFinding(inspection.id, selected.id, "flagged", note);
                setFlagOpen(false);
                toast.success("Finding flagged", { description: "Excluded from priorities." });
              }}
            >
              <Flag className="size-4" />
              Flag finding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------- work order dialog --------------------------- */}
      <WorkOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        finding={selected}
        inspectionId={inspection.id}
        assetId={inspection.assetId}
        assigneeDefault={state.session?.name ?? ""}
        onCreate={async (input) => {
          try {
            await api.createWorkOrder({
              asset_id: input.assetId,
              inspection_id: inspection.id,
              finding_id: input.findingRef,
              title: input.title,
              priority: input.priority,
              repair_action: input.title,
              due_date: new Date(input.dueDate).toISOString(),
              notes: `Created from review: ${input.source}`,
            });
            setOrderOpen(false);
            toast.success("Work order created", {
              description: `${input.title} dispatched to Maintenance schedule.`,
            });
          } catch {
            const order = createWorkOrder(input);
            setOrderOpen(false);
            toast.success(`${order.id} created`, {
              description: `${order.priority} priority · due ${order.dueDate} · ${order.assignee}.`,
            });
          }
        }}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function MeasureTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-1 py-1.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</div>
      <div className="text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}

function WorkOrderDialog({
  open,
  onOpenChange,
  finding,
  inspectionId,
  assetId,
  assigneeDefault,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: Finding | null;
  inspectionId: string;
  assetId: string;
  assigneeDefault: string;
  onCreate: (input: {
    title: string;
    assetId: string;
    priority: "high" | "medium" | "low";
    dueDate: string;
    assignee: string;
    findingRef?: string;
    source?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("high");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [assignee, setAssignee] = useState(assigneeDefault);

  /* prefill when the dialog opens for a finding */
  useEffect(() => {
    if (open && finding) {
      setTitle(`${assetId} — ${damageClasses[finding.classCode].label.toLowerCase()} repair`);
      setPriority(priorityFromSeverity[finding.severity]);
      setDueDate(defaultDueDate());
      setAssignee(assigneeDefault);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raise work order</DialogTitle>
          <DialogDescription>
            Repair order sourced from inspection {inspectionId}
            {finding ? ` · finding ${finding.classCode} (${finding.measurements.widthMm} mm)` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="wo-title">Title</Label>
            <Input
              id="wo-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as "high" | "medium" | "low")}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wo-due">Due date</Label>
              <Input
                id="wo-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wo-assignee">Assignee</Label>
            <Input
              id="wo-assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="rounded-lg"
              placeholder="Maintenance engineer on call"
            />
          </div>
          {finding ? (
            <MetaItem
              label="Finding reference (auto)"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{finding.id}</span>
                  <TriangleAlert className="size-3.5 text-warning" />
                  <span className="text-xs text-muted-foreground">
                    AI recommendation width {finding.measurements.widthMm} mm ·{" "}
                    {Math.round(finding.confidence * 100)}% confidence
                  </span>
                </span>
              }
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (title.trim().length < 6) {
                toast.error("Give the work order a descriptive title (6+ characters).");
                return;
              }
              onCreate({
                title: title.trim(),
                assetId,
                priority,
                dueDate,
                assignee: assignee.trim() || assigneeDefault,
                findingRef: finding?.id,
                source: `Engineer review · ${inspectionId}`,
              });
            }}
          >
            <Wrench className="size-4" />
            Create work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* end of file */
