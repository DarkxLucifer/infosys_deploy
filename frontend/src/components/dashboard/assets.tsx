import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ScanLine, MapPin, Loader2, Navigation, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth-context";
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
  const { user: authUser } = useAuth();
  const [liveAssets, setLiveAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedAssetForAssign, setSelectedAssetForAssign] = useState<string>("");

  const canAssign = useMemo(() => {
    const role = (authUser?.role || "").toLowerCase();
    return ["admin", "manager", "engineer", "civil-engineer", "lead_inspector"].includes(role);
  }, [authUser]);

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

  // Map live DB assets directly (no mock fallback injection)
  const combinedAssets = useMemo(() => {
    return liveAssets.map((a: any) => ({
      id: a.id,
      name: a.name,
      kind: (a.asset_type || a.assetType || "bridge").toLowerCase() as AssetKind,
      material: a.material || "Reinforced concrete",
      location: a.address || `GPS: ${a.latitude?.toFixed(4)}, ${a.longitude?.toFixed(4)}`,
      builtYear: a.construction_year || a.constructionYear || 2018,
      condition: (a.importance === "critical" ? "poor" : a.importance === "high" ? "fair" : "good") as AssetCondition,
      lastInspection: a.created_at || new Date().toISOString(),
      assignedInspectorId: a.assignedInspectorId,
      assignedInspectorName: a.assignedInspectorName,
      assignedInspectorEmail: a.assignedInspectorEmail,
      spanLengthM: undefined,
    }));
  }, [liveAssets]);

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
          <div className="flex items-center gap-2">
            {canAssign && (
              <Button
                variant="outline"
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => {
                  setSelectedAssetForAssign(combinedAssets[0]?.id || "");
                  setAssignDialogOpen(true);
                }}
              >
                <UserCheck className="size-4" />
                Assign Asset to Inspector
              </Button>
            )}
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Register asset
            </Button>
          </div>
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
                <TableHead className="hidden lg:table-cell">Assigned Inspector</TableHead>
                <TableHead className="hidden lg:table-cell">Last inspection</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((asset) => (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/assets/${asset.id}`)}
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
                  <TableCell className="hidden text-xs lg:table-cell">
                    {asset.assignedInspectorName ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <UserCheck className="size-3 text-primary shrink-0" />
                        <span className="truncate max-w-32">{asset.assignedInspectorName}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {relativeTime(asset.lastInspection)}
                  </TableCell>
                  <TableCell className="pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {canAssign && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg text-primary border-primary/30 hover:bg-primary/10 gap-1 text-xs"
                          onClick={() => {
                            setSelectedAssetForAssign(asset.id);
                            setAssignDialogOpen(true);
                          }}
                        >
                          <UserCheck className="size-3.5" />
                          Assign
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                        onClick={() =>
                          navigate(`/app/inspections/new?asset=${asset.id}`)
                        }
                      >
                        <ScanLine className="size-3.5" />
                        Inspect
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-lg"
                        onClick={() => navigate(`/app/assets/${asset.id}`)}
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

      <AssignAssetDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        assets={combinedAssets}
        defaultAssetId={selectedAssetForAssign}
        onAssigned={async () => {
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

/* ------------------------------------------------------------------ */
/* Role-Based Asset Assignment to Inspector Dialog                    */
/* ------------------------------------------------------------------ */

export function AssignAssetDialog({
  open,
  onOpenChange,
  assets,
  defaultAssetId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: any[];
  defaultAssetId?: string;
  onAssigned?: (result: any) => void;
}) {
  const [assetId, setAssetId] = useState(defaultAssetId || "");
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [inspectorId, setInspectorId] = useState("");
  const [method, setMethod] = useState("walkdown");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingInspectors, setLoadingInspectors] = useState(false);

  useEffect(() => {
    const targetId = defaultAssetId || (assets.length > 0 ? assets[0].id : "");
    if (targetId) {
      setAssetId(targetId);
      const target = assets.find((a) => a.id === targetId);
      if (target?.assignedInspectorId) {
        setInspectorId(target.assignedInspectorId);
      }
    }
  }, [defaultAssetId, assets]);

  useEffect(() => {
    if (open) {
      setLoadingInspectors(true);
      api
        .getInspectors()
        .then((list) => {
          if (Array.isArray(list)) {
            setInspectors(list);
            const currentAsset = assets.find((a) => a.id === (assetId || defaultAssetId));
            if (currentAsset?.assignedInspectorId && list.some((i) => i.id === currentAsset.assignedInspectorId)) {
              setInspectorId(currentAsset.assignedInspectorId);
            } else if (list.length > 0 && !inspectorId) {
              setInspectorId(list[0].id);
            }
          }
        })
        .catch(() => toast.error("Failed to load active field inspectors"))
        .finally(() => setLoadingInspectors(false));
    }
  }, [open, assetId, defaultAssetId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId) {
      toast.error("Please select an infrastructure asset.");
      return;
    }
    if (!inspectorId) {
      toast.error("Please select a field inspector.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.assignAssetToInspector(assetId, {
        inspector_id: inspectorId,
        inspection_method: method,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });

      toast.success(res.message || "Asset successfully assigned to inspector!");
      onAssigned?.(res);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to assign asset");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAsset = assets.find((a) => a.id === assetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="size-4 text-primary" />
            Assign Asset to Inspector
          </DialogTitle>
          <DialogDescription className="text-xs">
            Role-based delegation: schedule a field crack & damage inspection and assign it to an active inspector.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
          {/* Target Asset */}
          <div className="space-y-1.5">
            <Label htmlFor="assign-asset">Target Infrastructure Asset</Label>
            <Select value={assetId} onValueChange={(val) => {
              setAssetId(val);
              const found = assets.find((a) => a.id === val);
              if (found?.assignedInspectorId) {
                setInspectorId(found.assignedInspectorId);
              }
            }}>
              <SelectTrigger id="assign-asset" className="h-9 rounded-xl text-xs">
                <SelectValue placeholder="Select asset…" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <span className="font-mono font-bold text-primary">{a.id}</span> · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAsset && (
              <p className="text-[11px] text-muted-foreground">{selectedAsset.location}</p>
            )}
          </div>

          {/* Assigned Inspector */}
          <div className="space-y-1.5">
            <Label htmlFor="assign-inspector">Assigned Field Inspector</Label>
            {loadingInspectors ? (
              <div className="h-9 rounded-xl bg-muted animate-pulse" />
            ) : (
              <Select value={inspectorId} onValueChange={setInspectorId}>
                <SelectTrigger id="assign-inspector" className="h-9 rounded-xl text-xs">
                  <SelectValue placeholder="Choose field inspector…" />
                </SelectTrigger>
                <SelectContent>
                  {inspectors.map((ins) => (
                    <SelectItem key={ins.id} value={ins.id} className="text-xs">
                      <span className="font-semibold text-foreground">{ins.name || ins.email}</span> ·{" "}
                      <span className="text-muted-foreground">{ins.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Method & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-method">Inspection Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="assign-method" className="h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkdown" className="text-xs">Walkdown</SelectItem>
                  <SelectItem value="drone" className="text-xs">Drone Survey</SelectItem>
                  <SelectItem value="dslr" className="text-xs">DSLR Camera</SelectItem>
                  <SelectItem value="smartphone" className="text-xs">Smartphone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-due">Due Date</Label>
              <Input
                id="assign-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          {/* Field Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="assign-notes">Field Instructions / Focus Areas</Label>
            <Textarea
              id="assign-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inspect south pier joints, capture scale calibration line, check for shear cracks…"
              className="min-h-16 rounded-xl text-xs"
            />
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !assetId || !inspectorId}
              className="text-xs font-semibold gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Assigning…</span>
                </>
              ) : (
                <>
                  <UserCheck className="size-3.5" />
                  <span>Assign Asset to Inspector</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
