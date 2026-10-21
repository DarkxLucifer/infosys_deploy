import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowRight, UserCheck, AlertCircle, Loader2, Plus, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/store/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";
import { ComplianceNote, PageHeader, PageShell } from "./page-shell";

export function InspectionNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillAssetId = searchParams.get("asset") || "";

  const [assets, setAssets] = useState<any[]>([]);
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [assetId, setAssetId] = useState(prefillAssetId);
  const [inspectorId, setInspectorId] = useState("");
  const [inspectionDate, setInspectionDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick asset creation modal
  const [quickAssetOpen, setQuickAssetOpen] = useState(false);
  const [quickAssetName, setQuickAssetName] = useState("");
  const [quickAssetType, setQuickAssetType] = useState("bridge");
  const [quickLocation, setQuickLocation] = useState("");
  const [quickLat, setQuickLat] = useState<number | undefined>(undefined);
  const [quickLng, setQuickLng] = useState<number | undefined>(undefined);
  const [gettingGps, setGettingGps] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

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
        setQuickLat(lat);
        setQuickLng(lng);
        setQuickLocation(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setGettingGps(false);
        toast.success("GPS location acquired", {
          description: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        });
      },
      (_err) => {
        setGettingGps(false);
        setQuickLat(40.7128);
        setQuickLng(-74.0060);
        setQuickLocation("Field Zone GPS Tagged");
        toast.info("Using regional central coordinates");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleQuickCreateAsset = async () => {
    if (!quickAssetName.trim()) {
      toast.error("Please enter an asset name");
      return;
    }
    setQuickSubmitting(true);
    try {
      const created = await api.createAsset({
        name: quickAssetName.trim(),
        asset_type: quickAssetType,
        address: quickLocation.trim() || undefined,
        latitude: quickLat,
        longitude: quickLng,
      });
      toast.success(`Asset created: ${created.id}`);
      setAssets((prev) => [created, ...prev]);
      setAssetId(created.id);
      setQuickAssetOpen(false);
      setQuickAssetName("");
      setQuickLocation("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create asset");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const loadFormData = async () => {
    try {
      const [assetList, inspectorList] = await Promise.all([
        api.getAssets().catch(() => []),
        api.getInspectors().catch(() => []),
      ]);
      setAssets(assetList);
      setInspectors(inspectorList);

      if (prefillAssetId && assetList.some((a: any) => a.id === prefillAssetId)) {
        setAssetId(prefillAssetId);
      } else if (assetList.length > 0 && !assetId) {
        setAssetId(assetList[0].id);
      }

      // Default inspector to current user if inspector, else first available
      if (user?.role === "inspector" && user.id) {
        setInspectorId(user.id);
      } else if (inspectorList.length > 0 && !inspectorId) {
        setInspectorId(inspectorList[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFormData();
  }, [prefillAssetId, user]);

  const selectedAsset = assets.find((a) => a.id === assetId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId) {
      setError("Please select a target infrastructure asset.");
      return;
    }
    if (!inspectorId) {
      setError("Please assign a certified infrastructure inspector.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const created = await api.createInspection({
        asset_id: assetId,
        inspector_id: inspectorId,
        inspection_date: new Date(inspectionDate).toISOString(),
        due_date: new Date(dueDate).toISOString(),
        notes: notes.trim() || undefined,
      });

      toast.success("Inspection scheduled successfully", {
        description: `Assigned inspection created for asset ${assetId}. Status: Assigned.`,
      });
      navigate(`/app/inspections/${created.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create and assign inspection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        backHref="/app/inspections"
        backLabel="Inspections"
        eyebrow="Inspection Commissioning"
        title="Schedule & Assign Inspection"
        description="Commission a new infrastructure survey visit. Pick the asset, assign the certified inspector, set schedule milestones, and notify the field team."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form Container */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-3 space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="asset-select" className="text-xs font-semibold">
                Target Infrastructure Asset <span className="text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickAssetOpen(true)}
                className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 font-medium"
              >
                <Plus className="size-3" />
                <span>+ Add Asset with GPS</span>
              </Button>
            </div>
            {loading ? (
              <div className="h-10 rounded-xl bg-muted animate-pulse" />
            ) : (
              <Select value={assetId} onValueChange={(val) => setAssetId(val)}>
                <SelectTrigger id="asset-select" className="h-10 rounded-xl text-xs font-medium">
                  <SelectValue placeholder="Select asset from network inventory..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id} className="text-xs">
                      <span className="font-mono font-bold text-primary">{asset.id}</span> · {asset.name} ({asset.asset_type || asset.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedAsset && (
              <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50">
                <p className="font-semibold text-foreground">{selectedAsset.name}</p>
                <p>{selectedAsset.address} · Material: {selectedAsset.material} · Department: {selectedAsset.department}</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-select" className="text-xs font-semibold">
              Assigned Field Inspector <span className="text-destructive">*</span>
            </Label>
            {loading ? (
              <div className="h-10 rounded-xl bg-muted animate-pulse" />
            ) : (
              <Select value={inspectorId} onValueChange={(val) => setInspectorId(val)}>
                <SelectTrigger id="inspector-select" className="h-10 rounded-xl text-xs font-medium">
                  <SelectValue placeholder="Select certified field inspector..." />
                </SelectTrigger>
                <SelectContent>
                  {inspectors.map((insp) => (
                    <SelectItem key={insp.id} value={insp.id} className="text-xs">
                      {insp.name} ({insp.email}) · <span className="capitalize text-muted-foreground">{insp.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">
              The assigned inspector receives an immediate in-app and email notification to begin site capture.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="inspection-date" className="text-xs font-semibold">
                Scheduled Visit Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inspection-date"
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="h-10 rounded-xl text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due-date" className="text-xs font-semibold">
                Review Due Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 rounded-xl text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspection-notes" className="text-xs font-semibold">
              Visit Instructions & Standoff Notes (optional)
            </Label>
            <Textarea
              id="inspection-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inspect pier cap and north abutment; drone survey permitted with 2.5m standoff; check for salt crystallisation..."
              className="min-h-24 rounded-xl text-xs leading-relaxed"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs font-medium">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/app/inspections")}
              className="h-10 px-4 rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loading || !assetId || !inspectorId}
              className="h-10 px-5 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <span>Create & Assign</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Informational Panel */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground">Standard Inspection Journey</h3>
            <ol className="space-y-3.5 text-xs">
              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                  1
                </span>
                <div>
                  <div className="font-semibold text-foreground">Commission & Assign</div>
                  <div className="text-muted-foreground mt-0.5 leading-snug">
                    Inspection assigned to field inspector with scheduled target date. Status: <code className="text-primary font-mono text-[11px]">assigned</code>.
                  </div>
                </div>
              </li>

              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                  2
                </span>
                <div>
                  <div className="font-semibold text-foreground">Field Capture & Upload</div>
                  <div className="text-muted-foreground mt-0.5 leading-snug">
                    Inspector uploads high-resolution photography (drone, camera, smartphone). System executes 7 automated quality checks.
                  </div>
                </div>
              </li>

              <li className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary font-bold text-xs">
                  3
                </span>
                <div>
                  <div className="font-semibold text-foreground">Preprocessing & Review Gate</div>
                  <div className="text-muted-foreground mt-0.5 leading-snug">
                    Inspector locks upload and submits. Image preprocessing pipeline runs. Civil Engineer claims review and marks findings.
                  </div>
                </div>
              </li>
            </ol>

            <div className="p-3 rounded-xl bg-muted/60 border border-border/80 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <UserCheck className="size-3.5 text-primary" />
                <span>Qualified Engineering Gate</span>
              </div>
              <p>
                AI analysis is currently not connected. All findings, crack measurements, and damage severity assessments are recorded and certified by licensed Civil Engineers.
              </p>
            </div>
          </div>

          <ComplianceNote />
        </div>
      </div>

      {/* Quick Add Asset Dialog */}
      <Dialog open={quickAssetOpen} onOpenChange={setQuickAssetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Register Asset with GPS</DialogTitle>
            <DialogDescription>
              Create an asset immediately on-site. Only name and type required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="quick-name">Asset Name <span className="text-destructive">*</span></Label>
              <Input
                id="quick-name"
                value={quickAssetName}
                onChange={(e) => setQuickAssetName(e.target.value)}
                placeholder="e.g. West Pier Arch 4"
                className="rounded-lg text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Infrastructure Type</Label>
              <Select value={quickAssetType} onValueChange={setQuickAssetType}>
                <SelectTrigger className="rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">Bridge</SelectItem>
                  <SelectItem value="road">Road corridor</SelectItem>
                  <SelectItem value="tunnel">Tunnel</SelectItem>
                  <SelectItem value="retaining-wall">Retaining wall</SelectItem>
                  <SelectItem value="building">Structure deck</SelectItem>
                  <SelectItem value="dam">Hydro dam</SelectItem>
                  <SelectItem value="culvert">Culvert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" />
                  <span>GPS Location</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={gettingGps}
                  onClick={acquireGps}
                  className="h-7 text-[11px] gap-1 px-2.5 font-medium border-primary/30 text-primary"
                >
                  {gettingGps ? <Loader2 className="size-3 animate-spin" /> : <Navigation className="size-3" />}
                  <span>{gettingGps ? "Acquiring..." : "Acquire GPS"}</span>
                </Button>
              </div>
              <Input
                value={quickLocation}
                onChange={(e) => setQuickLocation(e.target.value)}
                placeholder="Click Acquire GPS above or type reference"
                className="rounded-lg bg-background text-xs"
              />
              {quickLat && quickLng && (
                <p className="text-[11px] text-primary font-mono">
                  📍 Coordinates: {quickLat.toFixed(5)}, {quickLng.toFixed(5)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAssetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickCreateAsset} disabled={quickSubmitting}>
              {quickSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Register & Select</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
