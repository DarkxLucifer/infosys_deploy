import { useMemo, useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { api, getAuthToken } from "@/lib/api";
import { useAuth } from "@/store/auth-context";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  FileText,
  Lock,
  TriangleAlert,
  Upload,
  CheckCheck,
  Loader2,
  Smartphone,
  UserCheck,
  Maximize2,
  Crop,
  Trash2,
  RefreshCw,
  Tag,
  Edit3,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Sparkles,
  Cpu,
  ScanSearch,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  PhotoZoomModal,
  PhotoReplaceModal,
  PhotoDeleteDialog,
  PhotoManualClassificationModal,
  PhotoAnnotationModal,
  MultiFileUploadZone,
} from "@/components/inspection/photo-inspection-suite";
import {
  ImageDetailsDrawer,
  ImageTransformModal,
} from "@/components/inspection/image-quality-components";
import { OpticalCalibrationModal } from "@/components/inspection/optical-calibration-modal";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { QualityBadge, ProcessingBadge } from "@/components/inspection/image-quality-components";
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
import type { DamageClassCode, Finding, Frame, Inspection, Severity } from "@/store/app";
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
  const { state, inspectionById, assetById, escalateInspection, generateReport } =
    useAppStore();
  const { navigate } = useDashboardNavigation();
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const { user: authUser } = useAuth();
  const [reassignOpen, setReassignOpen] = useState(false);
  const userRole = (authUser?.role || "").toLowerCase();
  const canReassign = ["admin", "manager", "engineer", "civil-engineer", "lead_inspector"].includes(
    userRole
  );

  const [dbInspection, setDbInspection] = useState<any | null>(null);
  const [dbImages, setDbImages] = useState<any[]>([]);
  const [dbDetections, setDbDetections] = useState<any[]>([]);
  const [dbAsset, setDbAsset] = useState<any | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const isImageSetLocked = ["pending_review", "in_review", "reviewed", "reported", "closed"].includes(
    (dbInspection?.status || "").toLowerCase()
  ) || Boolean(dbInspection?.submittedAt);

  const isAlreadySubmitted =
    isImageSetLocked ||
    Boolean(dbInspection?.submittedAt) ||
    ["pending_review", "in_review", "reviewed", "reported", "closed"].includes(
      (dbInspection?.status || "").toLowerCase()
    );
  const isInspector = ["inspector", "lead_inspector"].includes(userRole);
  const isEngineerOrAdmin = ["engineer", "civil-engineer", "civil_engineer", "admin"].includes(userRole);

  const [uploadSource, setUploadSource] = useState("smartphone");
  const [isUploading, setIsUploading] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<Record<string, "orig" | "proc" | "rfdetr" | "yolo" | "unet">>({});
  const [preprocessingImgId, setPreprocessingImgId] = useState<string | null>(null);
  const [calibratingImageId, setCalibratingImageId] = useState<string | null>(null);

  // Advanced Photo Modal States
  const [zoomPhoto, setZoomPhoto] = useState<any | null>(null);
  const [replacePhotoId, setReplacePhotoId] = useState<string | null>(null);
  const [deletePhoto, setDeletePhoto] = useState<any | null>(null);
  const [manualReviewPhoto, setManualReviewPhoto] = useState<any | null>(null);
  const [annotatePhoto, setAnnotatePhoto] = useState<any | null>(null);
  const [transformPhoto, setTransformPhoto] = useState<any | null>(null);
  const [drawerPhoto, setDrawerPhoto] = useState<any | null>(null);
  const [analyzingImgId, setAnalyzingImgId] = useState<string | null>(null);

  // Upload Queue for multi-file progress & retries
  const [uploadQueue, setUploadQueue] = useState<Array<{
    id: string;
    file: File;
    name: string;
    size: number;
    status: "uploading" | "success" | "error" | "warned";
    error?: string;
  }>>([]);

  const handleBatchFiles = async (files: File[]) => {
    if (!id || files.length === 0) return;
    setIsUploading(true);

    const newQueueItems = files.map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      file: f,
      name: f.name,
      size: f.size,
      status: "uploading" as const,
    }));

    setUploadQueue((prev) => [...newQueueItems, ...prev]);

    let successCount = 0;
    for (const item of newQueueItems) {
      try {
        await api.uploadInspectionImage(id, item.file, uploadSource, false);
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "success" } : q))
        );
        successCount++;
      } catch (err: any) {
        if (err.status === 422 && err.response?.detail?.warnings) {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: "warned", error: err.response.detail.warnings.join(", ") }
                : q
            )
          );
        } else {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: "error", error: err.message || "Upload failed" }
                : q
            )
          );
        }
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} photo${successCount === 1 ? "" : "s"} uploaded`);
    }
    setIsUploading(false);
    fetchData();
  };

  const handleRetryQueueItem = async (item: typeof uploadQueue[0]) => {
    if (!id) return;
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", error: undefined } : q))
    );
    try {
      await api.uploadInspectionImage(id, item.file, uploadSource, false);
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "success" } : q))
      );
      toast.success(`Photo ${item.name} uploaded successfully`);
      fetchData();
    } catch (err: any) {
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: err.message } : q))
      );
      toast.error(`Retry failed for ${item.name}: ${err.message}`);
    }
  };

  const handleSingleImageAnalyze = async (imgId: string) => {
    if (!id) return;
    setAnalyzingImgId(imgId);
    try {
      const res = await api.analyzeSingleImage(id, imgId);
      const pred = res.prediction;
      if (pred.has_crack) {
        toast.warning("Concrete Crack Identified", {
          description: `InfraScan ResNet50 v1.0: ${(pred.crack_probability * 100).toFixed(1)}% crack probability. Recorded in findings.`,
        });
      } else {
        toast.success("No Crack Detected", {
          description: `InfraScan ResNet50 v1.0: ${(pred.uncracked_probability * 100).toFixed(1)}% uncracked probability.`,
        });
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to run AI analysis on photo");
    } finally {
      setAnalyzingImgId(null);
    }
  };


  const fetchData = async () => {
    if (!id || id === "new") {
      setLoadingDb(false);
      return;
    }
    try {
      setBlockedMessage(null);
      const realInsp = await api.getInspection(id).catch((err: any) => {
        if (
          err.message?.includes("UNREVIEWED_ACCESS_BLOCKED") ||
          err.message?.includes("in review") ||
          err.message?.includes("Maintenance Engineers")
        ) {
          setBlockedMessage(
            "This inspection is currently in review. Maintenance Engineers can only access inspection data after certified engineering sign-off."
          );
        }
        return null;
      });
      const [realImages, realDets] = await Promise.all([
        api.getInspectionImages(id).catch(() => ({ items: [] })),
        api.getInspectionDetections(id).catch(() => ({ items: [] })),
      ]);
      if (realInsp) {
        setDbInspection(realInsp);
        setDbImages(realImages.items || []);
        setDbDetections(realDets.items || []);
        if (realInsp.asset) {
          setDbAsset(realInsp.asset);
        } else if (realInsp.assetId) {
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

      await api.uploadInspectionImage(id, blob, "smartphone", true, gpsCoord);
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
      setDbInspection((prev: any) => ({
        ...prev,
        status: "pending_review",
        submittedAt: new Date().toISOString(),
      }));
      toast.success("Submitted for review", {
        description: "Image set locked and routed to Civil Engineer review queue.",
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit for review. Ensure at least one accepted image exists.");
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
        method: (dbInspection.method || "walkdown") as any,
        seed: 1000 + idx,
        url: `/api/v1/images/${img.id}/file`,
        thumbnailUrl: `/api/v1/images/${img.id}/thumbnail`,
        width: img.width || 1920,
        height: img.height || 1080,
        status: img.status,
      }));

      // Map real database findings/detections
      const findingsFromDb: Finding[] = dbDetections.map((det: any) => {
        let bbox = { x: 35, y: 35, w: 30, h: 30 };
        if (det.geometry?.points && Array.isArray(det.geometry.points) && det.geometry.points.length > 0) {
          const xs = det.geometry.points.map((p: number[]) => p[0]);
          const ys = det.geometry.points.map((p: number[]) => p[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const imgW = 1920;
          const imgH = 1080;
          bbox = {
            x: Math.max(0, Math.min(95, Math.round((minX / imgW) * 100))),
            y: Math.max(0, Math.min(95, Math.round((minY / imgH) * 100))),
            w: Math.max(8, Math.min(90, Math.round(((maxX - minX) / imgW) * 100))),
            h: Math.max(8, Math.min(90, Math.round(((maxY - minY) / imgH) * 100))),
          };
        }
        const cls: DamageClassCode =
          det.defectType?.includes("transverse") ? "D10" :
          det.defectType?.includes("alligator") ? "D20" :
          det.defectType?.includes("spall") ? "D40" : "D00";
        const sev: Severity =
          det.severity === "severe" ? "critical" :
          det.severity === "moderate" ? "medium" : "low";

        return {
          id: det.id,
          inspectionId: det.inspectionId,
          frameId: det.imageId,
          classCode: cls,
          confidence: det.confidence || 0.9,
          severity: sev,
          bbox,
          measurements: {
            lengthPx: det.geometry?.length_px || 120,
            widthPx: det.geometry?.max_width_px || 3,
            areaPx: Math.round((det.geometry?.length_px || 120) * (det.geometry?.max_width_px || 3)),
            widthMm: det.geometry?.max_width_mm || 1.0,
          },
          mmPerPx: 0.25,
          review: det.verified ? "confirmed" : "pending",
          addedByModel: true,
          reviewedBy: det.verified ? "Dr. Meera Kulkarni" : undefined,
          reviewedAt: det.verifiedAt,
          note: det.notes || undefined,
        };
      });

      // Use real database frames exclusively when present
      const combinedFrames: any[] = framesFromDb.length > 0 ? framesFromDb : (storeInspection ? storeInspection.frames : []);

      return {
        id: dbInspection.id,
        title: dbInspection.title || `${dbInspection.asset?.name || dbInspection.assetId} Inspection`,
        assetId: dbInspection.assetId,
        inspector: dbInspection.inspector?.name || dbInspection.inspectorId || "Assigned Inspector",
        method: (dbInspection.method || "walkdown") as any,
        status: (
          Boolean(dbInspection.isSignedOff) || ["reviewed", "reported", "closed"].includes((dbInspection.status || "").toLowerCase())
            ? "reviewed"
            : ["pending_review", "in_review", "submitted"].includes((dbInspection.status || "").toLowerCase()) || Boolean(dbInspection.submittedAt)
            ? "awaiting-review"
            : "in-progress"
        ) as any,
        startedAt: dbInspection.inspectionDate || dbInspection.createdAt,
        completedAt: dbInspection.status === "closed" ? dbInspection.createdAt : undefined,
        modelVersion: dbInspection.analysisStatus === "completed" || dbDetections.length > 0
          ? (dbDetections[0]?.modelId || "InfraScan Model v1.0 (ResNet50)")
          : "InfraScan Model v1.0 (ResNet50)",
        progress: 100,
        notes: dbInspection.notes || "",
        escalationReason: undefined,
        frames: combinedFrames,
        findings: findingsFromDb.length > 0 ? findingsFromDb : (storeInspection ? storeInspection.findings : []),
      };
    }
    if (storeInspection) return storeInspection;
    return null;
  }, [storeInspection, dbInspection, dbImages, dbDetections]);

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

  if (blockedMessage) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <div className="size-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
            <Lock className="size-7" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Inspection Under Active Engineering Review</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {blockedMessage}
          </p>
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/app/inspections")}>
              Back to inspections
            </Button>
          </div>
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

  const handleDownloadReportFormat = async (format: "pdf" | "xlsx" | "csv" | "json") => {
    try {
      const extMap = { pdf: "pdf", xlsx: "xlsx", csv: "csv", json: "json" };
      const ext = extMap[format];
      toast.loading(`Generating certified ${format.toUpperCase()} report...`, { id: "report-dl" });
      const blob = await api.downloadInspectionReport(inspection.id, format);
      triggerDownload(blob, `infrascan_report_${inspection.id}.${ext}`);
      toast.success(`${format.toUpperCase()} report downloaded successfully`, { id: "report-dl" });
    } catch {
      toast.dismiss("report-dl");
      if (format === "pdf") {
        downloadCertificateNow();
      } else {
        toast.error(`Failed to export ${format.toUpperCase()} report`);
      }
    }
  };

  const exportDropdownMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 cursor-pointer">
          <Download className="size-4" />
          <span>Export Report</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Automated Reports (PDF, Excel, CSV, JSON)
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => handleDownloadReportFormat("pdf")}
          className="cursor-pointer gap-2 py-2"
        >
          <FileText className="size-4 text-red-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-xs">PDF Condition Report</span>
            <span className="text-[10px] text-muted-foreground">Certified engineering document</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDownloadReportFormat("xlsx")}
          className="cursor-pointer gap-2 py-2"
        >
          <FileSpreadsheet className="size-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-xs">Excel Workbook (.xlsx)</span>
            <span className="text-[10px] text-muted-foreground">Multi-sheet findings & metrics</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDownloadReportFormat("csv")}
          className="cursor-pointer gap-2 py-2"
        >
          <FileSpreadsheet className="size-4 text-blue-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-xs">Defect CSV (.csv)</span>
            <span className="text-[10px] text-muted-foreground">Tabular raw measurements</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDownloadReportFormat("json")}
          className="cursor-pointer gap-2 py-2"
        >
          <FileCode className="size-4 text-purple-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-xs">Inspection JSON</span>
            <span className="text-[10px] text-muted-foreground">Machine-readable payload</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={downloadCertificateNow} className="cursor-pointer gap-2 py-2">
          <ShieldCheck className="size-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-xs">Integrity Certificate</span>
            <span className="text-[10px] text-muted-foreground">Tamper-evident client certificate</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );



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
        backHref="/app/inspections"
        backLabel="Inspections"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              className="text-primary hover:underline font-semibold cursor-pointer"
              onClick={() => navigate(`/app/assets/${inspection.assetId}`)}
            >
              {inspection.assetId}
            </button>
            {asset?.name && <span className="text-muted-foreground">· {asset.name}</span>}
          </span>
        }
        title={inspection.title}
        description={`${(inspectionMethodLabels as any)[inspection.method] || inspection.method} · inspector ${inspection.inspector} · ${inspection.frames.length} frame${inspection.frames.length === 1 ? "" : "s"} · model ${inspection.modelVersion}`}
        actions={
          <>
            {!isAlreadySubmitted && inspection.status === "in-progress" ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleSubmitForReview} className="cursor-pointer">
                  <CheckCheck className="size-4" />
                  Submit for review
                </Button>
              </div>
            ) : null}
            {inspection.status === "awaiting-review" ? (
              <div className="flex items-center gap-2">
                {exportDropdownMenu}
                <Button onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  Review findings
                </Button>
                {escalateButton}
              </div>
            ) : null}
            {inspection.status === "reviewed" || inspection.status === "reported" ? (
              <div className="flex items-center gap-2">
                {exportDropdownMenu}
                <Button variant="secondary" onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  View review
                </Button>
              </div>
            ) : null}
            {inspection.status === "escalated" ? (
              <div className="flex items-center gap-2">
                {exportDropdownMenu}
                <Button onClick={() => navigate(`/app/review/${inspection.id}`)}>
                  <ClipboardCheck className="size-4" />
                  Open review
                </Button>
              </div>
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
              hint={(inspectionMethodLabels as any)[inspection.method] || inspection.method}
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
                    <MetaItem label="Capture method" value={(inspectionMethodLabels as any)[inspection.method] || inspection.method} />
                    <MetaItem label="Model" value={inspection.modelVersion} />
                    <MetaItem
                      label="Field Inspector"
                      value={
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            <UserCheck className="size-3.5 text-primary shrink-0" />
                            <span>{inspection.inspector || "Assigned Inspector"}</span>
                          </span>
                          {canReassign && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
                              onClick={() => setReassignOpen(true)}
                            >
                              Reassign
                            </Button>
                          )}
                        </div>
                      }
                    />
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
              {/* Image set lock notice or active upload area */}
              {isImageSetLocked ? (
                <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-xs shrink-0">
                      <Lock className="size-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        Image Set Locked · {dbInspection?.status === "reviewed" ? "Certified & Closed" : "Submitted for Civil Review"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Per InfraScan lifecycle specification, photographic evidence is permanently locked once submitted for review.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider border-amber-500/30 text-amber-600 dark:text-amber-400 bg-background/50">
                    Immutable Record
                  </Badge>
                </div>
              ) : (isInspector || isEngineerOrAdmin) ? (
                <>
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

                  {/* Drag and Drop Batch Uploader */}
                  <div className="mb-4">
                    <MultiFileUploadZone onFilesSelected={handleBatchFiles} isUploading={isUploading} />
                  </div>
                </>
              ) : null}

              {/* Upload Queue Progress & Retry */}
              {uploadQueue.length > 0 && (
                <div className="mb-4 p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Recent Upload Operations ({uploadQueue.length})</span>
                    <button
                      type="button"
                      onClick={() => setUploadQueue([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Clear queue
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-lg border bg-muted/40 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono truncate max-w-[150px] font-medium">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground">{(item.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                        <div className="flex items-center justify-between">
                          {item.status === "uploading" && (
                            <span className="text-[11px] text-primary flex items-center gap-1 font-semibold">
                              <Loader2 className="size-3 animate-spin" /> Uploading…
                            </span>
                          )}
                          {item.status === "success" && (
                            <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="size-3" /> Uploaded & Validated
                            </span>
                          )}
                          {item.status === "warned" && (
                            <span className="text-[11px] text-amber-500 flex items-center gap-1 font-semibold">
                              <AlertTriangle className="size-3" /> Quality Warning
                            </span>
                          )}
                          {item.status === "error" && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-rose-500 font-semibold truncate max-w-[120px]">
                                {item.error || "Failed"}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[10px] text-primary"
                                onClick={() => handleRetryQueueItem(item)}
                              >
                                Retry
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Uploaded Photos Grid with Individual Controls */}
              {dbImages.length > 0 ? (
                <div className="mb-6 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Staged Inspection Photographs ({dbImages.length})
                    </h4>
                    <span className="text-xs text-muted-foreground font-mono">
                      {dbImages.filter((img) => img.status === "valid" || img.quality_status === "accepted").length} Valid ·{" "}
                      {dbImages.filter((img) => img.status === "warned" || img.quality_status === "warning").length} Warnings
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {dbImages.map((img: any, idx: number) => {
                      const isCalibrated = img.calibration?.calibrated || (img.scale_calibration && img.scale_calibration.calibrated);
                      const needsConfirm = img.status === "warned" || img.quality_status === "warning" || img.quality_status === "needs_confirmation";
                      const qr = img.qualityReport || img.quality_report || {};
                      const aiPred = qr.ai_classification || qr.aiClassification || img.ai_classification || img.aiClassification || (img.aiDetection ? {
                        has_crack: img.aiDetection.defectType === "crack",
                        crack_probability: img.aiDetection.confidence,
                        uncracked_probability: 1 - (img.aiDetection.confidence || 0),
                        model_name: img.aiDetection.modelId || "InfraScan Model v1.0 (ResNet18)",
                        threshold: 0.80,
                        engine: "ONNXRuntime"
                      } : null);
                      const crackProb = typeof aiPred?.crack_probability === "number" ? aiPred.crack_probability : null;
                      const gateThresh = typeof aiPred?.threshold === "number" ? aiPred.threshold : 0.80;
                      const hasCrack = crackProb !== null ? crackProb >= gateThresh : Boolean(aiPred?.has_crack);
                      const rfdetrSeg = qr.rfdetr_detection || img.rfdetrDetection;
                      const hasRfdetr = Boolean(hasCrack && (img.hasRfdetr || (rfdetrSeg && rfdetrSeg.has_defect)));
                      const modelFallback = Boolean(hasCrack && (img.modelFallback || img.model_fallback || !hasRfdetr));
                      const unetSeg = qr.unet_segmentation || img.unetSegmentation;
                      const hasUnet = Boolean(hasCrack && (img.hasUnet || unetSeg || modelFallback));
                      const defaultMode: "orig" | "proc" | "rfdetr" | "yolo" | "unet" = hasCrack ? "unet" : "proc";
                      const mode = viewMode[img.id] || defaultMode;
                      const tok = getAuthToken();
                      const tokQuery = tok ? `?token=${encodeURIComponent(tok)}` : "";
                      const vTag = `&v=${img.sha256 ? img.sha256.substring(0, 10) : (img.updated_at || Date.now())}`;
                      const origUrl = `/api/v1/inspections/${id}/images/${img.id}/file${tokQuery}${vTag}`;
                      const procUrl = `/api/v1/inspections/${id}/images/${img.id}/processed${tokQuery}${vTag}`;
                      const rfdetrUrl = `/api/v1/inspections/${id}/images/${img.id}/file?variant=rfdetr${tok ? `&token=${encodeURIComponent(tok)}` : ""}${vTag}`;
                      const yoloUrl = `/api/v1/inspections/${id}/images/${img.id}/file?variant=yolo${tok ? `&token=${encodeURIComponent(tok)}` : ""}${vTag}`;
                      const unetUrl = `/api/v1/inspections/${id}/images/${img.id}/file?variant=unet${tok ? `&token=${encodeURIComponent(tok)}` : ""}${vTag}`;
                      const enhancedUrl = `/api/v1/inspections/${id}/images/${img.id}/file?variant=enhanced${tok ? `&token=${encodeURIComponent(tok)}` : ""}${vTag}`;
                      const imgSrc = mode === "rfdetr" ? (rfdetrUrl || procUrl) : mode === "yolo" ? (yoloUrl || rfdetrUrl || procUrl) : mode === "unet" ? (unetUrl || procUrl) : mode === "proc" ? enhancedUrl : origUrl;

                      const blurCheck = Array.isArray(qr.checks) ? qr.checks.find((c: any) => c.key === "blur" || c.key === "blur_variance") : null;
                      const manual = qr.manual_review || img.manualReview;

                      return (
                        <div key={img.id || idx} className="rounded-2xl border border-border bg-card p-3.5 space-y-3 shadow-xs hover:border-primary/40 transition-colors">
                          {/* Image Box */}
                          <div className="aspect-video w-full rounded-xl bg-black/90 overflow-hidden relative group cursor-pointer" onClick={() => setDrawerPhoto(img)}>
                            <img
                              src={imgSrc}
                              alt={img.filename}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                            />

                            {/* View Switch Pill */}
                            <div className="absolute top-2 left-2 flex items-center bg-black/80 backdrop-blur-md rounded-lg p-0.5 border border-white/15 text-[10px] z-10" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "orig" }))}
                                className={`px-2 py-0.5 rounded font-medium transition-all ${
                                  mode === "orig" ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                }`}
                              >
                                Original
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "proc" }))}
                                className={`px-2 py-0.5 rounded font-medium transition-all ${
                                  mode === "proc" ? "bg-card text-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                }`}
                              >
                                Enhanced
                              </button>
                              {hasRfdetr && (
                                <button
                                  type="button"
                                  onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "rfdetr" }))}
                                  className={`px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1 ${
                                    mode === "rfdetr" ? "bg-card text-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                  }`}
                                >
                                  <Cpu className="size-2.5 text-primary" />
                                  RF-DETR
                                </button>
                              )}
                              {(hasCrack && Boolean(img.hasYolo || img.has_yolo || qr.yolo_detection || img.yoloDetection)) && (
                                <button
                                  type="button"
                                  onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "yolo" }))}
                                  className={`px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1 ${
                                    mode === "yolo" ? "bg-card text-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                  }`}
                                >
                                  <ScanSearch className="size-2.5 text-amber-400" />
                                  YOLO
                                </button>
                              )}
                              {hasUnet && (
                                <button
                                  type="button"
                                  onClick={() => setViewMode((prev) => ({ ...prev, [img.id]: "unet" }))}
                                  className={`px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1 ${
                                    mode === "unet" ? "bg-card text-foreground font-semibold shadow-xs" : "text-white/70 hover:text-white"
                                  }`}
                                >
                                  <Sparkles className="size-2.5 text-cyan-400" />
                                  {modelFallback ? "UNet (Fallback)" : "UNet"}
                                </button>
                              )}
                            </div>

                            {/* Top Right Badges */}
                            <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10 pointer-events-none">
                              <div className="flex items-center gap-1">
                                <QualityBadge
                                  status={img.quality_status || (img.status === "warned" ? "warning" : img.status === "valid" ? "accepted" : "rejected")}
                                  confirmed={Boolean(img.warning_confirmed_by)}
                                />
                                {img.processing_status && (
                                  <ProcessingBadge status={img.processing_status} />
                                )}
                              </div>
                              {aiPred && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border shadow-xs ${
                                    hasCrack
                                      ? "bg-rose-950/90 text-rose-300 border-rose-500/40"
                                      : "bg-emerald-950/90 text-emerald-300 border-emerald-500/40"
                                  }`}
                                >
                                  {hasCrack
                                    ? `Crack Detected (${(((crackProb ?? aiPred.crack_probability ?? 1)) * 100).toFixed(0)}%)`
                                    : `Sound Surface (${(((aiPred.uncracked_probability ?? (1 - (crackProb ?? aiPred.crack_probability ?? 0)))) * 100).toFixed(0)}%)`}
                                </span>
                              )}
                              {isCalibrated ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-950/90 text-blue-300 border border-blue-500/40">
                                  Calibrated
                                </span>
                              ) : null}
                            </div>

                            {/* Zoom Hover Overlay Hint */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold pointer-events-none">
                              <Maximize2 className="size-4" />
                              <span>Click to Zoom</span>
                            </div>
                          </div>

                          {/* Image Metadata Row */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono truncate font-semibold text-foreground max-w-[160px]" title={img.filename}>
                                {img.filename}
                              </span>
                              <span className="text-muted-foreground font-mono text-[11px]">
                                {img.width} × {img.height}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span>{(img.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                              {blurCheck && (
                                <span>Sharpness: <strong className="text-foreground">{blurCheck.value}</strong></span>
                              )}
                              <span>
                                {img.exif_lat && img.exif_lng
                                  ? `GPS: ${img.exif_lat.toFixed(3)}, ${img.exif_lng.toFixed(3)}`
                                  : "GPS: Site Default"}
                              </span>
                            </div>

                            {manual && (
                              <div className="p-1.5 rounded bg-muted/60 text-[11px] text-foreground flex items-center justify-between">
                                <span>Inspector Verdict: <strong className="capitalize">{manual.manual_classification || manual.decision}</strong></span>
                                <span className="text-[10px] text-muted-foreground">{manual.reviewer_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Individual Controls Toolbar */}
                          <div className="pt-2 border-t border-border/70 flex flex-wrap items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => setZoomPhoto(img)}
                              title="Full Screen Zoom & Pan"
                            >
                              <Maximize2 className="size-3" />
                              <span>Zoom</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => setDrawerPhoto(img)}
                              title="Open OpenCV Quality Checks & Preprocessing Stages"
                            >
                              <Sliders className="size-3 text-primary" />
                              <span>Quality</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => setTransformPhoto(img)}
                              title="Crop and Rotate Photo"
                            >
                              <Crop className="size-3" />
                              <span>Crop/Rot</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              disabled={analyzingImgId === img.id || preprocessingImgId === img.id}
                              onClick={() => handleSingleImageAnalyze(img.id)}
                              title="Execute ResNet50 v1.0 inference on this photo"
                            >
                              {analyzingImgId === img.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Bot className="size-3 text-primary" />
                              )}
                              <span>AI Test</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                              onClick={() => setManualReviewPhoto(img)}
                              title="Record manual defect classification & override reason"
                            >
                              <Tag className="size-3" />
                              <span>Classify</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={() => setAnnotatePhoto(img)}
                              title="Draw manual defect bounding box annotation"
                            >
                              <Edit3 className="size-3" />
                              <span>Box</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => setReplacePhotoId(img.id)}
                              title="Replace photo with a fresh file"
                            >
                              <RefreshCw className="size-3" />
                              <span>Replace</span>
                            </Button>

                            {needsConfirm && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-warning border-warning/40 hover:bg-warning/10"
                                onClick={() => handleConfirmWarning(img.id)}
                              >
                                <CircleCheck className="size-3 mr-1" />
                                Confirm
                              </Button>
                            )}

                            {!isImageSetLocked && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 ml-auto"
                                onClick={() => setDeletePhoto(img)}
                                title="Remove photo"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
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

              {!isAlreadySubmitted && inspection.status === "in-progress" ? (
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

          {/* Optical Scale Calibration Modal */}
          <OpticalCalibrationModal
            open={!!calibratingImageId}
            onOpenChange={(open) => !open && setCalibratingImageId(null)}
            photo={
              dbImages.find((img: any) => img.id === calibratingImageId) ||
              (drawerPhoto?.id === calibratingImageId ? drawerPhoto : { id: calibratingImageId })
            }
            inspectionId={id}
            onCalibrated={(res) => {
              fetchData();
              setCalibratingImageId(null);
              if (res) {
                setDrawerPhoto((prev: any) => {
                  if (!prev) return prev;
                  if (res.imageId && prev.id !== res.imageId) return prev;
                  return {
                    ...prev,
                    calibration: res.calibration,
                    crack_geometry: res.crack_geometry,
                    crackGeometry: res.crack_geometry,
                    damageAssessment: res.damage_assessment || res.damageAssessment,
                    damage_assessment: res.damage_assessment || res.damageAssessment,
                    version: Date.now(),
                  };
                });
                setDbImages((prev: any[]) =>
                  prev.map((img: any) =>
                    img.id === (res.imageId || calibratingImageId)
                      ? {
                          ...img,
                          calibration: res.calibration,
                          crack_geometry: res.crack_geometry,
                          crackGeometry: res.crack_geometry,
                          damageAssessment: res.damage_assessment || res.damageAssessment,
                          damage_assessment: res.damage_assessment || res.damageAssessment,
                          version: Date.now(),
                        }
                      : img
                  )
                );
              }
            }}
          />

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

          {/* Reassign Inspector Dialog */}
          <ReassignInspectionDialog
            open={reassignOpen}
            onOpenChange={setReassignOpen}
            inspectionId={inspection.id}
            currentInspectorId={dbInspection?.inspectorId}
            currentInspectorName={inspection.inspector}
            onReassigned={() => fetchData()}
          />

          {/* Photo Inspection Suite Modals */}
          <PhotoZoomModal
            open={Boolean(zoomPhoto)}
            onOpenChange={(open) => !open && setZoomPhoto(null)}
            photo={zoomPhoto}
            inspectionId={id || ""}
          />

          <PhotoReplaceModal
            open={Boolean(replacePhotoId)}
            onOpenChange={(open) => !open && setReplacePhotoId(null)}
            photoId={replacePhotoId}
            inspectionId={id || ""}
            onSuccess={fetchData}
          />

          <PhotoDeleteDialog
            open={Boolean(deletePhoto)}
            onOpenChange={(open) => !open && setDeletePhoto(null)}
            photoId={deletePhoto?.id || null}
            inspectionId={id || ""}
            filename={deletePhoto?.filename}
            onSuccess={fetchData}
          />

          <PhotoManualClassificationModal
            open={Boolean(manualReviewPhoto)}
            onOpenChange={(open) => !open && setManualReviewPhoto(null)}
            photo={manualReviewPhoto}
            inspectionId={id || ""}
            onSuccess={fetchData}
          />

          <PhotoAnnotationModal
            open={Boolean(annotatePhoto)}
            onOpenChange={(open) => !open && setAnnotatePhoto(null)}
            photo={annotatePhoto}
            inspectionId={id || ""}
            existingAnnotations={dbDetections.filter((d: any) => d.image_id === annotatePhoto?.id)}
            onSuccess={fetchData}
          />

          <ImageDetailsDrawer
            open={Boolean(drawerPhoto)}
            onOpenChange={(open) => !open && setDrawerPhoto(null)}
            photo={drawerPhoto}
            onConfirmWarning={handleConfirmWarning}
            onRetryProcessing={handleRunPreprocess}
            onCalibrate={(arg: any) => setCalibratingImageId(typeof arg === "string" ? arg : arg?.id)}
            onReplace={!isImageSetLocked ? (imgId) => setReplacePhotoId(imgId) : undefined}
            onRemove={!isImageSetLocked ? (imgId) => setDeletePhoto(dbImages.find((img: any) => img.id === imgId) || { id: imgId }) : undefined}
            onTransform={(p) => setTransformPhoto(p)}
            onTransformed={(updated) => {
              fetchData();
              setDrawerPhoto((prev: any) => (prev ? { ...prev, ...updated, version: Date.now() } : null));
            }}
            onUpdatePhoto={(updated) => {
              fetchData();
              setDrawerPhoto((prev: any) => (prev ? { ...prev, ...updated, version: Date.now() } : null));
            }}
          />

          <ImageTransformModal
            open={Boolean(transformPhoto)}
            onOpenChange={(open) => !open && setTransformPhoto(null)}
            photo={transformPhoto}
            onTransformed={(updated) => {
              fetchData();
              setTransformPhoto(null);
              setDrawerPhoto((prev: any) => (prev ? { ...prev, ...updated, version: Date.now() } : null));
            }}
          />

        </>
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Reassign Field Inspector Dialog                                     */
/* ------------------------------------------------------------------ */

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
            <Label htmlFor="reassign-inspector">Assigned Field Inspector</Label>
            {loading ? (
              <div className="h-9 rounded-xl bg-muted animate-pulse" />
            ) : (
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="reassign-inspector" className="h-9 rounded-xl text-xs">
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
            <Label htmlFor="reassign-notes">Delegation / Handover Notes (optional)</Label>
            <Input
              id="reassign-notes"
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
                    {damageClasses[finding.classCode]?.label || "Concrete Crack"}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/70">{finding.id}</div>
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
                    {inspection.status === "reviewed" ? "View Finding" : "Review"}
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
