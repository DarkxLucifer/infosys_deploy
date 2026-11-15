import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin,
  Search,
  RotateCcw,
  ExternalLink,
  Eye,
  Info,
} from "lucide-react";

// Fix default Leaflet icon paths in bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapAssetItem {
  id: string;
  name: string;
  assetType: string;
  address?: string;
  latitude: number;
  longitude: number;
  constructionYear?: number;
  material?: string;
  department?: string;
  importance?: string;
  latestInspection?: {
    id: string;
    status: string;
    reviewStatus: string;
    inspectionDate: string | null;
    inspectorName?: string;
    inspectorEmail?: string;
  } | null;
  damage: {
    severity: "no_visible_damage" | "minor" | "moderate" | "severe" | "critical";
    severityLabel: string;
    color: string;
    primaryDamage: string;
    defectCount: number;
    requiresUrgentReview: boolean;
  };
}

// Helper to return clean SVG icons for asset types
function getAssetTypeIconSvg(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "bridge") {
    return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18"/><path d="M5 17v-5a7 7 0 0 1 14 0v5"/><line x1="8" y1="12" x2="8" y2="17"/><line x1="16" y1="12" x2="16" y2="17"/></svg>`;
  }
  if (t === "tunnel") {
    return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9a8 8 0 0 1 16 0v10"/><path d="M9 19v-6a3 3 0 0 1 6 0v6"/></svg>`;
  }
  if (t === "building") {
    return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="18" x2="9" y2="18.01"/><line x1="15" y1="18" x2="15" y2="18.01"/></svg>`;
  }
  if (t === "road") {
    return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19 8 5"/><path d="M20 19 16 5"/><line x1="12" y1="7" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="17"/></svg>`;
  }
  if (t === "dam") {
    return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20"/><path d="M4 18V8l8-4 8 4v10"/><path d="M12 4v14"/></svg>`;
  }
  return `<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
}

// Generate Leaflet DivIcon with pulsing rings for urgent alerts
function createAssetDivIcon(asset: MapAssetItem) {
  const isUrgent = asset.damage.severity === "critical";
  const isSevere = asset.damage.severity === "severe";
  const color = asset.damage.color || "#22c55e";

  const pulseRing = isUrgent
    ? `<div style="position: absolute; inset: -6px; border-radius: 9999px; background-color: ${color}; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
    : isSevere
    ? `<div style="position: absolute; inset: -4px; border-radius: 9999px; background-color: ${color}; opacity: 0.25; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>`
    : "";

  const html = `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      ${pulseRing}
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 9999px;
        background-color: ${color};
        border: 2px solid #ffffff;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.18s ease;
      ">
        ${getAssetTypeIconSvg(asset.assetType)}
      </div>
    </div>
  `;

  return L.divIcon({
    className: "infrascan-map-pin",
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

// Force Leaflet to recompute viewport dimensions when layout renders or transitions
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    const t3 = setTimeout(() => map.invalidateSize(), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);
  return null;
}

// OpenStreetMap tile provider for civil infrastructure mapping
const OPEN_STREET_MAP = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  subdomains: "abc",
  maxZoom: 19,
};

// Recenter map on assets
function MapRecenter({ assets }: { assets: MapAssetItem[] }) {
  const map = useMap();
  useEffect(() => {
    if (assets.length === 0) return;
    const valid = assets.filter(
      (a) =>
        typeof a.latitude === "number" &&
        !isNaN(a.latitude) &&
        typeof a.longitude === "number" &&
        !isNaN(a.longitude) &&
        a.latitude >= -90 &&
        a.latitude <= 90 &&
        a.longitude >= -180 &&
        a.longitude <= 180
    );
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].latitude, valid[0].longitude], 13);
      return;
    }
    const bounds = L.latLngBounds(valid.map((a) => [a.latitude, a.longitude]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [assets, map]);
  return null;
}

// Track zoom level to toggle permanent label mode
function MapZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handleZoom = () => onZoomChange(map.getZoom());
    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map, onZoomChange]);
  return null;
}

