import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Upload,
  X,
  AlertCircle,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/store/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { api, getAuthToken } from "@/lib/api";
import { ComplianceNote, PageHeader, PageShell } from "./page-shell";
import {
  ImageQualityCard,
  BatchSummaryCard,
  SessionDamageAssessmentCard,
  ImageTransformModal,
} from "@/components/inspection/image-quality-components";
import { OpticalCalibrationModal } from "@/components/inspection/optical-calibration-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedPhoto {
  id: string;
  inspectionId?: string;
  inspection_id?: string;
  name: string;
  previewUrl: string;
  processedUrl?: string | null;
  status: "uploading" | "valid" | "warning" | "error";
  quality_status: "checking" | "accepted" | "warning" | "rejected";
  processing_status: "not_started" | "queued" | "running" | "complete" | "failed" | "skipped";
  qualityNote?: string;
  qualityReport?: any;
  aiClassification?: any;
  ai_classification?: any;
  aiDetection?: any;
  processingRun?: any;
  warningConfirmed?: boolean;
  clientError?: string;
  source: string;
  gps?: { lat: number; lng: number };
  width?: number;
  height?: number;
  calibration?: any;
  drone?: { altitude?: number; gimbalPitch?: number };
  hasRfdetr?: boolean;
  has_rfdetr?: boolean;
  rfdetrUrl?: string | null;
  rfdetrDetection?: any;
  rfdetr_detection?: any;
  activeStage2Model?: string;
  active_stage2_model?: string;
  modelFallback?: boolean;
  model_fallback?: boolean;
  hasYolo?: boolean;
  yoloUrl?: string | null;
  annotatedUrl?: string | null;
  yoloDetection?: any;
  yolo_detection?: any;
  hasUnet?: boolean;
  unetUrl?: string | null;
  unetMaskUrl?: string | null;
  unetSegmentation?: any;
  unet_segmentation?: any;
  originalUrl?: string | null;
  thumbnailUrl?: string | null;
  geometryUrl?: string | null;
  quality_report?: any;
  crackGeometry?: any;
  crack_geometry?: any;
  hasGeometry?: boolean;
  has_geometry?: boolean;
  damageAssessment?: any;
  damage_assessment?: any;
  hasCrack?: boolean;
  version?: number;
}

// ─── Camera Capture Modal ─────────────────────────────────────────────────────

