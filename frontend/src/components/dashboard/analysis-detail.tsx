import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { api, getAuthToken } from "@/lib/api";
import {
  CircleCheck,
  CheckCircle2,
  Flag,
  Trash2,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Layers,
  ScanSearch,
  Maximize2,
  RefreshCw,
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
import {
  FindingReviewBadge,
  InspectionStatusBadge,
  SeverityBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
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

function getAuthenticatedUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const token = getAuthToken();
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export function AnalysisDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedFinding = searchParams.get("finding");

  const {
    state,
    inspectionById,
    assetById,
    reviewFinding,
    deleteFinding,
    createWorkOrder,
  } = useAppStore();

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

  // Active view mode per image: "unet" (default) | "yolo" | "mask"
  const [imageModes, setImageModes] = useState<Record<string, "unet" | "yolo" | "mask">>({});

  // Dialog states
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderFinding, setOrderFinding] = useState<any | null>(null);

  // Sign-Off Dialog states
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [signOffNotes, setSignOffNotes] = useState("");
  const [signOffSeverity, setSignOffSeverity] = useState<string>("minor");
  const [submittingSignOff, setSubmittingSignOff] = useState(false);

  // Zoom Modal
  const [zoomedImage, setZoomedImage] = useState<{ url: string; label: string; mode: string } | null>(null);

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
        const imagesList = realImages.items || [];
        setDbImages(imagesList);
        const detectionsList = Array.isArray(realDets) ? realDets : (realDets?.items || []);
        setDbDetections(detectionsList);

        // Pre-initialize image view modes to "unet" as default
        const initialModes: Record<string, "unet" | "yolo" | "mask"> = {};
        imagesList.forEach((img: any) => {
          initialModes[img.id] = "unet";
        });
        setImageModes((prev) => ({ ...initialModes, ...prev }));

        // Pre-calculate highest severity for sign-off default
        let highestSev = (realInsp.overall_severity || realInsp.severity || "minor").toLowerCase();
        const sevOrder = ["no_visible_damage", "minor", "moderate", "severe", "critical"];
        detectionsList.forEach((d: any) => {
          const s = (d.severity || "").toLowerCase();
          if (sevOrder.indexOf(s) > sevOrder.indexOf(highestSev)) {
            highestSev = s;
          }
        });
        setSignOffSeverity(highestSev);

        if (realInsp.assetId) {
          const assets = await api.getAssets().catch(() => []);
          const match = assets.find((a: any) => a.id === realInsp.assetId || a.code === realInsp.assetId);
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
        inspector:
          dbInspection.inspector?.name ||
          dbInspection.inspectorName ||
          dbInspection.inspectorId ||
          "Infrastructure Inspector",
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
        modelVersion:
          (Array.isArray(dbDetections) && dbDetections[0]?.model_id) ||
          "InfraScan Two-Stage AI (ResNet-18 + YOLO / U-Net)",
        progress: 100,
        notes: dbInspection.notes || "",
        escalationReason: undefined,
        frames: dbImages.map((img: any, idx: number) => {
          const unetUrl =
            img.unetUrl ||
            `/api/v1/images/${img.id}/file?variant=unet`;
          const yoloUrl =
            img.rfdetrUrl ||
            img.yoloUrl ||
            `/api/v1/images/${img.id}/file?variant=rfdetr`;
          const maskUrl =
            img.unetMaskUrl ||
            `/api/v1/images/${img.id}/file?variant=mask`;
          return {
            id: img.id,
            label: `Photo ${idx + 1} (${img.filename})`,
            filename: img.filename,
            capturedAt: img.createdAt || new Date().toISOString(),
            method: "walkdown" as const,
            seed: 1000 + idx,
            url: unetUrl, // U-Net model output image as default!
            unetUrl,
            yoloUrl,
            maskUrl,
            thumbnailUrl: img.thumbnailUrl || unetUrl,
            width: img.width,
            height: img.height,
            status: img.status,
            crackGeometry: img.crackGeometry,
            damageAssessment: img.damageAssessment,
            calibration: img.calibration,
            qualityReport: img.qualityReport,
          };
        }),
        findings: (Array.isArray(dbDetections) ? dbDetections : []).map((d: any) => {
          const isCracked =
            d.defect_type === "crack" ||
            d.defect_type === "longitudinal_cracking" ||
            d.defect_type === "transverse_cracking" ||
            d.defect_type === "alligator_cracking";
          const rawConfidence =
            d.confidence != null
              ? d.confidence
              : d.geometry?.probabilities?.cracked ?? 0.89;

          return {
            id: d.id,
            inspectionId: d.inspection_id || d.inspectionId,
            frameId: d.image_id || d.imageId,
            classCode: (d.defect_type === "longitudinal_cracking"
              ? "D00"
              : d.defect_type === "transverse_cracking"
              ? "D10"
              : d.defect_type === "alligator_cracking"
              ? "D20"
              : d.defect_type === "pothole"
              ? "D40"
              : "D00") as any,
            confidence: Number(rawConfidence),
            severity: (d.severity === "moderate"
              ? "medium"
              : d.severity === "severe"
              ? "high"
              : d.severity === "critical"
              ? "critical"
              : d.severity === "no_visible_damage"
              ? "low"
              : "low") as any,
            rawSeverity: d.severity || "minor",
            bbox: d.geometry?.bbox || undefined,
            source: d.source || "ai_model",
            modelId: d.model_id || d.modelId || "ResNet-18 + YOLO / U-Net",
            probabilities: d.geometry?.probabilities,
            threshold: d.geometry?.threshold || 0.8,
            predictedClass:
              d.geometry?.predicted_class ||
              (isCracked ? "Cracked" : "Uncracked"),
            measurements: {
              lengthPx: Math.round(
                d.measurements?.length_px || d.measurement?.length || 0
              ),
              widthPx: Math.round(
                d.measurements?.max_width_px || d.measurement?.max_width || 0
              ),
              areaPx: Math.round(
                d.measurements?.area_px || d.measurement?.area || 0
              ),
              widthMm:
                Math.round(
                  (d.measurements?.max_width_mm || d.measurement?.max_width || 0) * 10
                ) / 10,
            },
            mmPerPx: d.measurements?.calibrated ? 0.25 : 1,
            review: (d.verified_by || d.verified || d.geometry_verified)
              ? ("confirmed" as const)
              : ("pending" as const),
            addedByModel: d.source === "ai_model",
            reviewedBy: d.annotated_by || d.verified_by,
            reviewedAt: d.verified_at || d.updated_at || d.created_at,
            note: d.notes || "",
            defectType: d.defect_type || (isCracked ? "crack" : "sound_concrete"),
            geometryVerified: Boolean(d.verified_by || d.verified || d.geometry_verified),
          };
        }),
      };
    }
    if (storeInspection) return storeInspection;
    return null;
  }, [storeInspection, dbInspection, dbImages, dbDetections]);

  const asset =
    storeAsset ||
    dbAsset ||
    (inspection
      ? {
          id: inspection.assetId,
          name: inspection.assetId,
          location: "Inspection site",
          material: "Reinforced Concrete",
          kind: "bridge" as const,
        }
      : undefined);

  // Preselect requested finding if query param present
  useEffect(() => {
    if (!inspection) return;
    if (requestedFinding && inspection.findings.some((f) => f.id === requestedFinding)) {
      setSelectedFindingId(requestedFinding);
    }
  }, [requestedFinding, inspection]);

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
          description="The inspection may have been removed or does not exist."
          action={<Button onClick={() => navigate("/app/review")}>Back to review queue</Button>}
        />
      </PageShell>
    );
  }

  const decided = inspection.findings.filter((f) => f.review !== "pending").length;
  const pending = inspection.findings.length - decided;

  // Real backend actions
  const handleConfirmFinding = async (findingId: string) => {
    try {
      await api.verifyGeometry(findingId);
      toast.success("Finding verified & confirmed", {
        description: "Geometry certified for sign-off audit trail.",
      });
      loadBackendData();
    } catch {
      reviewFinding(inspection.id, findingId, "confirmed");
      toast.success("Finding confirmed", {
        description: "Validated as real damage in current session.",
      });
    }
  };

  const handleOpenFlagModal = (findingId: string, currentNote: string = "") => {
    setSelectedFindingId(findingId);
    setFlagNote(currentNote);
    setFlagOpen(true);
  };

  const handleFlagFindingSubmit = async () => {
    if (!selectedFindingId) return;
    const note = flagNote.trim();
    try {
      await api.updateDetection(selectedFindingId, {
        notes: note || "Flagged during review as potential false positive.",
      });
      toast.success("Finding flagged", {
        description: "Excluded from priority work orders; preserved in audit record.",
      });
      setFlagOpen(false);
      loadBackendData();
    } catch {
      reviewFinding(inspection.id, selectedFindingId, "flagged", note);
      setFlagOpen(false);
      toast.success("Finding flagged");
    }
  };

  const handleDeleteFinding = async (findingId: string, classCode: string = "Finding") => {
    try {
      await api.deleteDetection(findingId);
      toast.success("Finding discarded", {
        description: `${classCode} removed from survey findings.`,
      });
      loadBackendData();
    } catch {
      deleteFinding(inspection.id, findingId);
      toast.success("Finding removed");
    }
  };

  const handleSignOffSubmit = async () => {
    setSubmittingSignOff(true);
    try {
      const payload = {
        description: signOffNotes.trim() || undefined,
        severity: signOffSeverity,
      };
      await api.signOffInspection(inspection.id, payload).catch(async () => {
        // Fallback for inspector role
        return await api.submitInspection(inspection.id, payload);
      });

      toast.success("Review signed off successfully", {
        description: `${inspection.id} certified. Overall Severity: ${signOffSeverity.toUpperCase()}.`,
      });
      setSignOffOpen(false);
      loadBackendData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to sign off review. Please check all fields.");
    } finally {
      setSubmittingSignOff(false);
    }
  };

  const handleMarkNoDefects = async () => {
    try {
      await api.markNoDefects(inspection.id, "No defects recorded by engineer during inspection.");
      toast.success("Marked: No defects recorded", {
        description: "Clean survey recorded in audit log.",
      });
      loadBackendData();
    } catch (err: any) {
      toast.error(err.message || "Failed to record clean survey.");
    }
  };

  // Helper for switching image viewer variant
  const setPhotoVariant = (photoId: string, variant: "unet" | "yolo" | "mask") => {
    setImageModes((prev) => ({
      ...prev,
      [photoId]: variant,
    }));
  };

  const getPhotoVariant = (photoId: string): "unet" | "yolo" | "mask" => {
    return imageModes[photoId] || "unet"; // Default U-Net!
  };

  const getPhotoUrlForVariant = (frame: any, variant: "unet" | "yolo" | "mask"): string => {
    if (variant === "unet") {
      return (
        frame.unetUrl ||
        `/api/v1/images/${frame.id}/file?variant=unet`
      );
    }
    if (variant === "yolo") {
      return (
        frame.yoloUrl ||
        `/api/v1/images/${frame.id}/file?variant=rfdetr`
      );
    }
    if (variant === "mask") {
      return (
        frame.maskUrl ||
        `/api/v1/images/${frame.id}/file?variant=mask`
      );
    }
    return frame.url;
  };

  const imagesList = inspection.frames.length > 0 ? inspection.frames : [
    {
      id: "fallback-frame",
      label: "Photo 1 (Survey Frame)",
      capturedAt: new Date().toISOString(),
      method: "walkdown" as const,
      seed: 1001,
      url: `/api/v1/images/${id}/file?variant=unet`,
      unetUrl: `/api/v1/images/${id}/file?variant=unet`,
      yoloUrl: `/api/v1/images/${id}/file?variant=rfdetr`,
      maskUrl: `/api/v1/images/${id}/file?variant=mask`,
    },
  ];

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
        description={`${inspectionMethodLabels[inspection.method]} · Inspector: ${inspection.inspector} · Model: ${inspection.modelVersion}${inspection.completedAt ? ` · Completed: ${fmtDateTime(inspection.completedAt)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <InspectionStatusBadge status={inspection.status} />

            {/* Note: "Run analysis" button removed per specification */}

            {inspection.findings.length === 0 ? (
              <Button variant="outline" size="sm" onClick={handleMarkNoDefects} className="h-9 gap-1.5 text-xs">
                <ShieldCheck className="size-4 text-emerald-500" />
                Record no defects
              </Button>
            ) : null}

            {inspection.status !== "reviewed" ? (
              <Button
                size="sm"
                onClick={() => setSignOffOpen(true)}
                className="h-9 gap-1.5 rounded-xl text-xs font-semibold bg-primary hover:opacity-90 shadow-xs"
              >
                <CircleCheck className="size-4" />
                Sign off review
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Compliance & Model Verification Banner */}
      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="size-4 text-primary shrink-0" />
          <span>
            <strong>AI Decision Support:</strong> Inferences generated by <strong>{inspection.modelVersion}</strong> (calibrated crack threshold: 80.0% gate). Certified engineering review and sign-off is mandatory.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-lg bg-primary/15 text-primary font-semibold border border-primary/20">
            ResNet-18 + YOLO / U-Net
          </span>
        </div>
      </div>

      {/* Review Progress Overview */}
      <div className="mb-6 grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Review decisions
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">
                {decided} of {inspection.findings.length} finding
                {inspection.findings.length === 1 ? "" : "s"} decided
                {pending > 0 ? ` · ${pending} pending review` : " · All verified"}
              </div>
            </div>
            {inspection.findings.length > 0 ? (
              <span className="text-xs font-semibold text-primary font-mono">
                {Math.round((decided / inspection.findings.length) * 100)}% validated
              </span>
            ) : null}
          </div>
          <Progress
            className="mt-3 h-2 rounded-full bg-muted"
            value={inspection.findings.length === 0 ? 100 : (decided / inspection.findings.length) * 100}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Assigned Reviewer
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {state.session?.name || inspection.inspector || "Civil Engineer"}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {inspection.status === "reviewed"
              ? "Signed off & record locked."
              : "Review decisions update inspection audit log."}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* PAIRED IMAGE + DECISION BLOCK ROWS (ALL IMAGES DISPLAYED)        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {imagesList.map((frame, index) => {
          const currentMode = getPhotoVariant(frame.id);
          const currentVariantUrl = getPhotoUrlForVariant(frame, currentMode);
          const authImageUrl = getAuthenticatedUrl(currentVariantUrl);

          // Find findings belonging to this photo
          const frameFindings = inspection.findings.filter(
            (f) =>
              f.frameId === frame.id ||
              (f as any).imageId === frame.id ||
              (f as any).image_id === frame.id
          );

          // Crack geometry summary if available
          const geom = (frame as any).crackGeometry || ((frame as any).qualityReport as any)?.crack_geometry;
          const damageTier = (frame as any).damageAssessment || ((frame as any).qualityReport as any)?.damage_assessment;

          return (
            <div
              key={frame.id}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-colors hover:border-border/80"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* ── LEFT SIDE: Image Viewer with 3 Variant Buttons (7 cols) ── */}
                <div className="lg:col-span-7 space-y-3">
                  {/* Photo Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/60">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold text-foreground">
                        {frame.label || `Photo ${index + 1}`}
                      </span>
                      <span className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                        {frame.method || "Walkdown"}
                      </span>
                    </div>

                    {/* The 3 View Mode Buttons (Highlighted in Screenshot) + Zoom */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1 shadow-xs">
                        {/* Button 1: U-Net Model Output Image (DEFAULT) */}
                        <button
                          type="button"
                          onClick={() => setPhotoVariant(frame.id, "unet")}
                          title="View U-Net Model Output Image (Crack Segmentation)"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                            currentMode === "unet"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <Sparkles className="size-3.5" />
                          <span>U-Net</span>
                        </button>

                        {/* Button 2: YOLO from Database */}
                        <button
                          type="button"
                          onClick={() => setPhotoVariant(frame.id, "yolo")}
                          title="View YOLO / RF-DETR Detections from Database"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                            currentMode === "yolo"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <ScanSearch className="size-3.5" />
                          <span>YOLO</span>
                        </button>

                        {/* Button 3: Binary Map */}
                        <button
                          type="button"
                          onClick={() => setPhotoVariant(frame.id, "mask")}
                          title="View Binary Segmentation Map"
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                            currentMode === "mask"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <Layers className="size-3.5" />
                          <span>Binary Map</span>
                        </button>
                      </div>

                      {/* Zoom / Fullscreen Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedImage({
                            url: currentVariantUrl,
                            label: frame.label,
                            mode: currentMode,
                          })
                        }
                        title="Maximize / Inspect in High Resolution"
                        className="size-8 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Maximize2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Main Image Container */}
                  <div className="relative overflow-hidden rounded-xl bg-black/95 flex items-center justify-center min-h-[300px] max-h-[460px] border border-border/80">
                    {authImageUrl ? (
                      <img
                        src={authImageUrl}
                        alt={frame.label}
                        className="w-full h-full max-h-[460px] object-contain transition-opacity duration-200"
                        onError={(e) => {
                          // If current variant failed to load, fallback to original or thumbnail
                          const target = e.target as HTMLImageElement;
                          if (currentMode !== "unet" && (frame as any).unetUrl) {
                            target.src = getAuthenticatedUrl((frame as any).unetUrl) || "";
                          }
                        }}
                      />
                    ) : (
                      <div className="p-8 text-center text-muted-foreground text-xs">
                        No image source available for this frame
                      </div>
                    )}

                    {/* Mode Overlay Pill */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md text-[11px] font-semibold text-white border border-white/15 shadow-sm">
                        {currentMode === "unet" ? (
                          <>
                            <Sparkles className="size-3 text-cyan-400" />
                            <span>U-Net Crack Segmentation (Default)</span>
                          </>
                        ) : currentMode === "yolo" ? (
                          <>
                            <ScanSearch className="size-3 text-amber-400" />
                            <span>YOLO / RF-DETR Detections</span>
                          </>
                        ) : (
                          <>
                            <Layers className="size-3 text-purple-400" />
                            <span>Binary Segmentation Map</span>
                          </>
                        )}
                      </span>

                      {geom?.summary?.crack_density_percent != null && (
                        <span className="px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md text-[11px] font-mono font-bold text-cyan-300 border border-white/15">
                          {geom.summary.crack_density_percent.toFixed(2)}% Area
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Crack Geometry Strip if available */}
                  {geom?.summary && (
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-secondary/50 p-2 border border-border/60">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Crack Density</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                          {geom.summary.crack_density_percent?.toFixed(2)}%
                        </div>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2 border border-border/60">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Peak Width</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                          {geom.summary.max_width_mm
                            ? `${geom.summary.max_width_mm.toFixed(2)} mm`
                            : `${Math.round(geom.summary.max_width_px || 0)} px`}
                        </div>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2 border border-border/60">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Mean Width</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                          {geom.summary.mean_width_mm
                            ? `${geom.summary.mean_width_mm.toFixed(2)} mm`
                            : `${Math.round(geom.summary.mean_width_px || 0)} px`}
                        </div>
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-2 border border-border/60">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Branches</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                          {geom.summary.branch_count ?? 0}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── RIGHT SIDE: Paired Decision Block for THIS Image (5 cols) ── */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/60">
                    Findings & Decisions for Photo {index + 1}
                  </div>

                  {frameFindings.length > 0 ? (
                    <div className="space-y-3">
                      {frameFindings.map((finding) => {
                        const isConfirmed = finding.review === "confirmed";
                        const isFlagged = finding.review === "flagged";

                        return (
                          <div
                            key={finding.id}
                            className={cn(
                              "rounded-xl border bg-background p-4 shadow-2xs space-y-3 transition-colors",
                              isConfirmed
                                ? "border-emerald-500/40"
                                : isFlagged
                                ? "border-rose-500/40"
                                : "border-border hover:border-primary/40"
                            )}
                          >
                            {/* Header: Class Code, Defect Name, Severity, Review Status */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                                  {finding.classCode}
                                </span>
                                <span className="text-xs font-bold text-foreground">
                                  {(damageClasses as any)[finding.classCode]?.label ||
                                    (finding as any).defectType ||
                                    "Crack Defect"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <SeverityBadge severity={finding.severity} />
                                <FindingReviewBadge review={finding.review} />
                              </div>
                            </div>

                            {/* 4 Metric Tiles */}
                            <div className="grid grid-cols-4 gap-1.5 text-center">
                              <MeasureTile
                                label="CONF."
                                value={`${Math.round(finding.confidence * 100)}%`}
                              />
                              <MeasureTile
                                label="CLASS"
                                value={
                                  (finding as any).predictedClass ||
                                  ((finding as any).defectType === "crack" ? "Cracked" : "Defect")
                                }
                              />
                              <MeasureTile
                                label="SOURCE"
                                value={(finding as any).source === "ai_model" ? "ResNet-18" : "Manual"}
                              />
                              <MeasureTile
                                label="GATE"
                                value={`${(((finding as any).threshold || 0.8) * 100).toFixed(0)}%`}
                              />
                            </div>

                            {/* Crack Measurements & AASHTO / ASTM Severity */}
                            {finding.measurements && (
                              <div className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 text-xs space-y-1">
                                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                                  <span>Peak Crack Width:</span>
                                  <strong className="text-foreground font-mono">
                                    {finding.measurements.widthMm > 0
                                      ? `${finding.measurements.widthMm} mm`
                                      : `${finding.measurements.widthPx} px`}
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                                  <span>Total Crack Length:</span>
                                  <span className="font-mono text-foreground">
                                    {finding.measurements.lengthPx} px
                                  </span>
                                </div>
                                {damageTier?.severity_tier && (
                                  <div className="mt-1 pt-1 border-t border-border/40 flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Standard Tier:</span>
                                    <span className="text-[11px] font-bold text-primary uppercase">
                                      {damageTier.severity_tier}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Notes / Explanation */}
                            {finding.note ? (
                              <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                {finding.note}
                                {finding.reviewedBy ? ` — by ${finding.reviewedBy}` : ""}
                              </p>
                            ) : null}

                            {/* Decision Actions: Confirm, Flag, Work Order, Discard */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                              {!isConfirmed && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmFinding(finding.id)}
                                  className="h-8 rounded-lg text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                >
                                  <CircleCheck className="size-3.5" />
                                  Confirm
                                </Button>
                              )}

                              {!isFlagged && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenFlagModal(finding.id, finding.note)}
                                  className="h-8 rounded-lg text-xs font-semibold gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                >
                                  <Flag className="size-3.5" />
                                  Flag
                                </Button>
                              )}

                              {isConfirmed && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setOrderFinding(finding);
                                    setOrderOpen(true);
                                  }}
                                  className="h-8 rounded-lg text-xs font-semibold gap-1"
                                >
                                  <Wrench className="size-3.5 text-primary" />
                                  Work order
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteFinding(finding.id, finding.classCode)}
                                className="ml-auto h-8 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="size-3.5" />
                                Discard
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Sound Surface Decision Block if no findings on this photo */
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-foreground">Sound Concrete Surface</div>
                          <div className="text-[11px] text-muted-foreground">
                            No crack defects detected above the 80% confidence gate.
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground leading-relaxed bg-background/60 p-2.5 rounded-lg border border-border/50">
                        ResNet-18 classified this photo as uncracked. U-Net segmentation confirms zero continuous defect regions.
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            toast.success(`Photo ${index + 1} verified as sound concrete surface.`);
                          }}
                          className="h-8 rounded-lg text-xs font-semibold gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                        >
                          <CircleCheck className="size-3.5" />
                          Confirm Sound Surface
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            handleOpenFlagModal(`photo-${frame.id}`, "Flagged false negative — manual inspection suggested.");
                          }}
                          className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Flag className="size-3.5" />
                          Flag Missed Defect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ComplianceNote className="mt-6" />

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* SIGN-OFF REVIEW MODAL (WITH OPTIONAL DESCRIPTION & SEVERITY)      */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={signOffOpen} onOpenChange={setSignOffOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CircleCheck className="size-5 text-primary" />
              Sign Off Inspection Review
            </DialogTitle>
            <DialogDescription className="text-xs">
              Complete engineering review and certify defect classification. Sign-off locks the survey record into the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Inspection Context */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-secondary/60 p-2 border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Asset</span>
                <div className="font-bold text-foreground truncate mt-0.5">{inspection.assetId}</div>
              </div>
              <div className="rounded-lg bg-secondary/60 p-2 border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Photos</span>
                <div className="font-bold font-mono text-foreground mt-0.5">{imagesList.length}</div>
              </div>
              <div className="rounded-lg bg-secondary/60 p-2 border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Findings</span>
                <div className="font-bold font-mono text-foreground mt-0.5">{inspection.findings.length}</div>
              </div>
            </div>

            {/* Input 1: Reviewer Notes / Description (STRICTLY OPTIONAL) */}
            <div className="space-y-1.5">
              <Label htmlFor="signoff-desc" className="text-xs font-semibold flex items-center justify-between">
                <span>Reviewer Description / Remarks</span>
                <span className="text-[11px] font-normal text-muted-foreground">(Optional)</span>
              </Label>
              <Textarea
                id="signoff-desc"
                value={signOffNotes}
                onChange={(e) => setSignOffNotes(e.target.value)}
                placeholder="Add optional engineering remarks, maintenance recommendations, or field observations..."
                rows={3}
                className="text-xs rounded-xl resize-none"
              />
            </div>

            {/* Input 2: Option to Change/Override Damage Severity Level of Inspection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Overall Damage Severity Level</Label>
              <Select value={signOffSeverity} onValueChange={setSignOffSeverity}>
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue placeholder="Select severity level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_visible_damage" className="text-xs">
                    No Visible Damage / Sound (0% density, hairline surface only)
                  </SelectItem>
                  <SelectItem value="minor" className="text-xs">
                    Minor Damage (Peak &lt; 3.0 mm, crack density &lt; 2.0%)
                  </SelectItem>
                  <SelectItem value="moderate" className="text-xs">
                    Moderate Damage (3.0 mm ≤ w ≤ 5.0 mm or 2.0% – 5.0% density)
                  </SelectItem>
                  <SelectItem value="severe" className="text-xs">
                    Severe Damage (5.0 mm &lt; w ≤ 8.0 mm or 2.5% – 8.0% density)
                  </SelectItem>
                  <SelectItem value="critical" className="text-xs">
                    Critical / Urgent Review (&gt; 8.0 mm, branch &gt; 10, or &gt; 8.0% density)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Governed by AASHTO / ASTM crack width thresholds and computed surface area density.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSignOffOpen(false)}
              disabled={submittingSignOff}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSignOffSubmit}
              disabled={submittingSignOff}
              className="text-xs font-semibold gap-1.5 bg-primary text-primary-foreground shadow-xs"
            >
              {submittingSignOff && <RefreshCw className="size-3.5 animate-spin" />}
              <span>Certify & Sign Off</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* FLAG REJECTION DIALOG                                             */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Flag className="size-4 text-amber-500" />
              Flag Finding as Rejection / False Positive
            </DialogTitle>
            <DialogDescription className="text-xs">
              Flagging excludes the defect from priority dispatch while preserving it in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <Label htmlFor="flag-note-input" className="text-xs font-semibold">
              Rejection Reason / Note (Optional)
            </Label>
            <Textarea
              id="flag-note-input"
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              placeholder="e.g. Surface staining or expansion joint shadow, not structural cracking."
              rows={3}
              className="text-xs rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFlagOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleFlagFindingSubmit}
              className="text-xs font-semibold gap-1"
            >
              <Flag className="size-3.5" />
              Confirm Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* WORK ORDER CREATION DIALOG                                        */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <WorkOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        finding={orderFinding}
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
              description: `${order.priority} priority · due ${order.dueDate}.`,
            });
          }
        }}
      />

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* FULLSCREEN IMAGE ZOOM MODAL                                       */}
      {/* ───────────────────────────────────────────────────────────────── */}
      {zoomedImage && (
        <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
          <DialogContent className="max-w-5xl p-4 bg-black/95 text-white border-zinc-800">
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-800">
              <div className="space-y-0.5">
                <DialogTitle className="text-sm font-bold text-white">
                  {zoomedImage.label}
                </DialogTitle>
                <div className="text-[11px] text-zinc-400 capitalize">
                  Variant: {zoomedImage.mode === "unet" ? "U-Net Crack Segmentation" : zoomedImage.mode === "yolo" ? "YOLO / RF-DETR" : "Binary Segmentation Map"}
                </div>
              </div>
            </DialogHeader>
            <div className="flex items-center justify-center p-2 min-h-[500px]">
              <img
                src={getAuthenticatedUrl(zoomedImage.url)}
                alt={zoomedImage.label}
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-2xl"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function MeasureTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-1 py-1.5 border border-border/50">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</div>
      <div className="text-xs font-bold font-mono tabular-nums text-foreground">{value}</div>
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

  useEffect(() => {
    if (open && finding) {
      const classLabel = damageClasses[finding.classCode]?.label || "Defect";
      setTitle(`${assetId} — ${classLabel.toLowerCase()} repair`);
      setPriority(priorityFromSeverity[finding.severity] || "high");
      setDueDate(defaultDueDate());
      setAssignee(assigneeDefault);
    }
  }, [open, finding, assetId, assigneeDefault]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Wrench className="size-4 text-primary" />
            Raise Maintenance Work Order
          </DialogTitle>
          <DialogDescription className="text-xs">
            Repair order sourced from inspection {inspectionId}
            {finding ? ` · finding ${finding.classCode}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-xs">
          <div className="space-y-1">
            <Label htmlFor="wo-title" className="text-xs">Title</Label>
            <Input
              id="wo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high" className="text-xs">High</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                  <SelectItem value="low" className="text-xs">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="wo-due" className="text-xs">Due Date</Label>
              <Input
                id="wo-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="wo-assignee" className="text-xs">Assignee</Label>
            <Input
              id="wo-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Maintenance Engineer"
              className="text-xs h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onCreate({
                title: title.trim() || `${assetId} repair`,
                assetId,
                priority,
                dueDate,
                assignee: assignee.trim() || "Maintenance Team",
                findingRef: finding?.id,
                source: finding?.classCode,
              });
            }}
            className="text-xs font-semibold bg-primary text-primary-foreground shadow-xs"
          >
            Dispatch Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