export function DamageMapPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<MapAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [currentZoom, setCurrentZoom] = useState(11);

  const fetchMapData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAssetsMapSummary();
      setAssets(res.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to load infrastructure assets from database");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();
  }, []);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = asset.name.toLowerCase().includes(q);
        const matchesId = asset.id.toLowerCase().includes(q);
        const matchesAddr = (asset.address || "").toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesAddr) return false;
      }
      // Severity
      if (selectedSeverity !== "all" && asset.damage.severity !== selectedSeverity) {
        return false;
      }
      // Asset Type
      if (selectedType !== "all" && asset.assetType.toLowerCase() !== selectedType.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [assets, searchQuery, selectedSeverity, selectedType]);

  // Statistics KPI
  const stats = useMemo(() => {
    let critical = 0;
    let severe = 0;
    let moderate = 0;
    let minor = 0;
    let sound = 0;

    assets.forEach((a) => {
      if (a.damage.severity === "critical") critical++;
      else if (a.damage.severity === "severe") severe++;
      else if (a.damage.severity === "moderate") moderate++;
      else if (a.damage.severity === "minor") minor++;
      else sound++;
    });

    return { total: assets.length, critical, severe, moderate, minor, sound };
  }, [assets]);

  // Default initial center
  const defaultCenter: [number, number] = useMemo(() => {
    if (assets.length > 0) {
      const sumLat = assets.reduce((sum, a) => sum + a.latitude, 0);
      const sumLng = assets.reduce((sum, a) => sum + a.longitude, 0);
      return [sumLat / assets.length, sumLng / assets.length];
    }
    return [40.7589, -73.9851];
  }, [assets]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* ── Top Header & KPI Bar ── */}
      <div className="border-b bg-card px-4 py-3 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="size-4" />
              </div>
              <h1 className="text-base font-semibold text-foreground tracking-tight">
                Infrastructure GIS Damage Map
              </h1>
              <Badge variant="outline" className="text-[11px] font-mono uppercase bg-muted/50">
                Leaflet + OpenStreetMap
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Geospatial monitoring of registered civil infrastructure, latest verified AI crack assessments, and inspection states.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.total}</span> Total Assets
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-950/20 border border-red-500/30 text-red-700 dark:text-red-400 font-medium">
              <span className="size-2 rounded-full bg-red-800 animate-ping" />
              <span className="font-bold">{stats.critical}</span> Critical Urgent
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium">
              <span className="size-2 rounded-full bg-rose-500" />
              <span className="font-bold">{stats.severe}</span> Severe
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="font-bold">{stats.moderate}</span> Moderate
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="font-bold">{stats.sound}</span> Sound Surface
            </span>
          </div>
        </div>

        {/* ── Filter Controls Row ── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mt-3 pt-2.5 border-t border-border/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-52 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search asset name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>

            {/* Severity Filter Buttons */}
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
              {[
                { id: "all", label: "All Severities" },
                { id: "critical", label: "Critical", color: "text-red-600 dark:text-red-400" },
                { id: "severe", label: "Severe", color: "text-rose-500" },
                { id: "moderate", label: "Moderate", color: "text-amber-500" },
                { id: "minor", label: "Minor", color: "text-yellow-500" },
                { id: "no_visible_damage", label: "Sound", color: "text-emerald-500" },
              ].map((sev) => (
                <button
                  key={sev.id}
                  type="button"
                  onClick={() => setSelectedSeverity(sev.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedSeverity === sev.id
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className={sev.color || ""}>{sev.label}</span>
                </button>
              ))}
            </div>

            {/* Asset Type Filter Dropdown */}
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
              {[
                { id: "all", label: "All Types" },
                { id: "bridge", label: "Bridges" },
                { id: "building", label: "Buildings" },
                { id: "road", label: "Roads" },
                { id: "tunnel", label: "Tunnels" },
                { id: "dam", label: "Dams" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedType === t.id
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset / Reload Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedSeverity("all");
                setSelectedType("all");
              }}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCcw className="size-3" />
              Reset Filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchMapData}
              disabled={loading}
              className="h-8 text-xs gap-1.5"
            >
              Refresh Data
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main Map Area & Right Detail Panel ── */}
      <div className="relative flex-1 w-full h-full">
        {loading ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs">
            <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading registered assets & geospatial assessments...</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute top-4 left-4 z-50 p-4 max-w-md rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            <p className="font-semibold">Unable to load map data</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : null}

        {/* ── Leaflet Interactive Map ── */}
        <MapContainer
          center={defaultCenter}
          zoom={11}
          scrollWheelZoom={true}
          className="w-full h-full z-0 bg-slate-100 dark:bg-slate-900"
        >
          <MapResizeHandler />
          <TileLayer
            attribution={OPEN_STREET_MAP.attribution}
            url={OPEN_STREET_MAP.url}
            subdomains={OPEN_STREET_MAP.subdomains}
            maxZoom={OPEN_STREET_MAP.maxZoom}
          />

          <MapZoomTracker onZoomChange={setCurrentZoom} />
          <MapRecenter assets={filteredAssets} />

          {/* Render Markers */}
          {filteredAssets
            .filter(
              (asset) =>
                typeof asset.latitude === "number" &&
                !isNaN(asset.latitude) &&
                typeof asset.longitude === "number" &&
                !isNaN(asset.longitude) &&
                asset.latitude >= -90 &&
                asset.latitude <= 90 &&
                asset.longitude >= -180 &&
                asset.longitude <= 180
            )
            .map((asset) => {
            const icon = createAssetDivIcon(asset);
            const isZoomedIn = currentZoom >= 12;

            return (
              <Marker
                key={asset.id}
                position={[asset.latitude, asset.longitude]}
                icon={icon}
              >
                {/* ── Feature 3: Zoom-Adaptive Infrastructure Label ── */}
                <Tooltip
                  direction="top"
                  offset={[0, -20]}
                  opacity={0.95}
                  permanent={isZoomedIn}
                  className="infrascan-tooltip-card"
                >
                  <div className="px-1.5 py-0.5 text-[11px] font-sans">
                    <span className="font-semibold text-foreground">{asset.name}</span>
                    <span className="text-muted-foreground font-mono ml-1 text-[10px]">({asset.id})</span>
                  </div>
                </Tooltip>

                {/* ── Feature 4: Damage Information Popup ── */}
                <Popup className="infrascan-asset-popup" maxWidth={320}>
                  <div className="p-3 space-y-2.5 text-xs font-sans">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b pb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground text-sm leading-tight">
                            {asset.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {asset.id} · <span className="capitalize">{asset.assetType}</span>
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: `${asset.damage.color}15`,
                          borderColor: `${asset.damage.color}50`,
                          color: asset.damage.color,
                        }}
                        className="text-[10px] font-semibold uppercase tracking-wider shrink-0"
                      >
                        {asset.damage.severity === "no_visible_damage" ? "Sound" : asset.damage.severity}
                      </Badge>
                    </div>

                    {/* Address & Material */}
                    {asset.address ? (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        📍 {asset.address}
                      </p>
                    ) : null}

                    {/* Damage & Inspection Overview Grid */}
                    <div className="rounded-lg bg-muted/40 p-2 space-y-1.5 text-[11px] border">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Primary Defect:</span>
                        <span className="font-medium text-foreground">{asset.damage.primaryDamage}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Severity Level:</span>
                        <span
                          className="font-semibold"
                          style={{ color: asset.damage.color }}
                        >
                          {asset.damage.severityLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Review Status:</span>
                        <span className="font-medium text-foreground">
                          {asset.latestInspection?.reviewStatus || "No inspection on file"}
                        </span>
                      </div>
                      {asset.latestInspection?.inspectionDate ? (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Latest Inspection:</span>
                          <span className="font-mono text-foreground text-[10px]">
                            {new Date(asset.latestInspection.inspectionDate).toLocaleDateString()}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Action Links */}
                    <div className="pt-1 flex items-center gap-2">
                      {asset.latestInspection?.id ? (
                        <Button
                          size="sm"
                          className="w-full h-7 text-xs bg-primary hover:opacity-90 gap-1.5 shadow-xs"
                          onClick={() => navigate(`/app/inspections/${asset.latestInspection?.id}`)}
                        >
                          <Eye className="size-3" />
                          <span>View Inspection</span>
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={() => navigate(`/app/assets/${asset.id}`)}
                      >
                        <ExternalLink className="size-3" />
                        <span>Asset Record</span>
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* ── Floating Map Legend (Bottom Right) ── */}
        <div className="absolute bottom-4 right-4 z-20 p-3 rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-lg text-xs space-y-2 max-w-[210px]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground border-b pb-1.5">
            <span>Damage Severity Legend</span>
            <span className="text-[10px] text-muted-foreground font-mono">InfraScan</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#991b1b] border border-white shadow-xs shrink-0" />
              <span className="text-foreground">Critical / Urgent Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ef4444] border border-white shadow-xs shrink-0" />
              <span className="text-foreground">Severe Structural Damage</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#f97316] border border-white shadow-xs shrink-0" />
              <span className="text-foreground">Moderate Defect</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#eab308] border border-white shadow-xs shrink-0" />
              <span className="text-foreground">Minor Superficial Fissure</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#22c55e] border border-white shadow-xs shrink-0" />
              <span className="text-foreground">Sound Concrete Surface</span>
            </div>
          </div>
          <div className="pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
            Zoom ≥ 12 reveals permanent asset labels.
          </div>
        </div>

        {/* ── Asset Summary Pill (Bottom Left) ── */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-background/90 backdrop-blur-md shadow-md text-xs">
          <Info className="size-3.5 text-primary" />
          <span className="text-muted-foreground">Showing</span>
          <span className="font-semibold text-foreground">{filteredAssets.length} of {assets.length}</span>
          <span className="text-muted-foreground">geocoded assets</span>
        </div>
      </div>
    </div>
  );
}
