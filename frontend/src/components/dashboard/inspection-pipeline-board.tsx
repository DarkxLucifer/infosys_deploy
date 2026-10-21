import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers, RefreshCw, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { FEATURES } from "@/lib/features";

interface PipelineCounts {
  images_uploaded: number;
  quality_check: number;
  ai_analysing: number;
  needs_engineer_review: number;
  reviewed: number;
  reported: number;
  work_orders_open: number;
  last_refreshed_at: string;
}

export function InspectionPipelineBoard() {
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCounts = async () => {
    setIsRefreshing(true);
    try {
      const data = await api.getPipelineCounts();
      setCounts(data);
      setLastFetchTime(Date.now());
    } catch {
      // Retain existing state if error
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    // Refresh every 30 seconds per Part 3.7
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const isLive = Date.now() - lastFetchTime < 60000;

  const totalActive = counts
    ? counts.images_uploaded +
      counts.quality_check +
      counts.ai_analysing +
      counts.needs_engineer_review +
      counts.reviewed +
      counts.reported +
      counts.work_orders_open
    : 0;

  const stages = [
    { label: "Images uploaded", count: counts?.images_uploaded ?? 0, href: "/app/inspections" },
    { label: "Quality check", count: counts?.quality_check ?? 0, href: "/app/inspections" },
    { label: "AI analysing", count: counts?.ai_analysing ?? 0, href: "/app/review?status=ai_analysing" },
    { label: "Needs engineer review", count: counts?.needs_engineer_review ?? 0, href: "/app/review?status=needs_review", highlight: true },
    { label: "Reviewed", count: counts?.reviewed ?? 0, href: "/app/review?status=reviewed" },
    { label: "Reported", count: counts?.reported ?? 0, href: "/app/inspections" },
    { label: "Work orders open", count: counts?.work_orders_open ?? 0, href: "/app/dashboard" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm overflow-hidden space-y-4">
      {/* Board Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-secondary flex items-center justify-center text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Inspection Pipeline</h2>
            <p className="text-xs text-muted-foreground">End-to-end defect assessment workflow</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Real Live Indicator (Rule 4: green only when fetch < 60s, else grey stale) */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isLive
                ? "bg-success-soft text-success border border-success/30"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                isLive ? "bg-success animate-pulse" : "bg-muted-foreground"
              }`}
            />
            <span>{isLive ? "Live Pipeline" : "Stale"}</span>
          </div>

          <button
            type="button"
            onClick={fetchCounts}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh pipeline counts"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Dotted Canvas Board */}
      <div className="relative rounded-xl border border-border bg-secondary/20 p-6 pipeline-dots overflow-x-auto">
        {totalActive === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">No inspections in progress.</p>
            {FEATURES.inspectionCreate && (
              <Link
                to="/app/inspections/new"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Plus className="size-3.5" />
                <span>Create new inspection</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="flex items-center min-w-max gap-3 py-2">
            {stages.map((st, i) => (
              <div key={st.label} className="flex items-center gap-3">
                <Link
                  to={st.href}
                  className={`group flex flex-col justify-between w-38 h-24 p-3 rounded-xl border transition-all ${
                    st.highlight
                      ? "bg-card border-primary/60 shadow-xs hover:border-primary"
                      : "bg-card border-border hover:border-foreground/30 shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[11px] text-muted-foreground line-clamp-1 group-hover:text-foreground">
                      {st.label}
                    </span>
                    <span className="size-1.5 rounded-full bg-primary/40 group-hover:bg-primary" />
                  </div>
                  <div className="flex items-baseline justify-between mt-auto">
                    <span className="text-2xl font-bold font-mono text-foreground">
                      {st.count}
                    </span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-brand-accent group-hover:underline flex items-center">
                      View
                      <ArrowRight className="size-2.5 ml-0.5" />
                    </span>
                  </div>
                </Link>

                {i < stages.length - 1 && (
                  <div className="text-border shrink-0">
                    <ArrowRight className="size-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
        <span>Auto-refreshes every 30 seconds</span>
        <span>Awaiting review gates highlighted in primary boundary</span>
      </div>
    </div>
  );
}
