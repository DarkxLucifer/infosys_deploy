import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListFilter,
} from "lucide-react";
import { InspectionStatusBadge, SeverityBadge } from "./shared";
import { SearchIcon } from "./icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  inspectionStatusLabels,
  useAppStore,
  type Inspection,
  type InspectionStatus,
  type Severity,
} from "@/store/app";
import { useDashboardNavigation } from "./navigation";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | InspectionStatus;

const PAGE_SIZE = 8;

const filters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "awaiting-review", label: "Awaiting review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "escalated", label: "Escalated" },
];

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

export function AnalysisQueueContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const { state, assetById } = useAppStore();
  const { navigate } = useDashboardNavigation();

  const queue = useMemo(() => {
    const sorted = [...state.inspections].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return sorted.filter((inspection) => inspection.status !== "in-progress");
  }, [state.inspections]);

  const counts: Record<StatusFilter, number> = useMemo(() => {
    return {
      all: queue.length,
      "in-progress": 0,
      processing: queue.filter((row) => row.status === "processing").length,
      "awaiting-review": queue.filter((row) => row.status === "awaiting-review")
        .length,
      reviewed: queue.filter((row) => row.status === "reviewed").length,
      escalated: queue.filter((row) => row.status === "escalated").length,
    };
  }, [queue]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return queue.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ? true : row.status === statusFilter;
      const matchesQuery =
        query === "" ||
        row.title.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query) ||
        row.assetId.toLowerCase().includes(query) ||
        (assetById(row.assetId)?.name ?? "").toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });
  }, [searchQuery, statusFilter, queue, assetById]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  const setFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-8 pb-10 md:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Analysis queue</h1>
        <p className="text-lg text-muted-foreground">
          AI-detected cracks queued for qualified engineer validation
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListFilter className="size-4" />
              Filters
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className="inline-flex min-w-28 shrink-0 items-center justify-between gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
              >
                {filters.find((filter) => filter.value === statusFilter)?.label}
                <ChevronRight className="size-4 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                collisionPadding={16}
                className="astrix-dashboard min-w-44"
              >
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(value) => setFilter(value as StatusFilter)}
                >
                  {filters.map((filter) => (
                    <DropdownMenuRadioItem
                      key={filter.value}
                      value={filter.value}
                      className="font-normal text-muted-foreground data-[state=checked]:font-medium data-[state=checked]:text-foreground"
                    >
                      {filter.label}
                      <span className="ml-auto text-xs tabular-nums">
                        {counts[filter.value]}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <InputGroup className="h-11 w-full border-none bg-secondary px-3 py-1">
            <InputGroupAddon className="pl-0">
              <SearchIcon className="size-3.5 text-input-addon-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              className="h-full p-0 px-1.5!"
              aria-label="Search analysis queue"
              placeholder="Search inspections, asset ids..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
            />
          </InputGroup>
        </div>

        <div className="@container/toolbar hidden w-full min-w-0 md:block">
          <div className="flex w-full min-w-0 flex-col gap-3 @min-[52rem]/toolbar:flex-row @min-[52rem]/toolbar:items-center @min-[52rem]/toolbar:justify-between">
            <InputGroup className="h-11 w-full border-none bg-secondary px-3 py-1 @min-[52rem]/toolbar:min-w-60 @min-[52rem]/toolbar:max-w-92.25 @min-[52rem]/toolbar:flex-1">
              <InputGroupAddon className="pl-0">
                <SearchIcon className="size-3.5 text-input-addon-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                className="h-full p-0 px-1.5!"
                aria-label="Search analysis queue"
                placeholder="Search inspections, asset ids..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
              />
            </InputGroup>

            <div className="flex w-full items-center gap-1 rounded-[calc(var(--radius)+0.125rem)] border bg-secondary p-0.5 @min-[52rem]/toolbar:w-auto">
              {filters.map((filter) => {
                const isActive = statusFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setFilter(filter.value)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors @min-[52rem]/toolbar:flex-none",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-sm px-2 text-xs font-medium",
                        isActive
                          ? "bg-background text-primary"
                          : "bg-background text-foreground",
                      )}
                    >
                      {counts[filter.value]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Table className="min-w-215">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Inspection</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Top severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <AnalysisRow
                key={row.id}
                row={row}
                assetName={assetById(row.assetId)?.name ?? "Unassigned"}
                onOpen={() => navigate(`/dashboard/analysis/${row.id}`)}
              />
            ))}
          </TableBody>
        </Table>

        {filteredRows.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center">
            <p className="text-sm font-medium">Nothing in this lane</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different status filter or clear the search.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {pageRows.length} of {filteredRows.length} result
            {filteredRows.length === 1 ? "" : "s"}
          </p>

          <div className="flex w-full items-center justify-between md:w-auto md:justify-start md:gap-3">
            <div className="flex items-center">
              {getPageItems(currentPage, totalPages).map((item, index) => (
                <PageItem
                  key={`${item}-${index}`}
                  item={item}
                  currentPage={currentPage}
                  onSelect={setPage}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="size-10"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="size-10"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Status legend: {filters.slice(1).map((filter) => `${inspectionStatusLabels[filter.value as InspectionStatus]} (${counts[filter.value]})`).join(" · ")}
      </p>
    </div>
  );
}

function AnalysisRow({
  row,
  assetName,
  onOpen,
}: {
  row: Inspection;
  assetName: string;
  onOpen: () => void;
}) {
  const severity = topSeverity(row);
  const confidence =
    row.findings.length > 0
      ? Math.max(...row.findings.map((finding) => finding.confidence))
      : null;

  return (
    <TableRow
      className="cursor-pointer transition-colors hover:bg-secondary/40"
      onClick={onOpen}
    >
      <TableCell className="whitespace-normal">
        <div className="space-y-1">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.id} · {row.modelVersion}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <p className="font-mono text-sm font-medium">{row.assetId}</p>
          <p className="truncate text-xs text-muted-foreground">{assetName}</p>
        </div>
      </TableCell>
      <TableCell className="tabular-nums">
        {row.findings.length > 0 ? (
          <span>
            {row.findings.length}
            {confidence ? (
              <span className="ml-1 text-xs text-muted-foreground">
                top {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {severity ? (
          <SeverityBadge severity={severity} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.status === "processing" ? (
          <div className="flex flex-col gap-1.5">
            <InspectionStatusBadge status={row.status} />
            <Progress value={row.progress} className="h-1.5 w-24" />
          </div>
        ) : (
          <InspectionStatusBadge status={row.status} />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {fmtDateTime(row.completedAt ?? row.startedAt)}
      </TableCell>
    </TableRow>
  );
}

function PageItem({
  item,
  currentPage,
  onSelect,
}: {
  item: number | "ellipsis";
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  if (item === "ellipsis") {
    return (
      <span className="flex size-10 items-center justify-center text-sm text-muted-foreground">
        ...
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg text-sm transition-colors",
        item === currentPage
          ? "border border-primary font-bold text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item}
    </button>
  );
}

function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  if (current <= 2) {
    return [1, 2, "ellipsis", total - 1, total];
  }

  if (current >= total - 1) {
    return [1, 2, "ellipsis", total - 1, total];
  }

  return [1, "ellipsis", current, "ellipsis", total];
}
