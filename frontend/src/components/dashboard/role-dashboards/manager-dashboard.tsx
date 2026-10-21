import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MapPin, Download, ChevronDown, Plus } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, type ManagerDashboardPayload, MOCK_ASSETS, type Asset } from "@/lib/api";
import { getSeverityMeta, formatSeverityLabel } from "@/lib/rules";
import { InspectionPipelineBoard } from "@/components/dashboard/inspection-pipeline-board";

const DATE_RANGES = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
];

export function InfrastructureManagerDashboard() {
  const [data, setData] = useState<ManagerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("30d");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(MOCK_ASSETS[0]);
  const [activeLayer, setActiveLayer] = useState<"all" | "severe">("all");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const loadData = async () => {
    try {
      const res = await api.getManagerDashboard();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRange]);

  // Initialize and update Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([40.82, -73.94], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Place markers on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    MOCK_ASSETS.forEach((asset) => {
      const sevMeta = getSeverityMeta(asset.latest_severity || "minor");
      if (activeLayer === "severe" && sevMeta.code !== "severe" && sevMeta.code !== "critical") {
        return;
      }

      const marker = L.circleMarker([asset.latitude, asset.longitude], {
        radius: sevMeta.code === "critical" ? 10 : sevMeta.code === "severe" ? 8 : 6,
        fillColor: sevMeta.colorHex,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      }).addTo(map);

      marker.bindTooltip(`<b>${asset.code}</b>: ${asset.name}<br/>Severity: ${sevMeta.label}`);
      marker.on("click", () => {
        setSelectedAsset(asset);
      });
    });
  }, [activeLayer]);

  const handleExportCsv = async () => {
    const csvContent = await api.exportDashboardCsv("manager", selectedRange);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `infrascan-manager-overview-${selectedRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = data.kpis || {
    totalAssets: 0,
    totalInspectionsPeriod: 0,
    damagedAssetsCount: 0,
    highPriorityFindingsCount: 0,
    maintenanceProgressPct: 100,
    maintenanceOpenCount: 0,
    maintenanceOverdueCount: 0,
    inspectionCompletionRatePct: 100,
  };
  const hotspots = Array.isArray(data.hotspots) ? data.hotspots : [];

  return (
    <div className="space-y-6">
      {/* Header (Astrix Pattern: Title, Subtitle, Date-Range Dropdown, Export Button) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Infrastructure overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Condition, workload and priorities across your assets. (Reviewed findings only)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="h-10 px-3.5 pr-8 rounded-lg border border-input bg-card text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          </div>

          <Link
            to="/app/inspections/new"
            className="h-10 px-4 rounded-lg bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>New inspection</span>
          </Link>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-3.5 rounded-lg bg-secondary hover:bg-secondary/80 active:scale-[0.99] text-foreground border border-border text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (6 per Section 3.5.C) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Total Assets */}
        <Link to="/app/assets" className="p-4 rounded-xl border border-border bg-card hover:border-primary/60 transition-all shadow-xs block">
          <span className="text-[11px] font-semibold text-muted-foreground block">Total Assets</span>
          <div className="text-xl font-bold font-mono text-foreground mt-1">{kpis.totalAssets}</div>
          <span className="text-[10px] text-muted-foreground">Portfolio inventory</span>
        </Link>

        {/* Card 2: Total Inspections */}
        <Link to="/app/inspections" className="p-4 rounded-xl border border-border bg-card hover:border-primary/60 transition-all shadow-xs block">
          <span className="text-[11px] font-semibold text-muted-foreground block">Inspections (Period)</span>
          <div className="text-xl font-bold font-mono text-foreground mt-1">{kpis.totalInspectionsPeriod}</div>
          <span className="text-[10px] text-muted-foreground">Surveys logged</span>
        </Link>

        {/* Card 3: Damaged Assets */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground block">Damaged Assets</span>
          <div className="text-xl font-bold font-mono text-warning mt-1">{kpis.damagedAssetsCount}</div>
          <span className="text-[10px] text-warning font-medium">Moderate+ reviewed</span>
        </div>

        {/* Card 4: High-Priority Findings */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground block">High-Priority</span>
          <div className="text-xl font-bold font-mono text-destructive mt-1">{kpis.highPriorityFindingsCount}</div>
          <span className="text-[10px] text-destructive font-medium">Reviewed findings</span>
        </div>

        {/* Card 5: Maintenance Progress */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground block">Maintenance Progress</span>
          <div className="text-xl font-bold font-mono text-success mt-1">{kpis.maintenanceProgressPct}%</div>
          <span className="text-[10px] text-muted-foreground">{kpis.maintenanceOpenCount} open · {kpis.maintenanceOverdueCount} ovd</span>
        </div>

        {/* Card 6: Inspection Completion Rate */}
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground block">On-Time Completion</span>
          <div className="text-xl font-bold font-mono text-foreground mt-1">{kpis.inspectionCompletionRatePct}%</div>
          <span className="text-[10px] text-success font-medium">Completed on time</span>
        </div>
      </div>

      {/* Real Inspection Pipeline Board (Section 3.7) */}
      <InspectionPipelineBoard />

      {/* Geospatial Hotspots Leaflet Map + Asset Card */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                Geographic Hotspots & Asset Damage Map
              </h2>
              <p className="text-xs text-muted-foreground">Leaflet OpenStreetMap with reviewed severity markers</p>
            </div>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveLayer("all")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeLayer === "all" ? "bg-primary text-primary-foreground font-semibold" : "bg-card border border-border text-muted-foreground"
                }`}
              >
                All Assets
              </button>
              <button
                type="button"
                onClick={() => setActiveLayer("severe")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeLayer === "severe" ? "bg-destructive text-destructive-foreground font-semibold" : "bg-card border border-border text-muted-foreground"
                }`}
              >
                Severe & Critical Only
              </button>
            </div>
          </div>

          {/* Map Container */}
          <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-inner h-[380px]">
            <div ref={mapContainerRef} className="size-full z-0" />

            {/* Map Legend Floating */}
            <div className="absolute bottom-3 left-3 z-10 bg-card/95 border border-border p-2.5 rounded-lg shadow-md text-[11px] backdrop-blur-sm space-y-1">
              <div className="font-semibold text-foreground">Defect Severity Legend</div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-success" />
                <span>Minor Damage</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-warning" />
                <span>Moderate Damage</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-destructive" />
                <span>Severe Damage</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-critical border border-destructive" />
                <span>Critical / Requires Urgent Review</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Asset Card & Regional Hotspot Summary */}
        <div className="space-y-4">
          {selectedAsset && (
            <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-mono text-xs font-bold text-primary">{selectedAsset.code}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    selectedAsset.latest_severity === "critical"
                      ? "bg-critical-soft text-critical"
                      : selectedAsset.latest_severity === "severe"
                      ? "bg-destructive/10 text-destructive"
                      : selectedAsset.latest_severity === "moderate"
                      ? "bg-warning-soft text-warning"
                      : "bg-success-soft text-success"
                  }`}
                >
                  {formatSeverityLabel(selectedAsset.latest_severity || "minor")}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{selectedAsset.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{selectedAsset.address}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground text-[10px] block">Type</span>
                  <span className="font-medium text-foreground capitalize">{selectedAsset.type}</span>
                </div>
                <div className="p-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground text-[10px] block">Material</span>
                  <span className="font-medium text-foreground">{selectedAsset.material}</span>
                </div>
              </div>
              <Link
                to={`/app/assets/${selectedAsset.id}`}
                className="w-full h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-primary text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                View Asset Record &rarr;
              </Link>
            </div>
          )}

          {/* Hotspots list */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Identified Hotspots</h3>
            <div className="space-y-2">
              {hotspots.map((hs, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-muted/40 border border-border text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>{hs.region}</span>
                    <span className="text-destructive font-mono text-[11px]">{hs.severeCount} severe</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{hs.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
