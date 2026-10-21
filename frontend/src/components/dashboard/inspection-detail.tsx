import { useMemo, useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  FileText,
  Play,
  TriangleAlert,
  Upload,
  Ruler,
  CheckCheck,
  Loader2,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FrameCard, FrameClassStrip } from "@/components/inspection/crack-frame";
import {
  FindingReviewBadge,
  InspectionStatusBadge,
  SeverityBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { buildReportBlob, reportFilename, triggerDownload } from "@/lib/report-download";
import {
  damageClasses,
  fmtDateTime,
  inspectionMethodLabels,
  useAppStore,
} from "@/store/app";
import type { Finding, Frame, Inspection, Severity } from "@/store/app";
import {
  ComplianceNote,
  EmptyState,
  MetaItem,
  PageHeader,
  PageShell,
  StatCard,
} from "./page-shell";

const severityRank: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const pipelineStages = [
  { at: 0, label: "Capture intake" },
  { at: 25, label: "Quality & flattening" },
  { at: 45, label: "UNet segmentation" },
  { at: 65, label: "Morphology & measurement" },
  { at: 85, label: "Severity scoring" },
];

type BaselinePair = { current: Frame; previous: Frame };

function pickBaselinePair(
  inspection: Inspection,
  baseline: Inspection,
): BaselinePair | null {
  const current = inspection.frames[0];
  if (!current) return null;
  const previous =
    baseline.frames.find((frame) => frame.label === current.label) ?? baseline.frames[0];
  if (!previous) return null;
  return { current, previous };
}

function findBaselineMatch(
  inspection: Inspection,
  current: Finding,
  baseline: Inspection,
): Finding | undefined {
  const currentFrame = inspection.frames.find((frame) => frame.id === current.frameId);
  const candidates = baseline.findings.filter(
    (candidate) => candidate.classCode === current.classCode,
  );
  if (candidates.length === 0) return undefined;
  const sameLabel = currentFrame
    ? candidates.filter(
        (candidate) =>
          baseline.frames.find((frame) => frame.id === candidate.frameId)?.label ===
          currentFrame.label,
      )
    : [];
  const pool = sameLabel.length > 0 ? sameLabel : candidates;
  return pool.reduce((best, candidate) =>
    Math.abs(candidate.confidence - current.confidence) <
    Math.abs(best.confidence - current.confidence)
      ? candidate
      : best,
  );
}

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

export function InspectionDetailPage() {
  const { id = "" } = useParams();
  const { state, inspectionById, assetById, runAnalysis, escalateInspection, generateReport } =
    useAppStore();
  const { navigate } = useDashboardNavigation();
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");

  const [dbInspection, setDbInspection] = useState<any | null>(null);
  const [dbImages, setDbImages] = useState<any[]>([]);
  const [dbAsset, setDbAsset] = useState<any | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);

  const [uploadSource, setUploadSource] = useState("smartphone");
  const [isUploading, setIsUploading] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<Record<string, "orig" | "proc">>({});
  const [preprocessingImgId, setPreprocessingImgId] = useState<string | null>(null);
  const [calibratingImageId, setCalibratingImageId] = useState<string | null>(null);
  const [mmPerPixel, setMmPerPixel] = useState("0.25");
  const [refLineLength, setRefLineLength] = useState("100");
  const [pixelLength, setPixelLength] = useState("400");
  const [calibrationMethod, setCalibrationMethod] = useState("mm_per_pixel");

  const fetchData = async () => {
    if (!id || id === "new") {
      setLoadingDb(false);
      return;
    }
    try {
      const [realInsp, realImages] = await Promise.all([
        api.getInspection(id).catch(() => null),
        api.getInspectionImages(id).catch(() => ({ items: [] })),
      ]);
      if (realInsp) {
        setDbInspection(realInsp);
        setDbImages(realImages.items || []);
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
    fetchData();
  }, [id]);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setIsUploading(true);
    let successCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await api.uploadInspectionImage(id, file, uploadSource, false);
          successCount++;
        } catch (err: any) {
          if (err.status === 422 && err.response?.detail?.warnings) {
            toast.warning(`Warning on ${file.name}: ${err.response.detail.warnings.join(", ")}`, {
              description: "Warning recorded. Confirm warning in frame list to proceed.",
            });
          } else {
            toast.error(`Error uploading ${file.name}: ${err.message}`);
          }
        }
      }
      if (successCount > 0) {
        toast.success(`${successCount} frame${successCount === 1 ? "" : "s"} uploaded`);
      }
      fetchData();
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleCameraCapture = async (blob: Blob) => {
    if (!id) return;
    setIsUploading(true);
    try {
      let gpsCoord: { lat: number; lng: number } | undefined = undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          gpsCoord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {}
      }

      await api.uploadInspectionImage(id, blob, "smartphone", false, gpsCoord);
      toast.success("Camera photo captured & preprocessed", {
        description: "Image uploaded and initial crack enhancement preprocessing pipeline completed.",
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to upload camera capture");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunPreprocess = async (imgId: string) => {
    setPreprocessingImgId(imgId);
    try {
      await api.preprocessImage(imgId, "standard_crack_enhancement");
      toast.success("Image preprocessed successfully", {
        description: "Applied noise reduction, CLAHE contrast enhancement, and edge sharpening.",
      });
      setViewMode((prev) => ({ ...prev, [imgId]: "proc" }));
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Preprocessing failed");
    } finally {
      setPreprocessingImgId(null);
    }
  };

  const handleSubmitForReview = async () => {
    if (!id) return;
    try {
      await api.submitInspection(id);
      toast.success("Submitted for review", {
        description: "Image set locked and routed to Civil Engineer review queue.",
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit for review. Ensure at least one accepted image exists.");
    }
  };

  const handleCalibrate = async () => {
    if (!calibratingImageId || !id) return;
    try {
      if (calibrationMethod === "mm_per_pixel") {
        const val = parseFloat(mmPerPixel);
        if (isNaN(val) || val <= 0) {
          toast.error("Enter a valid mm/px value > 0");
          return;
        }
        await api.calibrateImage(id, calibratingImageId, {
          method: "mm_per_pixel",
          mm_per_pixel: val,
        });
      } else {
        const refMm = parseFloat(refLineLength);
        const px = parseFloat(pixelLength);
        if (isNaN(refMm) || refMm <= 0 || isNaN(px) || px <= 0) {
          toast.error("Enter valid reference length and pixel length");
          return;
        }
        await api.calibrateImage(id, calibratingImageId, {
          method: "manual_line",
          reference_line_length_mm: refMm,
          pixel_length: px,
        });
      }
      toast.success("Scale calibration saved", {
        description: "Measurements on this frame will be reported in physical mm.",
      });
      setCalibratingImageId(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save calibration.");
    }
  };

  const handleConfirmWarning = async (imageId: string) => {
    try {
      await api.confirmImageWarning(imageId);
      toast.success("Image warning confirmed", {
        description: "Accepted for inspection review.",
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm warning.");
    }
  };

  const storeInspection = inspectionById(id);
  const storeAsset = storeInspection ? assetById(storeInspection.assetId) : undefined;

  const inspection = useMemo(() => {
    if (dbInspection) {
      const framesFromDb = dbImages.map((img: any, idx: number) => ({
        id: img.id,
        label: `Frame ${idx + 1} (${img.filename})`,
        capturedAt: img.createdAt || new Date().toISOString(),
        method: "walkdown" as const,
        seed: 1000 + idx,
        url: `/api/v1/images/${img.id}/file`,
        thumbnailUrl: `/api/v1/images/${img.id}/thumbnail`,
        width: img.width || 1920,
        height: img.height || 1080,
        status: img.status,
      }));

      const framesFromStore = storeInspection ? storeInspection.frames : [];
      // Combine frames, avoiding duplicates by id
      const combinedFrames: any[] = [...framesFromDb];
      for (const sf of framesFromStore) {
        if (!combinedFrames.some((cf) => cf.id === sf.id)) {
          combinedFrames.push(sf);
        }
      }

      return {
        id: dbInspection.id,
        title: dbInspection.title || `Inspection ${dbInspection.id.slice(0, 8)}`,
        assetId: dbInspection.assetId,
        inspector: dbInspection.inspectorId || "Assigned Inspector",
        method: "walkdown" as const,
        status: (dbInspection.status === "in_progress" || dbInspection.status === "images_uploaded" || dbInspection.status === "draft"
          ? "in-progress"
          : dbInspection.status === "pending_review" || dbInspection.status === "submitted"
          ? "awaiting-review"
          : dbInspection.status === "reviewed"
          ? "reviewed"
          : "in-progress") as any,
        startedAt: dbInspection.inspectionDate || dbInspection.createdAt,
        completedAt: dbInspection.status === "closed" ? dbInspection.createdAt : undefined,
        modelVersion: "Classical OpenCV Engine (AI not connected)",
        progress: 100,
        notes: dbInspection.notes || "",
        escalationReason: undefined,
        frames: combinedFrames,
        findings: storeInspection ? storeInspection.findings : [],
      };
    }
    if (storeInspection) return storeInspection;
    return null;
  }, [storeInspection, dbInspection, dbImages]);

  const asset = storeAsset || dbAsset || (inspection ? { id: inspection.assetId, name: inspection.assetId, location: "Inspection site", material: "Reinforced Concrete", kind: "bridge" as const } : undefined);

  const baseline = useMemo(() => {
    if (!inspection) return undefined;
    return state.inspections
      .filter(
        (candidate) =>
          candidate.assetId === inspection.assetId &&
          candidate.id !== inspection.id &&
          candidate.status !== "in-progress" &&
          candidate.findings.length > 0,
      )
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }, [state.inspections, inspection]);

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
          title={`Inspection ${id} not found`}
          description="This inspection record was not found in your organization's registry or the link is invalid."
          action={
            <Button onClick={() => navigate("/app/inspections")}>
              Back to inspections
            </Button>
          }
        />
      </PageShell>
    );
  }

  const isProcessing = inspection.status === "processing";
  const pending = inspection.findings.filter((finding) => finding.review === "pending").length;
  const highSeverity = inspection.findings.filter(
    (finding) => severityRank[finding.severity] >= severityRank.high,
  ).length;

  const runAnalysisNow = () => {
    runAnalysis(inspection.id);
    toast.success("Analysis started", {
      description:
        "The pipeline moves through segmentation, measurement and severity scoring (~5s).",
    });
    navigate(`/dashboard/analysis/${inspection.id}`);
  };

  const downloadCertificateNow = () => {
    const report = generateReport("integrity", inspection.id);
    const blob = buildReportBlob(report, {
      assets: state.assets,
      inspections: state.inspections,
      workOrders: state.workOrders,
      settings: state.settings,
      userName: state.session?.name ?? "demo user",
    });
    triggerDownload(blob, reportFilename(report));
    toast.success(`${report.id} downloaded`, {
      description: "Integrity certificate PDF saved to your downloads.",
    });
  };



  const submitEscalation = () => {
    if (escalateReason.trim().length < 8) {
      toast.error("Add a short reason for the escalation (at least 8 characters).");
      return;
    }
    escalateInspection(inspection.id, escalateReason.trim());
    setEscalateOpen(false);
    setEscalateReason("");
    toast.success("Inspection escalated", {
      description: "Maintenance has been notified on this finding.",
    });
  };

  const escalateButton =
    inspection.status === "awaiting-review" && highSeverity > 0 ? (
      <Button variant="outline" onClick={() => setEscalateOpen(true)} className="text-warning">
        <TriangleAlert className="size-4" />
        Escalate
      </Button>
    ) : null;

  return (
    <PageShell wide>
      <PageHeader
        backHref="/dashboard/inspections"
        backLabel="Inspections"
        eyebrow={asset ? `${inspection.assetId} · ${asset.name}` : inspection.assetId}
        title={inspection.title}
        description={`${inspectionMethodLabels[inspection.method]} · inspector ${inspection.inspector} · ${inspection.frames.length} frame${inspection.frames.length === 1 ? "" : "s"} · model ${inspection.modelVersion}`}
        actions={
          <>
            {inspection.status === "in-progress" ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleSubmitForReview}>
                  <CheckCheck className="size-4" />
                  Submit for review
                </Button>
                <Button variant="secondary" onClick={runAnalysisNow}>
                  <Play className="size-4" />
                  Run analysis
                </Button>
              </div>
            ) : null}
            {inspection.status === "awaiting-review" ? (
              <>
                <Button variant="outline" onClick={downloadCertificateNow}>
                  <FileText className="size-4" />
                  Download certificate
                </Button>
                <Button onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  Review findings
                </Button>
                {escalateButton}
              </>
            ) : null}
            {inspection.status === "reviewed" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await api.generateReports(inspection.id, "all");
                      window.open(`/api/v1/inspections/${inspection.id}/reports/download?format=pdf`, "_blank");
                    } catch {
                      downloadCertificateNow();
                    }
                  }}
                >
                  <FileText className="size-4" />
                  Download report (PDF)
                </Button>
                <Button variant="secondary" onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  View review
                </Button>
              </div>
            ) : null}
            {inspection.status === "escalated" ? (
              <>
                <Button variant="outline" onClick={downloadCertificateNow}>
                  <FileText className="size-4" />
                  Download certificate
                </Button>
                <Button onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  Open review
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {inspection.status === "escalated" && inspection.escalationReason ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft/60 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-semibold text-destructive">Escalated to maintenance</div>
            <p className="mt-0.5 text-xs text-destructive/90">{inspection.escalationReason}</p>
          </div>
        </div>
      ) : null}

      {isProcessing ? (
        <ProcessingPanel inspection={inspection} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Status"
              value={<InspectionStatusBadge status={inspection.status} />}
              hint={inspection.completedAt ? `Completed ${fmtDateTime(inspection.completedAt)}` : "Capture staged"}
            />
            <StatCard
              label="Frames"
              value={inspection.frames.length}
              hint={inspectionMethodLabels[inspection.method]}
            />
            <StatCard
              label="Pending review"
              value={pending}
              tone={pending > 0 ? "warning" : "success"}
              hint="Findings awaiting a decision"
            />
            <StatCard
              label="High / critical"
              value={highSeverity}
              tone={highSeverity > 0 ? "danger" : "success"}
              hint="Above the confidence gate"
            />
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="mb-4 h-10 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
              <TabsTrigger value="frames" className="rounded-lg">Frames</TabsTrigger>
              <TabsTrigger value="findings" className="rounded-lg">Findings</TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg">History</TabsTrigger>
            </TabsList>

            {/* ---------------------------- overview ---------------------------- */}
            <TabsContent value="overview">
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-2xl border bg-card p-5 xl:col-span-2">
                  <h2 className="text-sm font-semibold">Survey record</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <MetaItem label="Inspection" value={inspection.id} />
                    <MetaItem label="Asset" value={inspection.assetId} />
                    <MetaItem label="Started" value={fmtDateTime(inspection.startedAt)} />
                    <MetaItem
                      label="Completed"
                      value={
                        inspection.completedAt ? (
                          fmtDateTime(inspection.completedAt)
                        ) : (
                          <span className="text-muted-foreground">Not yet</span>
                        )
                      }
                    />
                    <MetaItem label="Capture method" value={inspectionMethodLabels[inspection.method]} />
                    <MetaItem label="Model" value={inspection.modelVersion} />
                  </div>

                  <div className="mt-6">
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Workflow
                    </div>
                    <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          icon: Camera,
                          title: "Capture",
                          done: true,
                          text: `${inspection.frames.length} frame${inspection.frames.length === 1 ? "" : "s"} staged`,
                        },
                        {
                          icon: CircleAlert,
                          title: "Analysis pass",
                          done:
                            inspection.status === "awaiting-review" ||
                            inspection.status === "reviewed" ||
                            inspection.status === "escalated",
                          text:
                            inspection.status === "in-progress"
                              ? "Ready to run"
                              : `${inspection.findings.length} findings above the gate`,
                        },
                        {
                          icon: ClipboardCheck,
                          title: "Engineer review",
                          done: inspection.status === "reviewed",
                          text:
                            inspection.status === "reviewed"
                              ? "Signed off"
                              : `${pending} pending decision${pending === 1 ? "" : "s"}`,
                        },
                        {
                          icon: CircleCheck,
                          title: "Action",
                          done: inspection.status === "escalated",
                          text:
                            inspection.status === "escalated"
                              ? "Maintenance engaged"
                              : "Work orders come from confirmed findings",
                        },
                      ].map((step) => (
                        <li
                          key={step.title}
                          className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${
                            step.done
                              ? "border-success/30 bg-success-soft/40"
                              : "border-border"
                          }`}
                        >
                          <step.icon
                            className={`mt-0.5 size-4 ${
                              step.done ? "text-success" : "text-muted-foreground/50"
                            }`}
                          />
                          <div>
                            <div className="text-sm font-semibold">{step.title}</div>
                            <div className="text-xs text-muted-foreground">{step.text}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {inspection.notes ? (
                    <p className="mt-5 rounded-xl bg-muted/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Site notes · </span>
                      {inspection.notes}
                    </p>
                  ) : null}

                  {escalateButton ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3">
                      <p className="text-xs font-medium text-warning">
                        {highSeverity} high-severity finding{highSeverity === 1 ? "" : "s"} on
                        this pass. Validate them in the review view before escalating to
                        maintenance.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="mb-3 px-1">
                    <h2 className="text-sm font-semibold">Captured frames</h2>
                    <p className="text-xs text-muted-foreground">
                      First frames — the full grid lives in the Frames tab.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {inspection.frames.slice(0, 2).map((frame) => {
                      const frameFindings = inspection.findings.filter(
                        (item) => item.frameId === frame.id,
                      );
                      return (
                        <FrameCard
                          key={frame.id}
                          scene={frame}
                          findings={frameFindings}
                          footer={<FrameClassStrip findings={frameFindings} />}
                        />
                      );
                    })}
                    {inspection.frames.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">No frames staged.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ----------------------------- frames ------------------------------ */}
            <TabsContent value="frames">
              {/* Upload bar for inspectors & engineers */}
              <div className="mb-4 rounded-2xl border bg-card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Upload inspection imagery</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      JPG, PNG, or Drone files. Automatic validation of blur, resolution, and lighting.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={uploadSource} onValueChange={setUploadSource}>
                      <SelectTrigger className="h-9 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smartphone">Smartphone</SelectItem>
                        <SelectItem value="digital_camera">Digital camera</SelectItem>
                        <SelectItem value="drone">Drone capture</SelectItem>
                        <SelectItem value="upload">Repository</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Live Camera Button */}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setCameraModalOpen(true)}
                      className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium gap-1.5 shadow-xs"
                    >
                      <Camera className="size-3.5" />
                      <span>Take Photo</span>
                    </Button>

                    {/* Direct Mobile Device Camera Input */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleUploadFile}
                        disabled={isUploading}
                        className="hidden"
                      />
                      <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-all shadow-xs">
                        <Smartphone className="size-3.5 text-primary" />
                        <span>Mobile Cam</span>
                      </span>
                    </label>

                    {/* File upload */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png"
                        onChange={handleUploadFile}
                        disabled={isUploading}
                        className="hidden"
                      />
                      <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium transition-all shadow-xs">
                        {isUploading ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="size-3.5" />
                            <span>Upload files</span>
                          </>
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {dbImages.length > 0 ? (
                <div className="mb-4 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    Uploaded Image Assets ({dbImages.length})
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {dbImages.map((img: any, idx: number) => {
                      const isCalibrated = img.calibration?.calibrated || (img.scale_calibration && img.scale_calibration.calibrated);
                      const needsConfirm = img.status === "warned" || img.quality_status === "needs_confirmation";
                      const mode = viewMode[img.id] || "orig";
                      const isProc = mode === "proc";
                      const imgSrc = isProc
                        ? `/api/v1/images/${img.id}/processed`
                        : `/api/v1/images/${img.id}/file`;

                      return (
                        <div key={img.id || idx} className="rounded-xl border bg-card p-3 space-y-2">
                          <div className="aspect-video w-full rounded-lg bg-muted overflow-hidden relative group">
                            <img
                              src={imgSrc}
                              alt={img.filename}
                              className="w-full h-full object-cover transition-all"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />

                            {/* View Switch Pill (Original vs Preprocessed) */}
                            <div className="absolute top-2 left-2 flex items-center bg-black/70 backdrop-blur-md rounded-md p-0.5 border border-white/10 text-[10px] z-10">
                              <button
                                type="button"
                                onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "orig" }))}
                                className={`px-2 py-0.5 rounded font-medium transition-all ${
                                  !isProc ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                }`}
                              >
                                Original
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "proc" }))}
                                className={`px-2 py-0.5 rounded font-medium transition-all ${
                                  isProc ? "bg-emerald-600 text-white font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                }`}
                              >
                                Preprocessed
                              </button>
                            </div>

                            <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                              {(img.status === "valid" || img.quality_status === "accepted") && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/20 text-success border border-success/30 backdrop-blur-sm">
                                  Accepted
                                </span>
                              )}
                              {needsConfirm && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/20 text-warning border border-warning/30 backdrop-blur-sm">
                                  Warning
                                </span>
                              )}
                              {(img.status === "rejected" || img.quality_status === "rejected") && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/20 text-destructive border border-destructive/30 backdrop-blur-sm">
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono truncate max-w-[140px] text-foreground font-medium">{img.filename}</span>
                            <span className="text-muted-foreground text-[11px]">{img.width}x{img.height}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/60">
                            <span className="text-[11px] text-muted-foreground">
                              {isCalibrated ? `Scale: ${(img.calibration?.mm_per_pixel || 0.25).toFixed(2)} mm/px` : "Scale: Uncalibrated (px)"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-primary border-primary/30 hover:bg-primary/10 gap-1"
                                disabled={preprocessingImgId === img.id}
                                onClick={() => handleRunPreprocess(img.id)}
                              >
                                {preprocessingImgId === img.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Sparkles className="size-3" />
                                )}
                                <span>Preprocess</span>
                              </Button>
                              {needsConfirm && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] px-2 text-warning border-warning/40 hover:bg-warning/10"
                                  onClick={() => handleConfirmWarning(img.id)}
                                >
                                  <CircleCheck className="size-3" />
                                  Confirm
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => setCalibratingImageId(img.id)}
                              >
                                <Ruler className="size-3" />
                                Scale
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                {inspection.frames.map((frame) => {
                  const frameFindings = inspection.findings.filter(
                    (item) => item.frameId === frame.id,
                  );
                  return (
                    <FrameCard
                      key={frame.id}
                      scene={frame}
                      findings={frameFindings}
                      footer={<FrameClassStrip findings={frameFindings} />}
                    />
                  );
                })}
              </div>

              {inspection.status === "in-progress" ? (
                <div className="mt-6 p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Ready to hand off to engineering?</h4>
                    <p className="text-xs text-muted-foreground">
                      Submitting locks the image set and transitions this inspection to the Civil Engineer review queue.
                    </p>
                  </div>
                  <Button onClick={handleSubmitForReview}>
                    <CheckCheck className="size-4" />
                    Submit for review
                  </Button>
                </div>
              ) : null}
            </TabsContent>

            {/* ---------------------------- findings ----------------------------- */}
            <TabsContent value="findings">
              <FindingsTab inspection={inspection} />
            </TabsContent>

            {/* ----------------------------- history ----------------------------- */}
            <TabsContent value="history">
              <HistoryTab inspection={inspection} baseline={baseline} />
            </TabsContent>
          </Tabs>

          <ComplianceNote className="mt-4" />

          {/* Scale Calibration Dialog */}
          <Dialog open={!!calibratingImageId} onOpenChange={(open) => !open && setCalibratingImageId(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Physical Scale Calibration</DialogTitle>
                <DialogDescription>
                  Calibrate pixel-to-millimetre scale for physical crack width and length measurements.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Calibration method</Label>
                  <Select value={calibrationMethod} onValueChange={setCalibrationMethod}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mm_per_pixel">Direct millimetres per pixel (mm/px)</SelectItem>
                      <SelectItem value="manual_line">Reference gauge / card length</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {calibrationMethod === "mm_per_pixel" ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="mm-per-px">Millimetres per pixel (mm/px)</Label>
                    <Input
                      id="mm-per-px"
                      type="number"
                      step="0.01"
                      min="0.001"
                      value={mmPerPixel}
                      onChange={(e) => setMmPerPixel(e.target.value)}
                      placeholder="e.g. 0.25"
                      className="rounded-lg font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">Standard 1m standoff default: ~0.25 mm/px</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="ref-mm">Real length (mm)</Label>
                      <Input
                        id="ref-mm"
                        type="number"
                        step="1"
                        min="1"
                        value={refLineLength}
                        onChange={(e) => setRefLineLength(e.target.value)}
                        placeholder="e.g. 100"
                        className="rounded-lg font-mono"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ref-px">Length in image (px)</Label>
                      <Input
                        id="ref-px"
                        type="number"
                        step="1"
                        min="1"
                        value={pixelLength}
                        onChange={(e) => setPixelLength(e.target.value)}
                        placeholder="e.g. 400"
                        className="rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCalibratingImageId(null)}>
                  Cancel
                </Button>
                <Button onClick={handleCalibrate}>
                  <Ruler className="size-4" />
                  Save calibration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Escalate {inspection.id}</DialogTitle>
                <DialogDescription>
                  Escalation marks this inspection for maintenance attention. It stays visible on
                  the analysis queue until the review is signed off.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5 py-1">
                <Label htmlFor="escalation-reason">Reason</Label>
                <Input
                  id="escalation-reason"
                  value={escalateReason}
                  onChange={(event) => setEscalateReason(event.target.value)}
                  placeholder="e.g. Critical-width crack, immediate repair advised"
                  className="rounded-lg"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEscalateOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={submitEscalation}>
                  Escalate inspection
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Camera Capture Modal */}
          <CameraCaptureModal
            open={cameraModalOpen}
            onOpenChange={setCameraModalOpen}
            onCapture={handleCameraCapture}
          />
        </>
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Processing panel                                                    */
/* ------------------------------------------------------------------ */

function ProcessingPanel({ inspection }: { inspection: Inspection }) {
  const stage =
    [...pipelineStages].reverse().find((candidate) => inspection.progress >= candidate.at) ??
    pipelineStages[0];

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            AI analysis in flight · {inspection.id}
          </div>
          <h2 className="mt-1 text-xl font-bold">{stage.label}</h2>
        </div>
        <div className="text-3xl font-bold text-primary tabular-nums">
          {Math.round(inspection.progress)}%
        </div>
      </div>
      <Progress value={inspection.progress} className="mt-4 h-2.5 rounded-full bg-muted" />
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {pipelineStages.map((candidate, index) => {
          const nextStep = index + 1 < pipelineStages.length ? pipelineStages[index + 1].at : 101;
          const reached = inspection.progress >= nextStep;
          const active = !reached && inspection.progress >= candidate.at;
          return (
            <li
              key={candidate.label}
              className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                reached
                  ? "border-success/30 bg-success-soft/50"
                  : active
                    ? "border-primary/40 bg-accent"
                    : "border-border text-muted-foreground"
              }`}
            >
              {reached ? (
                <CircleCheck className="size-4 shrink-0 text-success" />
              ) : active ? (
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
              ) : (
                <span className="size-2 shrink-0 rounded-full bg-border" />
              )}
              {candidate.label}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <CircleAlert className="size-4" />
        Analysis runs automatically — you can leave this page and come back; the pass resumes
        after a reload.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Findings tab                                                        */
/* ------------------------------------------------------------------ */

function FindingsTab({ inspection }: { inspection: Inspection }) {
  const { navigate } = useDashboardNavigation();

  if (inspection.findings.length === 0) {
    return (
      <EmptyState
        title="No findings on this inspection"
        description={
          inspection.status === "in-progress"
            ? "Run the AI analysis from the header to generate segmentation findings."
            : "The capture was clean — no damage was detected above the confidence gate."
        }
      />
    );
  }

  const sorted = [...inspection.findings].sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity],
  );

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40">
            <TableHead className="pl-5">Class</TableHead>
            <TableHead className="hidden sm:table-cell">Frame</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="hidden lg:table-cell">Length</TableHead>
            <TableHead className="hidden lg:table-cell">Width</TableHead>
            <TableHead>Review</TableHead>
            <TableHead className="pr-5 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((finding) => {
            const frame = inspection.frames.find((candidate) => candidate.id === finding.frameId);
            return (
              <TableRow key={finding.id}>
                <TableCell className="pl-5">
                  <div className="font-mono text-[13px] font-semibold">{finding.classCode}</div>
                  <div className="text-xs text-muted-foreground">
                    {damageClasses[finding.classCode].label}
                  </div>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                  {frame?.label ?? finding.frameId}
                </TableCell>
                <TableCell className="tabular-nums">
                  {Math.round(finding.confidence * 100)}%
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={finding.severity} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                  {finding.measurements.lengthPx} px
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                  {finding.measurements.widthMm} mm
                </TableCell>
                <TableCell>
                  <FindingReviewBadge review={finding.review} />
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() =>
                      navigate(`/dashboard/analysis/${inspection.id}?finding=${finding.id}`)
                    }
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History tab — compare against the previous survey of this asset      */
/* ------------------------------------------------------------------ */

function HistoryTab({
  inspection,
  baseline,
}: {
  inspection: Inspection;
  baseline?: Inspection;
}) {
  const { navigate } = useDashboardNavigation();
  const pair = useMemo(
    () => (baseline ? pickBaselinePair(inspection, baseline) : null),
    [inspection, baseline],
  );

  const comparisons = useMemo(() => {
    if (!baseline) return [];
    return inspection.findings
      .map((current) => ({
        current,
        previous: findBaselineMatch(inspection, current, baseline),
      }))
      .sort((a, b) => severityRank[b.current.severity] - severityRank[a.current.severity])
      .slice(0, 4);
  }, [inspection, baseline]);

  if (!baseline) {
    return (
      <EmptyState
        title="No previous survey to compare"
        description={`Once this asset has a completed inspection with findings, this tab shows how crack widths changed since the last pass.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Historical comparison · same asset
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {baseline.id} — {fmtDateTime(baseline.startedAt)} → current {inspection.id}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={() => navigate(`/dashboard/inspections/${baseline.id}`)}
        >
          Open {baseline.id}
        </Button>
      </div>

      {pair ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                Baseline
              </span>
              <span className="text-sm font-semibold">{pair.previous.label}</span>
              <span className="text-xs text-muted-foreground">· {baseline.id}</span>
            </div>
            <FrameCard
              scene={pair.previous}
              findings={baseline.findings.filter((item) => item.frameId === pair.previous.id)}
              footer={
                <FrameClassStrip
                  findings={baseline.findings.filter((item) => item.frameId === pair.previous.id)}
                />
              }
            />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                Current
              </span>
              <span className="text-sm font-semibold">{pair.current.label}</span>
              <span className="text-xs text-muted-foreground">· {inspection.id}</span>
            </div>
            <FrameCard
              scene={pair.current}
              findings={inspection.findings.filter((item) => item.frameId === pair.current.id)}
              footer={
                <FrameClassStrip
                  findings={inspection.findings.filter((item) => item.frameId === pair.current.id)}
                />
              }
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {comparisons.map(({ current, previous }) => {
          const delta = previous
            ? Math.round(
                (current.measurements.widthMm - previous.measurements.widthMm) * 100,
              ) / 100
            : null;
          const grew = delta != null && delta > 0;
          return (
            <div key={current.id} className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">{current.classCode}</span>
                <span className="text-xs text-muted-foreground">
                  {damageClasses[current.classCode].label}
                </span>
                <SeverityBadge severity={current.severity} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Baseline
                  </div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums">
                    {previous ? `${previous.measurements.widthMm} mm` : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Now
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-primary tabular-nums">
                    {current.measurements.widthMm} mm
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Change
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-bold tabular-nums ${
                      delta == null
                        ? "text-muted-foreground"
                        : grew
                          ? "text-destructive"
                          : "text-success"
                    }`}
                  >
                    {delta == null ? "new" : `${grew ? "+" : "−"}${Math.abs(delta)} mm`}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-center text-xs text-muted-foreground">
                {delta == null
                  ? "New damage class, not present in the baseline run."
                  : grew
                    ? `Propagation pattern — crack width grew since ${baseline.id}. Engineer sign-off required.`
                    : `Within measurement tolerance versus ${baseline.id}.`}
              </p>
              {previous?.note ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground italic">
                  “{previous.note}” — {previous.reviewedBy}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {comparisons.length === 0 ? (
        <EmptyState
          title={`No matching classes between ${baseline.id} and this pass`}
          description="Comparison pairs findings by damage class and closest frame label."
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field Camera Capture Modal with Geolocation & HD Viewfinder        */
/* ------------------------------------------------------------------ */

function CameraCaptureModal({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>("Locating GPS...");

  useEffect(() => {
    if (!open) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      setCapturedDataUrl(null);
      setCameraError(null);
      return;
    }

    // Try geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus(`📍 GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}m)`);
        },
        () => {
          setGpsStatus("📍 GPS: Unavailable / permission required");
        },
        { timeout: 5000 }
      );
    } else {
      setGpsStatus("📍 GPS: Not supported by browser");
    }

    // Start camera feed
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        .then((s) => {
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => {
          setCameraError(err.message || "Could not access camera. Please verify permissions or webcam connection.");
        });
    } else {
      setCameraError("Camera capture API is not supported in this browser environment.");
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCapturedDataUrl(dataUrl);
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
  };

  const handleConfirm = () => {
    if (!capturedDataUrl) return;
    fetch(capturedDataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        onCapture(blob);
        onOpenChange(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            Field Camera Capture
          </DialogTitle>
          <DialogDescription className="text-xs">
            Live inspection frame intake with GPS coordinate tagging and real-time contrast preprocessing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {cameraError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center space-y-2">
              <TriangleAlert className="size-8 text-destructive mx-auto" />
              <p className="text-sm font-semibold text-destructive">Camera Device Unavailable</p>
              <p className="text-xs text-muted-foreground">{cameraError}</p>
              <p className="text-xs text-muted-foreground pt-1">
                You can also use the <strong>Mobile Cam</strong> or <strong>Upload files</strong> options to select inspection photos.
              </p>
            </div>
          ) : (
            <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden flex items-center justify-center border">
              {capturedDataUrl ? (
                <img
                  src={capturedDataUrl}
                  alt="Captured frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {/* Viewfinder crosshairs overlay */}
              {!capturedDataUrl && !cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-52 h-52 border border-white/40 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
            <span className="font-mono">{gpsStatus}</span>
            <span className="text-[11px]">Direct HD Feed</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {capturedDataUrl ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleRetake}>
                Retake
              </Button>
              <Button onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCheck className="size-4 mr-1.5" />
                Upload & Preprocess
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleSnap}
              disabled={!!cameraError}
              className="bg-primary hover:opacity-90 gap-1.5"
            >
              <Camera className="size-4" />
              Capture Photo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
