import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import {
  CalendarIcon, ChevronDownIcon, ChevronRightIcon, ExportIcon, FullscreenIcon, MetricCubeIcon, TrendingUpIcon } from "./icons";
import { CrackPipeline } from "./pipeline-sample";
import { DashboardLink } from "./navigation";
import { InspectionStatusBadge, SeverityBadge } from "./shared";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  damageClasses,
  fmtDateTime,
  inspectionMethodLabels,
  useAppStore,
  type Inspection,
  type Severity,
} from "@/store/app";
import { dateRangeOptions, type DateRange } from "../../data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildReportBlob, reportFilename, triggerDownload } from "@/lib/report-download";

const dayMs = 24 * 60 * 60 * 1000;

export function DashboardContent() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-8 pb-10 md:px-6">
      <OverviewSection />
      <PipelineSection />
      <StreamSection />
      <AlertsSection />
      <ComplianceBand />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

type Metric = {
  label: string;
  value: string;
  trend?: {
    value: string;
    label: string;
    tone: "positive" | "warning";
  };
  footnote?: string;
};

function rangeToDays(range: DateRange): number {
  switch (range) {
    case "today":
      return 1;
    case "last-7-days":
      return 7;
    case "last-30-days":
      return 30;
    case "last-90-days":
      return 90;
    case "last-12-months":
      return 365;
    default:
      return 30;
  }
}

