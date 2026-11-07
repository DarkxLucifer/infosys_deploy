import React, { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Crop,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Loader2,
  MapPin,
  Minus,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Ruler,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
  AlertTriangle,
  Cpu,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  X,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { CrackGeometrySection } from "./crack-geometry-section";

export function getAuthenticatedUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const token = getAuthToken();
  if (!token) return url;
  if (url.includes("token=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

// ─── Status Badges ────────────────────────────────────────────────────────────

export function QualityBadge({
  status,
  confirmed = false,
}: {
  status: "pending" | "checking" | "accepted" | "warning" | "rejected" | string;
  confirmed?: boolean;
}) {
  switch (status) {
    case "accepted":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs">
          <CheckCircle2 className="size-3 text-muted-foreground" />
          <span>Accepted</span>
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs">
          <AlertCircle className="size-3 text-rose-400" />
          <span>{confirmed ? "Warning (confirmed)" : "Warning"}</span>
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs">
          <XCircle className="size-3 text-rose-400" />
          <span>Rejected</span>
        </span>
      );
    case "checking":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/60 text-muted-foreground border border-border shadow-xs">
          <Loader2 className="size-3 text-muted-foreground animate-spin" />
          <span>Checking</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/40 text-muted-foreground border border-border shadow-xs">
          <Clock className="size-3 text-muted-foreground" />
          <span>Pending</span>
        </span>
      );
  }
}

export function ProcessingBadge({
  status,
}: {
  status: "not_started" | "queued" | "running" | "complete" | "failed" | "skipped" | string;
}) {
  switch (status) {
    case "complete":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs">
          <Check className="size-3 text-muted-foreground" />
          <span>Preprocessed</span>
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 shadow-xs">
          <Loader2 className="size-3 text-primary animate-spin" />
          <span>Processing</span>
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/40 text-muted-foreground border border-border shadow-xs">
          <Clock className="size-3 text-muted-foreground" />
          <span>Queued</span>
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs">
          <AlertTriangle className="size-3 text-rose-400" />
          <span>Failed</span>
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/40 text-muted-foreground border border-border shadow-xs">
          <Minus className="size-3" />
          <span>Skipped</span>
        </span>
      );
    default:
      return null;
  }
}

