/**
 * InfraScan Core Engineering & Non-Negotiable Rules Helpers
 * 
 * Strict Compliance:
 * 1. AI output is decision support, never a verdict.
 * 2. Never declare a structure unsafe. (Highest severity is "Critical / Requires Urgent Engineering Review").
 * 3. Pixels vs Millimetres: null mm_per_pixel -> display in "px" with "not calibrated".
 * 4. Progression Gate: only show delta % when both images have same viewpoint, calibrated scale, and registration.
 * 5. Absence of detections is not proof of no defects: Use "No defects detected by AI in reviewed images".
 * 6. Role-based access control.
 * 7. Reviewed-only reporting for manager views; AI-only labeled "pending review".
 */

export type SeverityLevel =
  | "no_visible_damage"
  | "minor"
  | "moderate"
  | "severe"
  | "critical";

export type RoleType =
  | "inspector"
  | "engineer"
  | "maintenance"
  | "manager"
  | "admin";

export function normalizeRole(role?: string | null): RoleType {
  const r = (role || "").toLowerCase().trim();
  if (r === "civil-engineer" || r === "civil_engineer" || r === "engineer") return "engineer";
  if (r === "maintenance-engineer" || r === "maintenance_engineer" || r === "maintenance") return "maintenance";
  if (r === "infrastructure-inspector" || r === "infrastructure_inspector" || r === "inspector") return "inspector";
  if (r === "infrastructure-manager" || r === "infrastructure_manager" || r === "manager") return "manager";
  if (r === "admin" || r === "administrator") return "admin";
  return "engineer";
}

export interface FormattedMeasurement {
  value: number;
  displayValue: string;
  unit: "px" | "mm";
  isCalibrated: boolean;
  label: string;
  annotation: string | null;
}

/**
 * Rule 3: Pixels vs millimetres
 * If mm_per_pixel is null, show measurements in px with the note "not calibrated".
 * Show mm only when a scale exists. Never convert without a scale.
 */
export function formatMeasurement(
  pixels: number,
  mmPerPixel: number | null | undefined,
  precision = 2
): FormattedMeasurement {
  if (mmPerPixel === null || mmPerPixel === undefined || mmPerPixel <= 0) {
    return {
      value: Math.round(pixels),
      displayValue: `${Math.round(pixels)}`,
      unit: "px",
      isCalibrated: false,
      label: `${Math.round(pixels)} px (not calibrated)`,
      annotation: "not calibrated",
    };
  }

  const mmStr = (pixels * mmPerPixel).toFixed(precision);
  return {
    value: Number(mmStr),
    displayValue: mmStr,
    unit: "mm",
    isCalibrated: true,
    label: `${mmStr} mm`,
    annotation: null,
  };
}

export interface ProgressionResult {
  canCompare: boolean;
  changePercent: number | null;
  changeText: string;
  warningNotice: string | null;
  rawDeltaPx: number;
}

/**
 * Rule 4: Progression needs comparable images
 * Show a change figure (e.g. "+29%") only when both inspections have:
 * - the same viewpoint
 * - a calibrated scale (mm_per_pixel != null)
 * - valid image registration
 * Otherwise show values in px with a warning.
 */
export function evaluateProgression(
  currentPx: number,
  previousPx: number,
  currentCalibrated: boolean,
  previousCalibrated: boolean,
  viewpointMatched: boolean,
  isRegistered: boolean
): ProgressionResult {
  const rawDeltaPx = currentPx - previousPx;

  if (!viewpointMatched) {
    return {
      canCompare: false,
      changePercent: null,
      changeText: `${rawDeltaPx >= 0 ? "+" : ""}${Math.round(rawDeltaPx)} px`,
      warningNotice: "Viewpoints differ between inspections. Visual progression comparison unverified.",
      rawDeltaPx,
    };
  }

  if (!isRegistered) {
    return {
      canCompare: false,
      changePercent: null,
      changeText: `${rawDeltaPx >= 0 ? "+" : ""}${Math.round(rawDeltaPx)} px`,
      warningNotice: "Image registration pending. Unaligned surfaces cannot yield certified delta.",
      rawDeltaPx,
    };
  }

  if (!currentCalibrated || !previousCalibrated) {
    return {
      canCompare: false,
      changePercent: null,
      changeText: `${rawDeltaPx >= 0 ? "+" : ""}${Math.round(rawDeltaPx)} px`,
      warningNotice: "Optical scale not calibrated on one or both inspections. Showing pixel difference only.",
      rawDeltaPx,
    };
  }

  const pct = ((currentPx - previousPx) / previousPx) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    canCompare: true,
    changePercent: Math.round(pct * 10) / 10,
    changeText: `${sign}${pct.toFixed(1)}%`,
    warningNotice: null,
    rawDeltaPx,
  };
}