function OverviewSection() {
  const [dateRange, setDateRange] = useState<DateRange>("last-30-days");
  const { state, generateReport } = useAppStore();

  /* anchor "now" to the newest activity so the demo dates stay coherent */
  const datasetNow = useMemo(() => {
    const times = state.inspections.map((inspection) =>
      new Date(inspection.startedAt).getTime(),
    );
    const assets = state.assets.map((asset) =>
      new Date(asset.lastInspection).getTime(),
    );
    return Math.max(...times, ...assets, Date.now() - dayMs * 30);
  }, [state.inspections, state.assets]);

  const rangeStart = datasetNow - rangeToDays(dateRange) * dayMs;

  const inRangeInspections = state.inspections.filter((inspection) => {
    const time = new Date(inspection.startedAt).getTime();
    return time >= rangeStart && time <= datasetNow + dayMs;
  });

  const awaiting = state.inspections.filter(
    (inspection) => inspection.status === "awaiting-review",
  ).length;
  const processing = state.inspections.filter(
    (inspection) => inspection.status === "processing",
  ).length;

  const previousRangeInspections = state.inspections.filter((inspection) => {
    const time = new Date(inspection.startedAt).getTime();
    return time >= rangeStart - (datasetNow - rangeStart) && time < rangeStart;
  });

  const thisMonth = state.inspections.filter((inspection) => {
    const then = new Date(inspection.startedAt);
    const now = new Date(datasetNow);
    return (
      then.getMonth() === now.getMonth() &&
      then.getFullYear() === now.getFullYear()
    );
  }).length;

  const metrics: Metric[] = [
    {
      label: "Registered assets",
      value: String(state.assets.length),
      trend: {
        value: `+${Math.max(1, Math.round(state.assets.length * 0.06))}`,
        label: "new this window",
        tone: "positive",
      },
    },
    {
      label: "Inspections this month",
      value: String(thisMonth),
      trend: {
        value: `+${Math.max(
          0,
          inRangeInspections.length - previousRangeInspections.length,
        )}`,
        label: "vs previous window",
        tone: "positive",
      },
    },
    {
      label: "Awaiting review",
      value: String(awaiting).padStart(2, "0"),
      trend: {
        value: processing > 0 ? `${processing} processing` : "queue clear",
        label: "engineer validation",
        tone: awaiting > 0 ? "warning" : "positive",
      },
    },
    {
      label: "Reports generated",
      value: String(state.reports.length),
      footnote: "PDF · CSV · JSON — all exportable",
    },
  ];

  function handleExport() {
    try {
      const report = generateReport("maintenance");
      const blob = buildReportBlob(report, {
        assets: state.assets,
        inspections: state.inspections,
        workOrders: state.workOrders,
        settings: state.settings,
        userName: state.session?.name ?? "Civil Engineer",
      });
      triggerDownload(blob, reportFilename(report));
      toast.success("Maintenance Report Exported", {
        description: `${report.title} downloaded successfully.`,
      });
    } catch {
      toast.error("Failed to generate export report.");
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Network overview</h1>
          <p className="text-lg text-muted-foreground">
            Crack &amp; damage assessment across {state.assets.length} registered
            assets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className={buttonVariants({
                variant: "secondary",
                className: "h-10 gap-2 px-3.5",
              })}
            >
              <CalendarIcon className="size-5" />
              {dateRangeOptions.find((option) => option.value === dateRange)?.label}
              <ChevronDownIcon className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              collisionPadding={16}
              className="astrix-dashboard min-w-40"
            >
              <DropdownMenuRadioGroup
                value={dateRange}
                onValueChange={(value) => setDateRange(value as DateRange)}
              >
                {dateRangeOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="font-normal text-muted-foreground data-[state=checked]:font-medium data-[state=checked]:text-foreground"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" className="h-10 gap-1 px-3.5" onClick={handleExport}>
            Export
            <ExportIcon className="size-5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCardItem key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function MetricCardItem({ metric }: { metric: Metric }) {
  return (
    <article className="rounded-xl border bg-card p-3 md:p-4">
      <div className="flex flex-col gap-5 md:gap-8">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex size-7 items-center justify-center rounded-lg border md:size-8">
            <MetricCubeIcon className="size-3.5 md:size-4" />
          </div>
          <p className="text-xs font-medium text-muted-foreground md:text-sm">
            {metric.label}
          </p>
        </div>

        <div className="flex flex-col gap-2 md:gap-3">
          <p className="text-[1.625rem] leading-none font-semibold md:text-[2rem]">
            {metric.value}
          </p>

          {metric.trend ? (
            <div className="flex items-center gap-1">
              {metric.trend.tone === "positive" ? (
                <span className="inline-flex items-center gap-1 rounded-xl bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  <TrendingUpIcon className="size-3" />
                  {metric.trend.value}
                </span>
              ) : (
                <span className="text-xs font-semibold text-warning">
                  {metric.trend.value}
                </span>
              )}
              <span className="text-xs font-medium text-muted-foreground">
                {metric.trend.label}
              </span>
            </div>
          ) : null}

          {metric.footnote ? (
            <p className="text-xs font-medium text-muted-foreground">
              {metric.footnote}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

function PipelineSection() {
  const [zoom, setZoom] = useState(1);
  const { state } = useAppStore();
  const activeModel = state.models.find((model) => model.status === "active");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Live crack-detection pipeline</h2>

      <div className="relative h-100 overflow-hidden rounded-3xl border bg-secondary dark:bg-card/40">
        <div className="pipeline-dots absolute inset-0" />

        <div className="absolute top-4 right-4 left-4 z-10 flex items-center gap-0.5 md:right-auto">
          <div className="flex size-12 shrink-0 items-center justify-center gap-2 rounded-xl border bg-card md:w-auto md:justify-start md:px-3">
            <span className="relative flex size-3 md:size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
              <span className="relative size-full rounded-full bg-success" />
            </span>
            <span className="hidden text-sm text-success md:inline">
              Live pipeline
            </span>
          </div>
          <div className="flex h-12 items-center rounded-xl border bg-card px-3 md:min-w-fit">
            <span className="truncate text-sm font-medium text-primary">
              Model:{" "}
              {activeModel
                ? `${activeModel.name} ${activeModel.version}`
                : "InfraScan Model v1.0 (ResNet50)"}
            </span>
          </div>
        </div>

        <div className="no-scrollbar absolute inset-0 flex items-center overflow-x-auto px-6 pt-10 pb-16">
          <div
            className="mx-auto origin-center transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            <CrackPipeline
              role="img"
              aria-label="Crack detection pipeline nodes"
              className="min-w-220"
            />
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 rounded-xs border border-card bg-card/50 p-0.5 backdrop-blur-[7.625rem]">
          <div className="flex flex-col overflow-hidden rounded-xs border bg-card">
            <Button
              variant="outline"
              size="icon"
              className="size-9.75 rounded-none border-0 border-b border-border shadow-none"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.6, value + 0.15))}
            >
              <Plus className="size-4.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-9.75 rounded-none border-0 shadow-none"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.7, value - 0.15))}
            >
              <Minus className="size-4.5" />
            </Button>
          </div>
        </div>

        <div className="absolute right-4 bottom-4 z-10 rounded-[calc(var(--radius)+0.125rem)] border bg-card/50 p-0.5 backdrop-blur-[7.625rem]">
          <Button
            variant="outline"
            className="h-10.5 gap-2.5 rounded-lg border-0 bg-card py-2.5 pr-3.5 pl-2.5 text-sm font-medium shadow-none"
            asChild
          >
            <DashboardLink href="/dashboard/analysis">
              Open analysis queue
              <FullscreenIcon className="size-5" />
            </DashboardLink>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent inspections                                                  */
/* ------------------------------------------------------------------ */

const severityRank: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

function topSeverity(inspection: Inspection): Severity | null {
  let best: Severity | null = null;
  for (const finding of inspection.findings) {
    if (!best || severityRank[finding.severity] > severityRank[best]) {
      best = finding.severity;
    }
  }
  return best;
}

function StreamSection() {
  const { state, assetById } = useAppStore();

  const rows = useMemo(() => {
    const sorted = [...state.inspections].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return sorted.slice(0, 5);
  }, [state.inspections]);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Recent inspections</h2>
          <p className="text-sm text-muted-foreground">
            Capture streams, AI analysis status and engineer review progress
          </p>
        </div>
        <Button variant="secondary" className="gap-1 pl-3 pr-2" asChild>
          <DashboardLink href="/dashboard/inspections">
            See all
            <ChevronRightIcon className="size-5" />
          </DashboardLink>
        </Button>
      </div>

      <Table className="min-w-215">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[24%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Inspection</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Top severity</TableHead>
            <TableHead>Findings</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <StreamRow
              key={row.id}
              row={row}
              assetName={assetById(row.assetId)?.name ?? "Unassigned"}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function StreamRow({
  row,
  assetName,
}: {
  row: Inspection;
  assetName: string;
}) {
  const severity = topSeverity(row);
  const confidence =
    row.findings.length > 0
      ? Math.max(...row.findings.map((finding) => finding.confidence))
      : null;

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <DashboardLink
          href={`/dashboard/inspections/${row.id}`}
          className="group block space-y-1"
        >
          <p className="truncate font-medium group-hover:text-primary">
            {row.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.id} · {inspectionMethodLabels[row.method]} ·{" "}
            {fmtDateTime(row.startedAt)}
          </p>
        </DashboardLink>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <p className="font-mono text-sm font-medium">{row.assetId}</p>
          <p className="truncate text-xs text-muted-foreground">{assetName}</p>
        </div>
      </TableCell>
      <TableCell>
        {severity ? (
          <SeverityBadge severity={severity} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="tabular-nums">
        {row.findings.length > 0 ? (
          <span>
            {row.findings.length}
            {confidence ? (
              <span className="ml-1 text-xs text-muted-foreground">
                @ {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.status === "processing" ? (
          <div className="flex min-w-40 flex-col gap-1.5">
            <InspectionStatusBadge status={row.status} />
            <Progress value={row.progress} className="h-1.5" />
          </div>
        ) : (
          <InspectionStatusBadge status={row.status} />
        )}
      </TableCell>
    </TableRow>
  );
}

/* ------------------------------------------------------------------ */
/* Priority alerts                                                     */
/* ------------------------------------------------------------------ */

function AlertsSection() {
  const { state, assetById } = useAppStore();

  const alerts = useMemo(() => {
    const rows = state.inspections.flatMap((inspection) =>
      inspection.findings
        .filter((finding) =>
          inspection.status === "escalated"
            ? finding.severity === "critical" || finding.severity === "high"
            : finding.review === "pending" &&
              (finding.severity === "critical" || finding.severity === "high" || finding.severity === "medium"),
        )
        .map((finding) => ({ inspection, finding })),
    );
    return rows
      .sort(
        (a, b) =>
          severityRank[b.finding.severity] - severityRank[a.finding.severity],
      )
      .slice(0, 6);
  }, [state.inspections]);

  return (
    <section className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Priority alerts</h2>
        <p className="text-sm text-muted-foreground">
          Open findings ranked by severity — engineer validation required
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-8 text-center">
          <p className="text-sm font-medium">All clear — no open alerts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every detected finding has passed review sign-off.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {alerts.map(({ inspection, finding }) => (
            <DashboardLink
              key={finding.id}
              href={`/dashboard/analysis/${inspection.id}`}
              className="group flex items-start justify-between gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <span className="rounded-md border bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                    {finding.classCode}
                  </span>
                </div>
                <p className="truncate text-sm font-semibold">
                  {damageClasses[finding.classCode].label}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {inspection.id} · {inspection.assetId} ·{" "}
                  {assetById(inspection.assetId)?.name ?? ""}
                </p>
              </div>
              <AlertTriangle
                className={cn(
                  "size-4 shrink-0",
                  finding.severity === "critical" || finding.severity === "high"
                    ? "text-destructive"
                    : finding.severity === "medium"
                      ? "text-warning"
                      : "text-muted-foreground/40",
                )}
              />
            </DashboardLink>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Compliance band                                                     */
/* ------------------------------------------------------------------ */

function ComplianceBand() {
  const { state } = useAppStore();
  const activeModel =
    state.models.find((model) => model.status === "active") ??
    state.models[0];

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3.5">
      <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-warning" />
      <p className="text-sm leading-relaxed text-foreground/90">
        <span className="font-semibold">Safety boundary.</span>{" "}
        AI priorities are recommendations. A qualified civil engineer must
        validate severity classes and approve repairs before maintenance work
        orders are committed to an asset owner. Outputs are traceable to model
        version{" "}
        <span className="font-mono text-xs">
          {activeModel ? `${activeModel.name} ${activeModel.version}` : "InfraScan Model v1.0 (ResNet50)"}
        </span>
        .
      </p>
    </div>
  );
}
