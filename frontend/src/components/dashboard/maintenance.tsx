import { useMemo, useState } from "react";
import { CircleAlert, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SeverityBadge,
  WorkOrderStatusBadge,
} from "@/components/watermelon/astrix-dashboard/components/astrix/shared";
import { useDashboardNavigation } from "@/components/watermelon/astrix-dashboard/components/astrix/navigation";
import { fmtDate, useAppStore } from "@/store/app";
import type { WorkOrder, WorkOrderStatus } from "@/store/app";
import {
  ComplianceNote,
  EmptyState,
  PageHeader,
  PageShell,
  StatCard,
} from "./page-shell";

type Priority = "high" | "medium" | "low";

const statusLabels: Record<WorkOrderStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  "in-progress": "In progress",
  closed: "Closed",
};

function isOverdue(order: WorkOrder): boolean {
  if (order.status === "closed") return false;
  return new Date(order.dueDate).getTime() < Date.now();
}

function dueWithinDays(order: WorkOrder, days: number): boolean {
  if (order.status === "closed") return false;
  const due = new Date(order.dueDate).getTime();
  return due >= Date.now() && due <= Date.now() + days * 86400000;
}

export function MaintenancePage() {
  const { state, updateWorkOrder } = useAppStore();
  const { navigate } = useDashboardNavigation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkOrderStatus>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return state.workOrders
      .filter((order) => {
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        const matchesText =
          text === "" ||
          order.id.toLowerCase().includes(text) ||
          order.title.toLowerCase().includes(text) ||
          order.assetId.toLowerCase().includes(text) ||
          order.assignee.toLowerCase().includes(text);
        return matchesStatus && matchesText;
      })
      .sort((a, b) => {
        const priorityWeight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
        if (a.status === "closed" && b.status !== "closed") return 1;
        if (b.status === "closed" && a.status !== "closed") return -1;
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
          return priorityWeight[a.priority] - priorityWeight[b.priority];
        }
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [state.workOrders, query, statusFilter]);

  const openCount = state.workOrders.filter((order) => order.status !== "closed").length;
  const highCount = state.workOrders.filter(
    (order) => order.priority === "high" && order.status !== "closed",
  ).length;
  const soonCount = state.workOrders.filter((order) => dueWithinDays(order, 7)).length;
  const overdue = state.workOrders.filter(isOverdue).length;

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Repair pipeline"
        title="Maintenance board"
        description="Work orders sourced from AI recommendations and engineer reviews. Move each order through scheduled → in progress → closed as crews complete the repair."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New work order
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open orders" value={openCount} hint={`${state.workOrders.length} total on the board`} />
        <StatCard
          label="High priority"
          value={highCount}
          tone={highCount > 0 ? "danger" : "success"}
          hint="Critical findings typically"
        />
        <StatCard
          label="Due within 7 days"
          value={soonCount}
          tone={soonCount > 0 ? "warning" : "success"}
          hint="Watch the schedule"
        />
        <StatCard
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "danger" : "success"}
          hint="Past their due date"
        />
      </div>

      {overdue > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft/60 px-4 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-xs leading-relaxed text-destructive">
            {overdue} work order{overdue === 1 ? "" : "s"} overdue. Reschedule the due date or
            close them out when the repair is verified on site.
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order, asset, assignee…"
            className="h-9 rounded-xl pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as "all" | WorkOrderStatus)}
        >
          <SelectTrigger className="h-9 w-40 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in-progress">In progress</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {state.workOrders.length} orders
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No work orders match"
          description="Adjust the filters, or raise an order from a confirmed finding in the engineer review."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead className="pl-5">Order</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="hidden md:table-cell">Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Source</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="hidden xl:table-cell">Assignee</TableHead>
                <TableHead className="pr-5 text-right">Advance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="pl-5 font-mono text-[13px] font-semibold text-primary">
                    {order.id}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => navigate(`/dashboard/assets/${order.assetId}`)}
                    >
                      {order.assetId}
                    </button>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate md:table-cell">
                    {order.title}
                  </TableCell>
                  <TableCell>
                    {order.priority === "high" ? (
                      <SeverityBadge severity={order.findingRef ? "critical" : "high"} />
                    ) : (
                      <span
                        className={`inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold ${
                          order.priority === "medium"
                            ? "bg-warning-soft text-warning"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {order.priority === "medium" ? "Medium" : "Low"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <WorkOrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-52 truncate text-xs text-muted-foreground lg:table-cell">
                    {order.source}
                  </TableCell>
                  <TableCell
                    className={`text-xs tabular-nums ${isOverdue(order) ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {fmtDate(order.dueDate)}
                    {isOverdue(order) ? " · overdue" : ""}
                  </TableCell>
                  <TableCell className="hidden text-xs xl:table-cell">
                    {order.assignee}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg">
                          {order.status === "closed" ? "Reopen" : "Move"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Set status</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={order.status}
                          onValueChange={(value) => {
                            updateWorkOrder(order.id, { status: value as WorkOrderStatus });
                            toast.success(`${order.id} → ${statusLabels[value as WorkOrderStatus]}`);
                          }}
                        >
                          {(Object.keys(statusLabels) as WorkOrderStatus[]).map((status) => (
                            <DropdownMenuRadioItem key={status} value={status}>
                              {statusLabels[status]}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ComplianceNote className="mt-4" />

      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultAssignee={state.session?.name ?? ""}
        onDone={(dueDate) => {
          setCreateOpen(false);
          toast.success(`Due through ${dueDate} — order added to the board.`);
        }}
      />
    </PageShell>
  );
}

function CreateWorkOrderDialog({
  open,
  onOpenChange,
  defaultAssignee,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAssignee: string;
  onDone: (dueDate: string) => void;
}) {
  const { state, createWorkOrder } = useAppStore();
  const [title, setTitle] = useState("");
  const [assetId, setAssetId] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("2026-11-06");
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New work order</DialogTitle>
          <DialogDescription>
            Manual orders are logged as engineer-initiated work alongside AI-sourced ones.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="new-wo-title">Title</Label>
            <Input
              id="new-wo-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Riverside overpass — fascia patch repair"
              className="rounded-lg"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Asset</Label>
            <Select value={assetId} onValueChange={(value) => setAssetId(value)}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select asset…" />
              </SelectTrigger>
              <SelectContent>
                {state.assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.id} · {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-wo-due">Due date</Label>
              <Input
                id="new-wo-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-wo-assignee">Assignee</Label>
            <Input
              id="new-wo-assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              placeholder="Maintenance engineer on call"
              className="rounded-lg"
            />
          </div>
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (title.trim().length < 6) {
                setError("Give the work order a descriptive title (6+ characters).");
                return;
              }
              if (!assetId) {
                setError("Select the asset the repair is for.");
                return;
              }
              if (!dueDate) {
                setError("Set a due date.");
                return;
              }
              setError(null);
              createWorkOrder({
                title: title.trim(),
                assetId,
                priority,
                dueDate,
                assignee: assignee.trim() || defaultAssignee,
                source: `Manual entry by ${state.session?.name ?? "demo user"}`,
              });
              onDone(dueDate);
            }}
          >
            <Plus className="size-4" />
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

