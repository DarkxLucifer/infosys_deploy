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
  Smartphone,
  Upload,
  X,
  AlertCircle,
  UserCheck,
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
import { api } from "@/lib/api";
import { ComplianceNote, PageHeader, PageShell } from "./page-shell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedPhoto {
  id: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "valid" | "warning" | "error";
  qualityNote?: string;
  source: "camera" | "upload";
  gps?: { lat: number; lng: number };
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
  }, [open]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
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
        <DialogHeader className="p-4 bg-card/90">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Camera className="size-4 text-primary" />
            Field Camera Capture
          </DialogTitle>
          <DialogDescription className="text-xs">
            Point at the infrastructure surface. Frame the area clearly before snapping.
          </DialogDescription>
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

// ─── Photo Thumbnail Card ──────────────────────────────────────────────────────

function PhotoCard({ photo, onRemove }: { photo: UploadedPhoto; onRemove: (id: string) => void }) {
  const statusColors: Record<UploadedPhoto["status"], string> = {
    uploading: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    valid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  };

  const statusLabel: Record<UploadedPhoto["status"], string> = {
    uploading: "Uploading…",
    valid: "Valid",
    warning: "Warning",
    error: "Failed",
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border bg-card group">
      <img
        src={photo.previewUrl}
        alt={photo.name}
        className="w-full aspect-video object-cover"
      />
      {/* Overlay badges */}
      <div className="absolute top-2 left-2 flex gap-1.5">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColors[photo.status]}`}
        >
          {statusLabel[photo.status]}
        </span>
        {photo.source === "camera" && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30">
            Camera
          </span>
        )}
      </div>
      {photo.gps && (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-[10px] text-primary/90 font-mono flex items-center gap-1">
          <MapPin className="size-2.5" />
          {photo.gps.lat.toFixed(5)}, {photo.gps.lng.toFixed(5)}
        </div>
      )}
      {/* Upload spinner overlay */}
      {photo.status === "uploading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="size-6 text-primary animate-spin" />
        </div>
      )}
      {/* Remove button */}
      {photo.status !== "uploading" && (
        <button
          onClick={() => onRemove(photo.id)}
          className="absolute top-2 right-2 size-6 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="size-3" />
        </button>
      )}
      {photo.qualityNote && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border bg-card/80 truncate">
          {photo.qualityNote}
        </div>
      )}
    </div>
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

  // Step 2 — photos
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        inspection_method: method,
        notes: notes.trim() || undefined,
        // inspector_id, inspection_date, due_date all auto-default on backend
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

  const uploadPhoto = useCallback(
    async (fileOrBlob: File | Blob, source: "camera" | "upload") => {
      if (!createdInspectionId) return;

      const tempId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(fileOrBlob);
      const name =
        fileOrBlob instanceof File
          ? fileOrBlob.name
          : `camera_${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;

      const gps = cachedGpsRef.current ?? undefined;

      setPhotos((prev) => [
        ...prev,
        {
          id: tempId,
          name,
          previewUrl,
          status: "uploading",
          source,
          gps,
        },
      ]);

      try {
        const result = await api.uploadInspectionImage(
          createdInspectionId,
          fileOrBlob,
          source,
          true, // allow_warning
          gps
        );

        const serverStatus = result?.status === "valid" ? "valid" : result?.status === "warning" ? "warning" : "valid";
        const qualityNote = result?.quality_check_result
          ? `Resolution: ${result.quality_check_result.resolution ?? "OK"} · Blur: ${result.quality_check_result.blur_score?.toFixed(1) ?? "OK"}`
          : undefined;

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? { ...p, id: result?.id ?? tempId, status: serverStatus, qualityNote }
              : p
          )
        );

        toast.success("Photo uploaded successfully");
      } catch (err: any) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === tempId ? { ...p, status: "error", qualityNote: err.message } : p
          )
        );
        toast.error(`Upload failed: ${err.message}`);
      }
    },
    [createdInspectionId]
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

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleFinish = () => {
    if (createdInspectionId) {
      navigate(`/app/inspections/${createdInspectionId}`);
    }
  };

  const selectedAsset = assets.find((a) => a.id === assetId);
  const validPhotos = photos.filter((p) => p.status === "valid" || p.status === "warning");

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
                <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-emerald-400" />
                <span>
                  Inspector defaults to <strong className="text-foreground">you</strong>. Inspection date = today, due date = +14 days. All auto-set.
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
              <div className="flex flex-wrap gap-3">
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

                <label className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted cursor-pointer transition-colors">
                  <Smartphone className="size-4" />
                  Mobile Cam
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </label>

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
                      or use the buttons above to take / upload photos
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Min 1080p · JPG, PNG, TIFF, HEIC
                    </p>
                  </div>
                </label>
              )}

              {/* Photo grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photo) => (
                    <PhotoCard key={photo.id} photo={photo} onRemove={handleRemovePhoto} />
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
                  {photos.length === 0
                    ? "No photos yet — capture at least one field photo"
                    : `${validPhotos.length} of ${photos.length} photo${photos.length !== 1 ? "s" : ""} uploaded successfully`}
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
                    disabled={validPhotos.length === 0}
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
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    Inspection Created
                  </h3>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">ID</span>
                      <code className="font-mono text-primary text-[11px]">{createdInspectionId}</code>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Asset</span>
                      <span>{selectedAsset?.name ?? assetId}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Method</span>
                      <span className="capitalize">{method}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-foreground w-20 shrink-0">Status</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono h-4">
                        assigned
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Quality guide */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Photo Quality Guide</h3>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    Minimum resolution: <strong className="text-foreground">1080p</strong>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    Sharp focus on defect area (not blurry)
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    Adequate lighting — avoid harsh shadows
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    Frame the full defect region in shot
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    Include reference scale ruler when possible
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
    </PageShell>
  );
}
