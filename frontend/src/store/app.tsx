import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Role =
  | "civil-engineer"
  | "inspector"
  | "maintenance-engineer"
  | "manager"
  | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  initials: string;
};

export type AssetKind =
  | "bridge"
  | "road"
  | "tunnel"
  | "retaining-wall"
  | "building";

export type AssetCondition = "good" | "fair" | "poor";

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  material: string;
  location: string;
  builtYear: number;
  condition: AssetCondition;
  lastInspection: string;
  spanLengthM?: number;
  notes?: string;
};

export type DamageClassCode = "D00" | "D10" | "D11" | "D20" | "D40" | "D50";

export type Severity = "low" | "medium" | "high" | "critical";

export type FindingReview = "pending" | "confirmed" | "flagged";

export type Finding = {
  id: string;
  inspectionId: string;
  frameId: string;
  classCode: DamageClassCode;
  confidence: number;
  severity: Severity;
  /** Bounding box in percent of the frame */
  bbox: { x: number; y: number; w: number; h: number };
  measurements: {
    lengthPx: number;
    widthPx: number;
    areaPx: number;
    widthMm: number;
  };
  /** Millimetres per pixel for this frame's standoff */
  mmPerPx: number;
  review: FindingReview;
  addedByModel: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
};

export type Frame = {
  id: string;
  label: string;
  capturedAt: string;
  method: InspectionMethod;
  seed: number;
};

export type InspectionMethod = "drone" | "walkdown" | "vehicle";

export type InspectionStatus =
  | "in-progress"
  | "processing"
  | "awaiting-review"
  | "reviewed"
  | "escalated";

export type Inspection = {
  id: string;
  assetId: string;
  title: string;
  method: InspectionMethod;
  inspector: string;
  startedAt: string;
  completedAt?: string;
  status: InspectionStatus;
  frames: Frame[];
  findings: Finding[];
  modelVersion: string;
  /** 0-100, only meaningful while status === "processing" */
  progress: number;
  notes?: string;
  escalationReason?: string;
};

export type ReportKind = "integrity" | "audit" | "findings" | "maintenance";

export type GeneratedReport = {
  id: string;
  title: string;
  kind: ReportKind;
  format: "pdf" | "csv" | "json";
  inspectionId?: string;
  createdAt: string;
  status: "ready" | "generating";
};

/** convenience alias used by status badges */
export type ReportStatus = GeneratedReport["status"];

export type WorkOrderStatus =
  | "open"
  | "scheduled"
  | "in-progress"
  | "closed";

export type WorkOrderPriority = "high" | "medium" | "low";

export type WorkOrder = {
  id: string;
  title: string;
  assetId: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  dueDate: string;
  assignee: string;
  source: string;
  findingRef?: string;
  createdAt: string;
};

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  time: string;
  tone?: "critical" | "info" | "success";
};

export type ModelCard = {
  id: string;
  name: string;
  version: string;
  algorithm: string;
  task: string;
  status: "active" | "review" | "archived";
  installedAt: string;
  metrics: { iou?: number; precision?: number; recall?: number };
  notes: string;
};

export type Settings = {
  orgName: string;
  confidenceGate: number;
  autoPriorityWorkOrders: boolean;
  retentionDays: number;
};

export type AppState = {
  session: User | null;
  users: User[];
  assets: Asset[];
  inspections: Inspection[];
  reports: GeneratedReport[];
  workOrders: WorkOrder[];
  notifications: AppNotification[];
  models: ModelCard[];
  settings: Settings;
};

/* ------------------------------------------------------------------ */
/* Static registries                                                   */
/* ------------------------------------------------------------------ */

export const roleLabels: Record<Role, string> = {
  "civil-engineer": "Civil Engineer",
  inspector: "Infrastructure Inspector",
  "maintenance-engineer": "Maintenance Engineer",
  manager: "Infrastructure Manager",
  admin: "Administrator",
};

export const assetKindLabels: Record<AssetKind, string> = {
  bridge: "Bridge",
  road: "Road corridor",
  tunnel: "Tunnel",
  "retaining-wall": "Retaining wall",
  building: "Structure deck",
};

