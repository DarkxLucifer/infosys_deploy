import { Link } from "react-router-dom";
import { Bot, Sparkles, ArrowRight, AlertTriangle, CheckCircle2, Image as ImageIcon } from "lucide-react";
import type { RecentAiClassification } from "@/lib/api";

interface RecentAiClassificationsFeedProps {
  items?: RecentAiClassification[];
  title?: string;
  subtitle?: string;
}

export function RecentAiClassificationsFeed({
  items = [],
  title = "Live AI Photo Classifications",
  subtitle = "Real-time ResNet50 v1.0 inference stream on captured field photos",
}: RecentAiClassificationsFeedProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden space-y-4 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Bot className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">{title}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
                <Sparkles className="size-2.5" />
                ResNet50 v1.0
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        <Link
          to="/app/inspections"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline self-start sm:self-auto"
        >
          <span>View all inspections</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Grid of Classified Images */}
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          <div className="flex flex-col items-center justify-center gap-2">
            <ImageIcon className="size-7 text-muted-foreground/60" />
            <p className="text-xs font-medium">No photographs classified yet.</p>
            <p className="text-[11px] text-muted-foreground max-w-sm">
              Upload photos to an inspection and trigger AI analysis to see real ResNet50 classification results stream here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {items.map((item) => {
            const isCrack = item.hasCrack || item.predictedClass === "Cracked";
            const confidencePercent = Math.round(item.confidence * 100);

            return (
              <div
                key={item.imageId}
                className="group rounded-xl border border-border bg-background p-3 flex flex-col justify-between space-y-2.5 hover:border-primary/50 transition-all shadow-xs"
              >
                {/* Image Thumbnail with Overlay Badge */}
                <div className="relative aspect-video w-full rounded-lg bg-black/90 overflow-hidden">
                  <img
                    src={(isCrack && (item as any).unetUrl) || (item as any).unetUrl || (item as any).rfdetrUrl || (item as any).annotatedUrl || item.thumbnailUrl}
                    alt={item.filename}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                    onError={(e) => {
                      // Fallback placeholder if image load fails
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />

                  {/* Top Floating Badge */}
                  <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs backdrop-blur-md ${
                        isCrack
                          ? "bg-rose-950/90 text-rose-300 border border-rose-500/40"
                          : "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40"
                      }`}
                    >
                      {isCrack ? (
                        <>
                          <AlertTriangle className="size-2.5 text-rose-400" />
                          <span>Crack Detected · {confidencePercent}%</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-2.5 text-emerald-400" />
                          <span>No Crack · {confidencePercent}%</span>
                        </>
                      )}
                    </span>

                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/80 text-white/80 border border-white/10">
                      T={item.threshold.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="space-y-1">
                  <div className="font-semibold text-xs text-foreground truncate" title={item.filename}>
                    {item.filename}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                    <span className="font-mono text-primary font-medium">{item.assetCode}</span>
                    <span className="truncate max-w-[120px]" title={item.assetName}>
                      {item.assetName}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <Link
                  to={`/app/inspections/${item.inspectionId}`}
                  className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-foreground text-[11px] font-semibold transition-colors border border-border/60"
                >
                  <span>Inspect photo</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
