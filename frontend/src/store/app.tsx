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
    id: "BR-018",
    name: "Riverside Overpass — South Deck",
    kind: "bridge",
    material: "Reinforced concrete",
    location: "Sector 4 · Grid E-2",
    builtYear: 1998,
    condition: "fair",
    lastInspection: "2026-10-12T09:10:00",
    spanLengthM: 84,
    notes: "Bi-annual deck survey. Girder G3 shows shadowing under the southbound lane.",
  },
  {
    id: "BR-031",
    name: "Halewood Viaduct — North Bend",
    kind: "bridge",
    material: "Prestressed concrete",
    location: "Ring Road · Pier 7",
    builtYear: 2004,
    condition: "good",
    lastInspection: "2026-09-28T14:00:00",
    spanLengthM: 132,
  },
  {
    id: "TU-2042",
    name: "Hillcrest Tunnel — East Bore",
    kind: "tunnel",
    material: "Cast in-situ concrete",
    location: "Route 9 · Ch. 1+240",
    builtYear: 1989,
    condition: "poor",
    lastInspection: "2026-10-06T11:45:00",
    spanLengthM: 640,
    notes: "Ventilation shaft lintel under watch since 2026-06.",
  },
  {
    id: "RD-1142",
    name: "M-40 Corridor · Km 22–27",
    kind: "road",
    material: "Asphalt overlay",
    location: "M-40 eastbound",
    builtYear: 2016,
    condition: "fair",
    lastInspection: "2026-10-15T08:20:00",
    spanLengthM: 5000,
  },
  {
    id: "RW-0081",
    name: "Quarry Access Retaining Wall",
    kind: "retaining-wall",
    material: "Concrete block (MSE)",
    location: "Quarry Road",
    builtYear: 2001,
    condition: "fair",
    lastInspection: "2026-09-19T10:05:00",
    spanLengthM: 96,
  },
  {
    id: "ST-0910",
    name: "Stack Exchange Plaza Deck",
    kind: "building",
    material: "Steel + composite deck",
    location: "Interchange 3",
    builtYear: 2012,
    condition: "good",
    lastInspection: "2026-10-02T15:30:00",
    spanLengthM: 210,
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
    id: "INSP-028",
    assetId: "RD-1142",
    title: "M-40 corridor resurvey · strip C",
    method: "vehicle",
    inspector: "Arjun Nair",
    startedAt: "2026-10-18T07:35:00",
    status: "processing",
    progress: 46,
    modelVersion,
    frames: [
      frame({ label: "CH 22+400", at: "07:35", seed: 281 }, "vehicle"),
      frame({ label: "CH 22+910", at: "07:38", seed: 282 }, "vehicle"),
      frame({ label: "CH 23+180", at: "07:41", seed: 283 }, "vehicle"),
      frame({ label: "CH 24+240", at: "07:47", seed: 284 }, "vehicle"),
    ],
    findings: [],
    notes: "Low sun angles after 08:00, frames shaded in post.",
  },
  {
    id: "INSP-027",
    assetId: "BR-018",
    title: "Riverside overpass — south fascia",
    method: "drone",
    inspector: "Arjun Nair",
    startedAt: "2026-10-17T10:12:00",
    status: "in-progress",
    progress: 0,
    modelVersion,
    frames: [
      frame({ label: "Fascia S-E1", at: "10:12", seed: 271 }, "drone"),
      frame({ label: "Fascia S-E2", at: "10:15", seed: 272 }, "drone"),
    ],
    findings: [],
    notes: "Captured close sequence along fascia, awaiting submission for analysis.",
  },
  {
    id: "INSP-026",
    assetId: "TU-2042",
    title: "Hillcrest tunnel lintel walkdown",
    method: "walkdown",
    inspector: "Arjun Nair",
    startedAt: "2026-10-16T13:05:00",
    completedAt: "2026-10-16T15:40:00",
    status: "awaiting-review",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Station 2", at: "13:05", seed: 261 }, "walkdown"),
      frame({ label: "Station 3", at: "13:22", seed: 262 }, "walkdown"),
      frame({ label: "Station 5", at: "13:48", seed: 263 }, "walkdown"),
    ],
    findings: [
      finding(
        "F-261-1",
        "INSP-026",
        "FR-261",
        "D11",
        0.81,
        "medium",
        { x: 18, y: 32, w: 26, h: 22 },
        { lengthPx: 168, widthPx: 14, widthMm: 1.9, mmPerPx: 0.135 },
        "pending",
      ),
      finding(
        "F-262-1",
        "INSP-026",
        "FR-262",
        "D20",
        0.74,
        "high",
        { x: 55, y: 51, w: 18, h: 20 },
        { lengthPx: 120, widthPx: 38, widthMm: 6.2, mmPerPx: 0.163 },
        "pending",
      ),
      finding(
        "F-263-1",
        "INSP-026",
        "FR-263",
        "D10",
        0.58,
        "low",
        { x: 8, y: 60, w: 30, h: 14 },
        { lengthPx: 210, widthPx: 3, widthMm: 0.4, mmPerPx: 0.133 },
        "pending",
      ),
    ],
    notes: "Lintel stations 2–5 walked with industrial flashlight rig.",
  },
  {
    id: "INSP-025",
    assetId: "BR-031",
    title: "Halewood viaduct quarterly pass",
    method: "drone",
    inspector: "Arjun Nair",
    startedAt: "2026-10-14T09:00:00",
    completedAt: "2026-10-14T12:20:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Pier 6 cap", at: "09:04", seed: 251 }, "drone"),
      frame({ label: "Pier 7 cap", at: "09:38", seed: 252 }, "drone"),
    ],
    findings: [
      finding(
        "F-251-1",
        "INSP-025",
        "FR-251",
        "D00",
        0.92,
        "low",
        { x: 30, y: 40, w: 16, h: 10 },
        { lengthPx: 88, widthPx: 2, widthMm: 0.2, mmPerPx: 0.1 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Bound to temperature contraction. No action." },
      ),
      finding(
        "F-252-1",
        "INSP-025",
        "FR-252",
        "D10",
        0.78,
        "low",
        { x: 58, y: 22, w: 20, h: 9 },
        { lengthPx: 132, widthPx: 3, widthMm: 0.3, mmPerPx: 0.1 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Within seasonal movement allowance." },
      ),
    ],
  },
  {
    id: "INSP-024",
    assetId: "BR-018",
    title: "Riverside deck & girders survey",
    method: "drone",
    inspector: "Arjun Nair",
    startedAt: "2026-10-12T08:30:00",
    completedAt: "2026-10-12T11:15:00",
    status: "awaiting-review",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Girder G3 midspan", at: "08:34", seed: 241 }, "drone"),
      frame({ label: "Deck soffit S-2", at: "09:02", seed: 242 }, "drone"),
    ],
    findings: [
      finding(
        "F-241-1",
        "INSP-024",
        "FR-241",
        "D10",
        0.87,
        "medium",
        { x: 28, y: 38, w: 34, h: 12 },
        { lengthPx: 214, widthPx: 4, widthMm: 0.36, mmPerPx: 0.09 },
        "pending",
      ),
      finding(
        "F-241-2",
        "INSP-024",
        "FR-241",
        "D00",
        0.94,
        "low",
        { x: 62, y: 55, w: 14, h: 7 },
        { lengthPx: 96, widthPx: 2, widthMm: 0.18, mmPerPx: 0.09 },
        "pending",
      ),
      finding(
        "F-242-1",
        "INSP-024",
        "FR-242",
        "D40",
        0.62,
        "medium",
        { x: 12, y: 44, w: 22, h: 16 },
        { lengthPx: 140, widthPx: 9, widthMm: 0.81, mmPerPx: 0.09 },
        "pending",
      ),
    ],
    notes: "Standard grid flight, 2.5 m standoff. Two gaps under tree canopy.",
  },
  {
    id: "INSP-023",
    assetId: "RW-0081",
    title: "Quarry wall autumn survey",
    method: "walkdown",
    inspector: "Arjun Nair",
    startedAt: "2026-10-10T09:30:00",
    completedAt: "2026-10-10T11:50:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [frame({ label: "Wall face N-4", at: "09:48", seed: 231 }, "walkdown")],
    findings: [
      finding(
        "F-231-1",
        "INSP-023",
        "FR-231",
        "D50",
        0.69,
        "low",
        { x: 22, y: 60, w: 24, h: 18 },
        { lengthPx: 180, widthPx: 5, widthMm: 0.45, mmPerPx: 0.09 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Cosmetic block pattern, stable since 2024." },
      ),
    ],
  },
  {
    id: "INSP-022",
    assetId: "ST-0910",
    title: "Plaza deck skid survey",
    method: "drone",
    inspector: "Priya Raghavan",
    startedAt: "2026-10-08T14:10:00",
    completedAt: "2026-10-08T16:05:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "Deck bay R1", at: "14:14", seed: 221 }, "drone"),
      frame({ label: "Deck bay R2", at: "14:40", seed: 222 }, "drone"),
    ],
    findings: [
      finding(
        "F-221-1",
        "INSP-022",
        "FR-221",
        "D00",
        0.71,
        "low",
        { x: 40, y: 30, w: 12, h: 6 },
        { lengthPx: 60, widthPx: 2, widthMm: 0.2, mmPerPx: 0.1 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Surface crazing only." },
      ),
    ],
  },
  {
    id: "INSP-021",
    assetId: "RD-1142",
    title: "M-40 strip B vehicle pass",
    method: "vehicle",
    inspector: "Arjun Nair",
    startedAt: "2026-10-05T07:20:00",
    completedAt: "2026-10-05T09:10:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [
      frame({ label: "CH 21+050", at: "07:22", seed: 211 }, "vehicle"),
      frame({ label: "CH 21+780", at: "07:50", seed: 212 }, "vehicle"),
    ],
    findings: [
      finding(
        "F-211-1",
        "INSP-021",
        "FR-211",
        "D10",
        0.83,
        "medium",
        { x: 15, y: 66, w: 28, h: 10 },
        { lengthPx: 240, widthPx: 22, widthMm: 2.4, mmPerPx: 0.109 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Witnessed — entered into strip C sealing program." },
      ),
    ],
  },
  {
    id: "INSP-020",
    assetId: "BR-031",
    title: "Halewood viaduct joint check",
    method: "walkdown",
    inspector: "Arjun Nair",
    startedAt: "2026-09-30T10:00:00",
    completedAt: "2026-09-30T12:30:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [frame({ label: "Joint J-4", at: "10:12", seed: 201 }, "walkdown")],
    findings: [],
  },
  {
    id: "INSP-019",
    assetId: "TU-2042",
    title: "Hillcrest lintel crack response",
    method: "walkdown",
    inspector: "Arjun Nair",
    startedAt: "2026-09-26T08:45:00",
    completedAt: "2026-09-26T10:20:00",
    status: "escalated",
    progress: 100,
    modelVersion,
    escalationReason: "Critical-width crack (11.4 mm) at ventilation lintel, immediate repair advised.",
    frames: [
      frame({ label: "Lintel face A", at: "08:47", seed: 191 }, "walkdown"),
      frame({ label: "Lintel face B", at: "09:15", seed: 192 }, "walkdown"),
    ],
    findings: [
      finding(
        "F-191-1",
        "INSP-019",
        "FR-191",
        "D40",
        0.93,
        "critical",
        { x: 34, y: 20, w: 12, h: 42 },
        { lengthPx: 336, widthPx: 68, widthMm: 11.4, mmPerPx: 0.168 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Critical. Escalated to maintenance same day." },
      ),
      finding(
        "F-192-1",
        "INSP-019",
        "FR-192",
        "D10",
        0.71,
        "medium",
        { x: 62, y: 40, w: 18, h: 10 },
        { lengthPx: 146, widthPx: 9, widthMm: 1.2, mmPerPx: 0.133 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni" },
      ),
    ],
  },
  {
    id: "INSP-018",
    assetId: "RW-0081",
    title: "Quarry wall post-rain check",
    method: "walkdown",
    inspector: "Sofia Mensah",
    startedAt: "2026-09-24T13:30:00",
    completedAt: "2026-09-24T15:00:00",
    status: "reviewed",
    progress: 100,
    modelVersion,
    frames: [frame({ label: "Wall face N-2", at: "13:44", seed: 181 }, "walkdown")],
    findings: [
      finding(
        "F-181-1",
        "INSP-018",
        "FR-181",
        "D00",
        0.77,
        "low",
        { x: 46, y: 52, w: 14, h: 8 },
        { lengthPx: 74, widthPx: 2, widthMm: 0.2, mmPerPx: 0.1 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Child of block pattern N-4. Keep observing." },
      ),
    ],
  },
  {
    id: "INSP-017",
    assetId: "BR-018",
    title: "Riverside deck baseline survey",
    method: "drone",
    inspector: "Arjun Nair",
    startedAt: "2026-06-28T09:15:00",
    completedAt: "2026-06-28T12:00:00",
    status: "reviewed",
    progress: 100,
    modelVersion: "CrackNet-R v3.1",
    frames: [
      frame({ label: "Girder G3 midspan", at: "09:22", seed: 171 }, "drone"),
      frame({ label: "Deck soffit S-2", at: "09:58", seed: 172 }, "drone"),
    ],
    findings: [
      finding(
        "F-171-1",
        "INSP-017",
        "FR-171",
        "D10",
        0.79,
        "low",
        { x: 30, y: 40, w: 18, h: 8 },
        { lengthPx: 120, widthPx: 2, widthMm: 0.11, mmPerPx: 0.09 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni", note: "Baseline crack, width 0.11 mm." },
      ),
      finding(
        "F-172-1",
        "INSP-017",
        "FR-172",
        "D00",
        0.9,
        "low",
        { x: 66, y: 48, w: 10, h: 6 },
        { lengthPx: 52, widthPx: 2, widthMm: 0.2, mmPerPx: 0.09 },
        "confirmed",
        { reviewedBy: "Dr. Meera Kulkarni" },
      ),
    ],
  },
];

const seedWorkOrders: WorkOrder[] = [
  {
    id: "MW-021",
    title: "Hillcrest tunnel — stitch critical lintel crack",
    assetId: "TU-2042",
    priority: "high",
    status: "in-progress",
    dueDate: "2026-10-28",
    assignee: "Sofia Mensah",
    source: "AI recommendation · INSP-019",
    findingRef: "F-191-1",
    createdAt: "2026-09-26T14:02:00",
  },
  {
    id: "MW-014",
    title: "M-40 strip C — crack sealing program",
    assetId: "RD-1142",
    priority: "medium",
    status: "scheduled",
    dueDate: "2026-11-04",
    assignee: "Sofia Mensah",
    source: "Engineer review · INSP-021",
    findingRef: "F-211-1",
    createdAt: "2026-10-06T09:12:00",
  },
  {
    id: "MW-011",
    title: "Halewood viaduct — joint J-4 re-sealing",
    assetId: "BR-031",
    priority: "low",
    status: "closed",
    dueDate: "2026-09-12",
    assignee: "Sofia Mensah",
    source: "Engineer review · INSP-014",
    createdAt: "2026-08-30T11:20:00",
  },
];

const seedReports: GeneratedReport[] = [
  {
    id: "RPT-079",
    title: "Q3 integrity certificates — batch export",
    kind: "integrity",
    format: "pdf",
    createdAt: "2026-10-02T16:00:00",
    status: "ready",
  },
  {
    id: "RPT-078",
    title: "INSP-023 integrity certificate — Quarry wall",
    kind: "integrity",
    format: "pdf",
    inspectionId: "INSP-023",
    createdAt: "2026-10-10T12:20:00",
    status: "ready",
  },
  {
    id: "RPT-077",
    title: "Findings dataset export — October window",
    kind: "findings",
    format: "json",
    createdAt: "2026-10-08T17:45:00",
    status: "ready",
  },
  {
    id: "RPT-076",
    title: "Inspection audit log — September",
    kind: "audit",
    format: "csv",
    createdAt: "2026-10-01T08:00:00",
    status: "ready",
  },
];

const seedModels: ModelCard[] = [
  {
    id: "cracknet-r",
    name: "CrackNet-R",
    version: "v3.2",
    algorithm: "UNet++ encoder / ResNet-34 trunk",
    task: "Crack segmentation & classification",
    status: "active",
    installedAt: "2026-09-08",
    metrics: { iou: 0.88, precision: 0.93, recall: 0.9 },
    notes: "Rotunda training split refreshed with 2026 spring batch.",
  },
  {
    id: "delamnet",
    name: "DelamNet",
    version: "v1.9",
    algorithm: "Mask2Former small",
    task: "Spalling, pothole & fragment detection",
    status: "active",
    installedAt: "2026-08-19",
    metrics: { iou: 0.81, precision: 0.9, recall: 0.85 },
    notes: "Runs after CrackNet-R in the same analysis pass.",
  },
  {
    id: "fissurenet-l2",
    name: "FissureNet L2",
    version: "v2.6",
    algorithm: "Thin-structure head on UNet++",
    task: "Hairline fissures (D00 class)",
    status: "review",
    installedAt: "2026-10-09",
    metrics: { iou: 0.74, precision: 0.86, recall: 0.79 },
    notes: "Candidate for hairline recall improvement. Awaiting engineer sign-off.",
  },
];

const seedNotifications: AppNotification[] = [
  {
    id: "n-1",
    title: "Analysis ready for review",
    description: "INSP-026 · 3 findings awaiting engineer validation on Hillcrest tunnel.",
    time: "22 min ago",
    tone: "info",
  },
  {
    id: "n-2",
    title: "Processing in progress",
    description: "INSP-028 · M-40 vehicle pass is 46% through the segmentation pass.",
    time: "1 hour ago",
    tone: "info",
  },
  {
    id: "n-3",
    title: "Work order due in 8 days",
    description: "MW-021 · Lintel crack stitching on TU-2042 closes Oct 28.",
    time: "Yesterday",
    tone: "critical",
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

export const STORAGE_KEY = "infrascan-state-v1";

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