export const conditionLabels: Record<AssetCondition, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const inspectionMethodLabels: Record<InspectionMethod, string> = {
  drone: "Drone survey",
  walkdown: "Manual walkdown",
  vehicle: "Vehicle-mounted",
};

export const inspectionStatusLabels: Record<InspectionStatus, string> = {
  "in-progress": "In progress",
  processing: "Processing",
  "awaiting-review": "Awaiting review",
  reviewed: "Reviewed",
  escalated: "Escalated",
};

export const severityOrder: Severity[] = ["low", "medium", "high", "critical"];

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  "in-progress": "In progress",
  closed: "Closed",
};

export const reportKindLabels: Record<ReportKind, string> = {
  integrity: "Integrity certificate",
  audit: "Inspection audit log",
  findings: "Findings dataset export",
  maintenance: "Maintenance summary",
};

export const damageClasses: Record<
  DamageClassCode,
  { label: string; description: string }
> = {
  D00: { label: "Hairline fissure", description: "Fine non-structural cracking, monitor only" },
  D10: { label: "Longitudinal crack", description: "Runs parallel to traffic direction" },
  D11: { label: "Alligator cracking", description: "Load-related fatigue pattern" },
  D20: { label: "Spalling / fragment", description: "Broken concrete with exposed section" },
  D40: { label: "Lateral crack", description: "Thermal or shrinkage crack across the member" },
  D50: { label: "Block cracking", description: "Interconnected square cracking grid" },
};

export const modelVersion = "CrackNet-R v3.2";

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

const seedUsers: User[] = [
  {
    id: "u-meera",
    name: "Dr. Meera Kulkarni",
    email: "m.kulkarni@infrascan.demo",
    role: "civil-engineer",
    title: "Principal Structural Engineer",
    initials: "MK",
  },
  {
    id: "u-arjun",
    name: "Arjun Nair",
    email: "a.nair@infrascan.demo",
    role: "inspector",
    title: "Senior Infrastructure Inspector",
    initials: "AN",
  },
  {
    id: "u-sofia",
    name: "Sofia Mensah",
    email: "s.mensah@infrascan.demo",
    role: "maintenance-engineer",
    title: "Maintenance Engineering Lead",
    initials: "SM",
  },
  {
    id: "u-david",
    name: "David Osei",
    email: "d.osei@infrascan.demo",
    role: "manager",
    title: "Infrastructure Manager",
    initials: "DO",
  },
  {
    id: "u-priya",
    name: "Priya Raghavan",
    email: "p.raghavan@infrascan.demo",
    role: "admin",
    title: "System Administrator",
    initials: "PR",
  },
];

const seedAssets: Asset[] = [
  {
    id: "BR-101",
    name: "Riverside Expressway Viaduct",
    kind: "bridge",
    material: "Reinforced Concrete",
    location: "West River Parkway, Pier 4-6, New York (40.7128, -74.0060)",
    builtYear: 2014,
    condition: "fair",
    lastInspection: "2026-10-22T10:00:00",
    spanLengthM: 120,
    notes: "Multi-span post-tensioned concrete viaduct carrying 4 lanes of interstate traffic. Periodic crack and spall monitoring.",
  },
  {
    id: "TU-204",
    name: "Hudson River North Tunnel",
    kind: "tunnel",
    material: "Precast Concrete Liners",
    location: "Hudson River Crossing, Bore 2, New York (40.7589, -73.9851)",
    builtYear: 2018,
    condition: "good",
    lastInspection: "2026-10-20T14:30:00",
    spanLengthM: 450,
    notes: "Sub-aqueous transit tunnel. Monitored for moisture infiltration and transverse lining joint fissures.",
  },
];

type SeedFrameSpec = { label: string; at: string; seed: number };

function frame(spec: SeedFrameSpec, method: InspectionMethod): Frame {
  return {
    id: `FR-${spec.seed}`,
    label: spec.label,
    capturedAt: spec.at,
    method,
    seed: spec.seed,
  };
}

