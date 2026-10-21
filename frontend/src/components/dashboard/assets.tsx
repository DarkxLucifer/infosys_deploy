import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ScanLine, MapPin, Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConditionBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { useAppStore, relativeTime } from "@/store/app";
import type {
  AssetCondition,
  AssetKind,
} from "@/store/app";
import { PageHeader, PageShell, EmptyState, ComplianceNote } from "./page-shell";

const kindOptions: { value: AssetKind; label: string }[] = [
  { value: "bridge", label: "Bridge" },
  { value: "road", label: "Road corridor" },
  { value: "tunnel", label: "Tunnel" },
  { value: "retaining-wall", label: "Retaining wall" },
  { value: "building", label: "Structure deck" },
];

type KindFilter = "all" | AssetKind;

export function AssetsPage() {
  const { state, registerAsset } = useAppStore();
  const { navigate } = useDashboardNavigation();
  const [liveAssets, setLiveAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchLiveAssets = async () => {
    try {
      const items = await api.getAssets();
      if (Array.isArray(items) && items.length > 0) {
        setLiveAssets(items);
      }
    } catch (e) {
      console.warn("Failed to fetch live assets, falling back to store:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveAssets();
  }, []);

  // Merge live assets with store assets
  const combinedAssets = useMemo(() => {
    if (liveAssets.length === 0) return state.assets;
    // Map live DB assets to UI format
    const dbMapped = liveAssets.map((a: any) => ({
      id: a.id,
      name: a.name,
      kind: (a.asset_type || a.assetType || "bridge").toLowerCase() as AssetKind,
      material: a.material || "Reinforced concrete",
      location: a.address || `GPS: ${a.latitude?.toFixed(4)}, ${a.longitude?.toFixed(4)}`,
      builtYear: a.construction_year || a.constructionYear || 2018,
      condition: (a.latest_severity === "critical" ? "poor" : a.latest_severity === "high" ? "fair" : "good") as AssetCondition,
      lastInspection: a.created_at || new Date().toISOString(),
      spanLengthM: undefined,
    }));
    // Include any in state not in liveAssets
    const liveIds = new Set(dbMapped.map((a) => a.id));
    const extra = state.assets.filter((a) => !liveIds.has(a.id));
    return [...dbMapped, ...extra];
  }, [liveAssets, state.assets]);

  const openFindingCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inspection of state.inspections) {
      const pending = inspection.findings.filter((f) => f.review === "pending").length;
      if (pending > 0) {
        counts.set(inspection.assetId, (counts.get(inspection.assetId) ?? 0) + pending);
      }
    }
    return counts;
  }, [state.inspections]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return combinedAssets.filter((asset) => {
      const matchesKind = kindFilter === "all" || asset.kind === kindFilter;
      const matchesText =
        text === "" ||
        asset.id.toLowerCase().includes(text) ||
        asset.name.toLowerCase().includes(text) ||
        asset.location.toLowerCase().includes(text) ||
        asset.material.toLowerCase().includes(text);
      return matchesKind && matchesText;
    });
  }, [combinedAssets, query, kindFilter]);

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Asset register"
        title="Infrastructure assets"
        description="Every bridge, road, tunnel and structure in the demo network. Select an asset to see its inspection history, findings and work orders."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Register asset
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ID, name, location…"
            className="h-9 rounded-xl pl-9"
          />
        </div>
        <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as KindFilter)}>
          <SelectTrigger className="h-9 w-44 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {kindOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
          {loading && <Loader2 className="size-3 animate-spin text-primary" />}
          {rows.length} of {liveAssets.length > 0 ? liveAssets.length : state.assets.length} assets
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No assets match this filter"
          description="Try a different search term, or register a new asset to add it to the register."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Register asset
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead className="pl-5">Asset ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden xl:table-cell">Material</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="hidden lg:table-cell">Open findings</TableHead>
                <TableHead className="hidden lg:table-cell">Last inspection</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((asset) => (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dashboard/assets/${asset.id}`)}
                >
                  <TableCell className="pl-5 font-mono text-[13px] font-semibold text-primary">
                    {asset.id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{asset.name}</div>
                    <div className="text-xs text-muted-foreground">{asset.location}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {kindOptions.find((option) => option.value === asset.kind)?.label ?? asset.kind}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {asset.material}
                  </TableCell>
                  <TableCell>
                    <ConditionBadge condition={asset.condition} />
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    {openFindingCount.get(asset.id) ?? 0}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {relativeTime(asset.lastInspection)}
                  </TableCell>
                  <TableCell className="pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        onClick={() =>
                          navigate(`/dashboard/inspections/new?asset=${asset.id}`)
                        }
                      >
                        <ScanLine className="size-3.5" />
                        Inspect
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-lg"
                        onClick={() => navigate(`/dashboard/assets/${asset.id}`)}
                      >
                        View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ComplianceNote className="mt-4" />

      <RegisterAssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingIds={combinedAssets.map((asset) => asset.id)}
        onRegister={async (input) => {
          registerAsset(input);
          await fetchLiveAssets();
        }}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Register asset dialog                                               */
/* ------------------------------------------------------------------ */

function RegisterAssetDialog({
  open,
  onOpenChange,
  existingIds,
  onRegister,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: string[];
  onRegister: (input: any) => void;
}) {
  const [assetId, setAssetId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("bridge");
  const [material, setMaterial] = useState("Reinforced concrete");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [gettingGps, setGettingGps] = useState(false);
  const [builtYear, setBuiltYear] = useState("2018");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acquireGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setLocation(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setGettingGps(false);
        toast.success("GPS location acquired", {
          description: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Accuracy: ${Math.round(pos.coords.accuracy)}m)`,
        });
      },
      (_err) => {
        setGettingGps(false);
        // Default to regional center if denied/unavailable
        setLatitude(40.7128);
        setLongitude(-74.0060);
        setLocation("Central Highway Corridor · Zone 1");
        toast.info("Using regional central coordinates", {
          description: "GPS permission was denied or timed out.",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      setError("Please give the asset a descriptive name.");
      return;
    }

    const cleanId = assetId.trim().toUpperCase();
    if (cleanId && existingIds.includes(cleanId)) {
      setError(`${cleanId} is already registered. Choose another ID or leave blank to auto-generate.`);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const year = builtYear ? Number.parseInt(builtYear, 10) : 2018;
      const created = await api.createAsset({
        id: cleanId || undefined,
        name: name.trim(),
        asset_type: kind,
        address: location.trim() || (latitude ? `GPS (${latitude.toFixed(4)}, ${longitude?.toFixed(4)})` : undefined),
        latitude,
        longitude,
        construction_year: Number.isFinite(year) ? year : 2018,
        material: material.trim() || "Reinforced concrete",
        importance: "medium",
        notes: notes.trim() || undefined,
      });

      toast.success(`Asset registered: ${created.id}`, {
        description: `${created.name} is now saved and available to all engineering roles.`,
      });

      onRegister({
        id: created.id,
        name: created.name,
        kind,
        material: created.material || "Reinforced concrete",
        location: created.address || location,
        builtYear: year,
        condition: "good" as AssetCondition,
        notes: notes.trim() || undefined,
      });

      onOpenChange(false);
      // Reset
      setAssetId("");
      setName("");
      setLocation("");
      setLatitude(undefined);
      setLongitude(undefined);
      setNotes("");
    } catch (e: any) {
      setError(e.message || "Failed to register asset in database.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Infrastructure Asset</DialogTitle>
          <DialogDescription>
            Register a bridge, road, tunnel, or civil structure. Only Name and Type are required; location can be auto-acquired via GPS.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="asset-name">
              Asset Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Riverside Overpass — South Deck"
              className="rounded-lg"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Infrastructure Type</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asset-id">
                Asset ID <span className="text-muted-foreground text-[11px]">(optional auto-generated)</span>
              </Label>
              <Input
                id="asset-id"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                placeholder="Auto e.g. BR-043"
                className="rounded-lg font-mono uppercase"
              />
            </div>
          </div>

          {/* Location & GPS option */}
          <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="asset-location" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" />
                <span>Geographic Location / GPS</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gettingGps}
                onClick={acquireGps}
                className="h-7 text-[11px] gap-1 px-2.5 font-medium border-primary/30 hover:bg-primary/10 text-primary"
              >
                {gettingGps ? <Loader2 className="size-3 animate-spin" /> : <Navigation className="size-3" />}
                <span>{gettingGps ? "Acquiring..." : "Use Current Location (GPS)"}</span>
              </Button>
            </div>
            <Input
              id="asset-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Route 9 · Km 14+200 or click GPS above"
              className="rounded-lg bg-background text-xs"
            />
            {latitude && longitude && (
              <p className="text-[11px] text-primary font-mono">
                📍 Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="asset-material">Material</Label>
              <Input
                id="asset-material"
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                className="rounded-lg text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asset-year">Construction Year</Label>
              <Input
                id="asset-year"
                type="number"
                min={1850}
                max={2026}
                value={builtYear}
                onChange={(event) => setBuiltYear(event.target.value)}
                className="rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-notes">Notes (optional)</Label>
            <Textarea
              id="asset-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Watch points, environmental conditions, access notes…"
              className="min-h-16 rounded-lg text-xs"
            />
          </div>

          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                <span>Registering...</span>
              </>
            ) : (
              <span>Register Asset</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
