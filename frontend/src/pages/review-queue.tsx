import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { FEATURES } from "@/lib/features";
import { formatSeverityLabel, type SeverityLevel } from "@/lib/rules";

interface QueueItem {
  id: string;
  assetCode: string;
  assetName: string;
  defectType: string;
  confidence: number;
  proposedSeverity: SeverityLevel;  
  status: "ai_analysing" | "needs_review" | "reviewed";
  submittedAt: string;
}

export default function ReviewQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(6);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Counts for filter pills
  const [counts, setCounts] = useState({
    all: 0,
    ai_analysing: 0,
    needs_review: 0,
    reviewed: 0,
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getReviewQueue({
        search,
        status: statusFilter,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);

      // Set real live counts from backend response
      if (res.counts) {
        setCounts(res.counts);
      } else {
        const allRes = await api.getReviewQueue({ status: "all", pageSize: 100 });
        setCounts({
          all: allRes.total,
          ai_analysing: allRes.items.filter((i: QueueItem) => i.status === "ai_analysing").length,
          needs_review: allRes.items.filter((i: QueueItem) => i.status === "needs_review").length,
          reviewed: allRes.items.filter((i: QueueItem) => i.status === "reviewed").length,
        });
      }
    } catch {
      // Keep existing
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter, page]);

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    setSearchParams(val === "all" ? {} : { status: val });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Review and manage AI findings awaiting engineer sign-off
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search asset, code, defect..."
            className="w-full h-10 pl-9 pr-4 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Segmented Status Filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border overflow-x-auto">
          {[
            { id: "all", label: "All", count: counts.all },
            { id: "ai_analysing", label: "AI analysing", count: counts.ai_analysing },
            { id: "needs_review", label: "Needs review", count: counts.needs_review },
            { id: "reviewed", label: "Reviewed", count: counts.reviewed },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleStatusChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-secondary text-primary text-[10px]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/70 text-foreground border-b border-border">
              <tr>
                <th className="py-3 px-4 font-semibold">Asset</th>
                <th className="py-3 px-4 font-semibold">Defect</th>
                <th className="py-3 px-4 font-semibold">Confidence</th>
                <th className="py-3 px-4 font-semibold">Proposed Severity</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Submitted</th>
                {FEATURES.engineerReviewScreen && (
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Loading review queue findings...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No defect findings matching criteria.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground">{row.assetCode}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-44">{row.assetName}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground">
                      {row.defectType}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {row.confidence > 0 ? (
                        <span className="font-semibold text-foreground">
                          {(row.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Pending AI</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          row.proposedSeverity === "critical"
                            ? "bg-critical-soft text-critical border border-critical/30"
                            : row.proposedSeverity === "severe"
                            ? "bg-destructive/10 text-destructive border border-destructive/30"
                            : row.proposedSeverity === "moderate"
                            ? "bg-warning-soft text-warning border border-warning/30"
                            : "bg-success-soft text-success border border-success/30"
                        }`}
                      >
                        {formatSeverityLabel(row.proposedSeverity)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {row.status === "ai_analysing" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                          <Clock className="size-3" />
                          <span>AI analysing</span>
                        </span>
                      )}
                      {row.status === "needs_review" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full">
                          <AlertCircle className="size-3" />
                          <span>Needs review</span>
                        </span>
                      )}
                      {row.status === "reviewed" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success-soft px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="size-3" />
                          <span>Reviewed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                      {new Date(row.submittedAt).toLocaleDateString()}
                    </td>
                    {FEATURES.engineerReviewScreen && (
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/app/review/${row.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <Eye className="size-3.5" />
                          <span>Review</span>
                        </Link>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Numbered Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border bg-card text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground">{items.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong> to{" "}
            <strong className="text-foreground">{Math.min(page * pageSize, total)}</strong> of{" "}
            <strong className="text-foreground">{total}</strong> results
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i + 1)}
                className={`size-8 rounded-lg text-xs font-semibold transition-colors ${
                  page === i + 1
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-foreground hover:bg-muted"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