function finding(
  id: string,
  inspectionId: string,
  frameId: string,
  classCode: DamageClassCode,
  confidence: number,
  severity: Severity,
  bbox: { x: number; y: number; w: number; h: number },
  m: { lengthPx: number; widthPx: number; widthMm: number; mmPerPx: number },
  review: FindingReview,
  opts?: { reviewedBy?: string; note?: string },
): Finding {
  return {
    id,
    inspectionId,
    frameId,
    classCode,
    confidence,
    severity,
    bbox,
    measurements: {
      lengthPx: m.lengthPx,
      widthPx: m.widthPx,
      widthMm: m.widthMm,
      areaPx: Math.round(m.lengthPx * m.widthPx * 0.58),
    },
    mmPerPx: m.mmPerPx,
    review,
    addedByModel: true,
    reviewedBy: opts?.reviewedBy,
    reviewedAt: review === "pending" ? undefined : "2026-10-20T01:00:00",
    note: opts?.note,
  };
}

const seedInspections: Inspection[] = [
  {
    id: "INSP-2026-001",
    assetId: "BR-101",
    title: "Pier 4-6 Visual and Crack Survey",
    method: "walkdown",
    inspector: "Alex Rivers",
    startedAt: "2026-10-22T10:00:00",
    completedAt: "2026-10-22T10:45:00",
    status: "awaiting-review",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Pier 4 Cap Beam - East Face", at: "10:05", seed: 1011 }, "walkdown"),
    ],
    findings: [
      finding(
        "det-br101-01",
        "INSP-2026-001",
        "FR-1011",
        "D00",
        0.92,
        "medium",
        { x: 38, y: 35, w: 25, h: 42 },
        { lengthPx: 240, widthPx: 6, widthMm: 1.8, mmPerPx: 0.3 },
        "pending",
        { note: "Longitudinal flexural crack along pier 4 cap beam. Width 1.8mm exceeds 1.5mm threshold." },
      ),
    ],
    notes: "Visual and high-resolution optical survey of riverside viaduct pier caps. Noticeable flexural cracking on pier 4.",
  },
  {
    id: "INSP-2026-002",
    assetId: "TU-204",
    title: "Bore 2 Annual Structural Integrity Scan",
    method: "drone",
    inspector: "Alex Rivers",
    startedAt: "2026-10-20T14:30:00",
    completedAt: "2026-10-20T15:15:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Ring 142 Crown Joint", at: "14:35", seed: 2041 }, "drone"),
    ],
    findings: [
      finding(
        "det-tu204-01",
        "INSP-2026-002",
        "FR-2041",
        "D10",
        0.88,
        "low",
        { x: 45, y: 30, w: 18, h: 36 },
        { lengthPx: 145, widthPx: 3, widthMm: 0.9, mmPerPx: 0.3 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Hairline transverse shrinkage joint, within safety margin." },
      ),
    ],
    notes: "Annual autonomous drone LiDAR and optical pass through Bore 2. Precast liners in satisfactory condition.",
  },
];

const seedWorkOrders: WorkOrder[] = [
  {
    id: "WO-2026-001",
    title: "Riverside Viaduct Pier 4 crack injection and epoxy sealing",
    assetId: "BR-101",
    priority: "high",
    status: "in-progress",
    dueDate: "2026-10-30",
    assignee: "Marcus Vance",
    source: "Engineer Review · INSP-2026-001",
    findingRef: "det-br101-01",
    createdAt: "2026-10-22T11:00:00",
  },
];

const seedReports: GeneratedReport[] = [
  {
    id: "RPT-2026-001",
    title: "Hudson Tunnel Bore 2 Certified Integrity Audit",
    kind: "integrity",
    format: "pdf",
    inspectionId: "INSP-2026-002",
    createdAt: "2026-10-21T09:00:00",
    status: "ready",
  },
];

