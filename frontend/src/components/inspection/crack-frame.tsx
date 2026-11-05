import { useMemo, useState } from "react";
import { Layers, ScanSearch, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/api";
import {
  damageClasses,
  fmtDateTime,
  type Frame,
  type Finding,
  type InspectionMethod,
  type Severity,
} from "@/store/app";

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = { x: number; y: number };

function buildCrackGeom(seed: number): { main: Point[]; branches: Point[][]; width: number } {
  const rnd = mulberry32(seed);
  const startX = 90 + rnd() * 380;
  const startY = 60 + rnd() * 120;
  const steps = 7;
  const main: Point[] = [{ x: startX, y: startY }];
  let angle = rnd() * 0.9 + 0.2;
  for (let index = 0; index < steps; index += 1) {
    const previous = main[main.length - 1];
    angle += (rnd() - 0.5) * 0.7;
    const length = 44 + rnd() * 52;
    main.push({
      x: Math.min(600, Math.max(40, previous.x + Math.cos(angle) * length)),
      y: Math.min(360, Math.max(40, previous.y + Math.sin(angle) * length)),
    });
  }

  const branches: Point[][] = [];
  const branchCount = 1 + Math.floor(rnd() * 2);
  for (let index = 0; index < branchCount; index += 1) {
    const origin = main[Math.floor(rnd() * (main.length - 1)) + 1];
    const branch: Point[] = [{ ...origin }];
    let branchAngle = angle + (rnd() > 0.5 ? 1.6 : -1.2) + (rnd() - 0.5) * 0.5;
    for (let step = 0; step < 3; step += 1) {
      const previous = branch[branch.length - 1];
      branchAngle += (rnd() - 0.5) * 0.6;
      branch.push({
        x: Math.min(620, Math.max(30, previous.x + Math.cos(branchAngle) * (28 + rnd() * 30))),
        y: Math.min(380, Math.max(30, previous.y + Math.sin(branchAngle) * (28 + rnd() * 30))),
      });
    }
    branches.push(branch);
  }

  return { main, branches, width: 1.6 + rnd() * 2.2 };
}

const severityStroke: Record<Severity, string> = {
  low: "var(--success)",
  medium: "var(--warning)",
  high: "var(--destructive)",
  critical: "var(--destructive)",
};

export type FrameMode = "annotated" | "mask" | "heat";

/* ------------------------------------------------------------------ */
/* Frame SVG                                                           */
/* ------------------------------------------------------------------ */

export function CrackFrame({
  seed,
  imageUrl,
  findings = [],
  mode = "annotated",
  selectedFindingId,
  onSelectFinding,
  className,
}: {
  seed: number;
  imageUrl?: string;
  findings?: Finding[];
  mode?: FrameMode;
  selectedFindingId?: string | null;
  onSelectFinding?: (findingId: string) => void;
  className?: string;
}) {
  const geometry = useMemo(() => buildCrackGeom(seed), [seed]);
  const W = 640;
  const H = 400;

  const token = getAuthToken();
  const fullImageUrl = imageUrl
    ? token
      ? imageUrl.includes("?")
        ? `${imageUrl}&token=${encodeURIComponent(token)}`
        : `${imageUrl}?token=${encodeURIComponent(token)}`
      : imageUrl
    : undefined;

  const aggregate = useMemo(() => {
    const rnd = mulberry32(seed + 17);
    return Array.from({ length: 70 }, () => ({
      x: rnd() * W,
      y: rnd() * H,
      r: 1 + rnd() * 3.4,
      o: 0.05 + rnd() * 0.14,
    }));
  }, [seed]);

  const patchShadows = useMemo(() => {
    const rnd = mulberry32(seed + 41);
    return Array.from({ length: 5 }, () => ({
      x: rnd() * W,
      y: rnd() * H,
      rx: 60 + rnd() * 120,
      ry: 30 + rnd() * 70,
      o: 0.05 + rnd() * 0.1,
    }));
  }, [seed]);

  const pointsToPath = (points: Point[]) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("block h-auto w-full", className)}
      role="img"
      aria-label="Inspection frame"
    >
      <defs>
        <linearGradient id={`concrete-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d4d0c6" />
          <stop offset="45%" stopColor="#c9c5ba" />
          <stop offset="100%" stopColor="#bfbab0" />
        </linearGradient>
      </defs>

      {/* photographic real image or concrete fallback */}
      {fullImageUrl ? (
        <image
          href={fullImageUrl}
          width={W}
          height={H}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <rect width={W} height={H} fill={`url(#concrete-${seed})`} />
          {patchShadows.map((patch, index) => (
            <ellipse
              key={index}
              cx={patch.x}
              cy={patch.y}
              rx={patch.rx}
              ry={patch.ry}
              fill="#8f8a80"
              opacity={patch.o}
            />
          ))}
          {aggregate.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill="#6e6a61" opacity={dot.o} />
          ))}
          <line x1="0" y1={H * 0.62} x2={W} y2={H * 0.62} stroke="#a9a49a" strokeWidth="1.4" opacity="0.55" />
          <line
            x1={W * (0.18 + (seed % 3) * 0.1)}
            y1="0"
            x2={W * (0.18 + (seed % 3) * 0.1) + 12}
            y2={H}
            stroke="#a9a49a"
            strokeWidth="1.2"
            opacity="0.4"
          />
        </>
      )}

      {/* crack geometry */}
      <g
        style={
          mode === "mask"
            ? undefined
            : { opacity: mode === "heat" ? 0.35 : 0.9 }
        }
      >
        <path
          d={pointsToPath(geometry.main)}
          stroke={mode === "heat" ? "#8a2f28" : "#45413c"}
          strokeWidth={geometry.width + 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.55}
        />
        <path
          d={pointsToPath(geometry.main)}
          stroke={mode === "heat" ? "#c0392b" : "#38342f"}
          strokeWidth={geometry.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {geometry.branches.map((branch, index) => (
          <path
            key={index}
            d={pointsToPath(branch)}
            stroke={mode === "heat" ? "#c0392b" : "#4c4841"}
            strokeWidth={geometry.width * 0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.75}
          />
        ))}
      </g>

      {/* segmentation mask overlay */}
      {mode === "mask" ? (
        <>
          <path
            d={pointsToPath(geometry.main)}
            stroke="var(--primary)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.28"
            strokeDasharray="1"
          />
          <path
            d={pointsToPath(geometry.main)}
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {geometry.branches.map((branch, index) => (
            <path
              key={index}
              d={pointsToPath(branch)}
              stroke="var(--primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity="0.24"
            />
          ))}
        </>
      ) : null}

      {/* finding annotations */}
      {mode === "annotated" || mode === "heat"
        ? findings.map((finding) => {
            if (!finding?.bbox) return null;
            const box = {
              x: (finding.bbox.x / 100) * W,
              y: (finding.bbox.y / 100) * H,
              w: (finding.bbox.w / 100) * W,
              h: (finding.bbox.h / 100) * H,
            };
            const selected = selectedFindingId === finding.id;
            const color = severityStroke[finding.severity] || "var(--primary)";
            const chipX = box.x;
            const chipY = Math.max(4, box.y - 22);
            const chipLabel = `${finding.classCode} · ${Math.round(finding.confidence * 100)}%`;

            return (
              <g
                key={finding.id}
                onClick={() => onSelectFinding?.(finding.id)}
                style={{ cursor: onSelectFinding ? "pointer" : undefined }}
              >
                {mode === "heat" ? (
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill={color}
                    opacity={selected ? 0.3 : 0.16}
                    rx="3"
                  />
                ) : null}
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={selected ? 2.4 : 1.5}
                  strokeDasharray={selected ? undefined : "6 4"}
                  rx="4"
                />
                {mode === "annotated" ? (
                  <>
                    <rect x={chipX} y={chipY} width={92} height={20} rx="4" fill={color} />
                    <text
                      x={chipX + 8}
                      y={chipY + 14}
                      fontSize="11"
                      fontWeight="700"
                      fill="white"
                      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                    >
                      {chipLabel}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })
        : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Framed panel with viewer controls                                   */
/* ------------------------------------------------------------------ */

const methodLabels: Record<InspectionMethod, string> = {
  drone: "Drone",
  walkdown: "Walkdown",
  vehicle: "Vehicle",
};

export function FrameCard({
  scene,
  findings,
  defaultMode = "annotated",
  selectedFindingId,
  onSelectFinding,
  className,
  footer,
}: {
  scene: Frame;
  findings: Finding[];
  defaultMode?: FrameMode;
  selectedFindingId?: string | null;
  onSelectFinding?: (findingId: string) => void;
  className?: string;
  footer?: React.ReactNode;
}) {
  const [mode, setMode] = useState<FrameMode>(defaultMode);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card astrix-dashboard",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-secondary/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{scene.label}</span>
          <span className="hidden rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:inline">
            {methodLabels[scene.method]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {fmtDateTime(scene.capturedAt)}
          </span>
          <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
            <button
              type="button"
              aria-label="Detections view"
              onClick={() => setMode("annotated")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                mode === "annotated"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ScanSearch className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Segmentation mask view"
              onClick={() => setMode("mask")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                mode === "mask"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Severity heat view"
              onClick={() => setMode("heat")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors",
                mode === "heat"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Flame className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <CrackFrame
          seed={scene.seed}
          imageUrl={(scene as any).yoloUrl || (scene as any).unetUrl || (scene as any).annotatedUrl || (scene as any).url || (scene as any).thumbnailUrl}
          findings={findings}
          mode={mode}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFinding}
        />
      </div>

      {footer ? <div className="border-t bg-secondary/40 px-3 py-2">{footer}</div> : null}
    </div>
  );
}

/** small helper strip listing classes present on a frame */
export function FrameClassStrip({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-4 w-4 rounded-full bg-success/20" />
        No damage classes detected in this frame
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {findings.map((finding) => (
        <span
          key={finding.id}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-0.5 text-[11px] font-medium"
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: severityFillToColor(finding.severity) }}
          />
          {finding.classCode} · {damageClasses[finding.classCode].label}
        </span>
      ))}
    </div>
  );
}

function severityFillToColor(severity: Severity): string {
  switch (severity) {
    case "low":
      return "#296e45";
    case "medium":
      return "#ab6114";
    default:
      return "#ab332e";
  }
}
