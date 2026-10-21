import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  FolderDown,
  Braces,
  Wrench,
} from "lucide-react";
import { ChevronDownIcon } from "./icons";
import { FormatBadge, ReportStatusBadge } from "./shared";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fmtDateTime,
  reportKindLabels,
  useAppStore,
  type ReportKind,
} from "@/store/app";
import { buildReportBlob, reportFilename, triggerDownload } from "@/lib/report-download";
import { dateRangeOptions, type DateRange } from "../../data";
import { cn } from "@/lib/utils";

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

const reportKindIcons: Record<ReportKind, SvgIcon> = {
  integrity: FileText,
  audit: ClipboardList,
  findings: Braces,
  maintenance: Wrench,
};

type KindFilter = "all" | ReportKind;
type StatusFilter = "all" | "ready" | "generating";

const reportKindFilterOptions: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All report types" },
  { value: "integrity", label: "Integrity certificate" },
  { value: "audit", label: "Inspection audit log" },
  { value: "findings", label: "Findings dataset export" },
  { value: "maintenance", label: "Maintenance summary" },
];

const reportStatusFilterOptions: {
  value: StatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All status" },
  { value: "ready", label: "Ready" },
  { value: "generating", label: "Generating" },
];

const kindHelpText: Record<ReportKind, string> = {
  integrity: "Certified findings dossier for a signed-off inspection batch (PDF).",
  audit: "Chronological inspection log — one row per inspection (CSV).",
  findings: "Raw detections, masks-free geometry, review state (JSON).",
  maintenance: "Work-order portfolio with priorities and due dates (PDF).",
};