const seedModels: ModelCard[] = [
  {
    id: "cracknet-r",
    name: "CrackNet-R",
    version: "v3.2",
    algorithm: "ResNet-50 + FPN with sub-pixel width estimator",
    task: "Surface cracks (D00, D10, D11)",
    status: "active",
    installedAt: "2026-08-15",
    metrics: { iou: 0.81, precision: 0.89, recall: 0.86 },
    notes: "Production model for bridge deck and tunnel liner scans. Calibrated with 0.30 mm/px ground truth.",
  },
];

const seedNotifications: AppNotification[] = [
  {
    id: "n-1",
    title: "Analysis ready for review",
    description: "INSP-2026-001 · Pier 4 crack awaiting engineer validation on Riverside Viaduct.",
    time: "15 min ago",
    tone: "critical",
  },
  {
    id: "n-2",
    title: "Inspection certified",
    description: "INSP-2026-002 · Bore 2 Annual Scan certified by Civil Engineer.",
    time: "2 days ago",
    tone: "info",
  },
];

const seedSettings: Settings = {
  orgName: "Metro Infrastructure Authority",
  confidenceGate: 0.65,
  autoPriorityWorkOrders: false,
  retentionDays: 180,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const STORAGE_KEY = "infrascan-state-v4";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function makeFrameSeeds(inspectionId: string, count: number): number[] {
  const base = hashString(inspectionId) % 900;
  return Array.from({ length: count }, (_, index) => base * 7 + index + 1);
}

function nowStamp(): string {
  return new Date().toISOString();
}

function prettyTime(date: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hour = date.getHours();
  const hour12 = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${months[date.getMonth()]} ${date.getDate()}, ${hour12}:${minute} ${suffix}`;
}

export function fmtDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return prettyTime(date);
}

export function fmtDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function nextId(list: { id: string }[], prefix: string, pad = 3): string {
  const numeric = list
    .map((item) => Number.parseInt(item.id.replace(prefix, ""), 10))
    .filter((value) => Number.isFinite(value));
  const max = numeric.length ? Math.max(...numeric) : 0;
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

function seedFindingForFrame(
  inspectionId: string,
  inspFrames: Frame[],
): Finding[] {
  const seeds = makeFrameSeeds(inspectionId, inspFrames.length);
  const candidates: Array<{
    classCode: DamageClassCode;
    weight: number;
  }> = [
    { classCode: "D00", weight: 0.32 },
    { classCode: "D10", weight: 0.24 },
    { classCode: "D40", weight: 0.18 },
    { classCode: "D11", weight: 0.1 },
    { classCode: "D50", weight: 0.08 },
    { classCode: "D20", weight: 0.08 },
  ];

  const findings: Finding[] = [];
  inspFrames.forEach((scene, frameIndex) => {
    const frameSeed = seeds[frameIndex] ?? frameIndex + 1;
    let raw = frameSeed * 9973;
    const rnd = () => {
      raw = (raw * 1103515245 + 12345) % 2147483648;
      return (raw / 2147483648);
    };
    const count = floor01(rnd() * 3.4);
    for (let index = 0; index < count; index += 1) {
      const pick = rnd();
      let cumulative = 0;
      let classCode: DamageClassCode = "D00";
      for (const candidate of candidates) {
        cumulative += candidate.weight;
        if (pick <= cumulative) {
          classCode = candidate.classCode;
          break;
        }
      }
      const confidence =
        Math.round((0.55 + rnd() * 0.43) * 100) / 100;
      const widthPx = 2 + Math.floor(rnd() * 40);
      const widthMm = Math.round(widthPx * (0.09 + rnd() * 0.12) * 100) / 100;
      const lengthPx = 60 + Math.floor(rnd() * 280);
      const severity: Severity =
        widthMm < 0.5 ? "low" : widthMm < 3 ? "medium" : widthMm < 10 ? "high" : "critical";
      findings.push(finding(
        `F-${scene.seed}-${index + 1}`,
        inspectionId,
        scene.id,
        classCode,
        confidence,
        severity,
        {
          x: 6 + Math.floor(rnd() * 55),
          y: 12 + Math.floor(rnd() * 55),
          w: 10 + Math.floor(rnd() * 30),
          h: 7 + Math.floor(rnd() * 26),
        },
        { lengthPx, widthPx, widthMm, mmPerPx: Math.round((widthMm / widthPx) * 1000) / 1000 },
        "pending",
      ));
    }
  });
  return findings;
}

function floor01(value: number): number {
  return Math.max(0, Math.floor(value)) || Math.round(value * 2) % 2;
}

/* ------------------------------------------------------------------ */
/* Public action names used by pages                                   */
/* ------------------------------------------------------------------ */

export type NewInspectionInput = {
  assetId: string;
  title?: string;
  method: InspectionMethod;
  frameCount: number;
  frameLabels?: string[];
  notes?: string;
};

export type NewAssetInput = Omit<Asset, "lastInspection" | "condition" | "notes"> & {
  condition: AssetCondition;
  notes?: string;
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

type AppStore = {
  state: AppState;
  signIn: (userId: string) => void;
  signOut: () => void;
  registerAsset: (asset: NewAssetInput) => Asset;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  createInspection: (input: NewInspectionInput) => Inspection;
  runAnalysis: (inspectionId: string) => void;
  addFinding: (
    inspectionId: string,
    classCode: DamageClassCode,
    severity: Severity,
    note?: string,
  ) => void;
  reviewFinding: (
    inspectionId: string,
    findingId: string,
    review: FindingReview,
    note?: string,
  ) => void;
  deleteFinding: (inspectionId: string, findingId: string) => void;
  escalateInspection: (inspectionId: string, reason: string) => void;
  signOffInspection: (inspectionId: string) => void;
  generateReport: (kind: ReportKind, inspectionId?: string) => GeneratedReport;
  createWorkOrder: (
    input: Pick<WorkOrder, "title" | "assetId" | "priority" | "dueDate" | "assignee"> & {
      findingRef?: string;
      source?: string;
    },
  ) => WorkOrder;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /* helpers */
  assetById: (id: string) => Asset | undefined;
  inspectionById: (id: string) => Inspection | undefined;
};

const AppStoreContext = createContext<AppStore | null>(null);

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.assets) && Array.isArray(parsed.inspections)) {
        return { ...buildSeedState(), ...parsed, session: null };
      }
    }
  } catch {
    /* fall through to seed */
  }
  return buildSeedState();
}

function buildSeedState(): AppState {
  return {
    session: null,
    users: seedUsers,
    assets: seedAssets,
    inspections: seedInspections,
    reports: seedReports,
    workOrders: seedWorkOrders,
    notifications: seedNotifications,
    models: seedModels,
    settings: seedSettings,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timers = useRef<Record<string, number>>({});

  /* persist */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable (private mode) — demo keeps running */
    }
  }, [state]);

  /* resume inspections that were processing before a reload */
  useEffect(() => {
    state.inspections
      .filter((inspection) => inspection.status === "processing")
      .forEach((inspection) => {
        if (timers.current[inspection.id] == null) {
          timers.current[inspection.id] = window.setTimeout(() => {
            finishAnalysis(inspection.id);
          }, 2600);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* progress ticker while any inspection is processing */
  const [tick, setTick] = useState(0);
  const hasProcessing = state.inspections.some((inspection) => inspection.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 350);
    return () => window.clearInterval(interval);
  }, [hasProcessing]);

  const finishAnalysis = useCallback(
    (inspectionId: string) => {
      setState((current) => {
        const inspection = current.inspections.find((item) => item.id === inspectionId);
        if (!inspection || inspection.status !== "processing") return current;

        const gate = current.settings.confidenceGate;
        const all = seedFindingForFrame(inspectionId, inspection.frames);
        let generated = all.filter((candidate) => candidate.confidence >= gate);
        if (generated.length === 0 && all.length > 0) {
          // keep the strongest finding so the review workflow always has material in the demo
          const strongest = all.reduce((best, candidate) =>
            candidate.confidence > best.confidence ? candidate : best,
          );
          strongest.confidence = Math.round(Math.min(0.98, gate + 0.02) * 100) / 100;
          generated = [strongest];
        }

        const inspections = current.inspections.map((item) =>
          item.id === inspectionId
            ? {
                ...item,
                status: "awaiting-review" as InspectionStatus,
                progress: 100,
                completedAt: nowStamp(),
                findings: generated,
              }
            : item,
        );

        const critical = generated.find((candidate) => candidate.severity === "critical");
        const notification: AppNotification = {
          id: `n-${inspectionId}-${nowStamp()}`,
          title: critical ? "Critical finding requires review" : "Analysis ready for review",
          description: `${inspectionId} · ${generated.length} finding${generated.length === 1 ? "" : "s"} flagged for engineer validation.`,
          time: "just now",
          tone: critical ? "critical" : "info",
        };

        return {
          ...current,
          inspections,
          notifications: [notification, ...current.notifications].slice(0, 12),
        };
      });
      delete timers.current[inspectionId];
    },
    [],
  );

  const runAnalysis = useCallback(
    (inspectionId: string) => {
      setState((current) => ({
        ...current,
        inspections: current.inspections.map((item) =>
          item.id === inspectionId
            ? { ...item, status: "processing" as InspectionStatus, progress: 3, findings: [] }
            : item,
        ),
      }));
      if (timers.current[inspectionId]) {
        window.clearTimeout(timers.current[inspectionId]);
      }
      stepProgress(inspectionId);
      timers.current[inspectionId] = window.setTimeout(() => {
        finishAnalysis(inspectionId);
      }, 5200);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finishAnalysis],
  );

  const stepProgress = useCallback((inspectionId: string) => {
    const advance = () => {
      setState((current) => {
        const inspection = current.inspections.find((item) => item.id === inspectionId);
        if (!inspection || inspection.status !== "processing") return current;
        return {
          ...current,
          inspections: current.inspections.map((item) =>
            item.id === inspectionId
              ? { ...item, progress: Math.min(93, item.progress + 6 + item.frames.length) }
              : item,
          ),
        };
      });
    };
    const interval = window.setInterval(advance, 420);
    const stop = window.setTimeout(() => window.clearInterval(interval), 5000);
    // keep both handles from leaking by storing a synthetic key
    timers.current[`${inspectionId}-interval`] = interval as unknown as number;
    timers.current[`${inspectionId}-stop`] = stop;
  }, []);

  const signIn = useCallback((userId: string) => {
    setState((current) => ({
      ...current,
      session: current.users.find((user) => user.id === userId) ?? null,
    }));
  }, []);

  const signOut = useCallback(() => {
    setState((current) => ({ ...current, session: null }));
  }, []);

  const registerAsset = useCallback((input: NewAssetInput): Asset => {
    const asset: Asset = { ...input, lastInspection: nowStamp() };
    setState((current) => ({
      ...current,
      assets: [asset, ...current.assets],
      notifications: [
        {
          id: `n-${asset.id}`,
          title: "Asset registered",
          description: `${asset.id} · ${asset.name} added to the asset register.`,
          time: "just now",
          tone: "success" as const,
        },
        ...current.notifications,
      ].slice(0, 12),
    }));
    return asset;
  }, []);

  const updateAsset = useCallback((id: string, patch: Partial<Asset>) => {
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === id ? { ...asset, ...patch } : asset,
      ),
    }));
  }, []);

  const createInspection = useCallback(
    (input: NewInspectionInput): Inspection => {
      const current = stateRef.current;
      const id = nextId(current.inspections, "INSP-");
      const seeds = makeFrameSeeds(id, input.frameCount);
      const stamps = input.frameLabels ?? [];
      const inspection: Inspection = {
        id,
        assetId: input.assetId,
        title:
          input.title ||
          `${current.assets.find((asset) => asset.id === input.assetId)?.name ?? "Unassigned"} survey`,
        method: input.method,
        inspector: current.session?.name ?? "Arjun Nair",
        startedAt: nowStamp(),
        status: "in-progress",
        modelVersion,
        frames: Array.from({ length: input.frameCount }, (_, index) => ({
          id: `FR-${seeds[index]}`,
          label: stamps[index] || `Frame ${index + 1}`,
          capturedAt: prettyTime(new Date()),
          method: input.method,
          seed: seeds[index],
        })),
        findings: [],
        progress: 0,
        notes: input.notes,
      };
      setState((latest) => ({ ...latest, inspections: [inspection, ...latest.inspections] }));
      return inspection;
    },
    [],
  );

  const addFinding = useCallback(
    (inspectionId: string, classCode: DamageClassCode, severity: Severity, note?: string) => {
      setState((current) => ({
        ...current,
        inspections: current.inspections.map((inspection) => {
          if (inspection.id !== inspectionId) return inspection;
          const target = inspection.frames[0] ?? inspection.frames[inspection.frames.length - 1];
          if (!target) return inspection;
          const findingId = `F-${hashString(inspectionId + Date.now()) % 100000}`;
          const widthPx = severity === "critical" ? 60 : severity === "high" ? 30 : severity === "medium" ? 10 : 2;
          const widthMm = Math.round(widthPx * 0.1 * 100) / 100;
          return {
            ...inspection,
            findings: [
              ...inspection.findings,
              {
                id: findingId,
                inspectionId,
                frameId: target.id,
                classCode,
                confidence: 1,
                severity,
                bbox: { x: 30 + (inspection.findings.length % 5) * 8, y: 30 + (inspection.findings.length % 4) * 10, w: 22, h: 12 },
                measurements: {
                  lengthPx: 120,
                  widthPx,
                  areaPx: Math.round(120 * widthPx * 0.58),
                  widthMm: widthMm || 1,
                },
                mmPerPx: 0.1,
                review: "confirmed" as FindingReview,
                addedByModel: false,
                reviewedBy: current.session?.name,
                note,
              },
            ],
          };
        }),
      }));
    },
    [],
  );

  const reviewFinding = useCallback(
    (inspectionId: string, findingId: string, review: FindingReview, note?: string) => {
      setState((current) => ({
        ...current,
        inspections: current.inspections.map((inspection) => {
          if (inspection.id !== inspectionId) return inspection;
          return {
            ...inspection,
            findings: inspection.findings.map((candidate) =>
              candidate.id === findingId
                ? {
                    ...candidate,
                    review,
                    reviewedBy: current.session?.name ?? candidate.reviewedBy,
                    reviewedAt: nowStamp(),
                    note: note !== undefined ? note : candidate.note,
                  }
                : candidate,
            ),
          };
        }),
      }));
    },
    [],
  );

  const deleteFinding = useCallback((inspectionId: string, findingId: string) => {
    setState((current) => ({
      ...current,
      inspections: current.inspections.map((inspection) =>
        inspection.id === inspectionId
          ? {
              ...inspection,
              findings: inspection.findings.filter(
                (candidate) => candidate.id !== findingId,
              ),
            }
          : inspection,
      ),
    }));
  }, []);

  const escalateInspection = useCallback((inspectionId: string, reason: string) => {
    setState((current) => ({
      ...current,
      inspections: current.inspections.map((inspection) =>
        inspection.id === inspectionId
          ? { ...inspection, status: "escalated" as InspectionStatus, escalationReason: reason }
          : inspection,
      ),
      notifications: [
        {
          id: `n-esc-${inspectionId}-${nowStamp()}`,
          title: "Inspection escalated",
          description: `${inspectionId} · ${reason}`,
          time: "just now",
          tone: "critical" as const,
        },
        ...current.notifications,
      ].slice(0, 12),
    }));
  }, []);

  const signOffInspection = useCallback((inspectionId: string) => {
    setState((current) => ({
      ...current,
      inspections: current.inspections.map((inspection) =>
        inspection.id === inspectionId
          ? {
              ...inspection,
              status: "reviewed" as InspectionStatus,
              findings: inspection.findings.map((finding) =>
                finding.review === "pending"
                  ? {
                      ...finding,
                      review: "confirmed" as FindingReview,
                      reviewedBy: current.session?.name,
                      reviewedAt: nowStamp(),
                    }
                  : finding,
              ),
            }
          : inspection,
      ),
      notifications: [
        {
          id: `n-sign-${inspectionId}-${nowStamp()}`,
          title: "Review signed off",
          description: `${inspectionId} · validated by ${current.session?.name ?? "an engineer"}.`,
          time: "just now",
          tone: "success" as const,
        },
        ...current.notifications,
      ].slice(0, 12),
    }));
  }, []);

  const generateReport = useCallback(
    (kind: ReportKind, inspectionId?: string): GeneratedReport => {
      const titles: Record<ReportKind, string> = {
        integrity: "Integrity certificate",
        audit: "Inspection audit log",
        findings: "Findings dataset export",
        maintenance: "Maintenance summary",
      };
      const current = stateRef.current;
      const id = nextId(current.reports, "RPT-", 3);
      const report: GeneratedReport = {
        id,
        title: inspectionId
          ? `${titles[kind]} — ${inspectionId}`
          : `${titles[kind]} — current register`,
        kind,
        format: kind === "audit" ? "csv" : kind === "findings" ? "json" : "pdf",
        inspectionId,
        createdAt: nowStamp(),
        status: "generating",
      };
      setState((latest) => ({ ...latest, reports: [report, ...latest.reports] }));
      window.setTimeout(() => {
        setState((latest) => ({
          ...latest,
          reports: latest.reports.map((item) =>
            item.id === report.id ? { ...item, status: "ready" as const } : item,
          ),
        }));
      }, 1800);
      return report;
    },
    [],
  );

  const createWorkOrder = useCallback<AppStore["createWorkOrder"]>((input) => {
    const current = stateRef.current;
    const id = nextId(current.workOrders, "MW-", 3);
    const order: WorkOrder = {
      id,
      title: input.title,
      assetId: input.assetId,
      priority: input.priority,
      status: "open",
      dueDate: input.dueDate,
      assignee: input.assignee || current.session?.name || "Unassigned",
      source: input.source || `Manual entry by ${current.session?.name ?? "demo user"}`,
      findingRef: input.findingRef,
      createdAt: nowStamp(),
    };
    setState((latest) => ({
      ...latest,
      workOrders: [order, ...latest.workOrders],
      notifications: [
        {
          id: `n-wo-${id}`,
          title: "Work order created",
          description: `${id} · ${input.title}`,
          time: "just now",
          tone: "success" as const,
        },
        ...latest.notifications,
      ].slice(0, 12),
    }));
    return order;
  }, []);

  const updateWorkOrder = useCallback((id: string, patch: Partial<WorkOrder>) => {
    setState((current) => ({
      ...current,
      workOrders: current.workOrders.map((order) =>
        order.id === id ? { ...order, ...patch } : order,
      ),
    }));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.filter((item) => item.id !== id),
    }));
  }, []);

  const dismissAllNotifications = useCallback(() => {
    setState((current) => ({ ...current, notifications: [] }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const assetById = useCallback(
    (id: string) => state.assets.find((asset) => asset.id === id),
    [state.assets],
  );

  const inspectionById = useCallback(
    (id: string) => state.inspections.find((inspection) => inspection.id === id),
    [state.inspections],
  );

  const value = useMemo(
    () => ({
      state,
      signIn,
      signOut,
      registerAsset,
      updateAsset,
      createInspection,
      runAnalysis,
      addFinding,
      reviewFinding,
      deleteFinding,
      escalateInspection,
      signOffInspection,
      generateReport,
      createWorkOrder,
      updateWorkOrder,
      dismissNotification,
      dismissAllNotifications,
      updateSettings,
      assetById,
      inspectionById,
    }),
    // tick re-renders progress bars while processing is active
    [state, tick, signIn, signOut, registerAsset, updateAsset, createInspection, runAnalysis, addFinding, reviewFinding, deleteFinding, escalateInspection, signOffInspection, generateReport, createWorkOrder, updateWorkOrder, dismissNotification, dismissAllNotifications, updateSettings, assetById, inspectionById], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return context;
}
