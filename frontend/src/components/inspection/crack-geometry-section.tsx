import { useState, useEffect } from "react";
import {
  Activity,
  Compass,
  Eye,
  Loader2,
  RefreshCw,
  Ruler,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface CrackMeasurement {
  id: string;
  area_px: number;
  length_px: number;
  avg_width_px: number;
  median_width_px: number;
  max_width_px: number;
  orientation_deg: number;
  perimeter_px?: number;
  branch_count: number;
  suggested_type?: string;
  bbox: { x: number; y: number; w: number; h: number };
  centroid: { x: number; y: number };
  area_mm2?: number | null;
  length_mm?: number | null;
  avg_width_mm?: number | null;
  median_width_mm?: number | null;
  max_width_mm?: number | null;
  perimeter_mm?: number | null;
  skeleton_points?: number[][];
  contour_points?: number[][];
  branch_points?: number[][];
}

export interface CrackGeometrySummary {
  total_crack_area_px: number;
  inspected_surface_area_px: number;
  unaffected_surface_area_px: number;
  crack_coverage_pct: number;
  unaffected_surface_pct: number;
  crack_count: number;
  total_crack_length_px: number;
  average_crack_width_px: number;
  maximum_crack_width_px: number;
  is_calibrated: boolean;
  mm_per_pixel?: number | null;
  unit: "mm" | "px";
  image_width?: number;
  image_height?: number;
  has_surface_mask?: boolean;
  total_crack_area_mm2?: number | null;
  inspected_surface_area_mm2?: number | null;
  unaffected_surface_area_mm2?: number | null;
  total_crack_length_mm?: number | null;
  average_crack_width_mm?: number | null;
  maximum_crack_width_mm?: number | null;
}

export interface CrackGeometryReport {
  success: boolean;
  summary: CrackGeometrySummary;
  cracks: CrackMeasurement[];
  visualization_path?: string;
  version?: string;
}

interface CrackGeometrySectionProps {
  photo: any;
  details?: any;
  onCalibrate?: (id: string) => void;
}

export function CrackGeometrySection({
  photo,
  details,
  onCalibrate,
}: CrackGeometrySectionProps) {
  const [geoData, setGeoData] = useState<CrackGeometryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [viewLayer, setViewLayer] = useState<"geometry" | "unet" | "mask" | "original">("geometry");
  const [selectedCrackId, setSelectedCrackId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unitMode, setUnitMode] = useState<"auto" | "px" | "mm">("auto");
  const [scaleInput, setScaleInput] = useState<string>("");

  const photoId = photo?.id;
  const initialGeometry =
    details?.crackGeometry ||
    details?.crack_geometry ||
    details?.qualityReport?.crack_geometry ||
    details?.quality_report?.crack_geometry ||
    photo?.crackGeometry ||
    photo?.crack_geometry ||
    photo?.qualityReport?.crack_geometry;

  // Load geometry on mount or when photo changes
  useEffect(() => {
    if (initialGeometry && initialGeometry.summary) {
      setGeoData(initialGeometry);
      if (initialGeometry.summary.mm_per_pixel) {
        setScaleInput(String(initialGeometry.summary.mm_per_pixel));
      }
      return;
    }

    if (!photoId || photoId.startsWith("client-")) return;

    let isMounted = true;
    setLoading(true);
    api
      .getImageGeometry(photoId)
      .then((res: CrackGeometryReport) => {
        if (isMounted && res?.summary) {
          setGeoData(res);
          if (res.summary.mm_per_pixel) {
            setScaleInput(String(res.summary.mm_per_pixel));
          }
        }
      })
      .catch(() => {
        // Fallback: auto-trigger calculation if not yet computed
        api
          .calculateImageGeometry(photoId)
          .then((res: CrackGeometryReport) => {
            if (isMounted && res?.summary) {
              setGeoData(res);
              if (res.summary.mm_per_pixel) {
                setScaleInput(String(res.summary.mm_per_pixel));
              }
            }
          })
          .catch((err) => {
            console.error("Geometry load error:", err);
          });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [photoId, initialGeometry]);

  const handleRecalculate = async (forceScale?: number) => {
    if (!photoId) return;
    setRecomputing(true);
    try {
      const parsedScale = forceScale !== undefined ? forceScale : (scaleInput ? parseFloat(scaleInput) : undefined);
      const res = await api.calculateImageGeometry(photoId, {
        force_recompute: true,
        mm_per_pixel: parsedScale && !isNaN(parsedScale) ? parsedScale : undefined,
      });
      if (res && res.summary) {
        setGeoData(res);
        toast.success(
          `Geometry re-extracted: ${res.summary.crack_coverage_pct}% crack area across ${res.summary.crack_count} regions.`
        );
      }
    } catch (e: any) {
      toast.error("Geometry recalculation failed: " + (e.message || "Unknown error"));
    } finally {
      setRecomputing(false);
    }
  };

  const summary = geoData?.summary;
  const cracks = geoData?.cracks || [];
  const isCalibrated = Boolean(summary?.is_calibrated && summary?.mm_per_pixel);
  const activeUnit = unitMode === "auto" ? (isCalibrated ? "mm" : "px") : unitMode;

  const originalUrl = details?.originalUrl || photo?.originalUrl || photo?.previewUrl;
  const unetUrl = details?.unetUrl || photo?.unetUrl || `/api/v1/images/${photoId}/file?variant=unet`;
  const unetMaskUrl = details?.unetMaskUrl || photo?.unetMaskUrl || `/api/v1/images/${photoId}/file?variant=mask`;
  const geometryUrl = details?.geometryUrl || photo?.geometryUrl || `/api/v1/images/${photoId}/file?variant=geometry&v=${recomputing ? Date.now() : (details?.sha256 || photo?.version || "1")}`;

  const currentPreviewSrc =
    viewLayer === "geometry"
      ? geometryUrl
      : viewLayer === "unet"
      ? unetUrl
      : viewLayer === "mask"
      ? unetMaskUrl
      : originalUrl;

  const filteredCracks = cracks.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      (c.suggested_type && c.suggested_type.toLowerCase().includes(q))
    );
  });

  const selectedCrack = cracks.find((c) => c.id === selectedCrackId);

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs">
        <Loader2 className="size-6 text-primary animate-spin" />
        <span>Extracting crack geometry from U-Net segmentation mask…</span>
        <span className="text-[10px] text-muted-foreground">
          Calculating surface areas, skeleton centerlines, and EDT thickness profiles.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* ─── Top Hero: Primary Geometry Metric (Crack Coverage %) ─── */}
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Crack Geometry & Surface Coverage
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-mono font-bold text-foreground border-border bg-muted/40"
              >
                {isCalibrated ? `Calibrated (${summary?.mm_per_pixel} mm/px)` : "Image-based (px) · Uncalibrated"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mathematical defect extraction derived from U-Net binary segmentation mask. Centerline skeleton graph
              traversal with Euclidean distance transform width measurement.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRecalculate()}
            disabled={recomputing}
            className="h-8 text-xs font-semibold gap-1.5 shrink-0 bg-background/80"
          >
            <RefreshCw className={`size-3.5 ${recomputing ? "animate-spin" : ""}`} />
            <span>{recomputing ? "Extracting…" : "Recalculate"}</span>
          </Button>
        </div>

        {/* Primary Metric Hero Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-card/80 border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Crack Area Coverage (Primary)
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-mono font-extrabold ${
                  (summary?.crack_coverage_pct || 0) > 0
                    ? "text-rose-400"
                    : "text-foreground"
                }`}
              >
                {summary?.crack_coverage_pct !== undefined ? `${summary.crack_coverage_pct}%` : "0.00%"}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">of inspected surface</span>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full ${
                  (summary?.crack_coverage_pct || 0) > 0
                    ? "bg-rose-500"
                    : "bg-muted"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, summary?.crack_coverage_pct || 0))}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-card/80 border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Total Crack Area
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-foreground">
                {isCalibrated && summary?.total_crack_area_mm2 !== null
                  ? `${summary?.total_crack_area_mm2?.toLocaleString()} mm²`
                  : `${summary?.total_crack_area_px?.toLocaleString()} px²`}
              </span>
              {isCalibrated && summary?.total_crack_area_px !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({summary.total_crack_area_px.toLocaleString()} px²)
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Number of crack pixels classified by U-Net
            </span>
          </div>

          <div className="p-3 rounded-lg bg-card/80 border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Unaffected Surface Area
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-foreground">
                {summary?.unaffected_surface_pct !== undefined ? `${summary.unaffected_surface_pct}%` : "100.00%"}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                ({summary?.unaffected_surface_area_px?.toLocaleString()} px²)
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Inspected Surface − Crack Area (Sound Concrete)
            </span>
          </div>
        </div>
      </div>

      {/* ─── Grid: 5 Detailed Summary Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Crack Regions</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {summary?.crack_count ?? 0} {summary?.crack_count === 1 ? "crack" : "cracks"}
          </span>
          <span className="text-[10px] text-muted-foreground block">Connected components</span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Total Crack Length</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {isCalibrated && summary?.total_crack_length_mm
              ? `${summary.total_crack_length_mm} mm`
              : `${summary?.total_crack_length_px?.toLocaleString()} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">Centreline skeleton sum</span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Average Width</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {isCalibrated && summary?.average_crack_width_mm
              ? `${summary.average_crack_width_mm} mm`
              : `${summary?.average_crack_width_px} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">Mean EDT thickness</span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Maximum Width</span>
          <span className="text-sm font-mono font-bold text-rose-400">
            {isCalibrated && summary?.maximum_crack_width_mm
              ? `${summary.maximum_crack_width_mm} mm`
              : `${summary?.maximum_crack_width_px} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">Peak EDT thickness</span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Inspected Surface</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {summary?.inspected_surface_area_px?.toLocaleString()} px²
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {summary?.has_surface_mask ? "Surface ROI mask" : "Entire image area"}
          </span>
        </div>
      </div>

      {/* ─── Geometry Visualization Section ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
          <div className="flex items-center gap-1.5">
            <Eye className="size-4 text-primary" />
            <h4 className="font-bold text-foreground text-xs">Dedicated Geometry Visualization</h4>
            {selectedCrack && (
              <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/40">
                Selected: {selectedCrack.id} ({selectedCrack.suggested_type})
              </Badge>
            )}
          </div>

          {/* Visualization Layer Switches */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => setViewLayer("geometry")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                viewLayer === "geometry"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Centerline & IDs
            </button>
            <button
              type="button"
              onClick={() => setViewLayer("unet")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                viewLayer === "unet"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              UNet Mask
            </button>
            <button
              type="button"
              onClick={() => setViewLayer("mask")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                viewLayer === "mask"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Binary Mask
            </button>
            <button
              type="button"
              onClick={() => setViewLayer("original")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                viewLayer === "original"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Original Photo
            </button>
          </div>
        </div>

        {/* Visualizer Canvas Viewport */}
        <div className="relative rounded-lg overflow-hidden border border-border/80 bg-black flex items-center justify-center min-h-[280px] max-h-[460px]">
          <img
            src={currentPreviewSrc}
            alt="Geometry Visualization"
            className="w-full h-full object-contain max-h-[460px]"
          />

          {/* Interactive Bounding Box Indicator if Crack Selected */}
          {selectedCrack && (
            <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-md border border-primary/40 p-2.5 rounded-lg text-foreground space-y-1 shadow-lg text-[11px]">
              <div className="flex items-center justify-between gap-2 font-mono font-bold text-primary">
                <span>{selectedCrack.id}</span>
                <span className="text-[10px] text-muted-foreground">{selectedCrack.suggested_type}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                <span className="text-muted-foreground">Area:</span>
                <span>
                  {isCalibrated && selectedCrack.area_mm2
                    ? `${selectedCrack.area_mm2} mm²`
                    : `${selectedCrack.area_px.toLocaleString()} px²`}
                </span>
                <span className="text-muted-foreground">Length:</span>
                <span>
                  {isCalibrated && selectedCrack.length_mm
                    ? `${selectedCrack.length_mm} mm`
                    : `${selectedCrack.length_px} px`}
                </span>
                <span className="text-muted-foreground">Avg Width:</span>
                <span>
                  {isCalibrated && selectedCrack.avg_width_mm
                    ? `${selectedCrack.avg_width_mm} mm`
                    : `${selectedCrack.avg_width_px} px`}
                </span>
                <span className="text-muted-foreground">Max Width:</span>
                <span>
                  {isCalibrated && selectedCrack.max_width_mm
                    ? `${selectedCrack.max_width_mm} mm`
                    : `${selectedCrack.max_width_px} px`}
                </span>
                <span className="text-muted-foreground">Orientation:</span>
                <span>{selectedCrack.orientation_deg}°</span>
                <span className="text-muted-foreground">Branches:</span>
                <span>{selectedCrack.branch_count} junctions</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCrackId(null)}
                className="h-5 text-[10px] p-0 text-muted-foreground hover:text-white w-full"
              >
                Clear Selection
              </Button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground pt-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-rose-500 inline-block" /> Crack Mask Area
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-foreground inline-block border border-border" /> Skeleton Centerline
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary inline-block" /> Branch Junction
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary/70 inline-block" /> Crack Region ID
            </span>
          </div>
          <span>Click any row in the table below to inspect specific crack geometry.</span>
        </div>
      </div>

      {/* ─── Individual Crack Measurement Table ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden space-y-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
              <Activity className="size-3.5 text-primary" />
              Individual Crack Measurements Table
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Deterministic connected components analysis. Length via skeleton graph edge traversal; width via EDT.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Filter */}
            <div className="relative">
              <Search className="size-3 absolute left-2 top-2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter ID or Type…"
                className="h-7 text-xs pl-6 w-36"
              />
            </div>

            {/* Unit Toggle */}
            {isCalibrated && (
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setUnitMode("mm")}
                  className={`px-2 py-0.5 rounded ${
                    activeUnit === "mm" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  Metric (mm)
                </button>
                <button
                  type="button"
                  onClick={() => setUnitMode("px")}
                  className={`px-2 py-0.5 rounded ${
                    activeUnit === "px" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                  }`}
                >
                  Pixels (px)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="rounded-lg border border-border overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 sticky top-0 border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
              <tr>
                <th className="py-2 px-2.5">Crack ID</th>
                <th className="py-2 px-2.5">Area ({activeUnit === "mm" ? "mm²" : "px²"})</th>
                <th className="py-2 px-2.5">Length ({activeUnit === "mm" ? "mm" : "px"})</th>
                <th className="py-2 px-2.5">Avg Width ({activeUnit === "mm" ? "mm" : "px"})</th>
                <th className="py-2 px-2.5">Max Width ({activeUnit === "mm" ? "mm" : "px"})</th>
                <th className="py-2 px-2.5">Orientation</th>
                <th className="py-2 px-2.5">Branches</th>
                <th className="py-2 px-2.5">Structural Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCracks.length > 0 ? (
                filteredCracks.map((c) => {
                  const isSelected = selectedCrackId === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCrackId(isSelected ? null : c.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/15 border-l-2 border-primary font-semibold"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <td className="py-2 px-2.5 font-mono font-bold text-foreground flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            isSelected ? "bg-primary animate-pulse" : "bg-muted-foreground"
                          }`}
                        />
                        {c.id}
                      </td>
                      <td className="py-2 px-2.5 font-mono">
                        {activeUnit === "mm" && c.area_mm2 != null
                          ? c.area_mm2.toLocaleString()
                          : c.area_px.toLocaleString()}
                      </td>
                      <td className="py-2 px-2.5 font-mono">
                        {activeUnit === "mm" && c.length_mm != null
                          ? c.length_mm.toFixed(1)
                          : c.length_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-foreground">
                        {activeUnit === "mm" && c.avg_width_mm != null
                          ? c.avg_width_mm.toFixed(2)
                          : c.avg_width_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-bold text-rose-400">
                        {activeUnit === "mm" && c.max_width_mm != null
                          ? c.max_width_mm.toFixed(2)
                          : c.max_width_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-muted-foreground flex items-center gap-1">
                        <Compass className="size-3 text-primary/70 shrink-0" />
                        {c.orientation_deg.toFixed(1)}°
                      </td>
                      <td className="py-2 px-2.5 font-mono text-muted-foreground">
                        {c.branch_count > 0 ? (
                          <span className="text-foreground font-semibold">{c.branch_count} junctions</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <Badge variant="outline" className="text-[9px] font-normal py-0">
                          {c.suggested_type || "Oblique"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    {summary?.crack_count === 0
                      ? "No crack defects detected on this surface."
                      : "No cracks matching filter query."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Physical Measurement Calibration Card ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
            <Ruler className="size-3.5 text-primary" />
            Physical Measurement Scale Calibration
          </span>
          <Badge
            variant="outline"
            className="text-[10px] text-foreground border-border"
          >
            {isCalibrated ? "Calibrated" : "Uncalibrated"}
          </Badge>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isCalibrated
            ? `Calibrated at ${summary?.mm_per_pixel} mm/px. Physical lengths and widths in millimetres (mm); surface areas in square millimetres (mm²).`
            : "No optical reference marker detected. Measurements are strictly reported as image pixel quantities (px and px²). To convert to millimetres, enter known optical scale below."}
        </p>

        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5 flex-1 max-w-xs">
            <Input
              type="number"
              step="0.01"
              value={scaleInput}
              onChange={(e) => setScaleInput(e.target.value)}
              placeholder="e.g. 0.25 mm/px"
              className="h-8 text-xs font-mono"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">mm / pixel</span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRecalculate()}
            disabled={recomputing || !scaleInput}
            className="h-8 text-xs font-semibold gap-1"
          >
            {recomputing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Zap className="size-3 text-primary" />
            )}
            <span>Apply Scale & Convert</span>
          </Button>

          {onCalibrate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCalibrate(photo.id)}
              className="h-8 text-xs text-primary"
            >
              Interactive Ruler Tool
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