export function ReportsContent() {
  const { state, generateReport } = useAppStore();
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("last-30-days");

  const filteredReports = useMemo(() => {
    const cutoff =
      (dateRange === "today" ? 1 : dateRange === "last-7-days" ? 7 : dateRange === "last-30-days" ? 30 : 90) *
      24 * 60 * 60 * 1000;
    const newest = Math.max(
      ...state.reports.map((report) =>
        new Date(report.createdAt).getTime(),
      ),
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    return state.reports.filter((report) => {
      const matchesKind = kindFilter === "all" ? true : report.kind === kindFilter;
      const matchesStatus =
        statusFilter === "all" ? true : report.status === statusFilter;
      const inRange =
        newest - new Date(report.createdAt).getTime() <= cutoff;
      return matchesKind && matchesStatus && inRange;
    });
  }, [state.reports, kindFilter, statusFilter, dateRange]);

  const kindFilterLabel =
    reportKindFilterOptions.find((option) => option.value === kindFilter)
      ?.label ?? "All report types";
  const statusFilterLabel =
    reportStatusFilterOptions.find((option) => option.value === statusFilter)
      ?.label ?? "All status";
  const dateRangeLabel =
    dateRangeOptions.find((option) => option.value === dateRange)?.label ??
    "Last 30 Days";

  function handleGenerate(kind: ReportKind) {
    generateReport(kind);
  }

  function handleDownload(report: (typeof state.reports)[number]) {
    const blob = buildReportBlob(report, {
      assets: state.assets,
      inspections: state.inspections,
      workOrders: state.workOrders,
      settings: state.settings,
      userName: state.session?.name ?? "Demo user",
    });
    triggerDownload(blob, reportFilename(report));
  }

  const kindFilterControl = (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={buttonVariants({
          variant: "secondary",
          className: "h-10 w-full justify-between gap-1 px-3 md:h-8 md:w-auto",
        })}
      >
        <span className="truncate">{kindFilterLabel}</span>
        <ChevronDownIcon className="size-5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="astrix-dashboard min-w-44"
      >
        <DropdownMenuRadioGroup
          value={kindFilter}
          onValueChange={(value) => setKindFilter(value as KindFilter)}
        >
          {reportKindFilterOptions.map((option) => (
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
  );

  const statusFilterControl = (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={buttonVariants({
          variant: "secondary",
          className: "h-10 w-full justify-between gap-1 px-3 md:h-8 md:w-auto",
        })}
      >
        <span className="truncate">{statusFilterLabel}</span>
        <ChevronDownIcon className="size-5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className="astrix-dashboard min-w-40"
      >
        <DropdownMenuRadioGroup
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          {reportStatusFilterOptions.map((option) => (
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
  );

  const dateFilterControl = (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={buttonVariants({
          variant: "secondary",
          className: "h-10 min-w-0 justify-between gap-2 px-3 md:h-8 md:w-auto",
        })}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{dateRangeLabel}</span>
        </span>
        <ChevronDownIcon className="size-5 shrink-0" />
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
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-8 pb-10 md:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-lg text-muted-foreground">
          Generate and export certified assessment documentation
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Select a report type to generate documentation
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(reportKindLabels) as ReportKind[]).map((kind) => {
            const Icon = reportKindIcons[kind];

            return (
              <div
                key={kind}
                className="flex flex-col gap-8 rounded-xl border bg-card p-4 pb-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="size-5" />
                  </div>
                  <FormatBadge format={kind === "audit" ? "csv" : kind === "findings" ? "json" : "pdf"} />
                </div>

                <div className="flex flex-1 flex-col gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">
                      {reportKindLabels[kind]}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {kindHelpText[kind]}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full gap-2"
                    onClick={() => handleGenerate(kind)}
                  >
                    Generate report
                    <ArrowRight className="size-4.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Reports render over the register as stored at generation time —
          per-inspection certificates can also be generated from an inspection's
          detail page.
        </p>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-center gap-2 md:hidden">
          <div className="min-w-0 flex-1">{dateFilterControl}</div>
          <div className="min-w-0 flex-1">{statusFilterControl}</div>
        </div>

        <div className="@container/reports-header hidden w-full min-w-0 md:block">
          <div className="flex w-full min-w-0 flex-col gap-4 @min-[52rem]/reports-header:flex-row @min-[52rem]/reports-header:items-end @min-[52rem]/reports-header:justify-between">
            <div className="min-w-0 space-y-2 @min-[52rem]/reports-header:min-w-56">
              <h2 className="text-lg font-medium">Generated reports</h2>
              <p className="text-sm text-muted-foreground">
                Download and manage documentation exports
              </p>
            </div>

            <div className="flex w-full min-w-0 items-center justify-between gap-2 @min-[52rem]/reports-header:w-auto">
              {dateFilterControl}
              <div className="flex items-center gap-2">
                {kindFilterControl}
                {statusFilterControl}
              </div>
            </div>
          </div>
        </div>

        <Table className="min-w-215">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Report name</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date generated</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReports.map((report) => (
              <ReportRowItem
                key={report.id}
                report={report}
                onDownload={() => handleDownload(report)}
              />
            ))}
          </TableBody>
        </Table>

        {filteredReports.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center">
            <p className="text-sm font-medium">No reports in this window</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate one using the cards above.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReportRowItem({
  report,
  onDownload,
}: {
  report: {
    id: string;
    title: string;
    kind: ReportKind;
    format: "pdf" | "csv" | "json";
    inspectionId?: string;
    createdAt: string;
    status: "ready" | "generating";
  };
  onDownload: () => void;
}) {
  const ready = report.status === "ready";
  const Icon = reportKindIcons[report.kind];

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-secondary">
            <Icon className="size-4" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">{report.title}</p>
            <p className="text-xs text-muted-foreground">
              {report.id} · {reportKindLabels[report.kind]}
              {report.inspectionId ? ` · ${report.inspectionId}` : ""}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <FormatBadge format={report.format} />
      </TableCell>
      <TableCell>
        <ReportStatusBadge status={report.status} />
      </TableCell>
      <TableCell className={cn("text-muted-foreground")}>
        {fmtDateTime(report.createdAt)}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={!ready}
          className="gap-2"
          onClick={onDownload}
        >
          Download
          <FolderDown className="size-5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
