import { Clock } from "lucide-react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
} from "./icons";
import type {
  AssetCondition,
  FindingReview,
  InspectionStatus,
  ReportStatus,
  Severity,
  WorkOrderStatus,
} from "@/store/app";
import { conditionLabels, workOrderStatusLabels } from "@/store/app";

/* ------------------------------- shared tone map ------------------------------ */

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-accent text-accent-foreground",
  neutral: "bg-muted text-muted-foreground",
};

function StatusChip({
  tone = "neutral",
  icon,
  label,
  pulse = false,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  label: string;
  pulse?: boolean;
}) {
  const toneCls = (tone && toneClasses[tone]) || toneClasses.neutral;
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap ${toneCls}`}
    >
      {icon}
      {label}
      {pulse ? (
        <span className="relative ml-0.5 flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
          <span className="relative size-full rounded-full bg-current" />
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------- inspection ------------------------------- */

const inspectionStatusTone: Record<
  string,
  { tone: Tone; label: string; pulse?: boolean }
> = {
  assigned: { tone: "info", label: "Assigned" },
  "in-progress": { tone: "info", label: "In progress" },
  in_progress: { tone: "info", label: "In progress" },
  processing: { tone: "info", label: "Processing", pulse: true },
  "awaiting-review": { tone: "warning", label: "Awaiting review" },
  awaiting_review: { tone: "warning", label: "Awaiting review" },
  pending_review: { tone: "warning", label: "Pending review" },
  in_review: { tone: "warning", label: "In review" },
  reviewed: { tone: "success", label: "Reviewed" },
  reported: { tone: "success", label: "Reported" },
  closed: { tone: "neutral", label: "Closed" },
  escalated: { tone: "danger", label: "Escalated" },
};

export function InspectionStatusBadge({ status }: { status: InspectionStatus | string }) {
  const norm = (status || "assigned").toLowerCase().trim();
  const config = inspectionStatusTone[norm] || {
    tone: "neutral" as Tone,
    label: (status || "Assigned").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  const Icon =
    norm === "reviewed" || norm === "reported"
      ? CheckCircleIcon
      : norm === "awaiting-review" || norm === "pending_review" || norm === "escalated"
        ? WarningCircleIcon
        : Clock;

  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      pulse={config.pulse}
      icon={<Icon className="size-3.5" />}
    />
  );
}

/* -------------------------------- severity -------------------------------- */

const severityTone: Record<
  string,
  { tone: Tone; label: string; solid?: boolean }
> = {
  low: { tone: "success", label: "Low" },
  minor: { tone: "success", label: "Minor" },
  medium: { tone: "warning", label: "Medium" },
  moderate: { tone: "warning", label: "Moderate" },
  high: { tone: "danger", label: "High" },
  severe: { tone: "danger", label: "Severe" },
  critical: { tone: "danger", label: "Critical", solid: true },
  none: { tone: "neutral", label: "None" },
};

export function SeverityBadge({ severity }: { severity: Severity | string }) {
  const key = (severity || "low").toLowerCase().trim();
  const config = severityTone[key] || { tone: "neutral" as Tone, label: severity || "Normal" };

  if (config.solid) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-destructive px-2.5 text-xs font-semibold text-white">
        <WarningCircleIcon className="size-3.5" />
        {config.label}
      </span>
    );
  }

  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      icon={<WarningCircleIcon className="size-3.5" />}
    />
  );
}

/* ------------------------------ finding review ----------------------------- */

const reviewTone: Record<
  string,
  { tone: Tone; label: string }
> = {
  pending: { tone: "warning", label: "Pending review" },
  confirmed: { tone: "success", label: "Confirmed" },
  flagged: { tone: "danger", label: "Flagged" },
};

export function FindingReviewBadge({ review }: { review: FindingReview | string }) {
  const norm = (review || "pending").toLowerCase().trim();
  const config = reviewTone[norm] || {
    tone: "neutral" as Tone,
    label: (review || "Pending").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      icon={
        norm === "pending"
          ? <Clock className="size-3.5" />
          : <CheckCircleIcon className="size-3.5" />
      }
    />
  );
}

/* --------------------------------- reports -------------------------------- */

const reportStatusTone: Record<string, { tone: Tone; label: string }> = {
  ready: { tone: "success", label: "Ready" },
  generating: { tone: "info", label: "Generating" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus | string }) {
  const norm = (status || "ready").toLowerCase().trim();
  const config = reportStatusTone[norm] || {
    tone: "neutral" as Tone,
    label: (status || "Ready").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      pulse={norm === "generating"}
      icon={<Clock className="size-3.5" />}
    />
  );
}

/* ------------------------------- work orders ------------------------------- */

const workOrderTone: Record<string, { tone: Tone; label: string }> = {
  open: { tone: "danger", label: workOrderStatusLabels.open },
  scheduled: { tone: "warning", label: workOrderStatusLabels.scheduled },
  "in-progress": { tone: "info", label: workOrderStatusLabels["in-progress"] },
  closed: { tone: "success", label: workOrderStatusLabels.closed },
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus | string }) {
  const norm = (status || "open").toLowerCase().trim();
  const config = workOrderTone[norm] || {
    tone: "neutral" as Tone,
    label: (status || "Open").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  return (
    <StatusChip tone={config.tone} label={config.label} />
  );
}

/* -------------------------------- condition -------------------------------- */

const conditionTone: Record<string, Tone> = {
  good: "success",
  fair: "warning",
  poor: "danger",
  critical: "danger",
  moderate: "warning",
  minor: "success",
};

export function ConditionBadge({ condition }: { condition?: AssetCondition | string | null }) {
  const norm = (condition || "good").toLowerCase().trim();
  const tone = conditionTone[norm] || "neutral";
  const label = conditionLabels[norm as AssetCondition] || (condition ? String(condition).toUpperCase() : "Good");
  return (
    <StatusChip
      tone={tone}
      label={label}
    />
  );
}

/* --------------------------------- format --------------------------------- */

export function FormatBadge({ format }: { format: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border bg-card px-2 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
      {format}
    </span>
  );
}
