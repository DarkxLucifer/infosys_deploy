import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building, FileText, X } from "lucide-react";
import { api } from "@/lib/api";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    assets: { id: string; code: string; name: string; type: string }[];
    inspections: { id: string; assetCode: string; date: string; status: string }[];
  }>({ assets: [], inspections: [] });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ assets: [], inspections: [] });
      return;
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ assets: [], inspections: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await api.searchGlobal(query);
        setResults(res);
      } catch {
        setResults({ assets: [], inspections: [] });
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  if (!open) return null;

  const handleSelect = (path: string) => {
    onClose();
    navigate(path);
  };

  const hasResults = results.assets.length > 0 || results.inspections.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global Search Palette"
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Search Input Box */}
        <div className="flex items-center px-4 border-b border-border">
          <Search className="size-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type asset code (INF-001) or inspection ID..."
            className="w-full h-14 px-3.5 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground border border-border ml-2">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-80 overflow-y-auto p-2 text-xs">
          {isLoading && (
            <div className="py-8 text-center text-muted-foreground">
              Searching infrastructure database...
            </div>
          )}

          {!isLoading && query && !hasResults && (
            <div className="py-8 text-center text-muted-foreground">
              No assets or inspections found matching &ldquo;{query}&rdquo;.
            </div>
          )}

          {!isLoading && !query && (
            <div className="py-8 text-center text-muted-foreground">
              Type to search civil assets, inspection reports, or defect codes.
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="space-y-3">
              {results.assets.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Assets ({results.assets.length})
                  </div>
                  <div className="space-y-1">
                    {results.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleSelect(`/app/assets/${asset.id}`)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-secondary/60 text-left transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building className="size-4 text-primary shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-primary">
                              {asset.code}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {asset.name}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {asset.type}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.inspections.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Inspections ({results.inspections.length})
                  </div>
                  <div className="space-y-1">
                    {results.inspections.map((insp) => (
                      <button
                        key={insp.id}
                        type="button"
                        onClick={() => handleSelect(`/app/inspections/${insp.id}`)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-secondary/60 text-left transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileText className="size-4 text-primary shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-primary">
                              {insp.id}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              Asset {insp.assetCode}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {insp.date}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-border bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Navigate with arrows, press Enter to open</span>
          <span>InfraScan Deep Search</span>
        </div>
      </div>
    </div>
  );
}