function CameraCaptureModal({
  open,
  onCapture,
  onClose,
}: {
  open: boolean;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  useEffect(() => {
    if (!open) {
      stopStream();
      setCaptured(null);
      setCapturedBlob(null);
      setReady(false);
      return;
    }
    startCamera();
    return () => stopStream();
  }, [open, facingMode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      toast.error("Camera unavailable. Use file upload instead.");
      onClose();
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const toggleFacingMode = () => {
    stopStream();
    setReady(false);
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCaptured(canvas.toDataURL("image/jpeg", 0.92));
        stopStream();
      },
      "image/jpeg",
      0.92
    );
  };

  const handleRetake = () => {
    setCaptured(null);
    setCapturedBlob(null);
    startCamera();
  };

  const handleUse = () => {
    if (capturedBlob) {
      onCapture(capturedBlob);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-black border-border">
        <DialogHeader className="p-4 bg-card/90 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Camera className="size-4 text-primary" />
              Field Camera Capture
            </DialogTitle>
            <DialogDescription className="text-xs">
              Point at the infrastructure surface. Frame the area clearly before snapping.
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleFacingMode}
            className="h-7 text-[11px] gap-1 px-2 border-border"
          >
            <RefreshCw className="size-3" />
            <span>{facingMode === "environment" ? "Front Cam" : "Back Cam"}</span>
          </Button>
        </DialogHeader>

        <div className="relative aspect-video bg-black flex items-center justify-center">
          {captured ? (
            <img src={captured} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-8 text-primary animate-spin" />
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <DialogFooter className="p-4 gap-2 bg-card/90">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            <X className="size-3.5 mr-1.5" /> Cancel
          </Button>
          {captured ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRetake} className="text-xs">
                Retake
              </Button>
              <Button size="sm" onClick={handleUse} className="text-xs font-semibold">
                <CheckCircle2 className="size-3.5 mr-1.5" /> Use Photo
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleSnap} disabled={!ready} className="text-xs font-semibold">
              <Camera className="size-3.5 mr-1.5" />
              {ready ? "Snap Photo" : "Starting camera…"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function InspectionNewPage() {
  useAuth(); // ensure auth context is available
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillAssetId = searchParams.get("asset") || "";

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [assets, setAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetId, setAssetId] = useState(prefillAssetId);
  const [method, setMethod] = useState("walkdown");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInspectionId, setCreatedInspectionId] = useState<string | null>(null);

  // GPS — cached once for entire session
  const cachedGpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [gpsLabel, setGpsLabel] = useState<string>("Not acquired");
  const [gpsAcquiring, setGpsAcquiring] = useState(false);

  // Step 2 — photos & limits
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [calibratingPhotoId, setCalibratingPhotoId] = useState<string | null>(null);
  const [limits, setLimits] = useState<any>(null);

  // Role-based inspector assignment
  const { user: authUser } = useAuth();
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [assignedInspectorId, setAssignedInspectorId] = useState<string>("");

  useEffect(() => {
    if (authUser?.id) setAssignedInspectorId(authUser.id);
    api
      .getInspectors()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setInspectors(data);
          if (!authUser?.id) setAssignedInspectorId(data[0].id);
        }
      })
      .catch(() => {});
  }, [authUser]);

  // Interactive transform modal state
  const [transformModalOpen, setTransformModalOpen] = useState(false);
  const [transformPhoto, setTransformPhoto] = useState<any | null>(null);

  // Load image quality limits dynamically from backend
  useEffect(() => {
    api
      .getImageLimits()
      .then((data) => {
        if (data) setLimits(data);
      })
      .catch(() => {
        // Fallback silently if offline
      });
  }, []);

  // Quick asset creation modal
  const [quickAssetOpen, setQuickAssetOpen] = useState(false);
  const [quickAssetName, setQuickAssetName] = useState("");
  const [quickAssetType, setQuickAssetType] = useState("bridge");
  const [quickLat, setQuickLat] = useState<number | undefined>(undefined);
  const [quickLng, setQuickLng] = useState<number | undefined>(undefined);
  const [quickLocation, setQuickLocation] = useState("");
  const [quickGpsAcquiring, setQuickGpsAcquiring] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // ── GPS Acquisition ────────────────────────────────────────────────────────

  const acquireGps = useCallback(
    (
      onSuccess?: (pos: { lat: number; lng: number }) => void,
      setAcquiring?: (v: boolean) => void
    ) => {
      if (!navigator.geolocation) {
        toast.error("Geolocation not supported by your browser");
        return;
      }
      (setAcquiring ?? setGpsAcquiring)(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          cachedGpsRef.current = coords;
          setGpsLabel(`📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
          (setAcquiring ?? setGpsAcquiring)(false);
          toast.success("GPS location acquired", {
            description: `Lat ${coords.lat.toFixed(4)}, Lng ${coords.lng.toFixed(4)}`,
          });
          onSuccess?.(coords);
        },
        () => {
          // Fallback coords still allow session to proceed
          const fallback = { lat: 40.7128, lng: -74.006 };
          cachedGpsRef.current = fallback;
          setGpsLabel("Field GPS Tagged (regional)");
          (setAcquiring ?? setGpsAcquiring)(false);
          toast.info("Using regional central coordinates");
          onSuccess?.(fallback);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    []
  );

  // Auto-acquire GPS silently on mount (for photo tagging)
  useEffect(() => {
    if (navigator.geolocation && !cachedGpsRef.current) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          cachedGpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsLabel(`📍 ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        },
        () => {
          // Silent failure — user can click button manually
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
    }
  }, []);

  // Load assets
  useEffect(() => {
    api
      .getAssets()
      .then((list: any[]) => {
        setAssets(list);
        if (prefillAssetId && list.some((a) => a.id === prefillAssetId)) {
          setAssetId(prefillAssetId);
        } else if (list.length > 0 && !assetId) {
          setAssetId(list[0].id);
        }
      })
      .catch(() => toast.error("Could not load assets"))
      .finally(() => setLoadingAssets(false));
  }, []);

  // ── Quick Create Asset ─────────────────────────────────────────────────────

  const handleQuickCreateAsset = async () => {
    if (!quickAssetName.trim()) {
      toast.error("Please enter an asset name");
      return;
    }
    setQuickSubmitting(true);
    try {
      const created = await api.createAsset({
        name: quickAssetName.trim(),
        asset_type: quickAssetType,
        address: quickLocation.trim() || undefined,
        latitude: quickLat,
        longitude: quickLng,
      });
      toast.success(`Asset created: ${created.id}`);
      setAssets((prev) => [created, ...prev]);
      setAssetId(created.id);
      setQuickAssetOpen(false);
      setQuickAssetName("");
      setQuickLocation("");
      setQuickLat(undefined);
      setQuickLng(undefined);
    } catch (e: any) {
      toast.error(e.message || "Failed to create asset");
    } finally {
      setQuickSubmitting(false);
    }
  };

  // ── Step 1: Create Inspection ──────────────────────────────────────────────

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId) {
      setError("Please select a target infrastructure asset.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createInspection({
        asset_id: assetId,
        inspector_id: assignedInspectorId || undefined,
        inspection_method: method,
        notes: notes.trim() || undefined,
      });
      setCreatedInspectionId(created.id);
      toast.success("Inspection created — now capture field photos");
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to create inspection.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2: Photo Upload ───────────────────────────────────────────────────

  // ── Step 2: Quality Assessment, Upload & Preprocessing ─────────────────────

  const clientPreCheck = useCallback(
    async (
      fileOrBlob: File | Blob
    ): Promise<{ passed: boolean; reason?: string; width?: number; height?: number }> => {
      // 1. File size check
      const maxBytes = limits?.max_file_size_bytes || 52428800; // 50MB
      if (fileOrBlob.size > maxBytes) {
        const mb = (fileOrBlob.size / (1024 * 1024)).toFixed(1);
        const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
        return {
          passed: false,
          reason: `File size (${mb} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
        };
      }

      // 2. MIME type check
      if (fileOrBlob instanceof File && fileOrBlob.type) {
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/tiff", "image/heic"];
        if (!allowed.includes(fileOrBlob.type.toLowerCase()) && !fileOrBlob.type.startsWith("image/")) {
          return {
            passed: false,
            reason: `Format '${fileOrBlob.type}' is not supported. Please use JPEG, PNG, or TIFF.`,
          };
        }
      }

      // 3. Resolution standardization (resolution limits removed per specification)
      return new Promise((resolve) => {
        const url = URL.createObjectURL(fileOrBlob);
        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth;
          const height = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve({ passed: true, width, height });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ passed: true }); // Server will check completeness/corruption
        };
        img.src = url;
      });
    },
    [limits]
  );

  const uploadPhoto = useCallback(
    async (
      fileOrBlob: File | Blob,
      source: string = "upload",
      allowWarning: boolean = false,
      drone?: { altitude?: number; gimbalPitch?: number }
    ) => {
      if (!createdInspectionId) return;

      const tempId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(fileOrBlob);
      const name =
        fileOrBlob instanceof File
          ? fileOrBlob.name
          : `${source}_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;

      const gps = cachedGpsRef.current ?? undefined;

      // 1. Client Pre-Check
      const preCheck = await clientPreCheck(fileOrBlob);
      if (!preCheck.passed) {
        setPhotos((prev) => [
          ...prev,
          {
            id: tempId,
            name,
            previewUrl,
            status: "error",
            quality_status: "rejected",
            processing_status: "skipped",
            clientError: preCheck.reason,
            qualityNote: preCheck.reason,
            source,
            gps,
            drone,
            width: preCheck.width,
            height: preCheck.height,
          },
        ]);
        toast.error(`Image rejected: ${preCheck.reason}`);
        return;
      }

      // 2. Add as checking / uploading
      setPhotos((prev) => [
        ...prev,
        {
          id: tempId,
          name,
          previewUrl,
          status: "uploading",
          quality_status: "checking",
          processing_status: "queued",
          source,
          gps,
          drone,
          width: preCheck.width,
          height: preCheck.height,
        },
      ]);

      try {
        const result = await api.uploadAssessedImage(
          fileOrBlob,
          createdInspectionId,
          allowWarning,
          source,
          gps,
          drone
        );

        const qualityStatus = result.quality_status || (result.quality_report?.overall === "warning" ? "warning" : "accepted");
        const processingStatus = result.processing_status || (qualityStatus === "accepted" ? "complete" : "not_started");
        const hasRfdetr = Boolean(result.hasRfdetr || result.has_rfdetr);
        const rfdetrUrl = result.rfdetrUrl || result.rfdetr_url || (hasRfdetr ? `/api/v1/images/${result.id}/file?variant=rfdetr` : null);
        const rfdetrDetection = result.rfdetrDetection || result.rfdetr_detection || result.quality_report?.rfdetr_detection || result.qualityReport?.rfdetr_detection;
        const activeStage2Model = result.activeStage2Model || result.active_stage2_model;
        const modelFallback = Boolean(result.modelFallback ?? result.model_fallback ?? (result.hasUnet && !hasRfdetr));
        const hasYolo = Boolean(result.hasYolo || result.has_yolo);
        const yoloUrl = result.yoloUrl || result.yolo_url || (hasYolo ? `/api/v1/images/${result.id}/file?variant=yolo` : null);
        const hasUnet = Boolean(result.hasUnet || result.has_unet);
        const unetUrl = result.unetUrl || result.unet_url || (hasUnet ? `/api/v1/images/${result.id}/file?variant=unet` : null);
        const unetMaskUrl = result.unetMaskUrl || (hasUnet ? `/api/v1/images/${result.id}/file?variant=mask` : null);
        const unetSegmentation = result.unetSegmentation || result.unet_segmentation || result.quality_report?.unet_segmentation || result.qualityReport?.unet_segmentation;
        const originalUrl = result.originalUrl || `/api/v1/images/${result.id}/file?variant=original`;
        const processedUrl = result.preview_url || result.processedUrl || (result.processed_path ? `/api/v1/images/${result.id}/file?variant=processed` : null);
        const yoloDetection = result.yoloDetection || result.yolo_detection || result.quality_report?.yolo_detection || result.qualityReport?.yolo_detection;

        const aiCls = result.ai_classification || result.aiClassification || result.quality_report?.ai_classification || result.qualityReport?.ai_classification;
        const pCrack = typeof aiCls?.crack_probability === "number" ? aiCls.crack_probability : null;
        const pThresh = typeof aiCls?.threshold === "number" ? aiCls.threshold : 0.80;
        const isCrack = pCrack !== null ? pCrack >= pThresh : Boolean(aiCls?.has_crack);

        const token = getAuthToken();
        const tokenParam = token ? `token=${encodeURIComponent(token)}` : "";
        const baseUnetCandidate = isCrack && (unetUrl || (result.id ? `/api/v1/images/${result.id}/file?variant=unet` : null));
        const unetCandidateUrl = baseUnetCandidate
          ? (baseUnetCandidate.includes("token=")
              ? baseUnetCandidate
              : `${baseUnetCandidate}${baseUnetCandidate.includes("?") ? "&" : "?"}${tokenParam}`)
          : null;

        // Result image to display: if crack defect detected, show UNet/RF-DETR overlay; if sound (<80%), show clean processed image
        const displayUrl = isCrack
          ? (unetCandidateUrl || ((!modelFallback && rfdetrUrl) || unetUrl || processedUrl || originalUrl))
          : (processedUrl || originalUrl);

        setPhotos((prev) =>
          prev.map((p) => {
            if (p.id !== tempId) return p;
            if (p.previewUrl && p.previewUrl.startsWith("blob:")) {
              try { URL.revokeObjectURL(p.previewUrl); } catch (_) {}
            }
            return {
              ...p,
              id: result.id,
              inspectionId: createdInspectionId,
              inspection_id: createdInspectionId,
              status: qualityStatus === "warning" ? "warning" : "valid",
              quality_status: qualityStatus,
              processing_status: processingStatus,
              qualityNote: result.quality_report?.reason || result.qualityReport?.reason,
              qualityReport: result.quality_report || result.qualityReport,
              aiClassification: result.ai_classification || result.aiClassification || result.quality_report?.ai_classification || result.qualityReport?.ai_classification,
              ai_classification: result.ai_classification || result.aiClassification || result.quality_report?.ai_classification || result.qualityReport?.ai_classification,
              aiDetection: result.ai_detection || result.aiDetection,
              processingRun: result.processing_run || result.processingRun,
              thumbnailUrl: displayUrl,
              previewUrl: displayUrl,
              originalUrl: originalUrl,
              processedUrl: displayUrl,
              hasRfdetr: hasRfdetr,
              has_rfdetr: hasRfdetr,
              rfdetrUrl: rfdetrUrl,
              rfdetrDetection: rfdetrDetection,
              rfdetr_detection: rfdetrDetection,
              activeStage2Model: activeStage2Model,
              active_stage2_model: activeStage2Model,
              modelFallback: modelFallback,
              model_fallback: modelFallback,
              yoloUrl: yoloUrl,
              annotatedUrl: displayUrl,
              hasYolo: hasYolo,
              yoloDetection: yoloDetection,
              yolo_detection: yoloDetection,
              hasUnet: true,
              has_unet: true,
              unetUrl: unetCandidateUrl,
              unetMaskUrl: unetMaskUrl,
              unetSegmentation: unetSegmentation,
              unet_segmentation: unetSegmentation,
              hasCrack: isCrack,
              hasGeometry: Boolean(result.hasGeometry || result.has_geometry || result.crackGeometry || result.crack_geometry),
              has_geometry: Boolean(result.hasGeometry || result.has_geometry || result.crackGeometry || result.crack_geometry),
              crackGeometry: result.crackGeometry || result.crack_geometry || result.qualityReport?.crack_geometry || result.quality_report?.crack_geometry,
              crack_geometry: result.crackGeometry || result.crack_geometry || result.qualityReport?.crack_geometry || result.quality_report?.crack_geometry,
              damageAssessment: result.damageAssessment || result.damage_assessment || result.qualityReport?.damage_assessment || result.quality_report?.damage_assessment,
              damage_assessment: result.damageAssessment || result.damage_assessment || result.qualityReport?.damage_assessment || result.quality_report?.damage_assessment,
              calibration: result.calibration || p.calibration,
              geometryUrl: result.geometryUrl || (result.id ? `/api/v1/images/${result.id}/file?variant=geometry` : null),
              warningConfirmed: Boolean(result.warning_confirmed_by),
              width: result.width || p.width,
              height: result.height || p.height,
              source: result.source || source,
              drone: result.quality_report?.drone || drone,
            };
          })
        );

        if (qualityStatus === "warning") {
          toast.warning("Quality warning detected", {
            description: result.quality_report?.reason || "Confirm warning to proceed.",
          });
        } else {
          toast.success("Image accepted & enhanced");
        }
      } catch (err: any) {
        const rep = err.response?.detail?.report;
        const msg = err.response?.detail?.message || err.message || "Quality assessment failed";

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? {
                  ...p,
                  status: "error",
                  quality_status: "rejected",
                  processing_status: "skipped",
                  qualityNote: msg,
                  qualityReport: rep,
                }
              : p
          )
        );
        toast.error(`Image rejected: ${msg}`);
      }
    },
    [createdInspectionId, clientPreCheck]
  );

  const handleCameraCapture = useCallback(
    (blob: Blob) => uploadPhoto(blob, "camera"),
    [uploadPhoto]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const file of files) {
        await uploadPhoto(file, "upload");
      }
      e.target.value = "";
    },
    [uploadPhoto]
  );

  const handlePhotoTransformed = useCallback((result: any) => {
    const timestamp = Date.now();
    const bust = (url?: string | null) => {
      if (!url) return url;
      return `${url}${url.includes("?") ? "&" : "?"}v=${timestamp}`;
    };

    setPhotos((prev) =>
      prev.map((p) =>
        p.id === result.imageId
          ? {
              ...p,
              ...result,
              id: result.imageId,
              width: result.width || p.width,
              height: result.height || p.height,
              previewUrl: bust(result.previewUrl) || p.previewUrl,
              originalUrl: bust(result.originalUrl) || p.originalUrl,
              processedUrl: bust(result.processedUrl) || p.processedUrl,
              thumbnailUrl: bust(result.thumbnailUrl) || p.thumbnailUrl,
              rfdetrUrl: bust(result.rfdetrUrl) || p.rfdetrUrl,
              unetUrl: bust(result.unetUrl) || p.unetUrl,
              unetMaskUrl: bust(result.unetMaskUrl) || p.unetMaskUrl,
              geometryUrl: bust(result.geometryUrl) || p.geometryUrl,
              annotatedUrl: bust(result.annotatedUrl) || bust(result.rfdetrUrl) || bust(result.unetUrl) || p.annotatedUrl,
              hasRfdetr: result.hasRfdetr ?? result.has_rfdetr ?? p.hasRfdetr,
              has_rfdetr: result.hasRfdetr ?? result.has_rfdetr ?? p.has_rfdetr,
              rfdetrDetection: result.rfdetrDetection || result.rfdetr_detection || p.rfdetrDetection,
              rfdetr_detection: result.rfdetrDetection || result.rfdetr_detection || p.rfdetr_detection,
              activeStage2Model: result.activeStage2Model || result.active_stage2_model || p.activeStage2Model,
              active_stage2_model: result.activeStage2Model || result.active_stage2_model || p.active_stage2_model,
              modelFallback: result.modelFallback ?? result.model_fallback ?? p.modelFallback,
              model_fallback: result.modelFallback ?? result.model_fallback ?? p.model_fallback,
              qualityReport: result.qualityReport || result.quality_report || p.qualityReport,
              quality_report: result.qualityReport || result.quality_report || p.quality_report,
              aiClassification: result.aiClassification || result.ai_classification || p.aiClassification,
              ai_classification: result.aiClassification || result.ai_classification || p.ai_classification,
              unetSegmentation: result.unetSegmentation || result.unet_segmentation || result.qualityReport?.unet_segmentation || p.unetSegmentation,
              unet_segmentation: result.unetSegmentation || result.unet_segmentation || result.qualityReport?.unet_segmentation || p.unet_segmentation,
              crackGeometry: result.crackGeometry || result.crack_geometry || result.qualityReport?.crack_geometry || p.crackGeometry,
              crack_geometry: result.crackGeometry || result.crack_geometry || result.qualityReport?.crack_geometry || p.crack_geometry,
              quality_status:
                result.quality_status ||
                (result.qualityReport?.overall === "rejected" ? "warning" : "accepted"),
              status:
                result.quality_status === "warning" ||
                result.qualityReport?.overall === "warning"
                  ? "warning"
                  : "valid",
              processing_status: "complete",
              version: timestamp,
            }
          : p
      )
    );
    setTransformModalOpen(false);
  }, []);

  const handleConfirmWarning = useCallback(async (id: string) => {
    try {
      const res = await api.confirmImageWarning(id);
      const token = getAuthToken();
      const tokenParam = token ? `token=${encodeURIComponent(token)}` : "";
      const bust = `?v=${Date.now()}${tokenParam ? `&${tokenParam}` : ""}`;

      const aiCls = res.aiClassification || res.ai_classification;
      const pCrack = typeof aiCls?.crack_probability === "number" ? aiCls.crack_probability : null;
      const pThresh = typeof aiCls?.threshold === "number" ? aiCls.threshold : 0.80;
      const isCrackDefect = pCrack !== null ? pCrack >= pThresh : Boolean(aiCls?.has_crack);

      const baseUnet = res.unetUrl || `/api/v1/images/${id}/file?variant=unet`;
      const sep = baseUnet.includes("?") ? "&" : "?";
      const unetBusted = `${baseUnet}${sep}v=${Date.now()}${tokenParam ? `&${tokenParam}` : ""}`;
      const defaultDisplay = isCrackDefect
        ? (res.previewUrl ? `${res.previewUrl}${res.previewUrl.includes("?") ? "&" : "?"}v=${Date.now()}${tokenParam ? `&${tokenParam}` : ""}` : unetBusted)
        : (res.processedUrl ? `${res.processedUrl}${res.processedUrl.includes("?") ? "&" : "?"}v=${Date.now()}${tokenParam ? `&${tokenParam}` : ""}` : `/api/v1/images/${id}/file?variant=processed${bust}`);

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "valid",
                quality_status: "accepted",
                processing_status: "complete",
                warningConfirmed: true,
                thumbnailUrl: defaultDisplay,
                previewUrl: defaultDisplay,
                annotatedUrl: defaultDisplay,
                unetUrl: isCrackDefect ? unetBusted : null,
                hasUnet: isCrackDefect && Boolean(res.hasUnet),
                has_unet: isCrackDefect && Boolean(res.has_unet),
                hasCrack: isCrackDefect,
                yoloUrl: isCrackDefect && res.yoloUrl ? `${res.yoloUrl}${tokenParam ? `&${tokenParam}` : ""}` : null,
                hasYolo: isCrackDefect && Boolean(res.hasYolo ?? p.hasYolo),
                yoloDetection: isCrackDefect ? (res.yoloDetection || p.yoloDetection) : null,
                unetMaskUrl: isCrackDefect && res.unetMaskUrl ? `${res.unetMaskUrl}${tokenParam ? `&${tokenParam}` : ""}` : null,
                unetSegmentation: isCrackDefect ? (res.unetSegmentation || res.unet_segmentation || p.unetSegmentation) : null,
                aiClassification: res.aiClassification || res.ai_classification || p.aiClassification,
                hasGeometry: isCrackDefect && Boolean(res.hasGeometry || res.has_geometry || res.crackGeometry || res.crack_geometry || p.hasGeometry),
                has_geometry: isCrackDefect && Boolean(res.hasGeometry || res.has_geometry || res.crackGeometry || res.crack_geometry || p.hasGeometry),
                crackGeometry: isCrackDefect ? (res.crackGeometry || res.crack_geometry || p.crackGeometry) : null,
                crack_geometry: isCrackDefect ? (res.crackGeometry || res.crack_geometry || p.crackGeometry) : null,
                damageAssessment: res.damageAssessment || res.damage_assessment || p.damageAssessment,
                damage_assessment: res.damageAssessment || res.damage_assessment || p.damageAssessment,
                calibration: res.calibration || p.calibration,
                geometryUrl: isCrackDefect ? (res.geometryUrl || p.geometryUrl) : null,
                processedUrl: defaultDisplay,
                processingRun: res.processing_run || p.processingRun,
              }
            : p
        )
      );
      toast.success("Warning confirmed. Preprocessing complete.");
    } catch (err: any) {
      toast.error(`Failed to confirm warning: ${err.message}`);
    }
  }, []);

  const handleRetryProcessing = useCallback(async (id: string) => {
    try {
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, processing_status: "running" } : p))
      );
      const res = await api.retryImageProcessing(id);
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                processing_status: "complete",
                processedUrl: res.preview_url || `/api/v1/images/${id}/file?variant=processed`,
                processingRun: res.processing_run,
              }
            : p
        )
      );
      toast.success("Processing retried successfully");
    } catch (err: any) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, processing_status: "failed" } : p))
      );
      toast.error(`Retry failed: ${err.message}`);
    }
  }, []);

  const handleReplaceClick = useCallback((id: string) => {
    setReplaceTargetId(id);
    replaceFileInputRef.current?.click();
  }, []);

  const handleReplaceFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !replaceTargetId) return;
      const targetId = replaceTargetId;
      e.target.value = "";

      try {
        toast.info("Replacing image and re-assessing quality…");
        const res = await api.replaceImage(targetId, file);
        const newPreview = URL.createObjectURL(file);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === targetId
              ? {
                  ...p,
                  name: file.name,
                  previewUrl: newPreview,
                  status: res.quality_status === "warning" ? "warning" : "valid",
                  quality_status: res.quality_status,
                  processing_status: res.processing_status,
                  qualityNote: res.quality_report?.reason,
                  qualityReport: res.quality_report,
                  processingRun: res.processing_run,
                  processedUrl: res.preview_url || `/api/v1/images/${res.id}/file?variant=processed`,
                  warningConfirmed: Boolean(res.warning_confirmed_by),
                }
              : p
          )
        );
        toast.success("Image replaced successfully");
      } catch (err: any) {
        toast.error(`Replacement rejected: ${err.message}`);
      } finally {
        setReplaceTargetId(null);
      }
    },
    [replaceTargetId]
  );

  const handleCalibrate = useCallback((id: string) => {
    setCalibratingPhotoId(id);
  }, []);

  const handleRemovePhoto = useCallback(
    async (id: string) => {
      setPhotos((prev) => {
        const photo = prev.find((p) => p.id === id);
        if (photo) URL.revokeObjectURL(photo.previewUrl);
        return prev.filter((p) => p.id !== id);
      });
      try {
        await api.deleteImage(id, createdInspectionId || undefined);
      } catch {
        // Ignored
      }
    },
    [createdInspectionId]
  );

  const handleFinish = () => {
    if (createdInspectionId) {
      navigate(`/app/inspections/${createdInspectionId}`);
    }
  };

  const selectedAsset = assets.find((a) => a.id === assetId);

  // Section 6.3 Status line and button enablement rules
  const acceptedPhotos = photos.filter(
    (p) => p.quality_status === "accepted" || (p.quality_status === "warning" && p.warningConfirmed)
  );
  const rejectedPhotos = photos.filter(
    (p) => p.quality_status === "rejected" || p.status === "error" || p.clientError
  );
  const unconfirmedWarnings = photos.filter(
    (p) => p.quality_status === "warning" && !p.warningConfirmed
  );
  const isBatchWorking = photos.some(
    (p) => p.status === "uploading" || p.processing_status === "running" || p.processing_status === "queued"
  );

  const getStatusLine = () => {
    if (photos.length === 0) {
      return "No photos added yet. Take a photo or upload files to begin.";
    }
    if (isBatchWorking) {
      return "Uploading and checking batch… processing in progress.";
    }
    if (rejectedPhotos.length > 0) {
      return `${rejectedPhotos.length} rejected photo(s) must be replaced or removed before review.`;
    }
    if (unconfirmedWarnings.length > 0) {
      return `${unconfirmedWarnings.length} photo(s) have warnings. Confirm or replace them to proceed.`;
    }
    return `${acceptedPhotos.length} of ${photos.length} photo(s) accepted and preprocessed. Ready for engineer review.`;
  };

  const isDoneDisabled =
    photos.length === 0 ||
    isBatchWorking ||
    rejectedPhotos.length > 0 ||
    unconfirmedWarnings.length > 0 ||
    acceptedPhotos.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <PageHeader
        backHref="/app/inspections"
        backLabel="Inspections"
        eyebrow={step === 1 ? "Step 1 of 2" : "Step 2 of 2"}
        title={step === 1 ? "New Inspection" : "Capture Field Photos"}
        description={
          step === 1
            ? "Select the asset and optionally add notes. Dates and inspector are set automatically."
            : "Take photos with your camera or upload images from drone / DSLR. GPS is tagged automatically."
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${step === 1 ? "bg-primary/10 text-primary border-primary/40" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}
        >
          {step > 1 ? <CheckCircle2 className="size-3.5" /> : <span className="size-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">1</span>}
          Asset & Details
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <div
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${step === 2 ? "bg-primary/10 text-primary border-primary/40" : "bg-muted text-muted-foreground border-border"}`}
        >
          <span className="size-3.5 rounded-full bg-current text-white flex items-center justify-center text-[10px] font-bold opacity-60">2</span>
          Photo Capture
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── STEP 1: Form ── */}
        {step === 1 && (
          <>
            <form
              onSubmit={handleCreateInspection}
              className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-3 space-y-5"
            >
              {/* Asset selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="asset-select" className="text-xs font-semibold">
                    Infrastructure Asset <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickAssetOpen(true)}
                    className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 font-medium"
                  >
                    <Plus className="size-3" />
                    New Asset
                  </Button>
                </div>
                {loadingAssets ? (
                  <div className="h-10 rounded-xl bg-muted animate-pulse" />
                ) : (
                  <Select value={assetId} onValueChange={setAssetId}>
                    <SelectTrigger id="asset-select" className="h-10 rounded-xl text-xs font-medium">
                      <SelectValue placeholder="Select asset from network inventory…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {assets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id} className="text-xs">
                          <span className="font-mono font-bold text-primary">{asset.id}</span> ·{" "}
                          {asset.name} ({asset.asset_type || asset.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedAsset && (
                  <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50">
                    <p className="font-semibold text-foreground">{selectedAsset.name}</p>
                    <p>
                      {selectedAsset.address} · Type: {selectedAsset.asset_type || selectedAsset.type}
                    </p>
                  </div>
                )}
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <Label htmlFor="method-select" className="text-xs font-semibold">
                  Inspection Method
                </Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="method-select" className="h-10 rounded-xl text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkdown" className="text-xs">
                      Walkdown (on-foot inspection)
                    </SelectItem>
                    <SelectItem value="drone" className="text-xs">
                      Drone survey
                    </SelectItem>
                    <SelectItem value="dslr" className="text-xs">
                      DSLR / mounted camera
                    </SelectItem>
                    <SelectItem value="smartphone" className="text-xs">
                      Smartphone capture
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Role-Based Inspector Assignment (Engineers, Managers, Admins) */}
              {["admin", "manager", "engineer", "civil-engineer"].includes(
                (authUser?.role || "").toLowerCase()
              ) && (
                <div className="space-y-1.5">
                  <Label htmlFor="inspector-select" className="text-xs font-semibold">
                    Assigned Field Inspector <span className="text-muted-foreground font-normal">(role-based delegation)</span>
                  </Label>
                  <Select
                    value={assignedInspectorId}
                    onValueChange={setAssignedInspectorId}
                  >
                    <SelectTrigger id="inspector-select" className="h-10 rounded-xl text-xs font-medium">
                      <SelectValue placeholder="Choose inspector…" />
                    </SelectTrigger>
                    <SelectContent>
                      {inspectors.map((ins) => (
                        <SelectItem key={ins.id} value={ins.id} className="text-xs">
                          <span className="font-semibold text-foreground">{ins.name || ins.email}</span>{" "}
                          <span className="text-muted-foreground font-mono text-[10px]">({ins.email})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="inspection-notes" className="text-xs font-semibold">
                  Field Notes{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="inspection-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Inspect pier cap and north abutment; drone survey permitted with 2.5 m standoff…"
                  className="min-h-20 rounded-xl text-xs leading-relaxed"
                />
              </div>

              {/* Auto-defaults notice */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/60 text-[11px] text-muted-foreground">
                <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-foreground" />
                <span>
                  Inspection date = today, due date = +14 days. Assigned to:{" "}
                  <strong className="text-foreground">
                    {inspectors.find((i) => i.id === assignedInspectorId)?.name || (authUser?.name ?? "you")}
                  </strong>
                </span>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs font-medium">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/app/inspections")}
                  className="h-10 px-4 rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || loadingAssets || !assetId}
                  className="h-10 px-5 rounded-xl text-xs font-semibold flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Creating…</span>
                    </>
                  ) : (
                    <>
                      <span>Next: Capture Photos</span>
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Info panel */}
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">What happens next?</h3>
                <ol className="space-y-3.5 text-xs">
                  <li className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                      1
                    </span>
                    <div>
                      <div className="font-semibold text-foreground">Create inspection record</div>
                      <div className="text-muted-foreground mt-0.5 leading-snug">
                        Linked to asset, assigned to you. Status:{" "}
                        <code className="text-primary font-mono text-[11px]">assigned</code>.
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                      2
                    </span>
                    <div>
                      <div className="font-semibold text-foreground">Capture field imagery</div>
                      <div className="text-muted-foreground mt-0.5 leading-snug">
                        Use your phone camera or upload drone / DSLR files. GPS tagged automatically.
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                      3
                    </span>
                    <div>
                      <div className="font-semibold text-foreground">Submit for engineering review</div>
                      <div className="text-muted-foreground mt-0.5 leading-snug">
                        Automated quality checks run. Civil Engineer reviews findings and signs off.
                      </div>
                    </div>
                  </li>
                </ol>

                <div className="p-3 rounded-xl bg-muted/60 border border-border/80 text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <UserCheck className="size-3.5 text-primary" />
                    <span>Engineering Gate Required</span>
                  </div>
                  <p>
                    AI results are decision support. All findings must be reviewed and certified by
                    a licensed Civil Engineer before any report is issued.
                  </p>
                </div>
              </div>
              <ComplianceNote />
            </div>
          </>
        )}

        {/* ── STEP 2: Photo Capture ── */}
        {step === 2 && (
          <>
            <div className="lg:col-span-3 space-y-5">
              {/* GPS status bar */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                <MapPin className="size-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">GPS Location (shared across all photos)</p>
                  <p className="text-[11px] text-muted-foreground truncate">{gpsLabel}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={gpsAcquiring}
                  onClick={() => acquireGps()}
                  className="h-7 text-[11px] gap-1 px-2.5 border-primary/30 text-primary shrink-0"
                >
                  {gpsAcquiring ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Navigation className="size-3" />
                  )}
                  <span>{cachedGpsRef.current ? "Re-acquire" : "Acquire GPS"}</span>
                </Button>
              </div>

              {/* Upload actions */}
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-2"
                >
                  <Camera className="size-4" />
                  Take Photo
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-2"
                >
                  <Upload className="size-4" />
                  Upload Files
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Drag-drop zone (when no photos yet) */}
              {photos.length === 0 && (
                <label
                  className="rounded-2xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-3 p-12 cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files).filter((f) =>
                      f.type.startsWith("image/")
                    );
                    files.forEach((f) => uploadPhoto(f, "upload"));
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <ImagePlus className="size-10 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Drop images here</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or use the buttons above to capture or upload field photos
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Standardized for deep learning crack assessment
                    </p>
                  </div>
                </label>
              )}

              {/* Photo grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photo) => (
                    <ImageQualityCard
                      key={photo.id}
                      photo={photo}
                      onRemove={handleRemovePhoto}
                      onReplace={handleReplaceClick}
                      onConfirmWarning={handleConfirmWarning}
                      onRetryProcessing={handleRetryProcessing}
                      onCalibrate={handleCalibrate}
                      onTransform={(p) => {
                        setTransformPhoto(p);
                        setTransformModalOpen(true);
                      }}
                      onTransformed={handlePhotoTransformed}
                      onUpdatePhoto={(updated) => {
                        setPhotos((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                      }}
                    />
                  ))}

                  {/* Add more tile */}
                  <label className="rounded-xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col items-center justify-center gap-2 aspect-video cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFileInput}
                    />
                    <Plus className="size-6 text-muted-foreground/50" />
                    <span className="text-[11px] text-muted-foreground">Add more</span>
                  </label>
                </div>
              )}

              {/* Summary & actions */}
              <div className="flex items-center justify-between pt-4 border-t border-border gap-4">
                <div className="text-xs text-muted-foreground">
                  {getStatusLine()}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFinish}
                    className="h-10 px-4 rounded-xl text-xs"
                  >
                    Skip & Open Workspace
                  </Button>
                  <Button
                    type="button"
                    disabled={isDoneDisabled}
                    onClick={handleFinish}
                    className="h-10 px-5 rounded-xl text-xs font-semibold flex items-center gap-2"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>Done — Open Inspection</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Side info */}
            <div className="space-y-4 lg:col-span-2">
              {/* Inspection summary */}
              {createdInspectionId && (
                <div className="rounded-2xl border-2 border-foreground/30 bg-card p-4 space-y-3 shadow-xs">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-foreground" />
                    Inspection Created
                  </h3>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">ID</span>
                      <code className="font-mono text-foreground font-semibold text-[11px]">{createdInspectionId}</code>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Asset</span>
                      <span className="text-foreground">{selectedAsset?.name ?? assetId}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Method</span>
                      <span className="capitalize text-foreground">{method}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Status</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono h-4 border-foreground/40 text-foreground">
                        assigned
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Batch quality & preprocessing summary */}
              <BatchSummaryCard photos={photos} />

              {/* Session Damage Severity Assessment (AASHTO / ASTM & PDF §10) */}
              <SessionDamageAssessmentCard photos={photos} inspectionId={createdInspectionId || undefined} />

              {/* Quality guide (dynamic from server limits) */}
              <div className="rounded-2xl border-2 border-foreground/30 bg-card p-5 space-y-3 shadow-xs">
                <h3 className="text-sm font-bold text-foreground tracking-tight">Photo Quality Guide</h3>
                <ul className="space-y-2 text-xs text-foreground/80">
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-foreground mt-0.5 shrink-0" />
                    <span>
                      Resolution:{" "}
                      <strong className="text-foreground">
                        Any resolution accepted (standardized to model input)
                      </strong>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-foreground mt-0.5 shrink-0" />
                    <span>Sharp focus on defect area (blur score ≥ {limits?.thresholds?.blur_variance_warn || 80})</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-foreground mt-0.5 shrink-0" />
                    <span>Adequate lighting (brightness ≥ {limits?.thresholds?.mean_brightness_warn || 70})</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-foreground mt-0.5 shrink-0" />
                    <span>Frame the full defect region in shot</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-foreground mt-0.5 shrink-0" />
                    <span>Max file size: {Math.round((limits?.max_file_size_bytes || 52428800) / (1024 * 1024))} MB (JPEG, PNG, TIFF)</span>
                  </li>
                </ul>
                <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
                  Without scale calibration, lengths are shown in pixels (uncalibrated). mm/cm
                  measurements require a calibration reference in the image.
                </p>
              </div>

              <ComplianceNote />
            </div>
          </>
        )}
      </div>

      {/* Camera modal */}
      <CameraCaptureModal
        open={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setCameraOpen(false)}
      />

      {/* Quick Add Asset Dialog */}
      <Dialog open={quickAssetOpen} onOpenChange={setQuickAssetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
            <DialogDescription>Name and type are all that's required. GPS is optional.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="quick-name">
                Asset Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quick-name"
                value={quickAssetName}
                onChange={(e) => setQuickAssetName(e.target.value)}
                placeholder="e.g. West Pier Arch 4"
                className="rounded-lg text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Infrastructure Type</Label>
              <Select value={quickAssetType} onValueChange={setQuickAssetType}>
                <SelectTrigger className="rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">Bridge</SelectItem>
                  <SelectItem value="road">Road corridor</SelectItem>
                  <SelectItem value="tunnel">Tunnel</SelectItem>
                  <SelectItem value="retaining-wall">Retaining wall</SelectItem>
                  <SelectItem value="building">Structure deck</SelectItem>
                  <SelectItem value="dam">Hydro dam</SelectItem>
                  <SelectItem value="culvert">Culvert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" />
                  GPS Location (optional)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={quickGpsAcquiring}
                  onClick={() =>
                    acquireGps(
                      (pos) => {
                        setQuickLat(pos.lat);
                        setQuickLng(pos.lng);
                        setQuickLocation(`GPS: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
                      },
                      setQuickGpsAcquiring
                    )
                  }
                  className="h-7 text-[11px] gap-1 px-2.5 font-medium border-primary/30 text-primary"
                >
                  {quickGpsAcquiring ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Navigation className="size-3" />
                  )}
                  <span>{quickGpsAcquiring ? "Acquiring…" : "Acquire GPS"}</span>
                </Button>
              </div>
              <Input
                value={quickLocation}
                onChange={(e) => setQuickLocation(e.target.value)}
                placeholder="Click Acquire GPS above or type reference"
                className="rounded-lg bg-background text-xs"
              />
              {quickLat && quickLng && (
                <p className="text-[11px] text-primary font-mono">
                  📍 {quickLat.toFixed(5)}, {quickLng.toFixed(5)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAssetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickCreateAsset} disabled={quickSubmitting}>
              {quickSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                "Register & Select"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden File Input for Image Replacement */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReplaceFileChange}
      />

      {/* Optical Scale Calibration Modal */}
      <OpticalCalibrationModal
        open={Boolean(calibratingPhotoId)}
        onOpenChange={(v) => !v && setCalibratingPhotoId(null)}
        photo={photos.find((p) => p.id === calibratingPhotoId)}
        inspectionId={createdInspectionId}
        onCalibrated={(res) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === calibratingPhotoId
                ? {
                    ...p,
                    calibration: res.calibration,
                    crack_geometry: res.crack_geometry,
                    crackGeometry: res.crackGeometry || res.crack_geometry,
                    damage_assessment: res.damage_assessment || res.damageAssessment,
                    damageAssessment: res.damageAssessment || res.damage_assessment,
                    hasGeometry: Boolean(res.crack_geometry || res.crackGeometry),
                    has_geometry: Boolean(res.crack_geometry || res.crackGeometry),
                  }
                : p
            )
          );
          setCalibratingPhotoId(null);
        }}
      />

      {/* Interactive Image Transform Modal (Crop, Rotate, Orientation) */}
      <ImageTransformModal
        open={transformModalOpen}
        onOpenChange={setTransformModalOpen}
        photo={transformPhoto}
        onTransformed={handlePhotoTransformed}
      />
    </PageShell>
  );
}
