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
  tone,
  icon,
  label,
  pulse = false,
}: {
  tone: Tone;
  icon?: React.ReactNode;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
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
  InspectionStatus,
  { tone: Tone; label: string; pulse?: boolean }
> = {
  "in-progress": { tone: "info", label: "In progress" },
  processing: { tone: "info", label: "Processing", pulse: true },
  "awaiting-review": { tone: "warning", label: "Awaiting review" },
  reviewed: { tone: "success", label: "Reviewed" },
  escalated: { tone: "danger", label: "Escalated" },
};

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const config = inspectionStatusTone[status];
  const Icon =
    status === "reviewed"
      ? CheckCircleIcon
      : status === "awaiting-review" || status === "escalated"
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
  Severity,
  { tone: Tone; label: string; solid?: boolean }
> = {
  low: { tone: "success", label: "Low" },
  medium: { tone: "warning", label: "Medium" },
  high: { tone: "danger", label: "High" },
  critical: { tone: "danger", label: "Critical", solid: true },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const config = severityTone[severity];

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
  FindingReview,
  { tone: Tone; label: string }
> = {
  pending: { tone: "warning", label: "Pending review" },
  confirmed: { tone: "success", label: "Confirmed" },
  flagged: { tone: "danger", label: "Flagged" },
};

export function FindingReviewBadge({ review }: { review: FindingReview }) {
  const config = reviewTone[review];
  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      icon={
        review === "pending"
          ? <Clock className="size-3.5" />
          : <CheckCircleIcon className="size-3.5" />
      }
    />
  );
}

/* --------------------------------- reports -------------------------------- */

const reportStatusTone: Record<ReportStatus, { tone: Tone; label: string }> = {
  ready: { tone: "success", label: "Ready" },
  generating: { tone: "info", label: "Generating" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const config = reportStatusTone[status];
  return (
    <StatusChip
      tone={config.tone}
      label={config.label}
      pulse={status === "generating"}
      icon={<Clock className="size-3.5" />}
    />
  );
}

/* ------------------------------- work orders ------------------------------- */

const workOrderTone: Record<WorkOrderStatus, { tone: Tone; label: string }> = {
  open: { tone: "danger", label: workOrderStatusLabels.open },
  scheduled: { tone: "warning", label: workOrderStatusLabels.scheduled },
  "in-progress": { tone: "info", label: workOrderStatusLabels["in-progress"] },
  closed: { tone: "success", label: workOrderStatusLabels.closed },
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  const config = workOrderTone[status];
  return (
    <StatusChip tone={config.tone} label={config.label} />
  );
}

/* -------------------------------- condition -------------------------------- */

const conditionTone: Record<AssetCondition, Tone> = {
  good: "success",
  fair: "warning",
  poor: "danger",
};

export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  return (
    <StatusChip
      tone={conditionTone[condition]}
      label={conditionLabels[condition]}
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