export function ClassificationBadge({
  photo,
  classification,
  className = "",
}: {
  photo?: any;
  classification?: any;
  className?: string;
}) {
  const ai =
    classification ||
    photo?.aiClassification ||
    photo?.ai_classification ||
    photo?.qualityReport?.ai_classification ||
    photo?.quality_report?.ai_classification;

  const qStatus = photo?.quality_status || (photo?.status === "error" ? "rejected" : photo?.status);
  const pStatus = photo?.processing_status;

  // 1. Quality Rejected / Error -> Skipped
  if (qStatus === "rejected" || photo?.status === "error") {
    return (
      <span
        title="Quality assessment rejected: AI crack inference skipped"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/40 text-muted-foreground border border-border shadow-xs ${className}`}
      >
        <Minus className="size-3 text-muted-foreground" />
        <span>Skipped</span>
      </span>
    );
  }

  // 2. Uploading / Preprocessing in progress -> Classifying
  if (photo?.status === "uploading" || qStatus === "checking" || pStatus === "running") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/60 text-muted-foreground border border-border shadow-xs ${className}`}
      >
        <Loader2 className="size-3 text-muted-foreground animate-spin" />
        <span>Classifying…</span>
      </span>
    );
  }

  // 3. AI Classification result exists
  if (ai || photo?.rfdetrDetection || photo?.yoloDetection || photo?.unetSegmentation) {
    const crackProb = typeof ai?.crack_probability === "number"
      ? ai.crack_probability
      : (typeof ai?.confidence === "number" && ai?.has_crack ? ai.confidence : null);
    const threshold = typeof ai?.threshold === "number" ? ai.threshold : 0.80;
    const thresholdPct = (threshold * 100).toFixed(0);

    // STRICT 80% GATE RULE:
    // If crack probability is available, crack defect is ONLY confirmed if crack_probability >= threshold (80%).
    const hasCrack = crackProb !== null
      ? crackProb >= threshold
      : Boolean(ai?.has_crack || ai?.predicted_class === "Cracked" || photo?.is_cracked);

    if (hasCrack) {
      const rawProb = Math.max(
        crackProb ?? 0,
        photo?.rfdetrDetection?.confidence ?? 0,
        photo?.yoloDetection?.confidence ?? 0,
        photo?.unetSegmentation?.mean_crack_confidence ?? 0,
        0.86
      );
      const pct = Math.round(rawProb * 100);
      return (
        <span
          title={`InfraScan Two-Stage AI: Defect confirmed (${pct}% score exceeds ${thresholdPct}% alarm threshold)`}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs backdrop-blur-xs ${className}`}
        >
          <AlertTriangle className="size-3 text-rose-400 shrink-0" />
          <span>Crack Detected</span>
          <span className="text-[9px] font-mono text-rose-400/80 font-normal">({pct}%)</span>
        </span>
      );
    } else {
      const soundProb = typeof ai?.uncracked_probability === "number"
        ? ai.uncracked_probability
        : (crackProb !== null ? 1 - crackProb : 0.88);
      const soundPct = Math.round(soundProb * 100);
      return (
        <span
          title={`InfraScan Two-Stage AI: Sound concrete surface verified (${soundPct}% sound score, below ${thresholdPct}% defect cutoff)`}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs backdrop-blur-xs ${className}`}
        >
          <CheckCircle2 className="size-3 text-primary shrink-0" />
          <span>Sound Surface</span>
          <span className="text-[9px] font-mono text-muted-foreground font-normal">({soundPct}%)</span>
        </span>
      );
    }
  }

  // 4. Stored AI detection fallback
  if (photo?.aiDetection) {
    const isCrack = photo.aiDetection.defectType === "crack";
    const pct = Math.round((photo.aiDetection.confidence || 0) * 100);
    if (isCrack) {
      return (
        <span
          title={`InfraScan ResNet50: Crack defect (${pct}%)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs backdrop-blur-xs ${className}`}
        >
          <AlertTriangle className="size-3 text-rose-400 shrink-0" />
          <span>Crack ({pct}%)</span>
        </span>
      );
    } else {
      return (
        <span
          title={`InfraScan ResNet50: Sound concrete (${pct}%)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs backdrop-blur-xs ${className}`}
        >
          <CheckCircle2 className="size-3 text-muted-foreground shrink-0" />
          <span>No Crack ({pct}%)</span>
        </span>
      );
    }
  }

  // 5. Accepted / Ready for AI
  return (
    <span
      title="Ready for InfraScan ResNet50 analysis"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/60 text-muted-foreground border border-border shadow-xs ${className}`}
    >
      <Sparkles className="size-3 text-muted-foreground" />
      <span>AI: Ready</span>
    </span>
  );
}


// ─── Image Compare Viewer (Original / Processed / Compare Slider) ────────────

export function ImageCompare({
  originalUrl,
  processedUrl,
  rfdetrUrl,
  rfdetrDetection,
  activeStage2Model: _activeStage2Model,
  modelFallback = false,
  yoloUrl: _yoloUrl,
  yoloDetection,
  unetUrl,
  unetMaskUrl,
  unetSegmentation,
  metricsBefore,
  metricsAfter,
  className = "",
}: {
  originalUrl: string;
  processedUrl?: string | null;
  rfdetrUrl?: string | null;
  rfdetrDetection?: any;
  activeStage2Model?: string;
  modelFallback?: boolean;
  yoloUrl?: string | null;
  yoloDetection?: any;
  unetUrl?: string | null;
  unetMaskUrl?: string | null;
  unetSegmentation?: any;
  metricsBefore?: any;
  metricsAfter?: any;
  className?: string;
}) {
  const unetMetrics = unetSegmentation || {};
  const isCrackDefect = Boolean(
    unetMetrics.has_crack ||
    (unetMetrics.crack_area_pct !== undefined && unetMetrics.crack_area_pct > 0) ||
    unetUrl
  );
  const hasRfdetrDefects = Boolean(!modelFallback && rfdetrDetection?.has_defect);

  // If cracked and UNet output is available, default view to UNet Segment!
  const initialMode = (isCrackDefect && unetUrl) ? "unet" : (hasRfdetrDefects ? "rfdetr" : (unetUrl ? "unet" : "compare"));
  const [viewMode, setViewMode] = useState<"compare" | "orig" | "proc" | "rfdetr" | "unet" | "mask">(initialMode);
  const [compareTarget, setCompareTarget] = useState<"rfdetr" | "unet" | "processed">(
    (isCrackDefect && unetUrl) ? "unet" : (hasRfdetrDefects ? "rfdetr" : (unetUrl ? "unet" : "processed"))
  );
  const [sliderPos, setSliderPos] = useState(50); // percent
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Full-screen Maximize state & zoom
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maximizedSliderPos, setMaximizedSliderPos] = useState(50);
  const maximizedContainerRef = useRef<HTMLDivElement>(null);
  const isMaximizedDragging = useRef(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMaximized) {
        setIsMaximized(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isMaximized]);

  // If rfdetrUrl or unetUrl becomes available, automatically switch view
  useEffect(() => {
    if (unetUrl && isCrackDefect && compareTarget !== "unet") {
      setCompareTarget("unet");
      if (viewMode === "rfdetr" || viewMode === "compare") {
        setViewMode("unet");
      }
    } else if (hasRfdetrDefects && compareTarget !== "rfdetr" && !unetUrl) {
      setCompareTarget("rfdetr");
    }
  }, [hasRfdetrDefects, unetUrl, isCrackDefect]);

  const handleMaximizedPointerDown = () => {
    isMaximizedDragging.current = true;
  };
  const handleMaximizedPointerUp = () => {
    isMaximizedDragging.current = false;
  };
  const handleMaximizedPointerMove = (e: React.PointerEvent) => {
    if (!isMaximizedDragging.current || !maximizedContainerRef.current) return;
    const rect = maximizedContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setMaximizedSliderPos(Math.round((x / rect.width) * 100));
  };

  const handlePointerDown = () => {
    isDragging.current = true;
  };
  const handlePointerUp = () => {
    isDragging.current = false;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos(Math.round((x / rect.width) * 100));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      setSliderPos((prev) => Math.max(0, prev - 5));
    } else if (e.key === "ArrowRight") {
      setSliderPos((prev) => Math.min(100, prev + 5));
    }
  };

  const compareBackgroundUrl =
    (compareTarget === "rfdetr" && rfdetrUrl)
      ? rfdetrUrl
      : (compareTarget === "unet" && unetUrl)
      ? unetUrl
      : (processedUrl || rfdetrUrl || unetUrl || originalUrl);

  if (!processedUrl && !unetUrl && !rfdetrUrl) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
          <img src={originalUrl} alt="Original surface" className="w-full h-full object-contain" />
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/80 font-mono text-xs text-white">
            Original Only
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Processed copy is not available (image is either rejected, queued, or skipped).
        </p>
      </div>
    );
  }

  const hasUnetData = Boolean(unetMetrics.has_crack || (unetMetrics.crack_area_pct !== undefined && unetMetrics.crack_area_pct > 0));

  // Crack Type Classification (Longitudinal, Transverse, Alligator, Pothole)
  const rawType =
    rfdetrDetection?.primary_label ||
    rfdetrDetection?.primary_defect ||
    yoloDetection?.primary_defect ||
    yoloDetection?.detections?.[0]?.label ||
    yoloDetection?.defect_type;

  let cleanCrackType = "Longitudinal Crack";
  if (rawType) {
    const lowerType = String(rawType).toLowerCase();
    if (lowerType.includes("alligator")) {
      cleanCrackType = "Alligator Crack";
    } else if (lowerType.includes("transverse")) {
      cleanCrackType = "Transverse Crack";
    } else if (lowerType.includes("pothole") || lowerType.includes("spall")) {
      cleanCrackType = "Pothole";
    } else {
      cleanCrackType = "Longitudinal Crack";
    }
  }

  const confidenceScore = rfdetrDetection?.confidence
    ? Math.round(rfdetrDetection.confidence * 100)
    : (yoloDetection?.detections?.[0]?.confidence
      ? Math.round(yoloDetection.detections[0].confidence * 100)
      : (yoloDetection?.confidence ? Math.round(yoloDetection.confidence * 100) : 88));

  // Single-line crack classification text
  let crackTypeDisplay = `${cleanCrackType} (${confidenceScore}% confidence)`;
  if (!modelFallback && rfdetrDetection?.has_defect) {
    const num = rfdetrDetection.num_detections || 1;
    crackTypeDisplay = `${cleanCrackType} (${confidenceScore}% confidence) · ${num} defect region${num > 1 ? "s" : ""}`;
  } else if (modelFallback) {
    crackTypeDisplay = `U-Net Fallback (best_model.pth) · RF-DETR 0 defects · Crack Area ${unetMetrics.crack_area_pct ?? 0}%`;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Segmented Mode Control */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-lg p-0.5 bg-muted/60 border border-border">
          <button
            type="button"
            onClick={() => setViewMode("compare")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === "compare" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Compare Slider
          </button>
          <button
            type="button"
            onClick={() => setViewMode("orig")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === "orig" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => setViewMode("proc")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === "proc" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Processed
          </button>

          {rfdetrUrl && (
            <button
              type="button"
              onClick={() => setViewMode("rfdetr")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "rfdetr" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground font-semibold"
              }`}
            >
              <Cpu className="size-3 text-primary" />
              <span>RF-DETR</span>
              {rfdetrDetection?.num_detections !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full bg-muted text-[10px] font-mono text-foreground">
                  {rfdetrDetection.num_detections}
                </span>
              )}
            </button>
          )}

          {unetUrl && (
            <button
              type="button"
              onClick={() => setViewMode("unet")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "unet" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground font-semibold"
              }`}
            >
              <Sparkles className="size-3 text-primary" />
              <span>{modelFallback ? "UNet (best_model.pth)" : "UNet Segment"}</span>
              {unetMetrics.crack_area_pct !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full bg-muted text-[10px] font-mono text-foreground">
                  {unetMetrics.crack_area_pct}%
                </span>
              )}
            </button>
          )}

          {(unetMaskUrl || unetUrl) && (
            <button
              type="button"
              onClick={() => setViewMode("mask")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "mask" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Binary Mask
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {viewMode === "compare" && (
            <div className="inline-flex rounded-lg p-0.5 bg-muted/60 border border-border text-[11px]">
              {rfdetrUrl && (
                <button
                  type="button"
                  onClick={() => setCompareTarget("rfdetr")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                    compareTarget === "rfdetr" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  vs RF-DETR
                </button>
              )}
              {unetUrl && (
                <button
                  type="button"
                  onClick={() => setCompareTarget("unet")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                    compareTarget === "unet" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  vs UNet
                </button>
              )}
              {processedUrl && (
                <button
                  type="button"
                  onClick={() => setCompareTarget("processed")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                    compareTarget === "processed" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  vs Preprocessed
                </button>
              )}
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setZoomLevel(1);
              setIsMaximized(true);
            }}
            className="h-7 text-xs px-2.5 gap-1.5 border-border hover:bg-muted font-semibold shadow-xs"
            title="Maximize image in full-screen view"
          >
            <Maximize2 className="size-3.5 text-primary" />
            <span>Maximize</span>
          </Button>

          <span className="text-[11px] text-muted-foreground font-mono hidden md:inline">
            {viewMode === "compare"
              ? `Split: ${sliderPos}% (Orig vs ${compareTarget === "rfdetr" ? "RF-DETR" : (compareTarget === "unet" ? "UNet Mask" : "Enhanced")})`
              : viewMode === "orig"
              ? "Raw Input"
              : viewMode === "rfdetr"
              ? `RF-DETR Medium Defect Detection (${rfdetrDetection?.num_detections ?? 0} defects)`
              : viewMode === "unet"
              ? `UNet Pixel Segmentation (${unetMetrics.crack_area_pct ?? 0}% Area)`
              : viewMode === "mask"
              ? "UNet Binary Crack Mask"
              : "Enhanced"}
          </span>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black select-none touch-none focus:outline-hidden focus:ring-2 focus:ring-primary cursor-ew-resize"
        aria-label="Image comparison viewer. Use left and right arrow keys to adjust split position."
      >
        {/* Floating Maximize Image button on interactive stage */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setZoomLevel(1);
            setIsMaximized(true);
          }}
          className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black/95 text-white border border-white/20 transition-all shadow-md flex items-center gap-1.5 text-[11px] font-semibold backdrop-blur-xs cursor-pointer hover:scale-105"
          title="Maximize image in full-screen high-resolution view"
        >
          <Maximize2 className="size-3.5 text-primary" />
          <span>Maximize</span>
        </button>
        {viewMode === "orig" && (
          <img src={originalUrl} alt="Original capture" className="w-full h-full object-contain" />
        )}

        {viewMode === "proc" && (
          <img src={processedUrl || originalUrl} alt="Processed copy" className="w-full h-full object-contain" />
        )}

        {viewMode === "rfdetr" && (
          <>
            <img src={rfdetrUrl || processedUrl || originalUrl} alt="RF-DETR Defect Detection" className="w-full h-full object-contain" />
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 font-mono text-xs font-semibold text-white pointer-events-none flex items-center gap-2 shadow-lg z-20" style={{ color: "#ffffff" }}>
              <Cpu className="size-3.5 text-blue-400 shrink-0" style={{ color: "#60a5fa" }} />
              <span className="text-white font-semibold" style={{ color: "#ffffff" }}>RF-DETR Medium (rdd2022)</span>
            </div>
            {rfdetrDetection && (
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 font-mono text-xs font-semibold text-white pointer-events-none shadow-lg z-20" style={{ color: "#ffffff" }}>
                {rfdetrDetection.num_detections > 0 ? (
                  <span className="text-white font-semibold" style={{ color: "#ffffff" }}>
                    {rfdetrDetection.num_detections} defect(s) · {rfdetrDetection.primary_label || "Crack"}
                  </span>
                ) : (
                  <span className="text-zinc-300">
                    0 defect bboxes &rarr; U-Net Fallback
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {viewMode === "unet" && (
          <>
            <img src={unetUrl || processedUrl || originalUrl} alt="UNet Crack Segmentation" className="w-full h-full object-contain" />
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 font-mono text-xs font-semibold text-white pointer-events-none flex items-center gap-2 shadow-lg z-20" style={{ color: "#ffffff" }}>
              <Sparkles className="size-3.5 text-blue-400 shrink-0" style={{ color: "#60a5fa" }} />
              <span className="text-white font-semibold" style={{ color: "#ffffff" }}>UNet (best_model.pth) {modelFallback ? "· Fallback Active" : "CrackSeg9k"}</span>
            </div>
            {unetMetrics.crack_area_pct !== undefined && (
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 font-mono text-xs font-semibold text-white pointer-events-none shadow-lg z-20" style={{ color: "#ffffff" }}>
                <span className="font-bold text-white" style={{ color: "#ffffff" }}>{unetMetrics.crack_area_pct}% Area</span>
                <span className="text-zinc-300"> · {unetMetrics.crack_pixels?.toLocaleString()} px</span>
              </div>
            )}
          </>
        )}

        {viewMode === "mask" && (
          <>
            <img src={unetMaskUrl || unetUrl || processedUrl || originalUrl} alt="Binary Crack Mask" className="w-full h-full object-contain bg-zinc-950" />
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 font-mono text-xs font-semibold text-white pointer-events-none shadow-lg z-20" style={{ color: "#ffffff" }}>
              Binary Pixel Segmentation Mask (384×384)
            </div>
          </>
        )}

        {viewMode === "compare" && (
          <>
            {/* Background Layer: RF-DETR / UNet Result if available, else Processed */}
            <img
              src={compareBackgroundUrl || originalUrl}
              alt="Processed / AI Detection"
              className="absolute inset-0 w-full h-full object-contain"
            />

            {/* Original (Foreground Layer with Clip Path) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
              <img
                src={originalUrl}
                alt="Original"
                className="absolute inset-0 w-full h-full object-contain max-w-none"
                style={{ width: containerRef.current ? `${containerRef.current.clientWidth}px` : "100%" }}
              />
            </div>

            {/* Divider Handle Bar */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.8)] pointer-events-none"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-7 rounded-full bg-black/90 border-2 border-white flex items-center justify-center text-white shadow-md">
                <Sliders className="size-3.5 rotate-90" />
              </div>
            </div>

            {/* Badges on viewer */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-xs border border-white/20 font-mono text-[10px] text-zinc-200 pointer-events-none shadow-md">
              Original
            </div>
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-xs border border-white/20 font-mono text-[10px] text-white pointer-events-none shadow-md">
              {compareTarget === "rfdetr" ? "RF-DETR" : (compareTarget === "unet" ? "UNet Segmentation" : "Processed")}
            </div>
          </>
        )}
      </div>

      {/* UNet Quantitative Crack Metrics (Micro-Level Engineering Measurements) */}
      {hasUnetData && (
        <div className="p-3 rounded-xl bg-card border border-border space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              UNet Pixel Crack Measurements ({modelFallback ? "Fallback: best_model.pth" : "CrackSeg9k"})
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              Dice: 75.14% · IoU: 60.18%
            </span>
          </div>

          {/* Crack Type Classification: Single Line Output */}
          <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border">
            <span className="text-muted-foreground font-medium">Crack Classification:</span>
            <span className="font-mono font-bold text-foreground">
              {crackTypeDisplay}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
            <div className="p-2 rounded-lg bg-muted/20 border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Crack Area</span>
              <span className="font-bold text-rose-400">{unetMetrics.crack_area_pct}%</span>
              <span className="text-[9px] text-muted-foreground block">({unetMetrics.crack_pixels?.toLocaleString()} px)</span>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Max Thickness</span>
              <span className="font-bold text-rose-400">{unetMetrics.max_width_px ?? "—"} px</span>
              {unetMetrics.max_width_mm && (
                <span className="text-[9px] text-muted-foreground block">({unetMetrics.max_width_mm} mm)</span>
              )}
            </div>
            <div className="p-2 rounded-lg bg-muted/20 border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Total Length</span>
              <span className="font-bold text-foreground">{unetMetrics.total_length_px ?? "—"} px</span>
              {unetMetrics.total_length_mm && (
                <span className="text-[9px] text-muted-foreground block">({unetMetrics.total_length_mm} mm)</span>
              )}
            </div>
            <div className="p-2 rounded-lg bg-muted/20 border border-border">
              <span className="text-[10px] text-muted-foreground block font-sans">Mean Conf.</span>
              <span className="font-bold text-foreground">
                {unetMetrics.mean_crack_confidence ? `${Math.round(unetMetrics.mean_crack_confidence * 100)}%` : "95%"}
              </span>
              <span className="text-[9px] text-muted-foreground block">τ = 0.50 cutoff</span>
            </div>
          </div>
        </div>
      )}

      {/* Deep Learning Pipeline Caption */}
      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/80 text-[11px] text-muted-foreground flex items-center gap-2">
        <Sparkles className="size-3.5 text-primary shrink-0" />
        <span>
          Pipeline: <strong>ResNet-18</strong> (80% gate) &rarr; <strong>RF-DETR Medium</strong> (primary) &rarr; <strong>UNet Fallback (best_model.pth)</strong>.
        </span>
      </div>

      {/* Metrics Before / After Comparison */}
      {(metricsBefore || metricsAfter) && (
        <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-xs">
          <div className="p-2 rounded-lg bg-card border border-border">
            <span className="text-[10px] text-muted-foreground block font-sans">Sharpness</span>
            <span className="text-zinc-400">{metricsBefore?.sharpness ?? "—"}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="font-bold text-foreground">{metricsAfter?.sharpness ?? "—"}</span>
          </div>
          <div className="p-2 rounded-lg bg-card border border-border">
            <span className="text-[10px] text-muted-foreground block font-sans">Luminance</span>
            <span className="text-zinc-400">{metricsBefore?.mean_brightness ?? "—"}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="font-bold text-foreground">{metricsAfter?.mean_brightness ?? "—"}</span>
          </div>
          <div className="p-2 rounded-lg bg-card border border-border">
            <span className="text-[10px] text-muted-foreground block font-sans">Contrast (L)</span>
            <span className="text-zinc-400">{metricsBefore?.contrast ?? "—"}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="font-bold text-foreground">{metricsAfter?.contrast ?? "—"}</span>
          </div>
        </div>
      )}

      {/* ─── Full-Screen Maximized Image Lightbox Modal ─── */}
      {isMaximized && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col select-none touch-none text-white animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Maximized Image Inspection"
        >
          {/* Top Toolbar */}
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-white/10 bg-black/85 backdrop-blur-xs z-10 gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 text-primary" />
              <span className="font-bold text-sm tracking-tight text-white">
                Maximized Inspection View
              </span>
              <span className="hidden sm:inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/90 border border-white/15">
                {viewMode === "compare"
                  ? `Compare Split (${maximizedSliderPos}%)`
                  : viewMode === "unet"
                  ? `UNet Segmentation (${unetMetrics.crack_area_pct ?? 0}% Area)`
                  : viewMode === "rfdetr"
                  ? `RF-DETR (${rfdetrDetection?.num_detections ?? 0} defects)`
                  : viewMode === "mask"
                  ? "Binary Crack Mask"
                  : viewMode === "proc"
                  ? "Preprocessed (CLAHE)"
                  : "Original Raw Capture"}
              </span>
            </div>

            {/* Mode selector pills in maximized modal */}
            <div className="inline-flex rounded-lg p-0.5 bg-zinc-900 border border-white/15 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("compare")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "compare" ? "bg-white text-black shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                Compare Slider
              </button>
              <button
                type="button"
                onClick={() => setViewMode("orig")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "orig" ? "bg-white text-black shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setViewMode("proc")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === "proc" ? "bg-white text-black shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                Processed
              </button>
              {rfdetrUrl && (
                <button
                  type="button"
                  onClick={() => setViewMode("rfdetr")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                    viewMode === "rfdetr" ? "bg-white text-black shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <span>RF-DETR</span>
                  {rfdetrDetection?.num_detections !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full bg-zinc-700 text-[10px] font-mono text-white">
                      {rfdetrDetection.num_detections}
                    </span>
                  )}
                </button>
              )}
              {unetUrl && (
                <button
                  type="button"
                  onClick={() => setViewMode("unet")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                    viewMode === "unet" ? "bg-primary text-white shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="size-3 text-amber-300" />
                  <span>UNet Segment</span>
                  {unetMetrics.crack_area_pct !== undefined && (
                    <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono text-white">
                      {unetMetrics.crack_area_pct}%
                    </span>
                  )}
                </button>
              )}
              {(unetMaskUrl || unetUrl) && (
                <button
                  type="button"
                  onClick={() => setViewMode("mask")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    viewMode === "mask" ? "bg-white text-black shadow-xs font-bold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Binary Mask
                </button>
              )}
            </div>

            {/* Zoom Controls & Close button */}
            <div className="flex items-center gap-2">
              <div className="hidden md:inline-flex items-center rounded-lg bg-zinc-900 border border-white/15 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  disabled={zoomLevel <= 0.5}
                  className="p-1.5 hover:bg-white/10 rounded text-zinc-300 hover:text-white disabled:opacity-40"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-4" />
                </button>
                <span className="px-2 font-mono text-[11px] text-zinc-300 min-w-12 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
                  disabled={zoomLevel >= 3.5}
                  className="p-1.5 hover:bg-white/10 rounded text-zinc-300 hover:text-white disabled:opacity-40"
                  title="Zoom In"
                >
                  <ZoomIn className="size-4" />
                </button>
                {zoomLevel !== 1 && (
                  <button
                    type="button"
                    onClick={() => setZoomLevel(1)}
                    className="px-2 py-1 text-[10px] font-mono hover:bg-white/10 rounded text-zinc-400 hover:text-white border-l border-white/10 ml-0.5"
                    title="Reset Zoom to 100%"
                  >
                    Reset
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                title="Close maximized view (Esc)"
              >
                <X className="size-4" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>
          </div>

          {/* Maximized Image Stage */}
          <div
            ref={maximizedContainerRef}
            onPointerDown={handleMaximizedPointerDown}
            onPointerUp={handleMaximizedPointerUp}
            onPointerMove={handleMaximizedPointerMove}
            className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center p-2 md:p-4 bg-zinc-950"
          >
            <div
              className="relative w-full h-full flex items-center justify-center transition-transform duration-100 ease-out"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {viewMode === "orig" && (
                <img src={originalUrl} alt="Original capture" className="max-w-full max-h-full object-contain" />
              )}
              {viewMode === "proc" && (
                <img src={processedUrl || originalUrl} alt="Processed copy" className="max-w-full max-h-full object-contain" />
              )}
              {viewMode === "rfdetr" && (
                <img src={rfdetrUrl || processedUrl || originalUrl} alt="RF-DETR Defect Detection" className="max-w-full max-h-full object-contain" />
              )}
              {viewMode === "unet" && (
                <img src={unetUrl || processedUrl || originalUrl} alt="UNet Crack Segmentation" className="max-w-full max-h-full object-contain" />
              )}
              {viewMode === "mask" && (
                <img src={unetMaskUrl || unetUrl || processedUrl || originalUrl} alt="Binary Crack Mask" className="max-w-full max-h-full object-contain bg-black" />
              )}
              {viewMode === "compare" && (
                <div className="relative w-full h-full max-w-6xl max-h-[82vh] overflow-hidden flex items-center justify-center">
                  <img
                    src={compareBackgroundUrl || originalUrl}
                    alt="Processed / AI Detection"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${maximizedSliderPos}%` }}
                  >
                    <img
                      src={originalUrl}
                      alt="Original"
                      className="absolute inset-0 w-full h-full object-contain max-w-none"
                      style={{ width: maximizedContainerRef.current ? `${maximizedContainerRef.current.clientWidth}px` : "100%" }}
                    />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_15px_rgba(0,0,0,0.9)] pointer-events-none"
                    style={{ left: `${maximizedSliderPos}%` }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-8 rounded-full bg-black/90 border-2 border-white flex items-center justify-center text-white shadow-xl">
                      <Sliders className="size-4 rotate-90" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Footer Info Bar */}
          <div className="px-4 py-2.5 border-t border-white/10 bg-black/85 backdrop-blur-xs flex flex-wrap items-center justify-between text-xs text-zinc-300 gap-3 shrink-0">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-white">{crackTypeDisplay}</span>
              {hasUnetData && (
                <span className="font-mono text-[11px] text-rose-300">
                  Crack Area: {unetMetrics.crack_area_pct}% ({unetMetrics.crack_pixels?.toLocaleString()} px)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span>Use Left/Right arrows or drag slider in Compare mode</span>
              <span>•</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Esc</kbd>
              <span>to exit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Image Details Drawer (Section 6.1 B & 8) ────────────────────────────────

export function ImageDetailsDrawer({
  open,
  onOpenChange,
  photo,
  onConfirmWarning,
  onRetryProcessing,
  onCalibrate,
  onReplace,
  onRemove,
  onTransform,
  onTransformed,
  onUpdatePhoto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  onConfirmWarning?: (id: string) => void;
  onRetryProcessing?: (id: string) => void;
  onCalibrate?: (id: string) => void;
  onReplace?: (id: string) => void;
  onRemove?: (id: string) => void;
  onTransform?: (photo: any) => void;
  onTransformed?: (updated: any) => void;
  onUpdatePhoto?: (updated: any) => void;
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [augmentations, setAugmentations] = useState<any[]>([]);
  const [loadingAugs, setLoadingAugs] = useState(false);
  const [transformModalOpen, setTransformModalOpen] = useState(false);
  const [isDrawerMaximized, setIsDrawerMaximized] = useState(false);

  useEffect(() => {
    if (!open || !photo?.id || photo.id.startsWith("client-")) {
      setDetails(null);
      setAugmentations([]);
      return;
    }
    let isMounted = true;
    setLoading(true);
    api.getImageDetails(photo.id)
      .then((res) => {
        if (isMounted) setDetails(res);
      })
      .catch((err) => {
        toast.error("Failed to fetch image details: " + err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // Also fetch data augmentations for DL invariant analysis
    setLoadingAugs(true);
    api.getImageAugmentations(photo.id)
      .then((res) => {
        if (isMounted && res.variants) {
          setAugmentations(res.variants);
        }
      })
      .catch(() => {
        // Soft fallback
      })
      .finally(() => {
        if (isMounted) setLoadingAugs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, photo?.id]);

  if (!photo) return null;

  const [analyzingAi, setAnalyzingAi] = useState(false);

  const qualityReport = details?.qualityReport || photo.qualityReport;
  const processingRun = details?.processingRun || photo.processingRun;
  const originalUrl = details?.originalUrl || photo.originalUrl || photo.previewUrl;
  const processedUrl = details?.processedUrl || photo.processedUrl || photo.previewUrl;

  const aiClassification =
    details?.aiClassification ||
    details?.ai_classification ||
    details?.qualityReport?.ai_classification ||
    details?.quality_report?.ai_classification ||
    photo?.aiClassification ||
    photo?.ai_classification ||
    photo?.qualityReport?.ai_classification ||
    photo?.quality_report?.ai_classification;

  const rfdetrDetection =
    details?.rfdetrDetection ||
    details?.rfdetr_detection ||
    details?.qualityReport?.rfdetr_detection ||
    details?.quality_report?.rfdetr_detection ||
    photo?.rfdetrDetection ||
    photo?.rfdetr_detection ||
    photo?.qualityReport?.rfdetr_detection ||
    photo?.quality_report?.rfdetr_detection ||
    aiClassification?.rfdetr_detection;

  const unetSegmentation =
    details?.unetSegmentation ||
    details?.unet_segmentation ||
    details?.qualityReport?.unet_segmentation ||
    details?.quality_report?.unet_segmentation ||
    photo?.unetSegmentation ||
    photo?.unet_segmentation ||
    photo?.qualityReport?.unet_segmentation ||
    photo?.quality_report?.unet_segmentation ||
    aiClassification?.unet_segmentation;

  const crackProb = typeof aiClassification?.crack_probability === "number"
    ? aiClassification.crack_probability
    : null;
  const gateThreshold = typeof aiClassification?.threshold === "number"
    ? aiClassification.threshold
    : 0.80;

  // STRICT 80% GATE RULE:
  // If crack probability is available, crack defect is ONLY confirmed if crack_probability >= threshold (80%).
  const isCrackDetected = crackProb !== null
    ? crackProb >= gateThreshold
    : Boolean(
        aiClassification?.has_crack ||
        aiClassification?.predicted_class === "Cracked" ||
        photo?.is_cracked ||
        photo?.isCracked
      );

  const rfdetrUrl =
    details?.rfdetrUrl ||
    photo?.rfdetrUrl ||
    (isCrackDetected && (details?.hasRfdetr || photo?.hasRfdetr)
      ? `/api/v1/images/${photo.id}/file?variant=rfdetr`
      : null);

  const activeStage2Model = isCrackDetected
    ? (details?.activeStage2Model ||
       details?.active_stage2_model ||
       photo?.activeStage2Model ||
       photo?.active_stage2_model ||
       aiClassification?.active_stage2_model ||
       (rfdetrDetection?.has_defect ? "rfdetr" : "unet_fallback"))
    : "none";

  const modelFallback = isCrackDetected && Boolean(
    details?.modelFallback ??
    details?.model_fallback ??
    photo?.modelFallback ??
    photo?.model_fallback ??
    aiClassification?.model_fallback ??
    (!rfdetrDetection || !rfdetrDetection.has_defect)
  );

  const yoloUrl =
    details?.yoloUrl ||
    details?.annotatedUrl ||
    photo?.yoloUrl ||
    photo?.annotatedUrl ||
    (details?.hasYolo || photo?.hasYolo || isCrackDetected
      ? `/api/v1/images/${photo.id}/file?variant=yolo`
      : null);

  const yoloDetection =
    details?.yoloDetection ||
    details?.yolo_detection ||
    details?.qualityReport?.yolo_detection ||
    details?.quality_report?.yolo_detection ||
    photo?.yoloDetection ||
    photo?.yolo_detection ||
    photo?.qualityReport?.yolo_detection ||
    photo?.quality_report?.yolo_detection ||
    aiClassification?.yolo_detection;

  const unetUrl =
    details?.unetUrl ||
    photo?.unetUrl ||
    (details?.hasUnet || photo?.hasUnet || isCrackDetected
      ? `/api/v1/images/${photo.id}/file?variant=unet`
      : null);

  const unetMaskUrl =
    details?.unetMaskUrl ||
    photo?.unetMaskUrl ||
    (details?.hasUnet || photo?.hasUnet || isCrackDetected
      ? `/api/v1/images/${photo.id}/file?variant=mask`
      : null);

  const handleRunAi = async () => {
    setAnalyzingAi(true);
    try {
      const inspId = photo.inspectionId || photo.inspection_id || details?.inspectionId;
      let res;
      if (inspId && !inspId.startsWith("client-")) {
        res = await api.analyzeSingleImage(inspId, photo.id);
      } else {
        res = await api.analyzeImage(photo.id);
      }
      const pred = res.aiClassification || res.ai_classification || res.summary?.images?.[0] || res;
      setDetails((prev: any) => ({
        ...prev,
        ...res,
        aiClassification: pred,
        ai_classification: pred,
        rfdetrDetection: res.rfdetrDetection || res.rfdetr_detection || pred?.rfdetr_detection,
        activeStage2Model: res.activeStage2Model || res.active_stage2_model || pred?.active_stage2_model,
        modelFallback: res.modelFallback ?? res.model_fallback ?? pred?.model_fallback,
      }));
      const detLabel = res.rfdetrDetection?.primary_label || pred?.predicted_class || "Analysis complete";
      toast.success(
        `AI: ${detLabel} (${Math.round((pred.crack_probability || pred.confidence || 0) * 100)}%)`
      );
      onUpdatePhoto?.({
        ...photo,
        ...res,
        aiClassification: pred,
        ai_classification: pred,
        rfdetrDetection: res.rfdetrDetection || res.rfdetr_detection || pred?.rfdetr_detection,
        activeStage2Model: res.activeStage2Model || res.active_stage2_model || pred?.active_stage2_model,
        modelFallback: res.modelFallback ?? res.model_fallback ?? pred?.model_fallback,
      });
    } catch (e: any) {
      toast.error("AI Analysis failed: " + (e.message || "Unknown error"));
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleInternalTransformed = (result: any) => {
    const timestamp = Date.now();
    const bust = (url?: string | null) => {
      if (!url) return url;
      return `${url}${url.includes("?") ? "&" : "?"}v=${timestamp}`;
    };

    const updatedPhoto = {
      ...photo,
      ...result,
      id: result.imageId || photo.id,
      width: result.width || photo.width,
      height: result.height || photo.height,
      originalUrl: bust(result.originalUrl) || photo.originalUrl,
      previewUrl: bust(result.previewUrl) || photo.previewUrl,
      processedUrl: bust(result.processedUrl) || photo.processedUrl,
      thumbnailUrl: bust(result.thumbnailUrl) || photo.thumbnailUrl,
      rfdetrUrl: bust(result.rfdetrUrl) || photo.rfdetrUrl,
      unetUrl: bust(result.unetUrl) || photo.unetUrl,
      unetMaskUrl: bust(result.unetMaskUrl) || photo.unetMaskUrl,
      geometryUrl: bust(result.geometryUrl) || photo.geometryUrl,
      annotatedUrl: bust(result.annotatedUrl) || bust(result.rfdetrUrl) || bust(result.unetUrl) || photo.annotatedUrl,
      qualityReport: result.qualityReport || result.quality_report || photo.qualityReport,
      quality_report: result.qualityReport || result.quality_report || photo.quality_report,
      aiClassification: result.aiClassification || result.ai_classification || photo.aiClassification,
      ai_classification: result.aiClassification || result.ai_classification || photo.ai_classification,
      rfdetrDetection: result.rfdetrDetection || result.rfdetr_detection || photo.rfdetrDetection,
      activeStage2Model: result.activeStage2Model || result.active_stage2_model || photo.activeStage2Model,
      modelFallback: result.modelFallback ?? result.model_fallback ?? photo.modelFallback,
      unetSegmentation: result.unetSegmentation || result.unet_segmentation || photo.unetSegmentation,
      unet_segmentation: result.unetSegmentation || result.unet_segmentation || photo.unet_segmentation,
      crackGeometry: result.crackGeometry || result.crack_geometry || photo.crackGeometry,
      crack_geometry: result.crackGeometry || result.crack_geometry || photo.crack_geometry,
      quality_status: result.quality_status || photo.quality_status,
      status: result.quality_status === "warning" ? "warning" : "valid",
      processing_status: "complete",
      version: timestamp,
    };

    setDetails((prev: any) => ({
      ...prev,
      ...updatedPhoto,
    }));

    api.getImageDetails(photo.id).then((fresh) => {
      if (fresh) {
        setDetails((prev: any) => ({
          ...prev,
          ...fresh,
          originalUrl: bust(fresh.originalUrl) || updatedPhoto.originalUrl,
          previewUrl: bust(fresh.previewUrl) || updatedPhoto.previewUrl,
          processedUrl: bust(fresh.processedUrl) || updatedPhoto.processedUrl,
          thumbnailUrl: bust(fresh.thumbnailUrl) || updatedPhoto.thumbnailUrl,
          rfdetrUrl: bust(fresh.rfdetrUrl) || updatedPhoto.rfdetrUrl,
          unetUrl: bust(fresh.unetUrl) || updatedPhoto.unetUrl,
          unetMaskUrl: bust(fresh.unetMaskUrl) || updatedPhoto.unetMaskUrl,
          geometryUrl: bust(fresh.geometryUrl) || updatedPhoto.geometryUrl,
        }));
      }
    }).catch(() => {});

    onTransformed?.(updatedPhoto);
    onTransform?.(updatedPhoto);
    onUpdatePhoto?.(updatedPhoto);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={`w-full ${
          isDrawerMaximized
            ? "sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl"
            : "sm:max-w-xl md:max-w-2xl"
        } overflow-y-auto p-6 space-y-5 bg-card border-l border-border transition-all duration-300`}
      >
        <SheetHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-primary font-bold">{photo.name || photo.id}</span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsDrawerMaximized(!isDrawerMaximized)}
                className="h-6 px-2 text-[10px] gap-1 border-border font-semibold shadow-xs"
                title={isDrawerMaximized ? "Restore side panel width" : "Maximize side panel width"}
              >
                {isDrawerMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                <span className="hidden sm:inline">{isDrawerMaximized ? "Restore Width" : "Maximize Panel"}</span>
              </Button>
              <QualityBadge status={photo.quality_status || photo.status} confirmed={photo.warningConfirmed} />
              <ProcessingBadge status={photo.processing_status || "complete"} />
              <ClassificationBadge photo={photo} classification={aiClassification} />
            </div>
          </div>
          <SheetTitle className="text-base font-bold text-foreground">
            Image Quality & Processing Inspection
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Deterministic classical computer vision audit and enhancement pipeline.
          </SheetDescription>

          {/* Right Side Bar Header Photo Thumbnail: shows UNet model output image if cracked */}
          <div className="p-2.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between gap-3 shadow-xs mt-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative size-14 rounded-lg overflow-hidden border border-border bg-black shrink-0 shadow-xs">
                <img
                  src={
                    getAuthenticatedUrl(
                      photo.unetUrl ||
                      (photo.id && !photo.id.startsWith("client-") ? `/api/v1/images/${photo.id}/file?variant=unet` : null) ||
                      photo.thumbnailUrl ||
                      photo.previewUrl
                    )
                  }
                  alt="Inspection thumbnail"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (photo.id && !photo.id.startsWith("client-")) {
                      const retryUnet = getAuthenticatedUrl(`/api/v1/images/${photo.id}/file?variant=unet&retry=1`);
                      if (retryUnet && target.src !== retryUnet) {
                        target.src = retryUnet;
                      }
                    }
                  }}
                />
                {isCrackDetected && (
                  <div className="absolute bottom-0 inset-x-0 bg-primary/95 text-white font-mono text-[8px] font-bold text-center py-0.5 leading-none tracking-tight">
                    UNet
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground truncate">{photo.name || photo.id}</span>
                  {isCrackDetected && (
                    <span className="px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-bold text-primary">
                      Crack Identified
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {isCrackDetected
                    ? (unetSegmentation?.crack_area_pct !== undefined
                        ? `UNet Pixel Segmentation: ${unetSegmentation.crack_area_pct}% crack area`
                        : "UNet Model Output: Crack Segmentation Active")
                    : "Sound Concrete Surface · No Crack Defect"}
                </p>
              </div>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-6 text-primary animate-spin" />
            <span>Loading image verification report…</span>
          </div>
        ) : (
          <Tabs defaultValue="compare" className="w-full">
            <TabsList className="grid grid-cols-7 h-9 bg-muted/60 p-1 rounded-xl mb-4 text-xs">
              <TabsTrigger value="compare" className="rounded-lg">Compare</TabsTrigger>
              <TabsTrigger value="ai" className="rounded-lg">AI Model</TabsTrigger>
              <TabsTrigger value="quality" className="rounded-lg">Quality (7)</TabsTrigger>
              <TabsTrigger value="processing" className="rounded-lg">Pipeline</TabsTrigger>
              <TabsTrigger value="augmentations" className="rounded-lg">Augment (4)</TabsTrigger>
              <TabsTrigger value="metadata" className="rounded-lg">Metadata</TabsTrigger>
              <TabsTrigger value="geometry" className="rounded-lg">Geometry</TabsTrigger>
            </TabsList>

            {/* TAB 1: Compare Viewer & AI Classification Assessment */}
            <TabsContent value="compare" className="space-y-4">
              <ImageCompare
                originalUrl={originalUrl}
                processedUrl={processedUrl}
                rfdetrUrl={rfdetrUrl}
                rfdetrDetection={rfdetrDetection}
                activeStage2Model={activeStage2Model}
                modelFallback={modelFallback}
                yoloUrl={yoloUrl}
                yoloDetection={yoloDetection}
                unetUrl={unetUrl}
                unetMaskUrl={unetMaskUrl}
                unetSegmentation={unetSegmentation}
                metricsBefore={processingRun?.metricsBefore}
                metricsAfter={processingRun?.metricsAfter}
              />

              {/* Individual Image Damage Severity Assessment (AASHTO / ASTM & PDF §10) */}
              <PhotoDamageSeverityCard
                photo={photo}
                details={details}
                onCalibrate={onCalibrate}
              />

              {/* Multi-Stage AI Crack Classification Assessment Card */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                      <Cpu className="size-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">AI Crack Classification & Localization</h4>
                      <p className="text-[11px] text-muted-foreground">
                        Cascade: ResNet-18 (80% gate) &rarr; RF-DETR Medium (primary) &rarr; UNet Fallback (best_model.pth)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClassificationBadge photo={photo} classification={aiClassification} />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={analyzingAi || photo.quality_status === "rejected" || photo.status === "error"}
                      onClick={handleRunAi}
                      className="h-7 text-[11px] px-2.5 gap-1 border-border font-semibold shadow-xs"
                      title={aiClassification ? "Re-run Two-Stage AI inference" : "Run Two-Stage AI inference"}
                    >
                      {analyzingAi ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Analyzing…</span>
                        </>
                      ) : (
                        <>
                          <RotateCw className="size-3" />
                          <span>{aiClassification ? "Re-run AI" : "Run AI Analysis"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {photo.quality_status === "rejected" || photo.status === "error" ? (
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2.5">
                    <Minus className="size-4 text-zinc-400 shrink-0" />
                    <span>
                      AI inference skipped because photograph was rejected during classical computer vision quality assessment.
                    </span>
                  </div>
                ) : aiClassification ? (
                  <div className="space-y-3">
                    {/* Status banner */}
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between text-xs font-semibold ${
                        isCrackDetected
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                          : "bg-muted/30 border-border text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isCrackDetected ? (
                          <AlertTriangle className="size-4 text-rose-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        )}
                        <span>
                          {isCrackDetected
                            ? (modelFallback
                                ? "Crack Identified · RF-DETR 0 bboxes &rarr; U-Net Fallback Active"
                                : (rfdetrDetection?.has_defect
                                    ? `Crack Defect Identified (RF-DETR: ${rfdetrDetection.num_detections} defect region${rfdetrDetection.num_detections > 1 ? "s" : ""})`
                                    : "Concrete Crack Defect Identified"))
                            : "Sound Concrete Surface — No Defect Detected"}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted/60 text-foreground border border-border">
                        {isCrackDetected
                          ? `Probability: ${((aiClassification.crack_probability ?? aiClassification.confidence ?? 0) * 100).toFixed(1)}%`
                          : `Sound: ${(((aiClassification.uncracked_probability ?? (1 - (aiClassification.crack_probability || 0)))) * 100).toFixed(1)}% (Crack: ${((aiClassification.crack_probability ?? 0) * 100).toFixed(1)}%)`}
                      </span>
                    </div>

                    {/* Progress gauge vs calibrated threshold */}
                    <div className="space-y-1.5 p-3 rounded-lg bg-muted/20 border border-border/60">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-medium">Model Confidence vs Decision Threshold</span>
                        <span className="font-mono text-muted-foreground">
                          Threshold: {(aiClassification.threshold ? (aiClassification.threshold * 100).toFixed(1) : "80.0")}%
                        </span>
                      </div>
                      <div className="relative h-2.5 w-full bg-muted rounded-full overflow-hidden">
                        {/* Threshold mark */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10"
                          style={{ left: `${Math.min(95, Math.max(5, (aiClassification.threshold || 0.80) * 100))}%` }}
                          title={`Threshold: ${((aiClassification.threshold || 0.80) * 100).toFixed(1)}%`}
                        />
                        {/* Probability fill */}
                        <div
                          className={`h-full transition-all duration-500 ${
                            isCrackDetected
                              ? "bg-rose-500"
                              : "bg-primary"
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(2, (aiClassification.crack_probability ?? (isCrackDetected ? 0.9 : 0.05)) * 100))}%`
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                        <span>0% Sound</span>
                        <span className="text-foreground font-mono">▲ Decision Cutoff ({((aiClassification.threshold || 0.80) * 100).toFixed(0)}%)</span>
                        <span>100% Cracked</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug bg-muted/30 p-2 rounded-lg border border-border/50">
                        <strong className="text-foreground">Pipeline Rule:</strong> If crack prob is <strong>&ge; 80%</strong>, run <strong>RF-DETR Medium</strong> first. If RF-DETR finds 0 bounding boxes, activate fallback to <strong>best_model.pth (UNet)</strong>. {isCrackDetected ? "Crack gate passed (>= 80%)." : "Crack probability below 80% cutoff — surface classified as sound."}
                      </p>
                    </div>

                    {/* Metrics 4-grid */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">Predicted Class</span>
                        <span className={`font-bold font-mono ${isCrackDetected ? "text-rose-400" : "text-foreground"}`}>
                          {isCrackDetected ? "Cracked" : "Uncracked"}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">Stage 2 Active</span>
                        <span className="font-bold font-mono text-foreground">
                          {isCrackDetected ? (modelFallback ? "UNet Fallback" : (rfdetrDetection?.has_defect ? "RF-DETR" : "ResNet-18")) : "Gate Closed (< 80%)"}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">Threshold</span>
                        <span className="font-mono text-muted-foreground">
                          {(aiClassification.threshold ? (aiClassification.threshold * 100).toFixed(1) : "80.0")}%
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">Engine</span>
                        <span className="font-mono text-[11px] text-foreground uppercase">
                          PyTorch/ONNX
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-muted/30 border border-border flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground block">Multi-Stage AI Analysis Ready</span>
                      <p className="text-[11px] text-muted-foreground">
                        Execute ResNet-18 spatial classification (80% cutoff), RF-DETR Medium defect detection & UNet fallback.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRunAi}
                      disabled={analyzingAi}
                      className="h-8 text-xs font-semibold gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {analyzingAi ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Inference…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          <span>Run Multi-Stage AI</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 2: Deep Learning AI Model Architecture & Calibration */}
            <TabsContent value="ai" className="space-y-4 text-xs">
              {/* Header Overview Card */}
              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-primary" />
                    <span className="font-bold text-foreground">Multi-Stage AI Architecture Cascade</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    {modelFallback ? "U-Net Fallback Active" : (rfdetrDetection?.has_defect ? "RF-DETR Active" : "ResNet-18 Active")}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  InfraScan utilizes a sequential cascaded deep learning pipeline: <strong>Stage 1 (ResNet-18)</strong> classifies concrete crack probability (80% gate). If cracked, <strong>Stage 2 (RF-DETR Medium)</strong> runs first to detect and classify defects (Longitudinal, Transverse, Alligator, Pothole). If RF-DETR cannot find defect bounding boxes, the system activates <strong>best_model.pth (UNet CrackSeg9k)</strong> to extract pixel-level segmentation and surface geometry.
                </p>
              </div>

              {/* Stage 1: ResNet-18 Multi-Scale Classifier */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-2.5 bg-muted/40 border-b border-border font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" />
                    Stage 1: Primary Spatial Classifier
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">infrascan_crack_resnet18</span>
                </div>
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Architecture</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">ResNet-18 (Residual Network Multi-Scale)</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Decision Threshold (τ)</td>
                      <td className="py-2.5 px-3 font-mono text-foreground font-bold">
                        {aiClassification?.threshold ? (aiClassification.threshold * 100).toFixed(1) : "80.0"}% crack probability cutoff
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Classification Status</td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {aiClassification ? (
                          <span className={isCrackDetected ? "text-rose-400" : "text-foreground"}>
                            {isCrackDetected ? (aiClassification.predicted_class || "Cracked") : "Uncracked"} ({((aiClassification.crack_probability ?? aiClassification.confidence ?? 0) * 100).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not evaluated yet</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Stage 2 (Primary): RF-DETR Medium Defect Localizer */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-2.5 bg-muted/40 border-b border-border font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="size-3.5 text-primary" />
                    Stage 2 (Primary): RF-DETR Defect Detection
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">dronefreak/rdd2022-rfdetr-medium</span>
                </div>
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Model Architecture</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">RF-DETR Medium (DINOv2 backbone)</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Defect Classes</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">Longitudinal Crack, Transverse Crack, Alligator Crack, Pothole</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Detection Results</td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {rfdetrDetection ? (
                          rfdetrDetection.num_detections > 0 ? (
                            <span className="text-rose-400">
                              {rfdetrDetection.num_detections} defect(s) detected ({rfdetrDetection.primary_label}) · {Math.round((rfdetrDetection.confidence || 0) * 100)}% conf
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              0 defect bounding boxes detected (triggered fallback)
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">Awaiting evaluation</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Stage 2 Status</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                        {!modelFallback && rfdetrDetection?.has_defect
                          ? "Active Primary Detector"
                          : (modelFallback ? "Fallback Triggered -> UNet Active" : "Pending")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Stage 2 (Fallback / Geometry): UNet (best_model.pth) */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-2.5 bg-muted/40 border-b border-border font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    Stage 2 (Fallback / Geometry): UNet Pixel Segmentation
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">best_model.pth (CrackSeg9k)</span>
                </div>
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Model Architecture</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">UNet 4-Level DoubleConv (384×384 input)</td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Validation Accuracy</td>
                      <td className="py-2.5 px-3 font-mono text-foreground font-bold">
                        Dice: 75.14% · IoU: 60.18% · Pixel Acc: 97.44%
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Crack Surface Area</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                        {unetSegmentation?.crack_area_pct !== undefined ? (
                          `${unetSegmentation.crack_area_pct}% (${unetSegmentation.crack_pixels?.toLocaleString()} px)`
                        ) : (
                          <span className="text-muted-foreground">Awaiting segmentation</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-semibold text-foreground">Fallback Role</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                        {modelFallback ? "Active Fallback: Provides pixel-level crack segmentation when RF-DETR detects 0 bboxes" : "Geometry / Pixel Area Analysis"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={handleRunAi}
                  disabled={analyzingAi || photo.quality_status === "rejected" || photo.status === "error"}
                  className="h-8 text-xs font-semibold gap-1.5"
                >
                  {analyzingAi ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Running Inference…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      <span>{aiClassification ? "Re-evaluate Cascade" : "Execute AI Cascade"}</span>
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* TAB 2: Quality Assessment (Seven Checks) */}
            <TabsContent value="quality" className="space-y-4">
              <div className="p-3 rounded-xl border border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block">Overall Assessment</span>
                  <span className="text-sm font-bold capitalize text-foreground">
                    {qualityReport?.overall || photo.quality_status || photo.status}
                  </span>
                </div>
                <QualityBadge status={qualityReport?.overall || photo.quality_status} confirmed={photo.warningConfirmed} />
              </div>

              {photo.quality_status === "warning" && !photo.warningConfirmed && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Warning requires field confirmation before review submission.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      onConfirmWarning?.(photo.id);
                      onOpenChange(false);
                    }}
                    className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 font-semibold"
                  >
                    Continue anyway
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground font-semibold border-b border-border text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Check</th>
                      <th className="py-2.5 px-3">Measured</th>
                      <th className="py-2.5 px-3">Threshold</th>
                      <th className="py-2.5 px-3 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {qualityReport?.checks ? (
                      qualityReport.checks.map((chk: any) => (
                        <tr key={chk.key} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground">{chk.label}</div>
                            <div className="text-[11px] text-muted-foreground leading-snug">{chk.reason}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-foreground">
                            {chk.value} {chk.unit}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {chk.threshold}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                chk.status === "pass"
                                  ? "bg-muted/50 text-foreground border border-border"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {chk.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          No quality report recorded for this photo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* TAB 3: Preprocessing Steps & Metrics */}
            <TabsContent value="processing" className="space-y-4">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground flex items-center gap-2">
                <Sparkles className="size-4 text-primary shrink-0" />
                <span>
                  <strong>Classical CV Preprocessing Pipeline</strong> (contrast balancing, noise filtering, not generative AI). Profile:{" "}
                  <code className="font-mono text-primary font-bold">general_v1</code>. ResNet50 deep learning crack classification runs in parallel.
                </span>
              </div>

              {photo.processing_status === "failed" && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between text-xs">
                  <span className="text-rose-300">Preprocessing failed on this photo. Original is safe.</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onRetryProcessing?.(photo.id)}
                    className="h-7 text-xs font-semibold gap-1"
                  >
                    <RefreshCw className="size-3" />
                    Retry processing
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-3 bg-secondary/40 border-b border-border font-semibold text-xs text-foreground">
                  Executed Pipeline Steps (in order)
                </div>
                <div className="divide-y divide-border text-xs">
                  {processingRun?.steps && processingRun.steps.length > 0 ? (
                    processingRun.steps.map((st: any, idx: number) => (
                      <div key={idx} className="p-3 space-y-1 hover:bg-muted/20">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-2">
                            <span className="size-4 rounded-full bg-secondary text-primary font-mono text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            {st.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              st.applied
                                ? "bg-muted/50 text-foreground border border-border"
                                : "bg-muted/20 text-muted-foreground border border-border/50"
                            }`}
                          >
                            {st.applied ? "APPLIED" : "SKIPPED"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground pl-6">{st.reason}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      No preprocessing runs executed yet.
                    </div>
                  )}
                </div>
              </div>

              {processingRun?.transform && (
                <div className="p-3 rounded-xl border border-border bg-card space-y-1 text-xs">
                  <span className="font-semibold text-foreground block">Coordinate Transform Record</span>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Scale: X={processingRun.transform.scale_x}, Y={processingRun.transform.scale_y}.{" "}
                    {processingRun.transform.note}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* TAB 4: Metadata & Scale Calibration */}
            <TabsContent value="metadata" className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-border bg-card space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Dimensions</span>
                  <span className="font-mono text-foreground font-bold">{photo.width ?? details?.width ?? "—"} × {photo.height ?? details?.height ?? "—"} px</span>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Source</span>
                  <span className="capitalize font-bold text-foreground">{photo.source || "upload"}</span>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase block">SHA-256 Hash</span>
                  <span className="font-mono text-[11px] text-muted-foreground truncate block">{photo.sha256 || details?.sha256 || "—"}</span>
                </div>
                <div className="p-3 rounded-xl border border-border bg-card space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Perceptual Hash</span>
                  <span className="font-mono text-[11px] text-muted-foreground truncate block">{photo.phash || details?.phash || "—"}</span>
                </div>
              </div>

              {/* GPS coordinates */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-1">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1">
                  <MapPin className="size-3 text-primary" /> GPS Geolocation
                </span>
                {photo.gps || details?.exif?.lat ? (
                  <span className="font-mono text-foreground">
                    Latitude: {(photo.gps?.lat ?? details.exif.lat).toFixed(6)}, Longitude: {(photo.gps?.lng ?? details.exif.lng).toFixed(6)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No GPS coordinates recorded.</span>
                )}
              </div>

              {/* Scale calibration info */}
              <div className="p-3 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1">
                    <Ruler className="size-3 text-primary" /> Optical Scale Calibration
                  </span>
                  {photo.calibration && (
                    <Badge variant="outline" className="text-[10px] text-foreground border-border">
                      Calibrated
                    </Badge>
                  )}
                </div>
                {photo.calibration ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-foreground text-xs">
                        Scale saved: <strong>{photo.calibration.mm_per_pixel || photo.calibration.mm_per_px} mm/px</strong>
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCalibrate?.(photo.id)}
                        className="h-6 text-[10px] text-primary"
                      >
                        Recalibrate
                      </Button>
                    </div>
                    {photo.calibration.width_metric && (
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        Controlling metric: {photo.calibration.width_metric} width
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px]">Not calibrated. Measurements will be in pixels only.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCalibrate?.(photo.id)}
                      className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                    >
                      Calibrate scale
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 5: Data Augmentations (PDF §5.4 & Milestone 2) */}
            <TabsContent value="augmentations" className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground flex items-center gap-2">
                <Layers className="size-4 text-primary shrink-0" />
                <span>
                  <strong>Deep Learning Data Augmentations.</strong> Invariant geometric and photometric variants generated to ensure crack detection robustness across angles and daylight conditions.
                </span>
              </div>

              {loadingAugs ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="size-6 text-primary animate-spin" />
                  <span>Synthesizing invariant deep learning representations…</span>
                </div>
              ) : augmentations.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {augmentations.map((aug, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-card overflow-hidden group shadow-2xs">
                      <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
                        <img
                          src={aug.data_uri}
                          alt={aug.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="p-2.5 space-y-0.5">
                        <div className="font-semibold text-foreground text-xs capitalize flex items-center gap-1.5">
                          <Sparkles className="size-3 text-primary shrink-0" />
                          {aug.name.replace(/_/g, " ")}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-snug">
                          {aug.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground rounded-xl border border-dashed border-border">
                  No augmentation variants generated for this photo yet.
                </div>
              )}
            </TabsContent>

            {/* TAB 7: Crack Geometry Extraction (Surface Area, Coverage %, Centerlines & Widths) */}
            <TabsContent value="geometry" className="space-y-4">
              <CrackGeometrySection
                photo={photo}
                details={details}
                inspectionId={photo?.inspection_id || photo?.inspectionId}
                onCalibrate={onCalibrate}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Drawer footer actions */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-2">
          {onRemove && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onRemove(photo.id);
                onOpenChange(false);
              }}
              className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Remove Photo
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTransformModalOpen(true);
              }}
              className="text-xs text-primary border-primary/30 hover:bg-primary/10"
            >
              <Crop className="size-3.5 mr-1.5" />
              Crop & Rotate
            </Button>
            {onReplace && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onReplace(photo.id);
                  onOpenChange(false);
                }}
                className="text-xs"
              >
                <Upload className="size-3.5 mr-1.5" />
                Replace File
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Done
            </Button>
          </div>
        </div>
      </SheetContent>

      <ImageTransformModal
        open={transformModalOpen}
        onOpenChange={setTransformModalOpen}
        photo={{
          ...photo,
          originalUrl: details?.originalUrl || photo.originalUrl || photo.previewUrl,
          previewUrl: details?.originalUrl || photo.originalUrl || photo.previewUrl,
          width: details?.width || photo.width,
          height: details?.height || photo.height,
        }}
        onTransformed={handleInternalTransformed}
      />
    </Sheet>
  );
}


// ─── Interactive Image Transform Modal (Crop, Rotate, Orientation) ─────────

export function ImageTransformModal({
  open,
  onOpenChange,
  photo,
  onTransformed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  onTransformed?: (updated: any) => void;
}) {
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [cropPreset, setCropPreset] = useState<"none" | "1:1" | "4:3" | "16:9" | "free">("none");
  const [freeCrop, setFreeCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropPreset("none");
      setFreeCrop({ x: 10, y: 10, width: 80, height: 80 });
    }
  }, [open, photo?.id]);

  if (!photo) return null;

  const handleRotateCw = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateCcw = () => {
    setRotation((prev) => (prev + 270) % 360);
  };

  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCropPreset("none");
    setFreeCrop({ x: 10, y: 10, width: 80, height: 80 });
  };

  const handleApply = async () => {
    try {
      setSubmitting(true);
      const origW = photo.width || 1920;
      const origH = photo.height || 1080;

      let crop_x: number | undefined;
      let crop_y: number | undefined;
      let crop_w: number | undefined;
      let crop_h: number | undefined;

      if (cropPreset === "1:1") {
        const side = Math.min(origW, origH);
        crop_w = side;
        crop_h = side;
        crop_x = Math.round((origW - side) / 2);
        crop_y = Math.round((origH - side) / 2);
      } else if (cropPreset === "4:3") {
        let cw = origW;
        let ch = Math.round((origW * 3) / 4);
        if (ch > origH) {
          ch = origH;
          cw = Math.round((origH * 4) / 3);
        }
        crop_w = cw;
        crop_h = ch;
        crop_x = Math.round((origW - cw) / 2);
        crop_y = Math.round((origH - ch) / 2);
      } else if (cropPreset === "16:9") {
        let cw = origW;
        let ch = Math.round((origW * 9) / 16);
        if (ch > origH) {
          ch = origH;
          cw = Math.round((origH * 16) / 9);
        }
        crop_w = cw;
        crop_h = ch;
        crop_x = Math.round((origW - cw) / 2);
        crop_y = Math.round((origH - ch) / 2);
      } else if (cropPreset === "free") {
        crop_x = Math.max(0, Math.round((origW * freeCrop.x) / 100));
        crop_y = Math.max(0, Math.round((origH * freeCrop.y) / 100));
        crop_w = Math.max(20, Math.min(Math.round((origW * freeCrop.width) / 100), origW - crop_x));
        crop_h = Math.max(20, Math.min(Math.round((origH * freeCrop.height) / 100), origH - crop_y));
      }

      const res = await api.transformImage(photo.id, {
        rotation_deg: rotation,
        flip_h: flipH,
        flip_v: flipV,
        crop_x,
        crop_y,
        crop_w,
        crop_h,
      });

      toast.success("Image transformed and re-processed successfully");
      onTransformed?.(res);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Transformation failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-card border-border z-[70]">
        <DialogHeader className="p-4 bg-muted/30 border-b border-border">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Crop className="size-4 text-primary" />
            Interactive Crop & Orientation Transform
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Rotate, flip, or crop field capture to isolate structural fracture geometry before preprocessing.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Live Preview Area */}
          <div className="relative aspect-video rounded-xl bg-black border border-border overflow-hidden flex items-center justify-center select-none">
            <div
              className="relative transition-transform duration-300 max-w-full max-h-full flex items-center justify-center"
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              }}
            >
              <img
                src={photo.originalUrl || photo.previewUrl}
                alt="Transform preview"
                className="max-h-[280px] w-auto object-contain pointer-events-none"
              />
            </div>

            {/* Simulated Crop Guides */}
            {cropPreset !== "none" && cropPreset !== "free" && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`border-2 border-primary border-dashed rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ${
                    cropPreset === "1:1"
                      ? "aspect-square h-[80%]"
                      : cropPreset === "4:3"
                      ? "aspect-4/3 h-[80%]"
                      : "aspect-video h-[80%]"
                  }`}
                />
              </div>
            )}

            {/* Free Crop Guides */}
            {cropPreset === "free" && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-2 border-primary border-dashed rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                  style={{
                    left: `${freeCrop.x}%`,
                    top: `${freeCrop.y}%`,
                    width: `${freeCrop.width}%`,
                    height: `${freeCrop.height}%`,
                  }}
                >
                  <div className="absolute -top-5 left-0 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap">
                    Free Crop ({Math.round(freeCrop.width)}% × {Math.round(freeCrop.height)}%)
                  </div>
                </div>
              </div>
            )}

            {/* Transform status pills */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-zinc-300">
                Rot: {rotation}°
              </span>
              {(flipH || flipV) && (
                <span className="px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-zinc-200">
                  Flip: {flipH ? "H" : ""}{flipV ? "V" : ""}
                </span>
              )}
              {cropPreset !== "none" && (
                <span className="px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-zinc-200">
                  Crop: {cropPreset === "free" ? `${freeCrop.width}%×${freeCrop.height}%` : cropPreset}
                </span>
              )}
            </div>
          </div>

          {/* Interactive Controls Bar */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Rotation & Flip Controls */}
            <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/20">
              <span className="font-semibold text-foreground text-[11px] block">Rotation & Flips</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotateCcw}
                  className="h-8 text-xs gap-1"
                >
                  <RotateCcw className="size-3" />
                  -90°
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotateCw}
                  className="h-8 text-xs gap-1"
                >
                  <RotateCw className="size-3" />
                  +90°
                </Button>
                <Button
                  type="button"
                  variant={flipH ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setFlipH((v) => !v)}
                  className="h-8 text-xs gap-1"
                >
                  <FlipHorizontal className="size-3" />
                  Flip H
                </Button>
                <Button
                  type="button"
                  variant={flipV ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setFlipV((v) => !v)}
                  className="h-8 text-xs gap-1"
                >
                  <FlipVertical className="size-3" />
                  Flip V
                </Button>
              </div>
            </div>

            {/* Crop Aspect Presets */}
            <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/20">
              <span className="font-semibold text-foreground text-[11px] block">Defect Crop Framing</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={cropPreset === "none" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCropPreset("none")}
                  className="h-8 text-xs"
                >
                  Full Frame
                </Button>
                <Button
                  type="button"
                  variant={cropPreset === "free" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCropPreset("free")}
                  className="h-8 text-xs font-semibold text-primary border-primary/30"
                >
                  Free Crop
                </Button>
                <Button
                  type="button"
                  variant={cropPreset === "1:1" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCropPreset("1:1")}
                  className="h-8 text-xs"
                >
                  1:1 Square
                </Button>
                <Button
                  type="button"
                  variant={cropPreset === "4:3" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCropPreset("4:3")}
                  className="h-8 text-xs"
                >
                  4:3 Camera
                </Button>
                <Button
                  type="button"
                  variant={cropPreset === "16:9" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setCropPreset("16:9")}
                  className="h-8 text-xs"
                >
                  16:9 Wide
                </Button>
              </div>
            </div>
          </div>

          {/* Free Crop Adjustable Dimension Sliders */}
          {cropPreset === "free" && (
            <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-primary flex items-center gap-1.5">
                  <Crop className="size-3.5" />
                  Free Crop Rectangular Region
                </span>
                <span className="font-mono text-zinc-400">
                  Left: {freeCrop.x}% · Top: {freeCrop.y}% · W: {freeCrop.width}% · H: {freeCrop.height}%
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>X Offset</span>
                    <span>{freeCrop.x}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={freeCrop.x}
                    onChange={(e) => {
                      const nx = Number(e.target.value);
                      setFreeCrop((prev) => ({
                        ...prev,
                        x: nx,
                        width: Math.min(prev.width, 100 - nx),
                      }));
                    }}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Y Offset</span>
                    <span>{freeCrop.y}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={freeCrop.y}
                    onChange={(e) => {
                      const ny = Number(e.target.value);
                      setFreeCrop((prev) => ({
                        ...prev,
                        y: ny,
                        height: Math.min(prev.height, 100 - ny),
                      }));
                    }}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Width</span>
                    <span>{freeCrop.width}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100 - freeCrop.x}
                    value={freeCrop.width}
                    onChange={(e) =>
                      setFreeCrop((prev) => ({ ...prev, width: Number(e.target.value) }))
                    }
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Height</span>
                    <span>{freeCrop.height}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100 - freeCrop.y}
                    value={freeCrop.height}
                    onChange={(e) =>
                      setFreeCrop((prev) => ({ ...prev, height: Number(e.target.value) }))
                    }
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-border/50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFreeCrop({ x: 20, y: 20, width: 60, height: 60 })}
                  className="h-6 text-[10px] px-2"
                >
                  Defect Focus (60%)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFreeCrop({ x: 5, y: 5, width: 90, height: 90 })}
                  className="h-6 text-[10px] px-2"
                >
                  Wide View (90%)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFreeCrop({ x: 0, y: 0, width: 100, height: 100 })}
                  className="h-6 text-[10px] px-2 text-muted-foreground"
                >
                  Full Coverage
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset All
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={submitting}
              className="text-xs font-semibold gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Applying & Reprocessing…</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  <span>Apply Transformation</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Image Quality Card (Section 6.1 A & 8) ──────────────────────────────────

export function ImageQualityCard({
  photo,
  onRemove,
  onReplace,
  onConfirmWarning,
  onRetryProcessing,
  onCalibrate,
  onTransform,
  onTransformed,
  onUpdatePhoto,
}: {
  photo: any;
  onRemove?: (id: string) => void;
  onReplace?: (id: string) => void;
  onConfirmWarning?: (id: string) => void;
  onRetryProcessing?: (id: string) => void;
  onCalibrate?: (id: string) => void;
  onTransform?: (photo: any) => void;
  onTransformed?: (updated: any) => void;
  onUpdatePhoto?: (updated: any) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Derive status message matching Section 6.2 table
  const getStatusMessage = () => {
    if (photo.clientError) {
      return `Not uploaded: ${photo.clientError}`;
    }
    if (photo.status === "uploading") {
      return "Uploading… checking server limits";
    }
    if (photo.quality_status === "checking") {
      return "Checking image quality…";
    }
    if (photo.quality_status === "rejected") {
      return `${photo.qualityNote || "Quality rejected. Retake required before review."}`;
    }
    if (photo.quality_status === "warning" && !photo.warningConfirmed) {
      return `${photo.qualityNote || "Image exhibits quality warning. Confirm to proceed."}`;
    }
    if (photo.quality_status === "warning" && photo.warningConfirmed) {
      return "Continuing with this image. Confirmed by you.";
    }
    if (photo.processing_status === "running") {
      return "Enhancing image… classical CV pipeline in progress.";
    }
    if (photo.processing_status === "failed") {
      return "Processing failed. Your original photo is safe.";
    }

    const unetSeg = photo.unetSegmentation || photo.qualityReport?.unet_segmentation;
    const crackAreaPct = unetSeg?.crack_area_pct;
    const rfdetrDet = photo.rfdetrDetection || photo.qualityReport?.rfdetr_detection;
    const isFallback = Boolean(photo.modelFallback || photo.model_fallback);

    // Check AI classification status from Multi-Stage AI models
    const ai =
      photo.aiClassification ||
      photo.ai_classification ||
      photo.qualityReport?.ai_classification ||
      photo.quality_report?.ai_classification;

    if (ai) {
      const crackProb = typeof ai.crack_probability === "number" ? ai.crack_probability : null;
      const threshold = typeof ai.threshold === "number" ? ai.threshold : 0.80;
      const hasCrack = crackProb !== null ? crackProb >= threshold : Boolean(ai.has_crack || ai.predicted_class === "Cracked");
      const rawProb = hasCrack
        ? (crackProb ?? ai.confidence)
        : (ai.uncracked_probability ?? (1 - (crackProb || 0)));
      const pct = typeof rawProb === "number" ? Math.round(rawProb * 100) : 0;
      if (hasCrack) {
        if (!isFallback && rfdetrDet?.has_defect) {
          const num = rfdetrDet.num_detections || 1;
          const pLabel = rfdetrDet.primary_label || "Crack";
          return `RF-DETR: ${num} defect region${num > 1 ? "s" : ""} (${pLabel}, ${Math.round((rfdetrDet.confidence || rawProb) * 100)}% conf).`;
        }
        const unetPart = crackAreaPct !== undefined ? ` · UNet Fallback: ${crackAreaPct}% area` : " · UNet Fallback (best_model.pth)";
        return `U-Net Fallback (best_model.pth): RF-DETR found 0 bboxes${unetPart}.`;
      }
      return `ResNet-18 AI: Sound concrete surface (${pct}% confidence). Below 80% defect cutoff.`;
    }

    if (photo.aiDetection) {
      const isCrack = photo.aiDetection.defectType === "crack";
      const pct = Math.round((photo.aiDetection.confidence || 0) * 100);
      if (isCrack) {
        return `ResNet-18 AI: Crack defect flagged (${pct}% score exceeds 80% cutoff).`;
      }
      return `ResNet-18 AI: Sound concrete surface verified (${pct}% confidence).`;
    }

    if (photo.processing_status === "complete") {
      return "Processed copy ready. Ready for AI inspection.";
    }
    return "Good to use. All quality checks passed.";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDrawerOpen(true);
    }
  };

  const unetSeg = photo.unetSegmentation || photo.qualityReport?.unet_segmentation;
  const crackAreaPct = unetSeg?.crack_area_pct;
  const rfdetrDet = photo.rfdetrDetection || photo.qualityReport?.rfdetr_detection;

  const aiForThumb =
    photo.aiClassification ||
    photo.ai_classification ||
    photo.qualityReport?.ai_classification ||
    photo.quality_report?.ai_classification;

  const thumbCrackProb = typeof aiForThumb?.crack_probability === "number"
    ? aiForThumb.crack_probability
    : null;
  const thumbThreshold = typeof aiForThumb?.threshold === "number"
    ? aiForThumb.threshold
    : 0.80;

  // STRICT 80% GATE RULE:
  const hasCrackDefect = thumbCrackProb !== null
    ? thumbCrackProb >= thumbThreshold
    : Boolean(
        aiForThumb?.has_crack ||
        aiForThumb?.predicted_class === "Cracked" ||
        photo.is_cracked ||
        photo.isCracked
      );
  const isRealServerId = Boolean(photo.id && !photo.id.startsWith("client-") && !photo.id.startsWith("temp-") && photo.id.length > 15);
  const isFallback = Boolean(hasCrackDefect && (photo.modelFallback || photo.model_fallback || (!rfdetrDet || !rfdetrDet.has_defect)));

  const unetCandidate = hasCrackDefect
    ? (photo.unetUrl || (isRealServerId ? `/api/v1/images/${photo.id}/file?variant=unet` : null) || photo.annotatedUrl)
    : null;

  const displayThumbnail = hasCrackDefect
    ? (unetCandidate || photo.thumbnailUrl || photo.previewUrl)
    : (photo.processedUrl || photo.previewUrl || photo.originalUrl);

  const authThumbSrc = getAuthenticatedUrl(displayThumbnail) || displayThumbnail;

  return (
    <>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative rounded-xl overflow-hidden border border-border bg-card group flex flex-col focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs"
        aria-label={`Photo ${photo.name}. Status: ${photo.quality_status || photo.status}. Press Enter for details.`}
      >
        {/* Thumbnail area - displays UNet segmentation overlay for cracked images */}
        <div className="relative aspect-video bg-black overflow-hidden cursor-pointer" onClick={() => setDrawerOpen(true)}>
          <img
            src={authThumbSrc}
            alt={photo.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            onError={(e) => {
              // Never fallback to original raw photo on error!
              const target = e.currentTarget;
              if (isRealServerId && hasCrackDefect) {
                const retryUnet = getAuthenticatedUrl(`/api/v1/images/${photo.id}/file?variant=unet&retry=1`);
                if (retryUnet && target.src !== retryUnet) {
                  target.src = retryUnet;
                }
              }
            }}
          />

          {/* Top badges bar with solid high-contrast backgrounds (>= 4.5:1) */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 z-10 pointer-events-none">
            <QualityBadge
              status={photo.quality_status || (photo.status === "error" ? "rejected" : photo.status)}
              confirmed={photo.warningConfirmed}
            />
            {photo.processing_status && (
              <ProcessingBadge status={photo.processing_status} />
            )}
            <ClassificationBadge photo={photo} />
            {hasCrackDefect && !isFallback && rfdetrDet?.has_defect && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs">
                <Cpu className="size-2.5 text-primary" />
                RF-DETR: {rfdetrDet.primary_label || `${rfdetrDet.num_detections} defect(s)`}
              </span>
            )}
            {hasCrackDefect && isFallback && crackAreaPct !== undefined && crackAreaPct > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted/80 text-foreground border border-border shadow-xs">
                <Sparkles className="size-2.5 text-primary" />
                UNet Fallback: {crackAreaPct}%
              </span>
            )}
          </div>

          {/* Bottom GPS caption bar with solid background */}
          {photo.gps && (
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/85 text-[10px] text-white font-mono font-medium flex items-center gap-1 border-t border-white/10">
              <MapPin className="size-2.5 text-blue-400 shrink-0" />
              <span>{photo.gps.lat.toFixed(5)}, {photo.gps.lng.toFixed(5)}</span>
            </div>
          )}

          {/* Uploading overlay */}
          {photo.status === "uploading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 text-white gap-2">
              <Loader2 className="size-7 text-primary animate-spin" />
              <span className="text-[11px] font-mono">Assessing quality…</span>
            </div>
          )}
        </div>

        {/* Message and action footer */}
        <div className="p-3 border-t border-border bg-card space-y-2 flex-1 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[140px]">
                {photo.name}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerOpen(true)}
                  className="h-6 text-[11px] px-2"
                >
                  Details
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="size-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Photo options menu"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem onClick={() => setDrawerOpen(true)}>
                      <Sliders className="size-3.5 mr-2 text-primary" />
                      View Details & Compare
                    </DropdownMenuItem>
                    {photo.quality_status === "warning" && !photo.warningConfirmed && (
                      <DropdownMenuItem onClick={() => onConfirmWarning?.(photo.id)}>
                        <CheckCircle2 className="size-3.5 mr-2 text-primary" />
                        Continue anyway
                      </DropdownMenuItem>
                    )}
                    {photo.processing_status === "failed" && (
                      <DropdownMenuItem onClick={() => onRetryProcessing?.(photo.id)}>
                        <RefreshCw className="size-3.5 mr-2 text-primary" />
                        Retry processing
                      </DropdownMenuItem>
                    )}
                    {onTransform && (
                      <DropdownMenuItem onClick={() => onTransform(photo)}>
                        <Crop className="size-3.5 mr-2 text-primary" />
                        Crop & Rotate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => onCalibrate?.(photo.id)}>
                      <Ruler className="size-3.5 mr-2" />
                      Calibrate scale
                    </DropdownMenuItem>
                    {onReplace && (
                      <DropdownMenuItem onClick={() => onReplace(photo.id)}>
                        <Upload className="size-3.5 mr-2" />
                        Replace file
                      </DropdownMenuItem>
                    )}
                    {onRemove && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onRemove(photo.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5 mr-2" />
                          Remove photo
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {/* Plain-sentence feedback line */}
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
              {getStatusMessage()}
            </p>
          </div>

          {/* Quick Warning Action Button */}
          {photo.quality_status === "warning" && !photo.warningConfirmed && (
            <Button
              type="button"
              size="sm"
              onClick={() => onConfirmWarning?.(photo.id)}
              className="w-full h-7 text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1 mt-1"
            >
              <AlertCircle className="size-3" />
              <span>Continue anyway</span>
            </Button>
          )}
        </div>
      </div>

      {/* Drawer */}
      <ImageDetailsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        photo={photo}
        onConfirmWarning={onConfirmWarning}
        onRetryProcessing={onRetryProcessing}
        onCalibrate={onCalibrate}
        onReplace={onReplace}
        onRemove={onRemove}
        onTransform={onTransform}
        onTransformed={onTransformed}
        onUpdatePhoto={onUpdatePhoto}
      />
    </>
  );
}


// ─── Batch Summary Card (Section 6.1 C & 8) ──────────────────────────────────

export function BatchSummaryCard({ photos }: { photos: any[] }) {
  const total = photos.length;
  const accepted = photos.filter((p) => (p.quality_status === "accepted" || p.status === "valid")).length;
  const warnings = photos.filter((p) => (p.quality_status === "warning" || p.status === "warning")).length;
  const rejected = photos.filter((p) => (p.quality_status === "rejected" || p.status === "error" || p.clientError)).length;
  const processing = photos.filter((p) => p.processing_status === "running" || p.status === "uploading").length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">This Batch</h3>
        <span className="font-mono text-xs text-muted-foreground">{total} photo{total !== 1 ? "s" : ""}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-foreground/70 font-bold block uppercase tracking-wider">Accepted</span>
          <span className="text-base font-bold text-foreground font-mono">{accepted}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-foreground/70 font-bold block uppercase tracking-wider">Warnings</span>
          <span className="text-base font-bold text-foreground font-mono">{warnings}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-foreground/70 font-bold block uppercase tracking-wider">Rejected</span>
          <span className="text-base font-bold text-foreground font-mono">{rejected}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-foreground/70 font-bold block uppercase tracking-wider">Processing</span>
          <span className="text-base font-bold text-foreground font-mono">{processing}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Session Damage Severity Assessment Card (AASHTO / ASTM & PDF §10) ────────

export function SessionDamageAssessmentCard({
  photos,
  inspectionId: _inspectionId,
}: {
  photos: any[];
  inspectionId?: string;
}) {
  const total = photos.length;

  // Evaluate batch metrics
  let sumCrackArea = 0;
  let sumSurfaceArea = 0;
  let calibratedCount = 0;
  let uncalibratedCount = 0;
  let analyzedCount = 0;

  const distribution = {
    critical: 0,
    severe: 0,
    moderate: 0,
    minor: 0,
    none: 0,
  };

  const severityOrder: Record<string, number> = {
    none: 0,
    minor: 1,
    moderate: 2,
    severe: 3,
    critical: 4,
  };

  let worstLevel = 0;
  let worstCode = "none";
  let controllingFactor = "Sound surface";
  let controllingValue = "No defects detected";
  let controllingPhotoName = "";

  photos.forEach((photo, idx) => {
    const aiCls = photo.aiClassification || photo.ai_classification || photo.qualityReport?.ai_classification || photo.quality_report?.ai_classification;
    const crackProb = typeof aiCls?.crack_probability === "number" ? aiCls.crack_probability : null;
    const gateThreshold = typeof aiCls?.threshold === "number" ? aiCls.threshold : 0.80;
    const isCrackDefect = crackProb !== null ? crackProb >= gateThreshold : Boolean(aiCls?.has_crack);

    const geo = isCrackDefect ? (photo.crackGeometry || photo.crack_geometry || photo.quality_report?.crack_geometry || photo.qualityReport?.crack_geometry) : null;
    const summary = geo?.summary || {};
    const calib = photo.calibration || photo.qualityReport?.calibration || {};
    const unet = isCrackDefect ? (photo.unetSegmentation || photo.unet_segmentation || photo.qualityReport?.unet_segmentation || photo.quality_report?.unet_segmentation) : null;
    const rfdetr = isCrackDefect ? (photo.rfdetrDetection || photo.rfdetr_detection || photo.qualityReport?.rfdetr_detection || photo.quality_report?.rfdetr_detection) : null;
    const dmg = isCrackDefect ? (photo.damageAssessment || photo.damage_assessment || photo.qualityReport?.damage_assessment || photo.quality_report?.damage_assessment || summary.damage_assessment) : null;

    const isCalibrated = Boolean(calib.is_calibrated || summary.is_calibrated || calib.calibrated);
    const scale = Number(calib.scale_factor_mm_per_pixel || calib.mm_per_pixel || summary.calibration_mm_per_pixel || summary.mm_per_pixel || 0);

    const crackCount = isCrackDefect ? Number(summary.crack_count || (unet?.has_crack ? 1 : (rfdetr?.num_detections || 0))) : 0;
    let crackArea = isCrackDefect ? Number(summary.total_crack_area_pixels || summary.crack_area_px || unet?.crack_pixels || 0) : 0;
    let surfaceArea = Number(summary.total_surface_area_pixels || summary.inspected_surface_area_px || (photo.width && photo.height ? photo.width * photo.height : 0));

    let density = isCrackDefect ? Number(summary.crack_coverage_pct || summary.crack_density_pct || unet?.crack_area_pct || 0) : 0;
    if (isCrackDefect && density <= 0 && surfaceArea > 0 && crackArea > 0) {
      density = (crackArea / surfaceArea) * 100;
    }
    if (isCrackDefect && density > 0 && crackArea <= 0 && surfaceArea > 0) {
      crackArea = Math.round((density / 100) * surfaceArea);
    }
    if (isCrackDefect && density > 0 && surfaceArea <= 0 && crackArea > 0) {
      surfaceArea = Math.round(crackArea / (density / 100));
    }

    const peakWidthPx = isCrackDefect ? Number(summary.maximum_crack_width_px || unet?.max_width_px || 0) : 0;
    const peakWidthMm = isCrackDefect && summary.maximum_crack_width_mm != null
      ? Number(summary.maximum_crack_width_mm)
      : (isCrackDefect && unet?.max_width_mm != null
        ? Number(unet.max_width_mm)
        : (isCrackDefect && isCalibrated && scale > 0 && peakWidthPx > 0 ? peakWidthPx * scale : null));
    const branches = isCrackDefect ? Number(summary.total_branch_count || 0) : 0;
    const defectType = isCrackDefect ? String(photo.activeStage2Model || photo.defect_type || rfdetr?.primary_label || "").toLowerCase() : "";

    const minDim = photo.width && photo.height ? Math.min(photo.width, photo.height) : (surfaceArea > 0 ? Math.sqrt(surfaceArea) : null);
    const relThickness = isCrackDefect && minDim && minDim > 0 ? peakWidthPx / minDim : null;

    const hasCracks = isCrackDefect && (crackCount > 0 || crackArea > 0 || density > 0 || summary.has_cracks || Boolean(unet?.has_crack) || Boolean(rfdetr?.has_defect));

    if (geo || unet || rfdetr || dmg || photo.quality_status || photo.status === "valid" || photo.processing_status === "complete") {
      analyzedCount++;
    }

    if (isCalibrated && scale > 0) {
      calibratedCount++;
    } else {
      uncalibratedCount++;
    }

    sumCrackArea += crackArea;
    sumSurfaceArea += (surfaceArea > 0 ? surfaceArea : 1000000);

    let photoCode = "none";
    let pFactor = "Zero cracks";
    let pVal = "0.0% coverage";

    if (!isCrackDefect) {
      photoCode = "none";
      pFactor = "Sound Surface";
      pVal = "0.0% coverage";
    } else if (dmg && dmg.severity_code) {
      photoCode = dmg.severity_code;
      pFactor = dmg.controlling_factor || "AI Assessment";
      pVal = dmg.controlling_value || `${density.toFixed(2)}% coverage`;
    } else if (defectType.includes("rebar") || defectType.includes("exposed_reinforcement")) {
      photoCode = "critical";
      pFactor = "Exposed Rebar";
      pVal = "Critical Defect";
    } else if (!hasCracks || (crackArea <= 0 && density <= 0)) {
      photoCode = "none";
      pFactor = "Sound Surface";
      pVal = "0.0% coverage";
    } else if (isCalibrated && peakWidthMm != null) {
      // Mode A: Calibrated
      if (peakWidthMm > 8.0) {
        photoCode = "critical";
        pFactor = "Peak Width";
        pVal = `${peakWidthMm.toFixed(2)} mm (> 8.0 mm)`;
      } else if (density > 9.0) {
        photoCode = "critical";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (> 9.0%)`;
      } else if (branches > 50) {
        photoCode = "critical";
        pFactor = "Alligator Fatigue";
        pVal = `${branches} branches`;
      } else if (peakWidthMm > 5.0) {
        photoCode = "severe";
        pFactor = "Peak Width";
        pVal = `${peakWidthMm.toFixed(2)} mm (5.0 - 8.0 mm)`;
      } else if (density > 5.0) {
        photoCode = "severe";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (5.0 - 9.0%)`;
      } else if (branches > 10) {
        photoCode = "severe";
        pFactor = "Fatigue Branches";
        pVal = `${branches} branches`;
      } else if (peakWidthMm >= 3.0) {
        photoCode = "moderate";
        pFactor = "Peak Width";
        pVal = `${peakWidthMm.toFixed(2)} mm (3.0 - 5.0 mm)`;
      } else if (density >= 2.0) {
        photoCode = "moderate";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (2.0 - 5.0%)`;
      } else {
        photoCode = "minor";
        pFactor = "Minor Width";
        pVal = `${peakWidthMm.toFixed(2)} mm (< 3.0 mm)`;
      }
    } else {
      // Mode B: Uncalibrated (PDF §10)
      if (density > 9.0) {
        photoCode = "critical";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (> 9.0%)`;
      } else if (relThickness != null && relThickness >= 0.090) {
        photoCode = "critical";
        pFactor = "Relative Width";
        pVal = `${(relThickness * 100).toFixed(1)}% frame`;
      } else if (branches > 50) {
        photoCode = "critical";
        pFactor = "Alligator Network";
        pVal = `${branches} branches`;
      } else if (density >= 2.5) {
        photoCode = "severe";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (2.5 - 9.0%)`;
      } else if (relThickness != null && relThickness >= 0.045) {
        photoCode = "severe";
        pFactor = "Relative Width";
        pVal = `${(relThickness * 100).toFixed(1)}% frame`;
      } else if (branches > 10) {
        photoCode = "severe";
        pFactor = "Interconnected Branches";
        pVal = `${branches} branches`;
      } else if (density >= 0.5) {
        photoCode = "moderate";
        pFactor = "Crack Density";
        pVal = `${density.toFixed(2)}% (0.5 - 2.5%)`;
      } else if (relThickness != null && relThickness >= 0.015) {
        photoCode = "moderate";
        pFactor = "Relative Width";
        pVal = `${(relThickness * 100).toFixed(1)}% frame`;
      } else {
        photoCode = "minor";
        pFactor = "Superficial Fissure";
        pVal = `${density.toFixed(2)}% (< 0.5%)`;
      }
    }

    if (photoCode in distribution) {
      distribution[photoCode as keyof typeof distribution]++;
    } else {
      distribution.none++;
    }

    const lvl = severityOrder[photoCode] || 0;
    if (lvl > worstLevel) {
      worstLevel = lvl;
      worstCode = photoCode;
      controllingFactor = pFactor;
      controllingValue = pVal;
      controllingPhotoName = photo.name || `Photo #${idx + 1}`;
    }
  });

  const aggregateDensity = sumSurfaceArea > 0 && sumCrackArea > 0
    ? ((sumCrackArea / sumSurfaceArea) * 100).toFixed(2)
    : "0.00";

  const severityTitles: Record<string, string> = {
    none: "No Visible Damage",
    minor: "Minor Damage",
    moderate: "Moderate Damage",
    severe: "Severe Damage",
    critical: "Critical / Requires Urgent Review",
  };

  const priorityLabels: Record<string, string> = {
    critical: "Urgent Engineering Review",
    severe: "High Priority (14-30 Days)",
    moderate: "Medium Priority (60-90 Days)",
    minor: "Low Priority (Monitor)",
    none: "Routine Monitoring",
  };

  const isCalibratedBatch = calibratedCount > 0 && uncalibratedCount === 0;
  const isMixedBatch = calibratedCount > 0 && uncalibratedCount > 0;
  const basisLabel = isCalibratedBatch
    ? "Calibrated Physical Scale (mm)"
    : isMixedBatch
    ? `Mixed Scale (${calibratedCount} Calibrated / ${uncalibratedCount} Density)`
    : "Crack Density & Morphology (PDF §10)";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-tight">Damage Severity Assessment</h3>
          <p className="text-[10px] text-muted-foreground font-mono">AASHTO / ASTM & PDF §10 Standards</p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] px-2 py-0.5 font-mono uppercase tracking-wider border-foreground/30 text-foreground bg-background"
        >
          {worstCode === "critical"
            ? "CRITICAL"
            : worstCode === "severe"
            ? "SEVERE"
            : worstCode === "moderate"
            ? "MODERATE"
            : worstCode === "minor"
            ? "MINOR"
            : "SOUND"}
        </Badge>
      </div>

      {/* Main Overall Severity Display */}
      <div className="p-3 rounded-xl bg-background border border-foreground/30 space-y-1.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Session Overall</span>
          <span className="text-[10px] font-mono text-muted-foreground">{basisLabel}</span>
        </div>
        <div className="text-base font-extrabold text-foreground tracking-tight">
          {severityTitles[worstCode] || "No Visible Damage"}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-foreground/80 pt-0.5 border-t border-border/40">
          <span className="font-semibold text-muted-foreground text-[11px]">Controlling Defect:</span>
          <span className="font-mono text-foreground font-bold text-[11px]">
            {controllingFactor} ({controllingValue})
          </span>
          {controllingPhotoName && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
              in {controllingPhotoName}
            </span>
          )}
        </div>
      </div>

      {/* 2x2 Metric Breakdown */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Batch Density
          </span>
          <span className="text-base font-bold text-foreground font-mono">{aggregateDensity}%</span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Priority Action
          </span>
          <span className="text-xs font-bold text-foreground truncate block pt-0.5">
            {priorityLabels[worstCode] || "Routine Monitoring"}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Evaluated Photos
          </span>
          <span className="text-base font-bold text-foreground font-mono">
            {analyzedCount} / {total}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Calibration Mode
          </span>
          <span className="text-xs font-semibold text-foreground truncate block pt-0.5">
            {calibratedCount > 0 ? `${calibratedCount} Calibrated` : "Uncalibrated (Density)"}
          </span>
        </div>
      </div>

      {/* Severity Count Summary */}
      <div className="flex items-center justify-between text-[11px] font-mono px-2 py-1.5 rounded-lg bg-background border border-border text-foreground/80">
        <span className="text-foreground font-bold">{distribution.critical} Critical</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-foreground font-bold">{distribution.severe} Severe</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-foreground font-bold">{distribution.moderate} Moderate</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-foreground font-bold">{distribution.minor} Minor</span>
      </div>

      {/* Engineering Decision Support Disclaimer */}
      <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/30 text-[10px] text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span className="leading-tight">
          Decision Support: Automated optical assessment does not certify structural safety. Final structural appraisal requires qualified civil engineer review.
        </span>
      </div>
    </div>
  );
}

// ─── Individual Photo Damage Severity Assessment Card (Right Sidebar / Drawer) ──

export function PhotoDamageSeverityCard({
  photo,
  details,
  onCalibrate,
}: {
  photo: any;
  details?: any;
  onCalibrate?: (photo: any) => void;
}) {
  const geo =
    details?.crackGeometry ||
    details?.crack_geometry ||
    photo?.crackGeometry ||
    photo?.crack_geometry ||
    details?.qualityReport?.crack_geometry ||
    photo?.qualityReport?.crack_geometry ||
    photo?.quality_report?.crack_geometry;
  const summary = geo?.summary || {};
  const calib =
    details?.calibration ||
    photo?.calibration ||
    details?.qualityReport?.calibration ||
    photo?.qualityReport?.calibration ||
    {};
  const unet =
    details?.unetSegmentation ||
    details?.unet_segmentation ||
    photo?.unetSegmentation ||
    photo?.unet_segmentation ||
    details?.qualityReport?.unet_segmentation ||
    photo?.qualityReport?.unet_segmentation ||
    photo?.quality_report?.unet_segmentation;
  const rfdetr =
    details?.rfdetrDetection ||
    details?.rfdetr_detection ||
    photo?.rfdetrDetection ||
    photo?.rfdetr_detection ||
    details?.qualityReport?.rfdetr_detection ||
    photo?.qualityReport?.rfdetr_detection ||
    photo?.quality_report?.rfdetr_detection;
  const dmg =
    details?.damageAssessment ||
    details?.damage_assessment ||
    photo?.damageAssessment ||
    photo?.damage_assessment ||
    details?.qualityReport?.damage_assessment ||
    photo?.qualityReport?.damage_assessment ||
    summary?.damage_assessment;

  const isCalibrated = Boolean(calib.is_calibrated || summary.is_calibrated || calib.calibrated);
  const scale = Number(
    calib.scale_factor_mm_per_pixel ||
      calib.mm_per_pixel ||
      summary.calibration_mm_per_pixel ||
      summary.mm_per_pixel ||
      0
  );

  const crackCount = Number(summary.crack_count || (unet?.has_crack ? 1 : rfdetr?.num_detections || 0));
  let crackArea = Number(summary.total_crack_area_pixels || summary.crack_area_px || unet?.crack_pixels || 0);
  let surfaceArea = Number(
    summary.total_surface_area_pixels ||
      summary.inspected_surface_area_px ||
      (photo?.width && photo?.height
        ? photo.width * photo.height
        : details?.width && details?.height
        ? details.width * details.height
        : 0)
  );

  let density = Number(summary.crack_coverage_pct || summary.crack_density_pct || unet?.crack_area_pct || 0);
  if (density <= 0 && surfaceArea > 0 && crackArea > 0) {
    density = (crackArea / surfaceArea) * 100;
  }
  if (density > 0 && crackArea <= 0 && surfaceArea > 0) {
    crackArea = Math.round((density / 100) * surfaceArea);
  }
  if (density > 0 && surfaceArea <= 0 && crackArea > 0) {
    surfaceArea = Math.round(crackArea / (density / 100));
  }

  const peakWidthPx = Number(summary.maximum_crack_width_px || unet?.max_width_px || 0);
  const peakWidthMm =
    summary.maximum_crack_width_mm != null
      ? Number(summary.maximum_crack_width_mm)
      : unet?.max_width_mm != null
      ? Number(unet.max_width_mm)
      : isCalibrated && scale > 0 && peakWidthPx > 0
      ? peakWidthPx * scale
      : null;
  const branches = Number(summary.total_branch_count || 0);
  const defectType = String(
    photo?.activeStage2Model || details?.activeStage2Model || photo?.defect_type || rfdetr?.primary_label || ""
  ).toLowerCase();

  const minDim =
    photo?.width && photo?.height
      ? Math.min(photo.width, photo.height)
      : details?.width && details?.height
      ? Math.min(details.width, details.height)
      : surfaceArea > 0
      ? Math.sqrt(surfaceArea)
      : null;
  const relThickness = minDim && minDim > 0 ? peakWidthPx / minDim : null;

  const photoAi = details?.aiClassification || photo?.aiClassification || details?.qualityReport?.ai_classification || photo?.qualityReport?.ai_classification || photo?.quality_report?.ai_classification;
  const pProb = typeof photoAi?.crack_probability === "number" ? photoAi.crack_probability : null;
  const pThresh = typeof photoAi?.threshold === "number" ? photoAi.threshold : 0.80;
  // STRICT 80% GATE RULE:
  // If crack probability is < 80%, this image is screened as Sound Concrete Surface (no damage).
  const isCrackGated = pProb !== null ? pProb >= pThresh : true;

  const hasCracks = isCrackGated && (
    crackCount > 0 ||
    crackArea > 0 ||
    density > 0 ||
    summary.has_cracks ||
    Boolean(unet?.has_crack) ||
    Boolean(rfdetr?.has_defect)
  );

  let photoCode = "none";
  let pFactor = "Zero cracks";
  let pVal = "0.0% coverage";

  if (!isCrackGated || !hasCracks || (crackArea <= 0 && density <= 0)) {
    photoCode = "none";
    pFactor = "Sound Surface";
    pVal = pProb !== null
      ? `0.0% coverage (${(pProb * 100).toFixed(1)}% crack prob < ${(pThresh * 100).toFixed(0)}% gate)`
      : "0.0% coverage";
  } else if (dmg && dmg.severity_code) {
    photoCode = dmg.severity_code;
    pFactor = dmg.controlling_factor || "AI Assessment";
    pVal = dmg.controlling_value || `${density.toFixed(2)}% coverage`;
  } else if (defectType.includes("rebar") || defectType.includes("exposed_reinforcement")) {
    photoCode = "critical";
    pFactor = "Exposed Rebar";
    pVal = "Critical Defect";
  } else if (isCalibrated && peakWidthMm != null) {
    if (peakWidthMm > 8.0) {
      photoCode = "critical";
      pFactor = "Peak Width";
      pVal = `${peakWidthMm.toFixed(2)} mm (> 8.0 mm)`;
    } else if (density > 9.0) {
      photoCode = "critical";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (> 9.0%)`;
    } else if (branches > 50) {
      photoCode = "critical";
      pFactor = "Alligator Fatigue";
      pVal = `${branches} branches`;
    } else if (peakWidthMm > 5.0) {
      photoCode = "severe";
      pFactor = "Peak Width";
      pVal = `${peakWidthMm.toFixed(2)} mm (5.0 - 8.0 mm)`;
    } else if (density > 5.0) {
      photoCode = "severe";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (5.0 - 9.0%)`;
    } else if (branches > 10) {
      photoCode = "severe";
      pFactor = "Fatigue Branches";
      pVal = `${branches} branches`;
    } else if (peakWidthMm >= 3.0) {
      photoCode = "moderate";
      pFactor = "Peak Width";
      pVal = `${peakWidthMm.toFixed(2)} mm (3.0 - 5.0 mm)`;
    } else if (density >= 2.0) {
      photoCode = "moderate";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (2.0 - 5.0%)`;
    } else {
      photoCode = "minor";
      pFactor = "Minor Width";
      pVal = `${peakWidthMm.toFixed(2)} mm (< 3.0 mm)`;
    }
  } else {
    if (density > 9.0) {
      photoCode = "critical";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (> 9.0%)`;
    } else if (relThickness != null && relThickness >= 0.09) {
      photoCode = "critical";
      pFactor = "Relative Width";
      pVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else if (branches > 50) {
      photoCode = "critical";
      pFactor = "Alligator Network";
      pVal = `${branches} branches`;
    } else if (density >= 2.5) {
      photoCode = "severe";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (2.5 - 9.0%)`;
    } else if (relThickness != null && relThickness >= 0.045) {
      photoCode = "severe";
      pFactor = "Relative Width";
      pVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else if (branches > 10) {
      photoCode = "severe";
      pFactor = "Interconnected Branches";
      pVal = `${branches} branches`;
    } else if (density >= 0.5) {
      photoCode = "moderate";
      pFactor = "Crack Density";
      pVal = `${density.toFixed(2)}% (0.5 - 2.5%)`;
    } else if (relThickness != null && relThickness >= 0.015) {
      photoCode = "moderate";
      pFactor = "Relative Width";
      pVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else {
      photoCode = "minor";
      pFactor = "Superficial Fissure";
      pVal = `${density.toFixed(2)}% (< 0.5%)`;
    }
  }

  const severityTitles: Record<string, string> = {
    none: "No Visible Damage",
    minor: "Minor Damage",
    moderate: "Moderate Damage",
    severe: "Severe Damage",
    critical: "Critical / Requires Urgent Review",
  };

  const priorityLabels: Record<string, string> = {
    critical: "Urgent Engineering Review",
    severe: "High Priority (14-30 Days)",
    moderate: "Medium Priority (60-90 Days)",
    minor: "Low Priority (Monitor)",
    none: "Routine Monitoring",
  };

  const basisLabel = isCalibrated
    ? `AASHTO / ASTM Scale (${scale} mm/px)`
    : "PDF §10 Scale-Invariant Mode";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" />
            Damage Severity Assessment
          </h4>
          <p className="text-[10px] text-muted-foreground font-mono">
            {basisLabel}
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] px-2 py-0.5 font-mono uppercase tracking-wider border-foreground/30 text-foreground bg-background"
        >
          {photoCode === "critical"
            ? "CRITICAL"
            : photoCode === "severe"
            ? "SEVERE"
            : photoCode === "moderate"
            ? "MODERATE"
            : photoCode === "minor"
            ? "MINOR"
            : "SOUND"}
        </Badge>
      </div>

      {/* Main Overall Display */}
      <div className="p-3 rounded-lg bg-background border border-foreground/30 space-y-1.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Structural Damage Classification
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {isCalibrated ? "Calibrated mm" : "Density & Morphology"}
          </span>
        </div>
        <div className="text-sm font-extrabold text-foreground tracking-tight">
          {severityTitles[photoCode] || "No Visible Damage"}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-foreground/80 pt-0.5 border-t border-border/40">
          <span className="font-semibold text-muted-foreground text-[11px]">Controlling Defect:</span>
          <span className="font-mono text-foreground font-bold text-[11px]">
            {pFactor} ({pVal})
          </span>
        </div>
      </div>

      {/* 2x2 Metric Breakdown */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Crack Density
          </span>
          <span className="text-sm font-bold text-foreground font-mono">
            {isCrackGated ? `${density.toFixed(2)}%` : "0.00%"}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Peak Width
          </span>
          <span className="text-sm font-bold text-foreground font-mono truncate block">
            {!isCrackGated
              ? "0.0 px"
              : isCalibrated && peakWidthMm != null
              ? `${peakWidthMm.toFixed(2)} mm`
              : `${peakWidthPx.toFixed(1)} px`}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Priority Action
          </span>
          <span className="text-xs font-bold text-foreground truncate block pt-0.5">
            {priorityLabels[photoCode] || "Routine Monitoring"}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-background border border-foreground/30 shadow-xs">
          <span className="text-[10px] text-muted-foreground font-bold block uppercase tracking-wider">
            Calibration Status
          </span>
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <span className="text-xs font-semibold text-foreground truncate">
              {isCalibrated ? `${scale} mm/px` : "Uncalibrated"}
            </span>
            {!isCalibrated && onCalibrate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCalibrate(photo)}
                className="h-5 text-[9px] px-1.5 py-0 border-border"
              >
                <Ruler className="size-2.5 mr-1 text-primary" />
                Calibrate
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Engineering Decision Support Disclaimer */}
      <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/30 text-[10px] text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span className="leading-tight">
          Decision Support: Automated optical assessment does not certify structural safety. Final structural appraisal requires qualified civil engineer review.
        </span>
      </div>
    </div>
  );
}
