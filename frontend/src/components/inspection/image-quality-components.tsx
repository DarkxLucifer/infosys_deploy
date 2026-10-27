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
import { api } from "@/lib/api";
import { toast } from "sonner";

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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-xs">
          <CheckCircle2 className="size-3 text-emerald-400" />
          <span>Accepted</span>
        </span>
      );
    case "warning":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-500/40 shadow-xs">
          <AlertCircle className="size-3 text-amber-400" />
          <span>{confirmed ? "Warning (confirmed)" : "Warning"}</span>
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/40 shadow-xs">
          <XCircle className="size-3 text-rose-400" />
          <span>Rejected</span>
        </span>
      );
    case "checking":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-950/90 text-sky-300 border border-sky-500/40 shadow-xs">
          <Loader2 className="size-3 text-sky-400 animate-spin" />
          <span>Checking</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-900/90 text-zinc-300 border border-zinc-700/50 shadow-xs">
          <Clock className="size-3 text-zinc-400" />
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-950/90 text-indigo-300 border border-indigo-500/40 shadow-xs">
          <Check className="size-3 text-indigo-400" />
          <span>Preprocessed</span>
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-950/90 text-blue-300 border border-blue-500/40 shadow-xs">
          <Loader2 className="size-3 text-blue-400 animate-spin" />
          <span>Processing</span>
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-900/90 text-zinc-300 border border-zinc-700/50 shadow-xs">
          <Clock className="size-3 text-zinc-400" />
          <span>Queued</span>
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/40 shadow-xs">
          <AlertTriangle className="size-3 text-rose-400" />
          <span>Failed</span>
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-900/90 text-zinc-400 border border-zinc-800 shadow-xs">
          <Minus className="size-3" />
          <span>Skipped</span>
        </span>
      );
    default:
      return null;
  }
}


// ─── Image Compare Viewer (Original / Processed / Compare Slider) ────────────

