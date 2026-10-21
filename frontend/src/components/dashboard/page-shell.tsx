import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { InfraScanMark } from "@/components/watermelon/astrix-dashboard/components/astrix/logo";

/* ------------------------------------------------------------------ */
/* Shared scaffolding for dashboard pages                              */
/* ------------------------------------------------------------------ */

export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 md:px-6 lg:py-8",
        wide ? "max-w-[1400px]" : "max-w-6xl",
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel = "Back",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6">
      {backHref ? <BackLink href={backHref} label={backLabel} /> : null}
      {eyebrow ? (
        <div className="mb-1 text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
          {eyebrow}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  const { navigate } = useDashboardNavigation();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-2 gap-1.5 text-muted-foreground hover:text-foreground"
      onClick={() => navigate(href)}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Blocks reused across pages                                          */
/* ------------------------------------------------------------------ */

/**
 * The compliance band from the InfraScan spec: AI output is a
 * recommendation, a qualified engineer must validate every decision.
 */
export function ComplianceNote({
  className,
  message = "AI priorities are recommendations. Qualified personnel must validate repairs before any field action is taken.",
}: {
  className?: string;
  message?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft/60 px-4 py-3",
        className,
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <ShieldCheck className="size-4" />
      </span>
      <p className="text-xs leading-relaxed text-warning">
        {message}
      </p>
    </div>
  );
}

type StatTone = "default" | "success" | "warning" | "danger";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatTone;
}) {
  const toneBar: Record<StatTone, string> = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card px-4 py-3.5">
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          toneBar[tone],
        )}
      />
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function MetaItem({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <InfraScanMark className="size-10 text-muted-foreground/40" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
