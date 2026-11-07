import { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Compass,
  Crosshair,
  Eye,
  Loader2,
  RefreshCw,
  Ruler,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { OpticalCalibrationModal } from "./optical-calibration-modal";

export interface SeverityMetricDetail {
  category: string;
  code: string;
  width_mm: number | null;
}

export interface SeverityAssessmentDetail {
  category: string;
  category_code: string;
  controlling_metric: string;
  controlling_width_mm?: number | null;
  category_by_max_width?: SeverityMetricDetail;
  category_by_avg_width?: SeverityMetricDetail;
  description?: string;
  governance_notice?: string;
}

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
  severity_category?: string;
  severity_code?: string;
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
  width_metric_controlling?: "maximum" | "average";
  controlling_metric?: string;
  crack_severity_category?: string;
  crack_severity_code?: string;
  severity_assessment?: SeverityAssessmentDetail;
  damage_assessment?: any;
  crack_density_pct?: number;
  total_branch_count?: number;
  has_cracks?: boolean;
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
  inspectionId?: string | null;
  onCalibrate?: (id: string) => void;
  onGeometryUpdated?: (geo: CrackGeometryReport) => void;
}

export function CrackGeometrySection({
  photo,
  details,
  inspectionId,
  onCalibrate,
  onGeometryUpdated,
}: CrackGeometrySectionProps) {
  const [geoData, setGeoData] = useState<CrackGeometryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [viewLayer, setViewLayer] = useState<"geometry" | "unet" | "mask" | "original">("geometry");
  const [selectedCrackId, setSelectedCrackId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unitMode, setUnitMode] = useState<"auto" | "px" | "mm">("auto");
  const [scaleInput, setScaleInput] = useState<string>("");
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(false);
  const [selectedWidthMetric, setSelectedWidthMetric] = useState<"maximum" | "average">("maximum");

  const photoId = photo?.id;
  const calibCandidates = [
    photo?.calibration,
    details?.calibration,
    photo?.qualityReport?.calibration,
    details?.qualityReport?.calibration,
    photo?.quality_report?.calibration,
    details?.quality_report?.calibration,
  ].filter(Boolean);
  const calibObj =
    calibCandidates.find((c) => c?.calibrated || (c?.mm_per_pixel && c.mm_per_pixel > 0) || (c?.mm_per_px && c.mm_per_px > 0)) ||
    calibCandidates[0] ||
    null;

  const geoCandidates = [
    details?.crackGeometry,
    details?.crack_geometry,
    photo?.crackGeometry,
    photo?.crack_geometry,
    details?.qualityReport?.crack_geometry,
    details?.quality_report?.crack_geometry,
    photo?.qualityReport?.crack_geometry,
    photo?.quality_report?.crack_geometry,
  ].filter((g) => g && g.summary);
  const initialGeometry =
    geoCandidates.find((g) => g?.summary?.is_calibrated) ||
    geoCandidates[0] ||
    null;

  const calibScale = Number(calibObj?.mm_per_pixel || calibObj?.mm_per_px || 0);
  const hasActiveCalib = Boolean((calibObj?.calibrated || calibScale > 0) && calibScale > 0);
  const geoIsCalibrated = Boolean(initialGeometry?.summary?.is_calibrated && (initialGeometry?.summary?.mm_per_pixel || 0) > 0);

  // Load geometry on mount or when photo/details change
  useEffect(() => {
    if (initialGeometry && initialGeometry.summary) {
      if (hasActiveCalib && !geoIsCalibrated) {
        // Mismatch: Scale exists in calibration, but initialGeometry is uncalibrated!
        // Do NOT short-circuit with stale uncalibrated data; fall through to query backend.
      } else {
        setGeoData(initialGeometry);
        const mm = initialGeometry.summary.mm_per_pixel || calibScale;
        if (mm) {
          setScaleInput(String(mm));
        }
        if (initialGeometry.summary.width_metric_controlling) {
          setSelectedWidthMetric(initialGeometry.summary.width_metric_controlling);
        }
        return;
      }
    }

    if (!photoId || photoId.startsWith("client-")) return;

    let isMounted = true;
    setLoading(true);
    api
      .getImageGeometry(photoId)
      .then((res: CrackGeometryReport) => {
        if (isMounted && res?.summary) {
          setGeoData(res);
          const mm = res.summary.mm_per_pixel || calibScale;
          if (mm) {
            setScaleInput(String(mm));
          }
          if (res.summary.width_metric_controlling) {
            setSelectedWidthMetric(res.summary.width_metric_controlling);
          }
        }
      })
      .catch(() => {
        api
          .calculateImageGeometry(photoId, {
            force_recompute: hasActiveCalib,
            mm_per_pixel: calibScale > 0 ? calibScale : undefined,
            width_metric: selectedWidthMetric,
          })
          .then((res: CrackGeometryReport) => {
            if (isMounted && res?.summary) {
              setGeoData(res);
              const mm = res.summary.mm_per_pixel || calibScale;
              if (mm) {
                setScaleInput(String(mm));
              }
              if (res.summary.width_metric_controlling) {
                setSelectedWidthMetric(res.summary.width_metric_controlling);
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
  }, [
    photoId,
    details?.crackGeometry,
    details?.crack_geometry,
    photo?.crackGeometry,
    photo?.crack_geometry,
    details?.calibration?.mm_per_pixel,
    photo?.calibration?.mm_per_pixel,
    details?.calibration?.calibrated,
    photo?.calibration?.calibrated,
    photo?.version,
  ]);

  const handleRecalculate = async (forceScale?: number, metricToUse?: "maximum" | "average") => {
    if (!photoId) return;
    setRecomputing(true);
    try {
      const parsedScale = forceScale !== undefined ? forceScale : (scaleInput ? parseFloat(scaleInput) : undefined);
      if (parsedScale !== undefined && (isNaN(parsedScale) || parsedScale <= 0)) {
        toast.error("Optical scale factor must be a strictly positive number (e.g. 0.25 mm/px).");
        setRecomputing(false);
        return;
      }
      const metric = metricToUse || selectedWidthMetric;
      const res = await api.calculateImageGeometry(photoId, {
        force_recompute: true,
        mm_per_pixel: parsedScale && !isNaN(parsedScale) ? parsedScale : undefined,
        width_metric: metric,
      });
      if (res && res.summary) {
        setGeoData(res);
        if (res.summary.width_metric_controlling) {
          setSelectedWidthMetric(res.summary.width_metric_controlling);
        }
        if (res.summary.mm_per_pixel) {
          setScaleInput(String(res.summary.mm_per_pixel));
        }
        onGeometryUpdated?.(res);
        toast.success(
          res.summary.is_calibrated
            ? `Calibrated crack geometry: ${res.summary.crack_coverage_pct}% crack area, max width ${res.summary.maximum_crack_width_mm} mm [${res.summary.crack_severity_category}].`
            : `Geometry extracted: ${res.summary.crack_coverage_pct}% crack area across ${res.summary.crack_count} region(s).`
        );
      }
    } catch (e: any) {
      toast.error("Geometry recalculation failed: " + (e.message || "Unknown error"));
    } finally {
      setRecomputing(false);
    }
  };

  const handleMetricToggle = (metric: "maximum" | "average") => {
    setSelectedWidthMetric(metric);
    handleRecalculate(undefined, metric);
  };

  const summary = geoData?.summary;
  const cracks = geoData?.cracks || [];
  const effectiveScale = Number(
    summary?.mm_per_pixel ||
      calibObj?.mm_per_pixel ||
      calibObj?.mm_per_px ||
      0
  );
  const isCalibrated = Boolean(
    (summary?.is_calibrated || calibObj?.calibrated) && effectiveScale > 0
  );
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

  const totalCrackAreaMm2 = summary?.total_crack_area_mm2 != null
    ? summary.total_crack_area_mm2
    : (isCalibrated && summary?.total_crack_area_px
        ? Number(((summary.total_crack_area_px * effectiveScale * effectiveScale)).toFixed(2))
        : null);

  const inspectedSurfaceAreaMm2 = summary?.inspected_surface_area_mm2 != null
    ? summary.inspected_surface_area_mm2
    : (isCalibrated && summary?.inspected_surface_area_px
        ? Number(((summary.inspected_surface_area_px * effectiveScale * effectiveScale)).toFixed(2))
        : null);

  const unaffectedSurfaceAreaMm2 = summary?.unaffected_surface_area_mm2 != null
    ? summary.unaffected_surface_area_mm2
    : (isCalibrated && summary?.unaffected_surface_area_px
        ? Number(((summary.unaffected_surface_area_px * effectiveScale * effectiveScale)).toFixed(2))
        : null);

  const totalCrackLengthMm = summary?.total_crack_length_mm != null
    ? summary.total_crack_length_mm
    : (isCalibrated && summary?.total_crack_length_px
        ? Number(((summary.total_crack_length_px * effectiveScale)).toFixed(2))
        : null);

  const averageCrackWidthMm = summary?.average_crack_width_mm != null
    ? summary.average_crack_width_mm
    : (isCalibrated && summary?.average_crack_width_px
        ? Number(((summary.average_crack_width_px * effectiveScale)).toFixed(2))
        : null);

  const maximumCrackWidthMm = summary?.maximum_crack_width_mm != null
    ? summary.maximum_crack_width_mm
    : (isCalibrated && summary?.maximum_crack_width_px
        ? Number(((summary.maximum_crack_width_px * effectiveScale)).toFixed(2))
        : null);

  const controllingWidthMm =
    selectedWidthMetric === "average"
      ? averageCrackWidthMm
      : maximumCrackWidthMm;

  const sevAssessment = summary?.severity_assessment;
  let derivedCategory = summary?.crack_severity_category || sevAssessment?.category;
  let derivedCode = summary?.crack_severity_code || sevAssessment?.category_code;

  if (isCalibrated && (!derivedCategory || derivedCategory === "Uncalibrated")) {
    if (cracks.length === 0 || (controllingWidthMm !== null && controllingWidthMm <= 0)) {
      derivedCategory = "Sound Surface";
      derivedCode = "none";
    } else if (controllingWidthMm !== null && controllingWidthMm !== undefined) {
      if (controllingWidthMm < 1.0) {
        derivedCategory = "Hairline";
        derivedCode = "hairline";
      } else if (controllingWidthMm < 3.0) {
        derivedCategory = "Minor";
        derivedCode = "minor";
      } else if (controllingWidthMm <= 5.0) {
        derivedCategory = "Moderate";
        derivedCode = "moderate";
      } else {
        derivedCategory = "Severe";
        derivedCode = "severe";
      }
    } else {
      derivedCategory = "Minor";
      derivedCode = "minor";
    }
  }

  const currentCategory = derivedCategory || (isCalibrated ? "Minor" : "Uncalibrated");
  const currentCode = derivedCode || (isCalibrated ? "minor" : "uncalibrated");

  // Severity styling helper: Strict 1-3 colors (Neutral + Primary or subtle Warning)
  const getSeverityBadge = (category?: string, code?: string) => {
    let cat = (category || "").toLowerCase();
    let c = (code || "").toLowerCase();

    if (isCalibrated && (c === "uncalibrated" || cat === "uncalibrated" || (!c && !cat))) {
      if (controllingWidthMm !== null && controllingWidthMm !== undefined) {
        if (controllingWidthMm <= 0) { c = "none"; cat = "sound surface"; }
        else if (controllingWidthMm < 1.0) { c = "hairline"; cat = "hairline"; }
        else if (controllingWidthMm < 3.0) { c = "minor"; cat = "minor"; }
        else if (controllingWidthMm <= 5.0) { c = "moderate"; cat = "moderate"; }
        else { c = "severe"; cat = "severe"; }
      } else {
        c = "minor";
        cat = "minor";
      }
    }

    const norm = (c || cat).toLowerCase();
    if (norm === "hairline") {
      return (
        <Badge variant="outline" className="border-border bg-muted/50 text-foreground font-semibold px-2 py-0.5">
          Hairline (&lt; 1.0 mm)
        </Badge>
      );
    }
    if (norm === "minor") {
      return (
        <Badge variant="outline" className="border-border bg-muted/50 text-foreground font-semibold px-2 py-0.5">
          Minor (1.0 - &lt;3.0 mm)
        </Badge>
      );
    }
    if (norm === "moderate") {
      return (
        <Badge variant="outline" className="border-border bg-muted/50 text-foreground font-semibold px-2 py-0.5">
          Moderate (3.0 - 5.0 mm)
        </Badge>
      );
    }
    if (norm === "severe") {
      return (
        <Badge variant="outline" className="border-border bg-muted/60 text-foreground font-bold px-2 py-0.5 ring-1 ring-border">
          Severe (&gt; 5.0 mm)
        </Badge>
      );
    }
    if (norm === "no_visible_damage" || norm === "none" || norm.includes("sound")) {
      return (
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground font-medium px-2 py-0.5">
          Sound Surface (0.0 mm)
        </Badge>
      );
    }
    if (isCalibrated) {
      return (
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-semibold px-2 py-0.5">
          Calibrated ({effectiveScale.toFixed(4)} mm/px)
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium px-2 py-0.5 flex items-center gap-1">
        <AlertTriangle className="size-3" />
        Uncalibrated (Scale Required)
      </Badge>
    );
  };

  const handleOpenCalibration = () => {
    if (onCalibrate) {
      onCalibrate(photo.id);
    } else {
      setCalibrationModalOpen(true);
    }
  };

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

  const dmg =
    summary?.damage_assessment ||
    details?.damageAssessment ||
    details?.damage_assessment ||
    photo?.damageAssessment ||
    photo?.damage_assessment;

  const density = Number(summary?.crack_coverage_pct || summary?.crack_density_pct || 0);
  const peakWidthMm = summary?.maximum_crack_width_mm;
  const peakWidthPx = Number(summary?.maximum_crack_width_px || 0);
  const branches = Number(summary?.total_branch_count || 0);
  const surfaceArea = Number(summary?.inspected_surface_area_px || 0);
  const minDim = surfaceArea > 0 ? Math.sqrt(surfaceArea) : 1000;
  const relThickness = minDim > 0 ? peakWidthPx / minDim : 0;
  const hasCracks = Number(summary?.crack_count || 0) > 0 || density > 0 || summary?.has_cracks;

  let damageCode = "none";
  let damageFactor = "Sound surface";
  let damageVal = "0.0% coverage";

  if (dmg && dmg.severity_code) {
    damageCode = dmg.severity_code;
    damageFactor = dmg.controlling_factor || "AI Assessment";
    damageVal = dmg.controlling_value || `${density.toFixed(2)}% coverage`;
  } else if (!hasCracks) {
    damageCode = "none";
    damageFactor = "Sound surface";
    damageVal = "No cracks";
  } else if (isCalibrated && peakWidthMm != null) {
    if (peakWidthMm > 8.0) {
      damageCode = "critical";
      damageFactor = "Peak Width";
      damageVal = `${peakWidthMm.toFixed(2)} mm (> 8.0 mm)`;
    } else if (density > 9.0) {
      damageCode = "critical";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (> 9.0%)`;
    } else if (branches > 50) {
      damageCode = "critical";
      damageFactor = "Alligator Fatigue";
      damageVal = `${branches} branches`;
    } else if (peakWidthMm > 5.0) {
      damageCode = "severe";
      damageFactor = "Peak Width";
      damageVal = `${peakWidthMm.toFixed(2)} mm (5.0 - 8.0 mm)`;
    } else if (density > 5.0) {
      damageCode = "severe";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (5.0 - 9.0%)`;
    } else if (branches > 10) {
      damageCode = "severe";
      damageFactor = "Fatigue Branches";
      damageVal = `${branches} branches`;
    } else if (peakWidthMm >= 3.0) {
      damageCode = "moderate";
      damageFactor = "Peak Width";
      damageVal = `${peakWidthMm.toFixed(2)} mm (3.0 - 5.0 mm)`;
    } else if (density >= 2.0) {
      damageCode = "moderate";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (2.0 - 5.0%)`;
    } else {
      damageCode = "minor";
      damageFactor = "Minor Width";
      damageVal = `${peakWidthMm.toFixed(2)} mm (< 3.0 mm)`;
    }
  } else {
    if (density > 9.0) {
      damageCode = "critical";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (> 9.0%)`;
    } else if (relThickness >= 0.09) {
      damageCode = "critical";
      damageFactor = "Relative Width";
      damageVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else if (branches > 50) {
      damageCode = "critical";
      damageFactor = "Alligator Network";
      damageVal = `${branches} branches`;
    } else if (density >= 2.5) {
      damageCode = "severe";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (2.5 - 9.0%)`;
    } else if (relThickness >= 0.045) {
      damageCode = "severe";
      damageFactor = "Relative Width";
      damageVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else if (branches > 10) {
      damageCode = "severe";
      damageFactor = "Interconnected Branches";
      damageVal = `${branches} branches`;
    } else if (density >= 0.5) {
      damageCode = "moderate";
      damageFactor = "Crack Density";
      damageVal = `${density.toFixed(2)}% (0.5 - 2.5%)`;
    } else if (relThickness >= 0.015) {
      damageCode = "moderate";
      damageFactor = "Relative Width";
      damageVal = `${(relThickness * 100).toFixed(1)}% frame`;
    } else {
      damageCode = "minor";
      damageFactor = "Superficial Fissure";
      damageVal = `${density.toFixed(2)}% (< 0.5%)`;
    }
  }

  const damageTitles: Record<string, string> = {
    none: "No Visible Damage",
    minor: "Minor Damage",
    moderate: "Moderate Damage",
    severe: "Severe Damage",
    critical: "Critical / Requires Urgent Review",
  };

  return (
    <div className="space-y-4 text-xs">
      {/* ─── Top Hero: Primary Geometry Metric (Clean 1-3 colors) ─── */}
      <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Crack Geometry & Surface Coverage
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono font-medium ${
                  isCalibrated
                    ? "text-primary border-primary/30 bg-primary/5"
                    : "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                }`}
              >
                {isCalibrated ? `Calibrated: ${effectiveScale.toFixed(4)} mm/px` : "Uncalibrated (Pixels Only)"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mathematical defect extraction derived from U-Net binary segmentation mask. Centerline skeleton graph
              traversal with Euclidean distance transform width measurement.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenCalibration}
              className="h-8 text-xs font-semibold gap-1.5 bg-background border-border text-foreground hover:bg-muted"
            >
              <Ruler className="size-3.5 text-primary" />
              <span>{isCalibrated ? "Recalibrate Scale" : "Calibrate Scale"}</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRecalculate()}
              disabled={recomputing}
              className="h-8 text-xs font-semibold gap-1.5 bg-background border-border text-foreground hover:bg-muted"
            >
              <RefreshCw className={`size-3.5 ${recomputing ? "animate-spin" : ""}`} />
              <span>{recomputing ? "Extracting…" : "Recalculate"}</span>
            </Button>
          </div>
        </div>

        {/* Primary Metric Hero Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Crack Area Coverage (Primary)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-extrabold text-foreground">
                {summary?.crack_coverage_pct !== undefined ? `${summary.crack_coverage_pct}%` : "0.00%"}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">of inspected surface</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(2, summary?.crack_coverage_pct || 0))}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Total Crack Area
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-foreground">
                {isCalibrated && totalCrackAreaMm2 !== null
                  ? `${totalCrackAreaMm2.toLocaleString()} mm²`
                  : `${summary?.total_crack_area_px?.toLocaleString()} px²`}
              </span>
              {isCalibrated && summary?.total_crack_area_px !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({summary.total_crack_area_px.toLocaleString()} px²)
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              {isCalibrated ? "Converted via (mm/px)² area factor" : "Crack pixels classified by U-Net"}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-card border border-border shadow-2xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              Unaffected Surface Area
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-foreground">
                {summary?.unaffected_surface_pct !== undefined ? `${summary.unaffected_surface_pct}%` : "100.00%"}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                ({isCalibrated && unaffectedSurfaceAreaMm2 !== null ? `${unaffectedSurfaceAreaMm2.toLocaleString()} mm² / ` : ""}{summary?.unaffected_surface_area_px?.toLocaleString()} px²)
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Inspected Surface − Crack Area (Sound Concrete)
            </span>
          </div>
        </div>
      </div>

      {/* ─── Damage Severity Assessment (AASHTO / ASTM & PDF §10 Standards) ─── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="size-4 text-primary" />
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wide">
                Damage Severity Assessment
              </h4>
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 font-mono uppercase tracking-wider border-foreground/30 text-foreground bg-background"
              >
                {damageCode === "critical"
                  ? "CRITICAL"
                  : damageCode === "severe"
                  ? "SEVERE"
                  : damageCode === "moderate"
                  ? "MODERATE"
                  : damageCode === "minor"
                  ? "MINOR"
                  : "SOUND"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isCalibrated
                ? "Governed by physical crack widths and density (AASHTO / ASTM Standards)."
                : "Scale-invariant assessment derived from crack surface density and morphology (PDF §10)."}
            </p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {isCalibrated ? `Calibrated (${effectiveScale.toFixed(4)} mm/px)` : "PDF §10 Scale-Invariant"}
          </span>
        </div>

        {/* Severity Banner */}
        <div className="p-3 rounded-lg bg-background border border-foreground/30 space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>STRUCTURAL DAMAGE LEVEL</span>
            <span>{isCalibrated ? "Calibrated mm" : "Relative Ratio & Density"}</span>
          </div>
          <div className="text-base font-extrabold text-foreground tracking-tight">
            {damageTitles[damageCode] || "No Visible Damage"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground/80 pt-1 border-t border-border/40">
            <span className="font-semibold text-muted-foreground text-[11px]">Controlling Defect:</span>
            <span className="font-mono text-foreground font-bold text-[11px]">
              {damageFactor} ({damageVal})
            </span>
          </div>
        </div>
      </div>

      {/* ─── Damage Severity Assessment & Governance Card (Clean 1-3 colors) ─── */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="size-4 text-primary" />
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wide">
                Crack Severity Assessment (AASHTO / ASTM Standard)
              </h4>
              {getSeverityBadge(currentCategory, currentCode)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Crack-width boundaries: Hairline (&lt;1mm), Minor (1-&lt;3mm), Moderate (3-5mm), Severe (&gt;5mm).
            </p>
          </div>

          {/* Metric Selector Toggle (Maximum Width vs Average Width) */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg">
            <span className="text-[10px] font-bold text-muted-foreground uppercase px-1">Controlling Metric:</span>
            <button
              type="button"
              onClick={() => handleMetricToggle("maximum")}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all ${
                selectedWidthMetric === "maximum"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Maximum Width (Peak)
            </button>
            <button
              type="button"
              onClick={() => handleMetricToggle("average")}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all ${
                selectedWidthMetric === "average"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              Average Width (Mean)
            </button>
          </div>
        </div>

        {/* Uncalibrated Warning Banner: Single subtle amber tone */}
        {!isCalibrated && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <span className="font-bold text-xs block text-foreground">
                Optical Scale Calibration Required for Physical Severity Classification
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Crack severity categories (Hairline, Minor, Moderate, Severe) are strictly governed by physical millimetre crack widths.
                Without optical calibration, measurements are displayed in image pixels only.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenCalibration}
                className="h-7 text-xs font-semibold gap-1.5 mt-1 border-border text-foreground hover:bg-muted"
              >
                <Ruler className="size-3 text-primary" />
                <span>Open Optical Calibration Tool</span>
              </Button>
            </div>
          </div>
        )}

        {/* Both Width Metrics Side-by-Side Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div
            className={`p-3 rounded-lg border transition-all ${
              selectedWidthMetric === "maximum"
                ? "bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/20"
                : "bg-muted/30 border-border"
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                Peak Width Evaluation
                {selectedWidthMetric === "maximum" && (
                  <Badge className="text-[9px] py-0 bg-primary text-primary-foreground font-semibold">
                    Controlling
                  </Badge>
                )}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {isCalibrated && maximumCrackWidthMm !== null ? `${maximumCrackWidthMm} mm` : `${summary?.maximum_crack_width_px} px`}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-mono font-bold text-foreground">
                {isCalibrated && maximumCrackWidthMm !== null
                  ? `${maximumCrackWidthMm} mm`
                  : `${summary?.maximum_crack_width_px} px`}
              </span>
              {isCalibrated && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({summary?.maximum_crack_width_px} px)
                </span>
              )}
            </div>
            <div className="pt-1.5 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Category by Max Width:</span>
              <span className="font-semibold text-foreground">
                {(typeof sevAssessment?.category_by_max_width === "object"
                  ? sevAssessment?.category_by_max_width?.category
                  : sevAssessment?.category_by_max_width) ||
                  (isCalibrated ? currentCategory : "Uncalibrated")}
              </span>
            </div>
          </div>

          <div
            className={`p-3 rounded-lg border transition-all ${
              selectedWidthMetric === "average"
                ? "bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/20"
                : "bg-muted/30 border-border"
            }`}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                Mean Width Evaluation
                {selectedWidthMetric === "average" && (
                  <Badge className="text-[9px] py-0 bg-primary text-primary-foreground font-semibold">
                    Controlling
                  </Badge>
                )}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {isCalibrated && averageCrackWidthMm !== null ? `${averageCrackWidthMm} mm` : `${summary?.average_crack_width_px} px`}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-mono font-bold text-foreground">
                {isCalibrated && averageCrackWidthMm !== null
                  ? `${averageCrackWidthMm} mm`
                  : `${summary?.average_crack_width_px} px`}
              </span>
              {isCalibrated && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({summary?.average_crack_width_px} px)
                </span>
              )}
            </div>
            <div className="pt-1.5 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Category by Avg Width:</span>
              <span className="font-semibold text-foreground">
                {(typeof sevAssessment?.category_by_avg_width === "object"
                  ? sevAssessment?.category_by_avg_width?.category
                  : sevAssessment?.category_by_avg_width) ||
                  (isCalibrated ? currentCategory : "Uncalibrated")}
              </span>
            </div>
          </div>
        </div>

        {/* Civil Engineering Regulatory Note */}
        <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-[11px] text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary shrink-0" />
            <span>
              <strong>Engineer Review Required:</strong> Automated optical measurement and severity categories are provided as civil engineering decision support. Final structural appraisal requires qualified civil engineer validation.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono shrink-0 self-start sm:self-auto border-border text-muted-foreground">
            Status: Pending Engineer Review
          </Badge>
        </div>
      </div>

      {/* ─── Grid: 5 Detailed Summary Cards (Clean Monochromatic) ─── */}
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
            {isCalibrated && totalCrackLengthMm !== null
              ? `${totalCrackLengthMm} mm`
              : `${summary?.total_crack_length_px?.toLocaleString()} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {isCalibrated ? `(${summary?.total_crack_length_px?.toLocaleString()} px)` : "Centreline skeleton sum"}
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Average Width</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {isCalibrated && averageCrackWidthMm !== null
              ? `${averageCrackWidthMm} mm`
              : `${summary?.average_crack_width_px} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {isCalibrated ? `(${summary?.average_crack_width_px} px)` : "Mean EDT thickness"}
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Maximum Width</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {isCalibrated && maximumCrackWidthMm !== null
              ? `${maximumCrackWidthMm} mm`
              : `${summary?.maximum_crack_width_px} px`}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {isCalibrated ? `(${summary?.maximum_crack_width_px} px)` : "Peak EDT thickness"}
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card space-y-0.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Inspected Surface</span>
          <span className="text-sm font-mono font-bold text-foreground">
            {isCalibrated && inspectedSurfaceAreaMm2 !== null
              ? `${inspectedSurfaceAreaMm2.toLocaleString()} mm²`
              : `${summary?.inspected_surface_area_px?.toLocaleString()} px²`}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {isCalibrated ? `(${summary?.inspected_surface_area_px?.toLocaleString()} px²)` : (summary?.has_surface_mask ? "Surface ROI mask" : "Entire image area")}
          </span>
        </div>
      </div>

      {/* ─── Geometry Visualization Section ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
          <div className="flex items-center gap-1.5">
            <Eye className="size-4 text-primary" />
            <h4 className="font-bold text-foreground text-xs">Dedicated Geometry Visualization</h4>
            {selectedCrack && (
              <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
                Selected: {selectedCrack.id}
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
                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Centerline & Scale
            </button>
            <button
              type="button"
              onClick={() => setViewLayer("unet")}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                viewLayer === "unet"
                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
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
                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
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
                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Original Photo
            </button>
          </div>
        </div>

        {/* Visualizer Canvas Viewport */}
        <div className="relative rounded-lg overflow-hidden border border-border bg-black flex items-center justify-center min-h-[260px] max-h-[440px]">
          <img
            src={currentPreviewSrc}
            alt="Geometry Visualization"
            className="w-full h-full object-contain max-h-[440px]"
          />

          {/* Interactive Crack Info Overlay if selected */}
          {selectedCrack && (
            <div className="absolute top-2 right-2 bg-card/95 backdrop-blur-md border border-border p-2.5 rounded-lg text-foreground space-y-1 shadow-lg text-[11px]">
              <div className="flex items-center justify-between gap-2 font-mono font-bold text-primary">
                <span>{selectedCrack.id}</span>
                <span className="text-[10px] text-muted-foreground font-normal">{selectedCrack.suggested_type}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
                <span className="text-muted-foreground">Area:</span>
                <span>
                  {isCalibrated && (selectedCrack.area_mm2 != null || effectiveScale > 0)
                    ? `${selectedCrack.area_mm2 != null ? selectedCrack.area_mm2 : Number((selectedCrack.area_px * effectiveScale * effectiveScale).toFixed(1))} mm²`
                    : `${selectedCrack.area_px.toLocaleString()} px²`}
                </span>
                <span className="text-muted-foreground">Length:</span>
                <span>
                  {isCalibrated && (selectedCrack.length_mm != null || effectiveScale > 0)
                    ? `${selectedCrack.length_mm != null ? selectedCrack.length_mm : Number((selectedCrack.length_px * effectiveScale).toFixed(1))} mm`
                    : `${selectedCrack.length_px} px`}
                </span>
                <span className="text-muted-foreground">Avg Width:</span>
                <span>
                  {isCalibrated && (selectedCrack.avg_width_mm != null || effectiveScale > 0)
                    ? `${selectedCrack.avg_width_mm != null ? selectedCrack.avg_width_mm : Number((selectedCrack.avg_width_px * effectiveScale).toFixed(2))} mm`
                    : `${selectedCrack.avg_width_px} px`}
                </span>
                <span className="text-muted-foreground">Max Width:</span>
                <span>
                  {isCalibrated && (selectedCrack.max_width_mm != null || effectiveScale > 0)
                    ? `${selectedCrack.max_width_mm != null ? selectedCrack.max_width_mm : Number((selectedCrack.max_width_px * effectiveScale).toFixed(2))} mm`
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
                className="h-5 text-[10px] p-0 text-muted-foreground hover:text-foreground w-full"
              >
                Clear Selection
              </Button>
            </div>
          )}
        </div>

        {/* Legend: Clean neutral tones */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground pt-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary inline-block" /> Crack Mask Area
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-foreground inline-block border border-border" /> Skeleton Centerline
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-muted-foreground inline-block" /> Branch Junction
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary/70 inline-block" /> Crack Region ID
            </span>
          </div>
          <span>Click any table row below to inspect region geometry.</span>
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
                  className={`px-2 py-0.5 rounded transition-all ${
                    activeUnit === "mm" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground"
                  }`}
                >
                  Metric (mm)
                </button>
                <button
                  type="button"
                  onClick={() => setUnitMode("px")}
                  className={`px-2 py-0.5 rounded transition-all ${
                    activeUnit === "px" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground"
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
                <th className="py-2 px-2.5">Severity</th>
                <th className="py-2 px-2.5">Orientation</th>
                <th className="py-2 px-2.5">Structural Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCracks.length > 0 ? (
                filteredCracks.map((c) => {
                  const isSelected = selectedCrackId === c.id;
                  const cAreaMm2 = c.area_mm2 != null ? c.area_mm2 : (effectiveScale > 0 ? Number((c.area_px * effectiveScale * effectiveScale).toFixed(1)) : null);
                  const cLengthMm = c.length_mm != null ? c.length_mm : (effectiveScale > 0 ? Number((c.length_px * effectiveScale).toFixed(1)) : null);
                  const cAvgWidthMm = c.avg_width_mm != null ? c.avg_width_mm : (effectiveScale > 0 ? Number((c.avg_width_px * effectiveScale).toFixed(2)) : null);
                  const cMaxWidthMm = c.max_width_mm != null ? c.max_width_mm : (effectiveScale > 0 ? Number((c.max_width_px * effectiveScale).toFixed(2)) : null);

                  let crackCategory = c.severity_category;
                  let crackCode = c.severity_code;
                  if (isCalibrated && (!crackCategory || crackCategory === "Uncalibrated")) {
                    const crackWidth = cMaxWidthMm ?? (cAvgWidthMm ?? 0);
                    if (crackWidth < 1.0) { crackCategory = "Hairline"; crackCode = "hairline"; }
                    else if (crackWidth < 3.0) { crackCategory = "Minor"; crackCode = "minor"; }
                    else if (crackWidth <= 5.0) { crackCategory = "Moderate"; crackCode = "moderate"; }
                    else { crackCategory = "Severe"; crackCode = "severe"; }
                  }

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCrackId(isSelected ? null : c.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-l-2 border-primary font-semibold"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <td className="py-2 px-2.5 font-mono font-bold text-foreground flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            isSelected ? "bg-primary" : "bg-muted-foreground"
                          }`}
                        />
                        {c.id}
                      </td>
                      <td className="py-2 px-2.5 font-mono">
                        {activeUnit === "mm" && cAreaMm2 != null
                          ? cAreaMm2.toLocaleString()
                          : c.area_px.toLocaleString()}
                      </td>
                      <td className="py-2 px-2.5 font-mono">
                        {activeUnit === "mm" && cLengthMm != null
                          ? cLengthMm.toFixed(1)
                          : c.length_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-foreground">
                        {activeUnit === "mm" && cAvgWidthMm != null
                          ? cAvgWidthMm.toFixed(2)
                          : c.avg_width_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-bold text-foreground">
                        {activeUnit === "mm" && cMaxWidthMm != null
                          ? cMaxWidthMm.toFixed(2)
                          : c.max_width_px.toFixed(1)}
                      </td>
                      <td className="py-2 px-2.5 font-mono">
                        {isCalibrated ? (
                          getSeverityBadge(crackCategory, crackCode)
                        ) : (
                          <span className="text-muted-foreground text-[10px]">Uncalibrated</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-muted-foreground flex items-center gap-1">
                        <Compass className="size-3 text-muted-foreground shrink-0" />
                        {c.orientation_deg.toFixed(1)}°
                      </td>
                      <td className="py-2 px-2.5">
                        <Badge variant="outline" className="text-[9px] font-normal py-0 border-border text-muted-foreground">
                          {c.suggested_type || "Longitudinal"}
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

      {/* ─── Physical Measurement Scale Calibration Card ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
            <Ruler className="size-3.5 text-primary" />
            Physical Measurement Scale Calibration
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] font-medium ${
              isCalibrated
                ? "text-primary border-primary/30 bg-primary/5"
                : "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
            }`}
          >
            {isCalibrated ? `Calibrated (${effectiveScale.toFixed(4)} mm/px)` : "Uncalibrated"}
          </Badge>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isCalibrated
            ? `Optical scale active: ${effectiveScale.toFixed(4)} mm/px. Physical lengths and widths in millimetres (mm); surface areas in square millimetres (mm²). Formula: mm_per_pixel = known_length_mm ÷ reference_length_pixels.`
            : "No optical reference marker detected. Measurements are strictly reported as image pixel quantities (px and px²). To convert to millimetres, use the interactive ruler or enter known optical scale below."}
        </p>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xs">
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
            className="h-8 text-xs font-semibold gap-1 border-border text-foreground hover:bg-muted"
          >
            {recomputing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Zap className="size-3 text-primary" />
            )}
            <span>Apply Scale & Convert</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleOpenCalibration}
            className="h-8 text-xs font-semibold gap-1.5 text-foreground border border-border"
          >
            <Crosshair className="size-3.5 text-primary" />
            <span>Interactive Optical Ruler Tool</span>
          </Button>
        </div>
      </div>

      {/* Embedded Optical Calibration Modal */}
      <OpticalCalibrationModal
        open={calibrationModalOpen}
        onOpenChange={setCalibrationModalOpen}
        photo={photo}
        inspectionId={inspectionId}
        onCalibrated={(result) => {
          if (result?.crack_geometry) {
            setGeoData(result.crack_geometry);
          }
          if (result?.calibration?.mm_per_pixel) {
            setScaleInput(String(result.calibration.mm_per_pixel));
          } else if (result?.calibration === null) {
            setScaleInput("");
          }
          if (result?.calibration?.width_metric) {
            setSelectedWidthMetric(result.calibration.width_metric);
          }
          if (result?.crack_geometry) {
            onGeometryUpdated?.(result.crack_geometry);
          }
        }}
      />
    </div>
  );
}
