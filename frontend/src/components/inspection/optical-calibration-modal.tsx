import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Ruler,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info,
  Layers,
  Crosshair,
  Sliders,
  Trash2,
  MoveHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface OpticalCalibrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: any;
  inspectionId?: string | null;
  onCalibrated?: (result: any) => void;
}

interface Point {
  x: number; // in natural image pixels
  y: number; // in natural image pixels
}

const PRESET_TARGETS = [
  { label: "100 mm Gauge Bar", mm: 100 },
  { label: "Standard ID / Card (85.6 mm)", mm: 85.6 },
  { label: "50 mm Survey Marker", mm: 50 },
  { label: "300 mm Ruler", mm: 300 },
  { label: "Standard Coin (24.26 mm)", mm: 24.26 },
  { label: "10 mm Gauge Mark", mm: 10 },
];

export function OpticalCalibrationModal({
  open,
  onOpenChange,
  photo,
  inspectionId,
  onCalibrated,
}: OpticalCalibrationModalProps) {
  const [activeTab, setActiveTab] = useState<"interactive" | "direct">("interactive");
  const [p1, setP1] = useState<Point | null>(null);
  const [p2, setP2] = useState<Point | null>(null);
  const [activePoint, setActivePoint] = useState<1 | 2>(1);

  const [knownLengthMm, setKnownLengthMm] = useState<string>("100");
  const [directMmPerPx, setDirectMmPerPx] = useState<string>("0.25");
  const [widthMetric, setWidthMetric] = useState<"maximum" | "average">("maximum");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const photoId = photo?.id;
  const currentCalibration = photo?.calibration || photo?.qualityReport?.calibration;
  const imageUrl =
    photo?.processedUrl ||
    photo?.originalUrl ||
    photo?.previewUrl ||
    (photoId ? `/api/v1/images/${photoId}/file?variant=original` : "");

  // Load existing calibration data if already calibrated
  useEffect(() => {
    if (open && currentCalibration) {
      if (currentCalibration.mm_per_pixel) {
        setDirectMmPerPx(String(currentCalibration.mm_per_pixel));
      }
      if (currentCalibration.reference_line_length_mm) {
        setKnownLengthMm(String(currentCalibration.reference_line_length_mm));
      }
      if (currentCalibration.reference_p1 && currentCalibration.reference_p2) {
        setP1({ x: currentCalibration.reference_p1[0], y: currentCalibration.reference_p1[1] });
        setP2({ x: currentCalibration.reference_p2[0], y: currentCalibration.reference_p2[1] });
      }
      if (currentCalibration.width_metric) {
        setWidthMetric(currentCalibration.width_metric);
      }
    } else if (open && !currentCalibration) {
      setP1(null);
      setP2(null);
      setActivePoint(1);
    }
  }, [open, currentCalibration]);

  // Pixel distance calculation
  const pixelDistance =
    p1 && p2
      ? Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
      : 0;

  // Calculated scale (mm / pixel)
  const calculatedMmPerPixel =
    activeTab === "interactive"
      ? pixelDistance > 0 && parseFloat(knownLengthMm) > 0
        ? parseFloat(knownLengthMm) / pixelDistance
        : null
      : parseFloat(directMmPerPx) > 0
      ? parseFloat(directMmPerPx)
      : null;

  // Coordinate conversion from viewport/client mouse event to natural image coordinates
  const getNaturalCoords = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): Point | null => {
      const img = imageRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;

      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;

      const naturalW = img.naturalWidth || photo?.width || 800;
      const naturalH = img.naturalHeight || photo?.height || 600;

      return {
        x: Math.round(relX * naturalW * 10) / 10,
        y: Math.round(relY * naturalH * 10) / 10,
      };
    },
    [photo?.width, photo?.height]
  );

  // Click handler to position P1 or P2
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = getNaturalCoords(e);
    if (!pt) return;

    if (!p1 || activePoint === 1) {
      setP1(pt);
      setActivePoint(2);
    } else {
      setP2(pt);
      setActivePoint(1);
    }
  };

  // Convert natural coords to CSS percentages for SVG / overlay rendering
  const naturalToPercent = (pt: Point | null) => {
    const naturalW = imageRef.current?.naturalWidth || photo?.width || 800;
    const naturalH = imageRef.current?.naturalHeight || photo?.height || 600;
    if (!pt) return { left: "0%", top: "0%" };
    return {
      left: `${(pt.x / naturalW) * 100}%`,
      top: `${(pt.y / naturalH) * 100}%`,
    };
  };

  const p1Pct = naturalToPercent(p1);
  const p2Pct = naturalToPercent(p2);

  // Apply calibration save
  const handleSave = async () => {
    if (!photoId) return;

    let payload: any;
    if (activeTab === "interactive") {
      const mm = parseFloat(knownLengthMm);
      if (isNaN(mm) || mm <= 0) {
        toast.error("Please enter a valid known physical length in mm.");
        return;
      }
      if (!p1 || !p2 || pixelDistance < 2) {
        toast.error("Please select two distinct points on the reference gauge in the image.");
        return;
      }
      payload = {
        method: "manual_line",
        reference_line_length_mm: mm,
        pixel_length: Math.round(pixelDistance * 10) / 10,
        reference_p1: [p1.x, p1.y],
        reference_p2: [p2.x, p2.y],
        width_metric: widthMetric,
      };
    } else {
      const scale = parseFloat(directMmPerPx);
      if (isNaN(scale) || scale <= 0) {
        toast.error("Please enter a valid scale ratio (mm/px > 0).");
        return;
      }
      payload = {
        method: "direct_ratio",
        mm_per_pixel: scale,
        width_metric: widthMetric,
      };
    }

    setSaving(true);
    try {
      const res = await api.calibrateImage(inspectionId, photoId, payload);
      toast.success(
        `Scale Calibrated: ${res.calibration?.mm_per_pixel?.toFixed(4)} mm/px`,
        {
          description: `Severity assessment: ${res.crack_geometry?.summary?.crack_severity_category || "Calibrated"} (${widthMetric} width).`,
        }
      );
      if (onCalibrated) {
        onCalibrated(res);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save optical calibration.");
    } finally {
      setSaving(false);
    }
  };

  // Reset calibration
  const handleReset = async () => {
    if (!photoId) return;
    setResetting(true);
    try {
      const res = await api.deleteImageCalibration(photoId, inspectionId);
      toast.info("Calibration reset to uncalibrated pixel mode.");
      setP1(null);
      setP2(null);
      if (onCalibrated) {
        onCalibrated(res);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset calibration.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-2xl sm:max-w-2xl md:max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-3">
        {/* Header: Clean 1-3 colors (Neutral + Primary accent) */}
        <DialogHeader className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Ruler className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
                  <span>Optical Calibration & Severity Configuration</span>
                  {currentCalibration?.calibrated && (
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary bg-primary/5">
                      Active: {currentCalibration.mm_per_pixel} mm/px
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Map pixel distances to physical millimetres (mm) for standard crack severity classification.
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-[11px] font-mono border-border text-muted-foreground self-start sm:self-auto shrink-0">
              ASTM / AASHTO Standards
            </Badge>
          </div>
        </DialogHeader>

        {/* Method Tabs & Controlling Metric Selector */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-2.5">
            <TabsList className="h-8">
              <TabsTrigger value="interactive" className="text-xs font-semibold gap-1.5">
                <Crosshair className="size-3.5 text-primary" />
                Interactive Line Tool
              </TabsTrigger>
              <TabsTrigger value="direct" className="text-xs font-semibold gap-1.5">
                <Sliders className="size-3.5 text-primary" />
                Direct Scale Ratio (mm/px)
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-[11px] font-medium whitespace-nowrap">Controlling Metric:</span>
              <Select value={widthMetric} onValueChange={(v: any) => setWidthMetric(v)}>
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maximum">Maximum Width (Peak)</SelectItem>
                  <SelectItem value="average">Average Width (Mean)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TAB 1: Interactive Line Measurement */}
          <TabsContent value="interactive" className="space-y-3 m-0">
            {/* Instruction helper banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="size-4 text-primary shrink-0" />
                <span>
                  Click two endpoints on a known gauge bar or ruler in the image below to set the reference line.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <Button
                  size="sm"
                  variant={activePoint === 1 ? "default" : "outline"}
                  onClick={() => setActivePoint(1)}
                  className="h-6 text-[10px] px-2 font-mono"
                >
                  P1 (Start)
                </Button>
                <Button
                  size="sm"
                  variant={activePoint === 2 ? "default" : "outline"}
                  onClick={() => setActivePoint(2)}
                  className="h-6 text-[10px] px-2 font-mono"
                >
                  P2 (End)
                </Button>
                {(p1 || p2) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setP1(null);
                      setP2(null);
                      setActivePoint(1);
                    }}
                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                  >
                    Clear Line
                  </Button>
                )}
              </div>
            </div>

            {/* Interactive Image Viewport */}
            <div
              ref={containerRef}
              onClick={handleCanvasClick}
              className="relative rounded-xl border border-border bg-black overflow-hidden flex items-center justify-center cursor-crosshair min-h-[200px] max-h-[290px] select-none w-full"
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Calibration Target"
                className="w-full h-full object-contain max-h-[290px] pointer-events-none"
              />

              {/* SVG Overlay for Reference Line: Clean Primary Blue (#2563EB) */}
              {imageRef.current && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    width: imageRef.current.clientWidth,
                    height: imageRef.current.clientHeight,
                    top: imageRef.current.offsetTop,
                    left: imageRef.current.offsetLeft,
                  }}
                  viewBox={`0 0 ${imageRef.current.naturalWidth || 800} ${imageRef.current.naturalHeight || 600}`}
                  preserveAspectRatio="none"
                >
                  {p1 && p2 && (
                    <>
                      {/* Drop shadow / halo line */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#000000"
                        strokeWidth="5"
                        strokeOpacity="0.7"
                      />
                      {/* Active reference line in Primary Blue */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                      />
                    </>
                  )}
                </svg>
              )}

              {/* Endpoint Markers in Primary Blue */}
              {p1 && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10"
                  style={{ left: p1Pct.left, top: p1Pct.top }}
                >
                  <div className="size-5 rounded-full bg-primary/30 border-2 border-primary flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary" />
                  </div>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[9px] font-mono font-bold px-1 rounded shadow">
                    P1 ({Math.round(p1.x)}, {Math.round(p1.y)})
                  </span>
                </div>
              )}

              {p2 && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10"
                  style={{ left: p2Pct.left, top: p2Pct.top }}
                >
                  <div className="size-5 rounded-full bg-primary/30 border-2 border-primary flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-primary" />
                  </div>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[9px] font-mono font-bold px-1 rounded shadow">
                    P2 ({Math.round(p2.x)}, {Math.round(p2.y)})
                  </span>
                </div>
              )}

              {/* Floating Distance Badge: Explicit high-contrast white text on dark pill */}
              {p1 && p2 && (
                <div
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-neutral-900/95 border-2 border-primary/60 px-4 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-2 shadow-2xl z-30 pointer-events-none"
                  style={{ color: "#ffffff" }}
                >
                  <MoveHorizontal className="size-4 shrink-0 text-blue-400" style={{ color: "#60a5fa" }} />
                  <span className="text-white font-mono font-bold text-xs" style={{ color: "#ffffff" }}>
                    Pixel Distance: {pixelDistance.toFixed(1)} px
                  </span>
                </div>
              )}
            </div>

            {/* Inputs & Presets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="known-mm" className="text-xs font-bold text-foreground">
                  Known Reference Physical Length (mm)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="known-mm"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={knownLengthMm}
                    onChange={(e) => setKnownLengthMm(e.target.value)}
                    placeholder="e.g. 100"
                    className="font-mono text-sm h-9"
                  />
                  <span className="text-xs font-mono font-semibold text-muted-foreground whitespace-nowrap">
                    mm
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase block">
                    Quick Reference Presets:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TARGETS.map((t) => (
                      <button
                        key={t.mm}
                        type="button"
                        onClick={() => setKnownLengthMm(String(t.mm))}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                          knownLengthMm === String(t.mm)
                            ? "bg-primary text-primary-foreground border-primary font-bold"
                            : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Formula Card: Clean Neutral + Primary Accent */}
              <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
                <div className="flex items-center justify-between text-foreground font-bold">
                  <span className="flex items-center gap-1.5">
                    <Zap className="size-3.5 text-primary" />
                    Calibration Formula
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">mm_per_pixel = L_mm ÷ L_px</span>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-border font-mono text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference Line (L_px):</span>
                    <span className="font-bold text-foreground">{pixelDistance.toFixed(1)} px</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Known Length (L_mm):</span>
                    <span className="font-bold text-foreground">{parseFloat(knownLengthMm) || 0} mm</span>
                  </div>
                  <div className="border-t border-border pt-1 flex justify-between text-foreground font-bold">
                    <span>Resulting Optical Scale:</span>
                    <span className="text-primary font-bold">
                      {calculatedMmPerPixel !== null ? `${calculatedMmPerPixel.toFixed(4)} mm/px` : "Pending points"}
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Applied to crack centerline lengths, Euclidean distance widths, and surface areas (mm²).
                </p>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Direct Scale Ratio */}
          <TabsContent value="direct" className="space-y-4 m-0 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="direct-scale" className="text-xs font-bold text-foreground">
                  Optical Scale Factor (mm per pixel)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="direct-scale"
                    type="number"
                    step="0.001"
                    min="0.0001"
                    value={directMmPerPx}
                    onChange={(e) => setDirectMmPerPx(e.target.value)}
                    placeholder="e.g. 0.250"
                    className="font-mono text-sm h-9"
                  />
                  <span className="text-xs font-mono font-semibold text-muted-foreground whitespace-nowrap">
                    mm / px
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Direct ratio obtained from camera sensor pixel pitch, focal length, and standoff distance.
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[0.1, 0.2, 0.25, 0.33, 0.5, 1.0].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDirectMmPerPx(String(val))}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                        directMmPerPx === String(val)
                          ? "bg-primary text-primary-foreground border-primary font-bold"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {val} mm/px
                    </button>
                  ))}
                </div>
              </div>

              {/* Standoff Reference Guide */}
              <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
                <span className="font-bold text-foreground block">Typical Standoff Guidelines:</span>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                  <li><strong className="text-foreground">Close Macro (0.3m):</strong> ~0.08 - 0.15 mm/px</li>
                  <li><strong className="text-foreground">Standard Handheld (1.0m):</strong> ~0.20 - 0.30 mm/px</li>
                  <li><strong className="text-foreground">Drone Inspection (3.0m):</strong> ~0.60 - 1.20 mm/px</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Severity Classification Thresholds: Clean 1-3 colors (Neutral + Primary) */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <Layers className="size-3.5 text-primary" />
              Crack Width Severity Thresholds (Engineering Standard)
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Controlling: <strong className="text-foreground uppercase">{widthMetric}</strong> width
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-foreground space-y-0.5">
              <span className="font-bold text-xs block">Hairline</span>
              <span className="text-[10px] font-mono text-muted-foreground block">&lt; 1.0 mm</span>
              <span className="text-[9px] text-muted-foreground block">Superficial / Shrinkage</span>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-foreground space-y-0.5">
              <span className="font-bold text-xs block">Minor</span>
              <span className="text-[10px] font-mono text-muted-foreground block">1.0 mm to &lt; 3.0 mm</span>
              <span className="text-[9px] text-muted-foreground block">Monitor / Low Risk</span>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-foreground space-y-0.5">
              <span className="font-bold text-xs block">Moderate</span>
              <span className="text-[10px] font-mono text-muted-foreground block">3.0 mm to 5.0 mm</span>
              <span className="text-[9px] text-muted-foreground block">Maintenance / Sealing</span>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-foreground space-y-0.5">
              <span className="font-bold text-xs block">Severe</span>
              <span className="text-[10px] font-mono text-muted-foreground block">&gt; 5.0 mm</span>
              <span className="text-[9px] text-muted-foreground block">Immediate Engineering Review</span>
            </div>
          </div>
        </div>

        {/* Civil Engineering Regulatory Notice: Single subtle amber tone */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Civil Engineering Review Mandatory:</strong> Automated optical measurement and severity categories
            serve as decision support. Final structural evaluations and work order generation require physical verification
            and signature by a licensed civil engineer.
          </span>
        </div>

        {/* Footer Actions: Fully responsive, no clipping */}
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border mt-2">
          <div>
            {currentCalibration?.calibrated && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={resetting || saving}
                className="text-xs text-muted-foreground hover:text-foreground border-border"
              >
                <Trash2 className="size-3.5 mr-1.5" />
                <span>{resetting ? "Resetting…" : "Reset Scale"}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
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
              onClick={handleSave}
              disabled={saving || resetting || (activeTab === "interactive" && !calculatedMmPerPixel)}
              className="text-xs font-semibold gap-1.5"
            >
              <CheckCircle2 className="size-3.5" />
              <span>{saving ? "Saving…" : "Apply & Save Scale"}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