/**
 * Rule 2 & 5: Severity Wording & Absence of Detections
 * Never declare a structure unsafe. Never use 'unsafe', 'failing', 'dangerous', or 'all clear'.
 */
export function getSeverityMeta(severity: SeverityLevel | string): {
  code: SeverityLevel;
  label: string;
  badgeClass: string;
  borderClass: string;
  colorHex: string;
  isUrgentReview: boolean;
} {
  const norm = String(severity).toLowerCase().replace(/[\s-]/g, "_");

  switch (norm) {
    case "critical":
    case "requires_urgent_engineering_review":
    case "urgent_engineering_review":
      return {
        code: "critical",
        label: "Critical / Requires Urgent Engineering Review",
        badgeClass: "bg-red-950/80 text-red-200 border border-red-700/80 font-semibold",
        borderClass: "border-red-600",
        colorHex: "#991b1b",
        isUrgentReview: true,
      };
    case "severe":
      return {
        code: "severe",
        label: "Severe",
        badgeClass: "bg-red-500/15 text-red-400 border border-red-500/40 font-medium",
        borderClass: "border-red-500",
        colorHex: "#ef4444",
        isUrgentReview: false,
      };
    case "moderate":
      return {
        code: "moderate",
        label: "Moderate",
        badgeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/40 font-medium",
        borderClass: "border-amber-500",
        colorHex: "#f59e0b",
        isUrgentReview: false,
      };
    case "minor":
      return {
        code: "minor",
        label: "Minor",
        badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 font-medium",
        borderClass: "border-emerald-500",
        colorHex: "#10b981",
        isUrgentReview: false,
      };
    case "no_visible_damage":
    case "none":
    default:
      return {
        code: "no_visible_damage",
        label: "No defects detected by AI in reviewed images",
        badgeClass: "bg-slate-500/15 text-slate-400 border border-slate-500/40 font-medium",
        borderClass: "border-slate-500",
        colorHex: "#64748b",
        isUrgentReview: false,
      };
  }
}

export function formatSeverityLabel(severity: SeverityLevel | string): string {
  return getSeverityMeta(severity).label;
}

/**
 * Rule 1: AI Decision Support Labels
 */
export function getFindingReviewBadge(status: "ai_suggestion" | "confirmed" | "corrected" | "rejected" | string) {
  const norm = String(status).toLowerCase();
  if (norm.includes("confirm")) {
    return {
      label: "Engineer confirmed",
      className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40",
      isEngineerApproved: true,
    };
  }
  if (norm.includes("correct")) {
    return {
      label: "Engineer corrected",
      className: "bg-blue-500/15 text-blue-400 border border-blue-500/40",
      isEngineerApproved: true,
    };
  }
  if (norm.includes("reject")) {
    return {
      label: "Engineer rejected",
      className: "bg-red-500/15 text-red-400 border border-red-500/40",
      isEngineerApproved: false,
    };
  }
  return {
    label: "AI suggestion",
    className: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
    isEngineerApproved: false,
  };
}

/**
 * Rule 6: Role Route Permission Matrix
 */
export const ROLE_ROUTE_PERMISSIONS: Record<RoleType, string[]> = {
  inspector: [
    "/dashboard/inspector",
    "/dashboard/assets",
    "/dashboard/inspections",
    "/dashboard/inspections/new",
    "/dashboard/notifications",
  ],
  engineer: [
    "/dashboard/engineer",
    "/dashboard/assets",
    "/dashboard/inspections",
    "/dashboard/analysis",
    "/dashboard/reports",
    "/dashboard/notifications",
  ],
  manager: [
    "/dashboard/manager",
    "/dashboard/assets",
    "/dashboard/inspections",
    "/dashboard/damage-map",
    "/dashboard/maintenance",
    "/dashboard/reports",
    "/dashboard/notifications",
  ],
  maintenance: [
    "/dashboard/maintenance-console",
    "/dashboard/assets",
    "/dashboard/maintenance",
    "/dashboard/notifications",
  ],
  admin: [
    "/dashboard/admin",
    "/dashboard/inspector",
    "/dashboard/engineer",
    "/dashboard/manager",
    "/dashboard/maintenance-console",
    "/dashboard/assets",
    "/dashboard/inspections",
    "/dashboard/analysis",
    "/dashboard/damage-map",
    "/dashboard/maintenance",
    "/dashboard/reports",
    "/dashboard/admin-console",
    "/dashboard/settings",
    "/dashboard/notifications",
  ],
};

export function canRoleAccessRoute(role: RoleType, path: string): boolean {
  if (role === "admin") return true;
  const allowed = ROLE_ROUTE_PERMISSIONS[role] || [];
  return allowed.some((prefix) => path.startsWith(prefix));
}
