import React, { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Upload,
  RefreshCw,
  Trash2,
  Edit3,
  Tag,
  Check,
  Loader2,
  Info,
  Sparkles,
  ScanSearch,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";

// ─── 1. Photo Zoom & Fullscreen Modal ─────────────────────────────────────────

export function PhotoZoomModal({
  open,
  onOpenChange,
  photo,
  inspectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  inspectionId: string;
}) {
  const hasCrack = Boolean(
    photo?.aiClassification?.has_crack ||
    photo?.ai_classification?.has_crack ||
    photo?.aiDetection?.defectType === "crack" ||
    photo?.qualityReport?.ai_classification?.has_crack ||
    (photo?.aiClassification?.crack_probability ?? 0) >= 0.80
  );
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<"orig" | "proc" | "yolo" | "unet">(hasCrack ? "unet" : "orig");

  useEffect(() => {
    if (open) {
      setZoom(1);
      if (hasCrack) setViewMode("unet");
    }
  }, [open, hasCrack]);

  if (!photo) return null;

  const tok = getAuthToken();
  const tokQuery = tok ? `?token=${encodeURIComponent(tok)}` : "";
  const origSrc = `/api/v1/inspections/${inspectionId}/images/${photo.id}/file${tokQuery}`;
  const procSrc = `/api/v1/inspections/${inspectionId}/images/${photo.id}/processed${tokQuery}`;
  const yoloSrc = `/api/v1/inspections/${inspectionId}/images/${photo.id}/file?variant=yolo${tok ? `&token=${encodeURIComponent(tok)}` : ""}`;
  const unetSrc = `/api/v1/inspections/${inspectionId}/images/${photo.id}/file?variant=unet${tok ? `&token=${encodeURIComponent(tok)}` : ""}`;
  const currentSrc = viewMode === "unet" ? unetSrc : viewMode === "yolo" ? yoloSrc : viewMode === "proc" ? procSrc : origSrc;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col bg-card overflow-hidden">
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-sm font-bold font-mono text-foreground">
              {photo.filename || photo.name}
            </DialogTitle>
            <span className="text-xs text-muted-foreground font-mono">
              {photo.width} × {photo.height} px
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Original vs Preprocessed vs UNet switcher */}
            <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border text-xs">
              <button
                type="button"
                onClick={() => setViewMode("orig")}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  viewMode === "orig" ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setViewMode("proc")}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  viewMode === "proc" ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preprocessed
              </button>
              <button
                type="button"
                onClick={() => setViewMode("yolo")}
                className={`px-2.5 py-1 rounded font-medium transition-all flex items-center gap-1 ${
                  viewMode === "yolo" ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ScanSearch className="size-3 text-amber-400" />
                YOLO
              </button>
              <button
                type="button"
                onClick={() => setViewMode("unet")}
                className={`px-2.5 py-1 rounded font-medium transition-all flex items-center gap-1 ${
                  viewMode === "unet" ? "bg-primary text-primary-foreground font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3 text-cyan-400" />
                UNet Segment
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center bg-muted rounded-lg border border-border p-0.5">
              <Button size="icon" variant="ghost" className="size-7" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="text-[11px] font-mono px-2 min-w-[48px] text-center font-bold">
                {Math.round(zoom * 100)}%
              </span>
              <Button size="icon" variant="ghost" className="size-7" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={handleReset} title="Reset Zoom">
                <Maximize2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-black/95 flex items-center justify-center p-4 relative">
          <div
            style={{
              transform: `scale(${zoom})`,
              transition: "transform 0.15s ease-out",
              transformOrigin: "center center",
            }}
            className="max-w-full max-h-full flex items-center justify-center"
          >
            <img
              src={currentSrc}
              alt={photo.filename}
              className="max-w-full max-h-[72vh] object-contain rounded shadow-2xl select-none"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 2. Photo Replacement Modal ───────────────────────────────────────────────

export function PhotoReplaceModal({
  open,
  onOpenChange,
  photoId,
  inspectionId: _inspectionId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoId: string | null;
  inspectionId?: string;
  onSuccess?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [allowWarning, setAllowWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setAllowWarning(false);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 50 * 1024 * 1024) {
      toast.error("File exceeds maximum allowed size (50 MB).");
      return;
    }

    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
  };

  const handleReplace = async () => {
    if (!photoId || !file) return;
    setSubmitting(true);
    try {
      await api.replaceImage(photoId, file, allowWarning);
      toast.success("Photograph replaced successfully", {
        description: "Fresh quality assessment and preprocessing executed. Prior detections cleared.",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to replace photograph");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <RefreshCw className="size-4 text-primary" />
            <span>Replace Field Photograph</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Upload a higher-quality replacement image. The existing record will be updated, previous AI results cleared, and OpenCV quality checks rerun.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/30 transition-colors">
            <input
              type="file"
              id="replace-file-input"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="replace-file-input" className="cursor-pointer space-y-2 block">
              <Upload className="size-6 text-muted-foreground mx-auto" />
              <div className="font-semibold text-foreground">Click to select replacement image</div>
              <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP up to 50MB</p>
            </label>
          </div>

          {file && (
            <div className="p-3 rounded-lg border bg-muted/40 flex items-center gap-3">
              {previewUrl && (
                <img src={previewUrl} alt="Preview" className="size-12 object-cover rounded border" />
              )}
              <div className="truncate flex-1">
                <p className="font-mono font-medium truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="allow-warn-chk"
              checked={allowWarning}
              onChange={(e) => setAllowWarning(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <Label htmlFor="allow-warn-chk" className="text-xs cursor-pointer">
              Accept image even if OpenCV flags quality warning
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleReplace} disabled={!file || submitting} className="gap-1.5">
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            <span>Replace Photograph</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 3. Photo Deletion Confirmation Dialog ────────────────────────────────────

export function PhotoDeleteDialog({
  open,
  onOpenChange,
  photoId,
  inspectionId,
  filename,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoId: string | null;
  inspectionId: string;
  filename?: string;
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (!photoId) return;
    setSubmitting(true);
    try {
      await api.deleteImage(photoId, inspectionId);
      toast.success("Photograph removed", {
        description: "The photo has been removed from this inspection batch.",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove photograph");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
            <Trash2 className="size-4" />
            <span>Remove Photograph</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Are you sure you want to remove <strong className="text-foreground">{filename || "this photograph"}</strong>? Any associated quality records will be detached.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            <span>Confirm Remove</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 4. Manual Inspector Classification Modal ─────────────────────────────────

export function PhotoManualClassificationModal({
  open,
  onOpenChange,
  photo,
  inspectionId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  inspectionId: string;
  onSuccess?: () => void;
}) {
  const [classification, setClassification] = useState<"crack" | "no_crack" | "uncertain">("crack");
  const [decision, setDecision] = useState<"accepted" | "rejected" | "warned" | "manual_review">("accepted");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && photo) {
      const qr = photo.quality_report || photo.qualityReport || {};
      const manual = qr.manual_review || {};
      setClassification(manual.manual_classification || "crack");
      setDecision(manual.decision || "accepted");
      setReason(manual.override_reason || "");
      setNotes(manual.notes || "");
    }
  }, [open, photo]);

  if (!photo) return null;

  const aiPred = photo.quality_report?.ai_classification || photo.aiClassification;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.reviewImage(
        photo.id,
        {
          decision,
          manual_classification: classification,
          override_reason: reason,
          notes,
        },
        inspectionId
      );
      toast.success("Manual assessment saved", {
        description: `Photo recorded as ${classification.toUpperCase()} by inspector. Original AI predictions preserved.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save assessment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Tag className="size-4 text-primary" />
            <span>Inspector Manual Assessment</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Classify this frame manually or override model inference. Manual annotations are persistently recorded with your identity and separated from machine-generated results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* AI Model Baseline Callout */}
          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2.5">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-foreground">Machine Baseline (ResNet50 v1.0):</span>
              {aiPred ? (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Predicted: <strong className={aiPred.has_crack ? "text-rose-400" : "text-foreground"}>{aiPred.predicted_class}</strong> · Crack Prob: {(aiPred.crack_probability * 100).toFixed(1)}% · Threshold: {(aiPred.threshold * 100).toFixed(1)}%
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  AI analysis has not run yet on this photo.
                </p>
              )}
            </div>
          </div>

          {/* Classification Choice */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Inspector Defect Verdict</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={classification === "crack" ? "default" : "outline"}
                size="sm"
                className={`h-9 text-xs font-semibold justify-center ${classification === "crack" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}`}
                onClick={() => setClassification("crack")}
              >
                <XCircle className="size-3.5 mr-1" />
                Crack Present
              </Button>
              <Button
                type="button"
                variant={classification === "no_crack" ? "default" : "outline"}
                size="sm"
                className={`h-9 text-xs font-semibold justify-center ${classification === "no_crack" ? "bg-primary text-primary-foreground font-bold shadow-xs" : ""}`}
                onClick={() => setClassification("no_crack")}
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                No Crack
              </Button>
              <Button
                type="button"
                variant={classification === "uncertain" ? "default" : "outline"}
                size="sm"
                className={`h-9 text-xs font-semibold justify-center ${classification === "uncertain" ? "bg-muted text-foreground border border-border" : ""}`}
                onClick={() => setClassification("uncertain")}
              >
                <HelpCircle className="size-3.5 mr-1" />
                Uncertain / Review
              </Button>
            </div>
          </div>

          {/* Photo Disposition Status */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Photo Workflow Disposition</Label>
            <Select value={decision} onValueChange={(val: any) => setDecision(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted">Accepted for Engineering Review</SelectItem>
                <SelectItem value="warned">Quality Warning (Inspector Confirmed)</SelectItem>
                <SelectItem value="manual_review">Mark for Senior Engineer Audit</SelectItem>
                <SelectItem value="rejected">Reject Photo (Retake Demanded)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Override Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason for Assessment / Override</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Surface staining misidentified as crack; visible hairline fissure confirmed"
              className="text-xs h-9"
            />
          </div>

          {/* Inspector Site Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Inspector Field Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add environmental notes, member chainage, illumination conditions, etc."
              className="text-xs min-h-[64px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            <span>Save Assessment</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 5. Interactive Defect Bounding Box Annotation Canvas ─────────────────────

export function PhotoAnnotationModal({
  open,
  onOpenChange,
  photo,
  inspectionId,
  existingAnnotations = [],
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  inspectionId: string;
  existingAnnotations?: any[];
  onSuccess?: () => void;
}) {
  const [defectType, setDefectType] = useState("crack");
  const [severity, setSeverity] = useState("moderate");
  const [notes, setNotes] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentBox(null);
      setDrawing(false);
      setStartPos(null);
      setNotes("");
    }
  }, [open]);

  if (!photo) return null;

  const tok = getAuthToken();
  const tokQuery = tok ? `?token=${encodeURIComponent(tok)}` : "";
  const imgSrc = `/api/v1/inspections/${inspectionId}/images/${photo.id}/file${tokQuery}`;

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return {
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pos = getRelativeCoords(e);
    setStartPos(pos);
    setCurrentBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !startPos) return;
    const pos = getRelativeCoords(e);
    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const w = Math.abs(pos.x - startPos.x);
    const h = Math.abs(pos.y - startPos.y);
    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (drawing) {
      setDrawing(false);
      setStartPos(null);
      if (currentBox && (currentBox.w < 2 || currentBox.h < 2)) {
        setCurrentBox(null);
      }
    }
  };

  const handleSaveAnnotation = async () => {
    if (!currentBox) {
      toast.error("Please click and drag on the image to draw a defect bounding box.");
      return;
    }
    setSubmitting(true);
    try {
      await api.annotateImage(
        photo.id,
        {
          bbox: {
            x: Math.round(currentBox.x),
            y: Math.round(currentBox.y),
            w: Math.round(currentBox.w),
            h: Math.round(currentBox.h),
          },
          defect_type: defectType,
          severity,
          notes,
        },
        inspectionId
      );
      toast.success("Defect bounding box saved", {
        description: `Manual annotation recorded as ${defectType}. Distinct from AI predictions.`,
      });
      setCurrentBox(null);
      setNotes("");
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save annotation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col bg-card overflow-hidden">
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Edit3 className="size-4 text-primary" />
              <span>Manual Defect Annotation Canvas</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Click and drag on the image to box visible defect regions. Saved as engineer/inspector manual evidence.
            </DialogDescription>
          </div>
          <Badge variant="outline" className="text-primary border-primary/30 text-[11px] font-mono">
            Inspector Manual Tool
          </Badge>
        </DialogHeader>

        <div className="flex-1 grid md:grid-cols-3 overflow-hidden">
          {/* Canvas area (2 cols) */}
          <div className="md:col-span-2 bg-black/95 p-4 flex items-center justify-center overflow-auto select-none">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative max-w-full max-h-[64vh] cursor-crosshair border border-white/20 shadow-2xl rounded overflow-hidden"
            >
              <img
                src={imgSrc}
                alt="Annotation target"
                className="max-w-full max-h-[64vh] object-contain pointer-events-none"
              />

              {/* Render existing annotations */}
              {existingAnnotations.map((ann, idx) => {
                const box = ann.geometry?.bbox;
                if (!box) return null;
                return (
                  <div
                    key={idx}
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.w}%`,
                      height: `${box.h}%`,
                    }}
                    className="absolute border-2 border-primary bg-primary/20 pointer-events-none rounded-xs flex items-start justify-between p-1"
                  >
                    <span className="bg-card text-foreground border border-border font-mono text-[9px] px-1 rounded font-bold uppercase">
                      {ann.defect_type || "Defect"}
                    </span>
                  </div>
                );
              })}

              {/* Render in-progress drawn box */}
              {currentBox && (
                <div
                  style={{
                    left: `${currentBox.x}%`,
                    top: `${currentBox.y}%`,
                    width: `${currentBox.w}%`,
                    height: `${currentBox.h}%`,
                  }}
                  className="absolute border-2 border-dashed border-rose-400 bg-rose-500/25 pointer-events-none rounded-xs"
                />
              )}
            </div>
          </div>

          {/* Controls sidebar (1 col) */}
          <div className="p-4 border-l border-border bg-card overflow-y-auto space-y-4 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Defect Type</Label>
              <Select value={defectType} onValueChange={setDefectType}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crack">Surface Crack</SelectItem>
                  <SelectItem value="longitudinal_cracking">Longitudinal Crack</SelectItem>
                  <SelectItem value="transverse_cracking">Transverse Crack</SelectItem>
                  <SelectItem value="alligator_cracking">Alligator Fatigue Cracking</SelectItem>
                  <SelectItem value="spalling">Concrete Spalling / Break</SelectItem>
                  <SelectItem value="efflorescence">Efflorescence / Seepage</SelectItem>
                  <SelectItem value="exposed_rebar">Exposed Reinforcing Steel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Estimated Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor Damage</SelectItem>
                  <SelectItem value="moderate">Moderate Damage</SelectItem>
                  <SelectItem value="severe">Severe Damage</SelectItem>
                  <SelectItem value="critical">Critical Structural Threat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Annotation Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observed fissure orientation, proximity to joints or bearings, etc."
                className="text-xs min-h-[72px]"
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={handleSaveAnnotation}
                disabled={!currentBox || submitting}
                className="w-full text-xs font-semibold gap-1.5"
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                <span>Save Bounding Box</span>
              </Button>
              {!currentBox && (
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Click and drag across a defect in the preview to box it.
                </p>
              )}
            </div>

            {existingAnnotations.length > 0 && (
              <div className="pt-3 border-t border-border space-y-2">
                <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider block">
                  Saved Annotations ({existingAnnotations.length})
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {existingAnnotations.map((ann, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-muted/50 border border-border flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-semibold capitalize text-foreground">{ann.defect_type || "Defect"}</span>
                        <span className="text-muted-foreground block text-[10px]">{ann.severity || "moderate"} severity</span>
                      </div>
                      <Badge variant="outline" className="text-[9px]">Manual</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 6. Multi-file Drag & Drop Uploader ────────────────────────────────────────

export function MultiFileUploadZone({
  onFilesSelected,
  isUploading,
}: {
  onFilesSelected: (files: File[]) => void;
  isUploading: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || /\.(jpe?g|png|webp|tiff?)$/i.test(f.name)
    );
    if (files.length > 0) {
      onFilesSelected(files);
    } else {
      toast.error("Please drop valid image files (JPG, PNG, WebP).");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFilesSelected(files);
      e.target.value = "";
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
        isDragging
          ? "border-primary bg-primary/10 scale-[1.005]"
          : "border-border bg-card/60 hover:bg-card hover:border-primary/40"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        disabled={isUploading}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-2.5 max-w-md mx-auto">
        <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
          {isUploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5" />
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Drag & drop field photographs here, or{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-primary hover:underline font-bold"
            >
              browse files
            </button>
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Supports batch upload of JPG, PNG, and WebP (up to 50 MB per file). Automated classical OpenCV quality verification runs on intake.
          </p>
        </div>
      </div>
    </div>
  );
}
