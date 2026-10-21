import { useState } from "react";
import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { roleLabels, useAppStore } from "@/store/app";
import { STORAGE_KEY } from "@/store/app";
import type { Settings as SettingsType } from "@/store/app";
import { ComplianceNote, PageHeader, PageShell } from "./page-shell";

const gateOptions = ["0.5", "0.55", "0.6", "0.65", "0.7", "0.75", "0.8", "0.85", "0.9"];

function metricBar(value: number | undefined, tone: string) {
  if (value === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function SettingsPage() {
  const { state, updateSettings } = useAppStore();
  const [orgName, setOrgName] = useState(state.settings.orgName);
  const [retentionDays, setRetentionDays] = useState(String(state.settings.retentionDays));
  const [error, setError] = useState<string | null>(null);

  const patch = (update: Partial<SettingsType>) => {
    updateSettings(update);
  };

  const resetDemo = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — ignore */
    }
    window.location.reload();
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Organization profile, analysis defaults and the installed model registry. Changes apply to new analysis passes immediately."
      />

      <div className="space-y-4">
        {/* profile */}
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Signed-in persona</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Demo sessions pick one of the seeded personas on the sign-in screen. Roles control
            which workflows the demo highlights, they do not enforce server-side permissions.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-muted/50 px-4 py-3.5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
              {state.session?.initials ?? "IN"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{state.session?.name ?? "Not signed in"}</div>
              <div className="text-xs text-muted-foreground">
                {state.session
                  ? `${roleLabels[state.session.role]} · ${state.session.title}`
                  : "Sign in again from the landing page"}
              </div>
            </div>
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              {state.session ? roleLabels[state.session.role] : "—"}
            </span>
          </div>
        </section>

        {/* organization + defaults */}
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Organization profile</h2>
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-org">Organization name</Label>
                <Input
                  id="settings-org"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-retention">
                  Findings retention window (days)
                </Label>
                <Input
                  id="settings-retention"
                  type="number"
                  min={30}
                  max={365}
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Frame rasters older than this are dropped from the demo store; findings and
                  audit records never delete.
                </p>
              </div>
              {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
              <div>
                <Button
                  onClick={() => {
                    const days = Number.parseInt(retentionDays, 10);
                    if (orgName.trim().length < 3) {
                      setError("Organization name needs at least 3 characters.");
                      return;
                    }
                    if (!Number.isFinite(days) || days < 30 || days > 365) {
                      setError("Retention window must be between 30 and 365 days.");
                      return;
                    }
                    setError(null);
                    patch({ orgName: orgName.trim(), retentionDays: days });
                    toast.success("Settings saved", {
                      description: "Organization profile updated.",
                    });
                  }}
                >
                  <Save className="size-4" />
                  Save profile
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Analysis defaults</h2>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-1.5">
                <Label>Confidence gate</Label>
                <Select
                  value={String(state.settings.confidenceGate)}
                  onValueChange={(value) => {
                    const gate = Number.parseFloat(value);
                    patch({ confidenceGate: gate });
                    toast.success(
                      `Confidence gate set to ${Math.round(gate * 100)}% — applies to the next analysis pass.`,
                    );
                  }}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {gateOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {Math.round(Number.parseFloat(option) * 100)}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Findings below this model confidence are dropped from review. Raise it to
                  reduce false positives on gentle captures.
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-xl border px-3.5 py-3">
                <Checkbox
                  checked={state.settings.autoPriorityWorkOrders}
                  onCheckedChange={(checked) => {
                    patch({ autoPriorityWorkOrders: checked === true });
                    toast.success(
                      checked
                        ? "Auto work orders on — critical findings will queue orders at sign-off."
                        : "Auto work orders off — engineers raise orders manually.",
                    );
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Auto-priority work orders for critical findings
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    At sign-off, critical findings place a high-priority draft order on the
                    maintenance board automatically.
                  </span>
                </span>
              </label>
              <ComplianceNote
                message="Neither the gate nor automation replaces engineering judgement: every repair decision must be validated by qualified personnel."
              />
            </div>
          </div>
        </section>

        {/* model registry */}
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold">Model registry</h2>
              <p className="text-xs text-muted-foreground">
                Installed inference models and validation metrics (IoU · precision · recall).
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-lg bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
              <ShieldCheck className="size-3.5" />
              Registry traceable
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/20">
                <TableHead className="pl-5">Model</TableHead>
                <TableHead className="hidden md:table-cell">Algorithm</TableHead>
                <TableHead className="hidden lg:table-cell">Task</TableHead>
                <TableHead>IoU</TableHead>
                <TableHead className="hidden sm:table-cell">Precision</TableHead>
                <TableHead className="hidden sm:table-cell">Recall</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="pl-5">
                    <div className="font-semibold">
                      {model.name}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {model.version}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Installed {model.installedAt}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {model.algorithm}
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">{model.task}</TableCell>
                  <TableCell>{metricBar(model.metrics.iou, "bg-primary")}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {metricBar(model.metrics.precision, "bg-success")}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {metricBar(model.metrics.recall, "bg-warning")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold ${
                        model.status === "active"
                          ? "bg-success-soft text-success"
                          : model.status === "review"
                            ? "bg-warning-soft text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {model.status === "active"
                        ? "Active"
                        : model.status === "review"
                          ? "In review"
                          : "Archived"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* demo data */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-soft/40 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-warning">Reset demo data</h2>
            <p className="text-xs text-muted-foreground">
              Clears the localStorage-backed demo database ({STORAGE_KEY}) and reloads with the
              seeded register. Your session and any created inspections, orders and reports are
              lost.
            </p>
          </div>
          <Button variant="outline" className="border-warning/40 text-warning" onClick={resetDemo}>
            <RotateCcw className="size-4" />
            Reset demo data
          </Button>
        </section>
      </div>
    </PageShell>
  );
}
