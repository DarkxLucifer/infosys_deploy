import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Chart, registerables } from "chart.js";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Layers,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { triggerDownload } from "@/lib/report-download";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PageShell } from "@/components/dashboard/page-shell";

// Register Chart.js components
Chart.register(...registerables);

export function DamageAnalyticsPage() {
  const [range, setRange] = useState<string>("30d");
  const [assetType, setAssetType] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  // Analytics states
  const [overview, setOverview] = useState<any>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [progression, setProgression] = useState<any>(null);
  const [riskMatrix, setRiskMatrix] = useState<any>(null);
  const [velocity, setVelocity] = useState<any>(null);

  // Chart Canvas Refs
  const distributionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const riskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const velocityCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active chart instances
  const distributionChartRef = useRef<Chart | null>(null);
  const progressionChartRef = useRef<Chart | null>(null);
  const riskChartRef = useRef<Chart | null>(null);
  const velocityChartRef = useRef<Chart | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [ovData, distData, progData, riskData, velData] = await Promise.all([
        api.getAnalyticsOverview(range, assetType),
        api.getDamageDistribution(range, assetType),
        api.getCrackProgression(),
        api.getRiskMatrix(range),
        api.getMaintenanceVelocity(),
      ]);

      setOverview(ovData);
      setDistribution(distData);
      setProgression(progData);
      setRiskMatrix(riskData);
      setVelocity(velData);
    } catch (err: any) {
      toast.error(err.message || "Failed to load damage analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [range, assetType]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csvText = await api.exportDamageAnalyticsCsv(range);
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      triggerDownload(blob, `infrascan_damage_analytics_${range}.csv`);
      toast.success("Analytics Dataset Exported", {
        description: `Exported ${range} structural damage metrics CSV.`,
      });
    } catch (err: any) {
      toast.error(err.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  // Render Chart 1: Multi-Class Damage Distribution (Doughnut)
  useEffect(() => {
    if (!distributionCanvasRef.current || !distribution?.classes?.length) return;

    if (distributionChartRef.current) {
      distributionChartRef.current.destroy();
    }

    const ctx = distributionCanvasRef.current.getContext("2d");
    if (!ctx) return;

    const topClasses = distribution.classes.slice(0, 7);
    const labels = topClasses.map((c: any) => c.name);
    const counts = topClasses.map((c: any) => c.count);

    const colors = [
      "#6366f1", // Indigo
      "#f43f5e", // Rose
      "#f59e0b", // Amber
      "#06b6d4", // Cyan
      "#8b5cf6", // Purple
      "#10b981", // Emerald
      "#64748b", // Slate
    ];

    distributionChartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: counts,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: "transparent",
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 12,
              font: { size: 11, family: "inherit" },
              color: "#94a3b8",
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
                const val = Number(context.raw);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
                return ` ${context.label}: ${val} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      distributionChartRef.current?.destroy();
    };
  }, [distribution]);

  // Render Chart 2: Cross-Epoch Crack Growth Curves (Line)
  useEffect(() => {
    if (!progressionCanvasRef.current || !progression?.series?.length) return;

    if (progressionChartRef.current) {
      progressionChartRef.current.destroy();
    }

    const ctx = progressionCanvasRef.current.getContext("2d");
    if (!ctx) return;

    // Pick top assets with multiple epochs
    const activeSeries = progression.series.slice(0, 4);

    // Extract common labels or epoch indices
    const maxEpochs = Math.max(...activeSeries.map((s: any) => s.epochs.length), 3);
    const labels = Array.from({ length: maxEpochs }, (_, i) => `Epoch ${i + 1}`);

    const strokeColors = ["#6366f1", "#f43f5e", "#0ea5e9", "#10b981"];
    const isCalibratedSeries = activeSeries.some((s: any) => s.epochs?.some((e: any) => e.calibrated));
    const unitLabel = isCalibratedSeries ? "mm" : "px";

    const datasets = activeSeries.map((s: any, idx: number) => {
      const dataPoints = s.epochs.map((e: any) => e.max_aperture_px);
      return {
        label: `${s.asset_id} (${s.asset_name})`,
        data: dataPoints,
        borderColor: strokeColors[idx % strokeColors.length],
        backgroundColor: "transparent",
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: strokeColors[idx % strokeColors.length],
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    progressionChartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#94a3b8" },
          },
          y: {
            grid: { color: "rgba(148, 163, 184, 0.1)" },
            ticks: {
              font: { size: 11 },
              color: "#94a3b8",
              callback: (val) => `${val} ${unitLabel}`,
            },
            title: {
              display: true,
              text: `Max Crack Aperture (${unitLabel})`,
              color: "#94a3b8",
              font: { size: 11 },
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { size: 11 },
              color: "#94a3b8",
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.dataset.label}: ${context.raw} ${unitLabel}`,
            },
          },
        },
      },
    });

    return () => {
      progressionChartRef.current?.destroy();
    };
  }, [progression]);

  // Render Chart 3: Infrastructure Type x Severity Risk Matrix (Horizontal Stacked Bar)
  useEffect(() => {
    if (!riskCanvasRef.current || !riskMatrix?.rows?.length) return;

    if (riskChartRef.current) {
      riskChartRef.current.destroy();
    }

    const ctx = riskCanvasRef.current.getContext("2d");
    if (!ctx) return;

    const rows = riskMatrix.rows;
    const labels = rows.map((r: any) => r.display_name);

    riskChartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Sound",
            data: rows.map((r: any) => r.counts.no_visible_damage),
            backgroundColor: "#10b981", // Emerald
            stack: "risk",
          },
          {
            label: "Minor",
            data: rows.map((r: any) => r.counts.minor),
            backgroundColor: "#0ea5e9", // Sky
            stack: "risk",
          },
          {
            label: "Moderate",
            data: rows.map((r: any) => r.counts.moderate),
            backgroundColor: "#f59e0b", // Amber
            stack: "risk",
          },
          {
            label: "Severe",
            data: rows.map((r: any) => r.counts.severe),
            backgroundColor: "#f43f5e", // Rose
            stack: "risk",
          },
          {
            label: "Critical",
            data: rows.map((r: any) => r.counts.critical),
            backgroundColor: "#9333ea", // Purple
            stack: "risk",
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { color: "rgba(148, 163, 184, 0.1)" },
            ticks: { font: { size: 11 }, color: "#94a3b8" },
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#94a3b8" },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 10,
              font: { size: 11 },
              color: "#94a3b8",
            },
          },
        },
      },
    });

    return () => {
      riskChartRef.current?.destroy();
    };
  }, [riskMatrix]);

  // Render Chart 4: Maintenance SLA Turnaround (Bar)
  useEffect(() => {
    if (!velocityCanvasRef.current || !velocity?.crews?.length) return;

    if (velocityChartRef.current) {
      velocityChartRef.current.destroy();
    }

    const ctx = velocityCanvasRef.current.getContext("2d");
    if (!ctx) return;

    const crews = velocity.crews;
    const labels = crews.map((c: any) => c.crew.replace(" Maintenance", "").replace(" Specialists", ""));

    velocityChartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Target SLA (Days)",
            data: crews.map((c: any) => c.target_sla_days),
            backgroundColor: "rgba(99, 102, 241, 0.35)",
            borderColor: "#6366f1",
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Actual Turnaround (Days)",
            data: crews.map((c: any) => c.actual_avg_days),
            backgroundColor: "rgba(244, 63, 94, 0.8)",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, color: "#94a3b8" },
          },
          y: {
            grid: { color: "rgba(148, 163, 184, 0.1)" },
            ticks: {
              font: { size: 11 },
              color: "#94a3b8",
              callback: (val) => `${val} d`,
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 10,
              font: { size: 11 },
              color: "#94a3b8",
            },
          },
        },
      },
    });

    return () => {
      velocityChartRef.current?.destroy();
    };
  }, [velocity]);

  const monitoredAssets = useMemo(() => {
    return progression?.series || [];
  }, [progression]);

  return (
    <PageShell wide>
      <div className="space-y-8 pb-12">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <BarChart3 className="size-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Damage Analytics Engine</h1>
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-500 bg-indigo-500/5 text-xs">
                Milestone 3 Certified
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Cross-epoch damage progression, multi-class defect classification, and maintenance SLA compliance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time Window Selector */}
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <Calendar className="mr-1.5 size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="12m">Past 12 Months</SelectItem>
                <SelectItem value="all">All Records</SelectItem>
              </SelectContent>
            </Select>

            {/* Asset Type Filter */}
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger className="w-36 h-9 text-xs">
                <Filter className="mr-1.5 size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Asset Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Structures</SelectItem>
                <SelectItem value="bridge">Bridges</SelectItem>
                <SelectItem value="tunnel">Tunnels</SelectItem>
                <SelectItem value="road">Road Corridors</SelectItem>
                <SelectItem value="dam">Dams</SelectItem>
                <SelectItem value="building">Buildings</SelectItem>
              </SelectContent>
            </Select>

            {/* Export CSV Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting || loading}
              className="h-9 gap-1.5 text-xs font-medium cursor-pointer"
            >
              <Download className="size-3.5" />
              {exporting ? "Exporting..." : "Export Analytics CSV"}
            </Button>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAnalytics}
              disabled={loading}
              className="h-9 w-9 p-0 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* 4 Core Performance KPI Cards (Section 9, Page 37) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: DDR */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Defect Detection Rate</span>
                <ShieldAlert className="size-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight">
                  {overview ? `${overview.defect_detection_rate}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({overview?.inspections_with_defects ?? 0} / {overview?.total_inspections ?? 0} scans)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                Ratio of inspected structures presenting verified structural anomalies.
              </p>
            </CardContent>
          </Card>

          {/* Card 2: HPR */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">High-Priority Ratio</span>
                <AlertTriangle className="size-4 text-rose-500" />
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight text-rose-500">
                  {overview ? `${overview.high_priority_rate}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({overview?.high_priority_defects ?? 0} severe / critical)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                Proportion of defects categorized as P1/P2 requiring engineering intervention.
              </p>
            </CardContent>
          </Card>

          {/* Card 3: ICR */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Inspection Completion Rate</span>
                <CheckCircle2 className="size-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight text-emerald-500">
                  {overview ? `${overview.inspection_completion_rate}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({overview?.completed_inspections ?? 0} of {overview?.total_inspections ?? 0} closed)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                Inspections reviewed and signed off against scheduled baseline targets.
              </p>
            </CardContent>
          </Card>

          {/* Card 4: MTTR */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Mean Time to Resolution</span>
                <Clock className="size-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight">
                  {overview ? `${overview.mean_time_to_resolution_days}d` : "—"}
                </span>
                <span className="text-xs text-emerald-500 font-medium">Target &lt; 21d</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                Average lifecycle days from initial crack detection to certified work order closure.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1: Distribution & Cross-Epoch Progression */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 1: Multi-Class Damage Distribution */}
          <Card className="lg:col-span-5 border-border/60 bg-card/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Multi-Class Damage Distribution</CardTitle>
                  <CardDescription className="text-xs">
                    Verified structural crack and surface anomaly classification
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {distribution?.total ?? 0} findings
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 relative flex items-center justify-center">
                <canvas ref={distributionCanvasRef} />
              </div>
              <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                {distribution?.classes?.slice(0, 4).map((c: any) => (
                  <div key={c.key} className="flex items-center justify-between py-0.5">
                    <span className="text-muted-foreground truncate max-w-[130px]">{c.name}</span>
                    <span className="font-semibold">{c.count} ({c.percentage}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: Cross-Epoch Crack Aperture & Length Velocity */}
          <Card className="lg:col-span-7 border-border/60 bg-card/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Cross-Epoch Crack Progression Curves</CardTitle>
                  <CardDescription className="text-xs">
                    Multi-survey aperture dilation velocity across monitored infrastructure assets
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="size-3.5 text-indigo-500" />
                  <span>Dilation &Delta;w / &Delta;t</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 relative">
                <canvas ref={progressionCanvasRef} />
              </div>
              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span>Sound: &lt; 0.2mm (1.0px)</span>
                <span>Moderate: 0.2 – 2.0mm (1.0–10px)</span>
                <span className="text-rose-500 font-medium">Critical Dilation: &gt; 2.0mm (10px+)</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2: Risk Matrix & Maintenance Turnaround */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 3: Infrastructure Type x Severity Risk Matrix */}
          <Card className="lg:col-span-6 border-border/60 bg-card/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Asset Category &times; Damage Severity Matrix</CardTitle>
                  <CardDescription className="text-xs">
                    Risk distribution cross-tabulation across bridge, tunnel, road, and dam portfolios
                  </CardDescription>
                </div>
                <Layers className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 relative">
                <canvas ref={riskCanvasRef} />
              </div>
            </CardContent>
          </Card>

          {/* Chart 4: Maintenance SLA Turnaround */}
          <Card className="lg:col-span-6 border-border/60 bg-card/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Maintenance Crew Turnaround Velocity</CardTitle>
                  <CardDescription className="text-xs">
                    Target repair SLA days vs actual completion turnaround across specialized crews
                  </CardDescription>
                </div>
                <Wrench className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 relative">
                <canvas ref={velocityCanvasRef} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monitored Structures Cross-Epoch Growth Ledger */}
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Monitored Structures Cross-Epoch Growth Ledger</CardTitle>
                <CardDescription className="text-xs">
                  Active structures tracking serial crack measurements and calculated growth status
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {monitoredAssets.length} Monitored Assets
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[120px] font-semibold text-xs">Asset ID</TableHead>
                    <TableHead className="font-semibold text-xs">Asset Name</TableHead>
                    <TableHead className="font-semibold text-xs">Category</TableHead>
                    <TableHead className="font-semibold text-xs text-center">Epochs Tracked</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Latest Aperture</TableHead>
                    <TableHead className="font-semibold text-xs text-center">Growth Status</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitoredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                        No monitored assets found for the selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    monitoredAssets.map((asset: any) => {
                      const latest = asset.epochs?.[asset.epochs.length - 1];
                      const status = asset.latest_status || "stable";
                      return (
                        <TableRow key={asset.asset_id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-mono text-xs font-medium text-primary">
                            {asset.asset_id}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {asset.asset_name}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {asset.asset_type}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono">
                            {asset.epochs_count}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-medium">
                            {latest?.max_aperture_px ?? 0} px
                          </TableCell>
                          <TableCell className="text-center">
                            {status === "critical_acceleration" ? (
                              <Badge variant="destructive" className="text-[11px] font-medium gap-1">
                                <TrendingUp className="size-3" />
                                Critical Acceleration
                              </Badge>
                            ) : status === "moderate_growth" ? (
                              <Badge variant="secondary" className="text-[11px] font-medium bg-amber-500/10 text-amber-500 gap-1">
                                <ArrowUpRight className="size-3" />
                                Moderate Growth
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px] font-medium bg-emerald-500/10 text-emerald-500 gap-1">
                                <CheckCircle2 className="size-3" />
                                Stable
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link to={`/app/assets/${asset.asset_id}`}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-500 hover:text-indigo-600 gap-1 cursor-pointer">
                                Inspect
                                <ArrowUpRight className="size-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