export function ImageCompare({
  originalUrl,
  processedUrl,
  metricsBefore,
  metricsAfter,
  className = "",
}: {
  originalUrl: string;
  processedUrl?: string | null;
  metricsBefore?: any;
  metricsAfter?: any;
  className?: string;
}) {
  const [viewMode, setViewMode] = useState<"compare" | "orig" | "proc">("compare");
  const [sliderPos, setSliderPos] = useState(50); // percent
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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

  if (!processedUrl) {
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

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Segmented Mode Control */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg p-0.5 bg-muted/60 border border-border">
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
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {viewMode === "compare" ? `Split: ${sliderPos}%` : viewMode === "orig" ? "Raw Input" : "Enhanced"}
        </span>
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
        aria-label="Image comparison slider. Use left and right arrow keys to adjust split position."
      >
        {viewMode === "orig" && (
          <img src={originalUrl} alt="Original capture" className="w-full h-full object-contain" />
        )}

        {viewMode === "proc" && (
          <img src={processedUrl} alt="Processed copy" className="w-full h-full object-contain" />
        )}

        {viewMode === "compare" && (
          <>
            {/* Processed (Background Layer) */}
            <img
              src={processedUrl}
              alt="Processed"
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
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-zinc-300 pointer-events-none">
              Original
            </div>
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-indigo-300 pointer-events-none">
              Processed
            </div>
          </>
        )}
      </div>

      {/* Mandatory Regulatory Caption */}
      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/80 text-[11px] text-muted-foreground flex items-center gap-2">
        <Sparkles className="size-3.5 text-primary shrink-0" />
        <span>
          Processed copy for analysis. <strong>Standard image processing, not AI.</strong> Measurements use the original image.
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
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [augmentations, setAugmentations] = useState<any[]>([]);
  const [loadingAugs, setLoadingAugs] = useState(false);

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

  const qualityReport = details?.qualityReport || photo.qualityReport;
  const processingRun = details?.processingRun || photo.processingRun;
  const originalUrl = details?.originalUrl || photo.previewUrl;
  const processedUrl = details?.processedUrl || photo.processedUrl;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-6 space-y-5 bg-card border-l border-border"
      >
        <SheetHeader className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-primary font-bold">{photo.name || photo.id}</span>
            <div className="flex items-center gap-1.5">
              <QualityBadge status={photo.quality_status || photo.status} confirmed={photo.warningConfirmed} />
              <ProcessingBadge status={photo.processing_status || "complete"} />
            </div>
          </div>
          <SheetTitle className="text-base font-bold text-foreground">
            Image Quality & Processing Inspection
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Deterministic classical computer vision audit and enhancement pipeline.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-6 text-primary animate-spin" />
            <span>Loading image verification report…</span>
          </div>
        ) : (
          <Tabs defaultValue="compare" className="w-full">
            <TabsList className="grid grid-cols-5 h-9 bg-muted/60 p-1 rounded-xl mb-4 text-xs">
              <TabsTrigger value="compare" className="rounded-lg">Compare</TabsTrigger>
              <TabsTrigger value="quality" className="rounded-lg">Quality (7)</TabsTrigger>
              <TabsTrigger value="processing" className="rounded-lg">Pipeline</TabsTrigger>
              <TabsTrigger value="augmentations" className="rounded-lg">Augment (4)</TabsTrigger>
              <TabsTrigger value="metadata" className="rounded-lg">Metadata</TabsTrigger>
            </TabsList>

            {/* TAB 1: Compare Viewer */}
            <TabsContent value="compare" className="space-y-4">
              <ImageCompare
                originalUrl={originalUrl}
                processedUrl={processedUrl}
                metricsBefore={processingRun?.metricsBefore}
                metricsAfter={processingRun?.metricsAfter}
              />
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
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-300">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Warning requires field confirmation before review submission.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      onConfirmWarning?.(photo.id);
                      onOpenChange(false);
                    }}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white shrink-0 font-semibold"
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
                          <td className="py-2.5 px-3 font-mono">
                            {chk.value} {chk.unit}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {chk.threshold}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                chk.status === "pass"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                  : chk.status === "warn"
                                  ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                                  : "bg-rose-950 text-rose-400 border border-rose-500/30"
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
                  <strong>Standard image processing, not AI.</strong> Applied profile:{" "}
                  <code className="font-mono text-primary font-bold">general_v1</code>.
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
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                                : "bg-muted text-muted-foreground"
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
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                      Calibrated
                    </Badge>
                  )}
                </div>
                {photo.calibration ? (
                  <p className="font-mono text-foreground">
                    Scale saved: <strong>{photo.calibration.mm_per_pixel || photo.calibration.mm_per_px} mm per pixel</strong>
                  </p>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Not calibrated. Measurements will be in pixels.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCalibrate?.(photo.id)}
                      className="h-7 text-xs"
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
            {onTransform && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onTransform(photo);
                }}
                className="text-xs text-primary border-primary/30 hover:bg-primary/10"
              >
                <Crop className="size-3.5 mr-1.5" />
                Crop & Rotate
              </Button>
            )}
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
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-card border-border">
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
                src={photo.previewUrl}
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
                  className="absolute border-2 border-emerald-400 border-dashed rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                  style={{
                    left: `${freeCrop.x}%`,
                    top: `${freeCrop.y}%`,
                    width: `${freeCrop.width}%`,
                    height: `${freeCrop.height}%`,
                  }}
                >
                  <div className="absolute -top-5 left-0 bg-emerald-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
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
                <span className="px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-indigo-300">
                  Flip: {flipH ? "H" : ""}{flipV ? "V" : ""}
                </span>
              )}
              {cropPreset !== "none" && (
                <span className="px-2 py-0.5 rounded bg-black/80 font-mono text-[10px] text-emerald-300">
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
                  className="h-8 text-xs font-semibold text-emerald-400 border-emerald-500/30"
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
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/10 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
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
}: {
  photo: any;
  onRemove: (id: string) => void;
  onReplace?: (id: string) => void;
  onConfirmWarning?: (id: string) => void;
  onRetryProcessing?: (id: string) => void;
  onCalibrate?: (id: string) => void;
  onTransform?: (photo: any) => void;
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
    if (photo.processing_status === "complete") {
      return "Processed copy ready. Standard image processing, not AI.";
    }
    return "Good to use. All quality checks passed.";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDrawerOpen(true);
    }
  };

  return (
    <>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative rounded-xl overflow-hidden border border-border bg-card group flex flex-col focus:outline-hidden focus:ring-2 focus:ring-primary shadow-xs"
        aria-label={`Photo ${photo.name}. Status: ${photo.quality_status || photo.status}. Press Enter for details.`}
      >
        {/* Thumbnail area */}
        <div className="relative aspect-video bg-black overflow-hidden cursor-pointer" onClick={() => setDrawerOpen(true)}>
          <img
            src={photo.previewUrl}
            alt={photo.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
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
            {photo.source && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/90 text-primary border border-primary/40 shadow-xs capitalize">
                {photo.source}
              </span>
            )}
          </div>

          {/* Bottom GPS caption bar with solid background */}
          {photo.gps && (
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/85 text-[10px] text-emerald-300 font-mono font-semibold flex items-center gap-1 border-t border-black/40">
              <MapPin className="size-2.5 text-emerald-400 shrink-0" />
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
                        <CheckCircle2 className="size-3.5 mr-2 text-amber-400" />
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onRemove(photo.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3.5 mr-2" />
                      Remove photo
                    </DropdownMenuItem>
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
              className="w-full h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1 mt-1"
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
