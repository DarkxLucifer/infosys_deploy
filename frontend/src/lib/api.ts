/**
 * InfraScan Unified API Service & Realistic Mock Data Layer
 * 
 * Complies with Section 4 (22-table data model) and Section 9 (API contract):
 * - All dashboard metadata responses target <500ms
 * - Numbers with units explicitly: { value: 412, unit: "px", calibrated: false }
 * - Role-scoped data isolation
 * - Seamless toggle between mock data and real FastAPI backend via USE_MOCKS
 */

import { formatMeasurement, evaluateProgression, type SeverityLevel, type RoleType } from "./rules";

export const USE_MOCKS = false;
export const API_BASE_URL = "/api/v1";

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (inMemoryToken) {
    headers["Authorization"] = `Bearer ${inMemoryToken}`;
  }
  return headers;
}

export interface PendingUser {
  id: string;
  name: string;
  email: string;
  requestedRole: RoleType;
  organizationName: string;
  emailVerified: boolean;
  createdAt: string;
  signupMethod: string;
}

/* ------------------------------------------------------------------ */
/* Core Data Model Interfaces (Section 4)                             */
/* ------------------------------------------------------------------ */

export interface Organization {
  id: string;
  name: string;
  allow_self_registration: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  status: "active" | "pending_approval" | "deactivated" | "locked";
  last_login?: string;
  organization_id: string;
  mfa_enabled?: boolean;
}

export interface Asset {
  id: string;
  code: string; // e.g. INF-001
  name: string;
  type: "bridge" | "road" | "tunnel" | "retaining_wall" | "building" | "dam";
  material: string;
  address: string;
  latitude: number;
  longitude: number;
  construction_year: number;
  department: string;
  inspection_frequency_months: number;
  importance: "low" | "medium" | "high";
  latest_severity?: SeverityLevel;
  open_work_orders_count?: number;
}

export interface Inspection {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  inspector_id: string;
  inspector_name: string;
  date: string;
  status: "assigned" | "in_progress" | "pending_review" | "reviewed" | "completed";
  next_due_date: string;
  previous_inspection_id?: string;
  images_uploaded_count: number;
  findings_count: number;
  highest_proposed_severity: SeverityLevel;
  lowest_confidence: number;
  days_to_due: number;
  assigned_reviewer?: string;
  days_waiting_review?: number;
}

export interface InspectionImage {
  id: string;
  inspection_id: string;
  file_url: string;
  originalUrl?: string;
  previewUrl?: string;
  processedUrl?: string;
  enhancedUrl?: string;
  yoloUrl?: string;
  annotatedUrl?: string;
  hasYolo?: boolean;
  yoloDetection?: any;
  quality_status: "passed" | "rejected" | "accepted" | "warning";
  rejection_reason?: "blur" | "low_light" | "duplicate" | "resolution_insufficient";
  mm_per_pixel: number | null;
  gps_lat?: number;
  gps_lng?: number;
  captured_at: string;
}

export interface DefectDetection {
  id: string;
  image_id: string;
  asset_code: string;
  defect_type: "longitudinal" | "transverse" | "alligator" | "pothole" | "spalling" | "hairline";
  defect_type_name: string;
  confidence: number; // e.g. 0.91
  proposed_severity: SeverityLevel;
  length_px: number;
  max_width_px: number;
  mm_per_pixel: number | null;
  model_version: string;
  review_status: "pending" | "confirmed" | "corrected" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
  engineer_comment?: string;
  model_agreement?: "3/3 models" | "2/3 models" | "single model";
}

export interface MaintenanceItem {
  id: string; // shown as WO-xx
  asset_id: string;
  asset_code: string;
  asset_name: string;
  action: string;
  priority: "routine" | "low" | "medium" | "high" | "urgent_engineering_review";
  assignee_team: string;
  due_date: string;
  status: "unassigned" | "open" | "in_progress" | "closed";
  is_urgent_review_request: boolean;
}

export interface MLModelRecord {
  id: string;
  name: string;
  version: string;
  task: "classification" | "detection" | "segmentation" | "multi_model";
  deployed: boolean;
  metrics: {
    dice: number;
    iou: number;
    map50: number;
    recall: number;
    macro_f1: number;
  };
  sample_metric_label: string;
  last_evaluated: string;
}

export interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
  ip: string;
  user_agent: string;
  details: string;
}

export interface NotificationItem {
  id: string;
  user_id?: string;
  organization_id: string;
  level: "informational" | "low" | "medium" | "high" | "critical";
  type:
    | "inspection_assigned"
    | "inspection_completed"
    | "damage_detected"
    | "severe_damage_identified"
    | "engineering_review_required"
    | "maintenance_task_assigned"
    | "maintenance_deadline_approaching"
    | "inspection_report_generated"
    | "followup_inspection_required";
  title: string;
  body: string;
  entity_type: "inspection" | "asset" | "work_order" | "report";
  entity_id: string;
  created_at: string;
  read_at: string | null;
  role_target?: RoleType[];
}

export interface InspectionReportItem {
  id: string;
  inspection_id: string;
  asset_code: string;
  asset_name: string;
  version: string;
  file_url: string;
  status: "draft" | "signed_off" | "issued";
  issued_at: string;
  engineer_signature?: string;
}

/* ------------------------------------------------------------------ */
/* Dashboard Payloads (Section 6 & 9)                                 */
/* ------------------------------------------------------------------ */

export interface InspectorDashboardPayload {
  kpis: {
    assigned: number;
    pending: number;
    defectsPendingReview: number;
    highPriority: number;
  };
  myInspections: Inspection[];
  pendingReview: {
    inspectionId: string;
    assetCode: string;
    assetName: string;
    reviewerName: string;
    daysWaiting: number;
    highestProposedSeverity: SeverityLevel;
  }[];
  damageTrend: {
    month: string;
    reviewedMinor: number;
    reviewedModerate: number;
    reviewedSevere: number;
    aiProposedPending: number;
  }[];
  uploadQuality: {
    uploadedThisWeek: number;
    rejectedCount: number;
    topRejectionReason: string;
    retakeNeededList: { imageId: string; assetCode: string; reason: string; capturedAt: string }[];
  };
  upcomingInspections: {
    assetCode: string;
    assetName: string;
    dueDate: string;
    daysUntil: number;
    importance: string;
  }[];
  recentActivity: {
    id: string;
    time: string;
    text: string;
    type: "upload" | "analysis" | "review";
  }[];
  recentAiClassifications?: RecentAiClassification[];
}

export interface RecentAiClassification {
  imageId: string;
  filename: string;
  inspectionId: string;
  assetCode: string;
  assetName: string;
  hasCrack: boolean;
  predictedClass: "Cracked" | "Uncracked" | string;
  confidence: number;
  threshold: number;
  modelName: string;
  createdAt?: string;
  thumbnailUrl: string;
}

export interface EngineerDashboardPayload {
  kpis: {
    awaitingReview: number;
    reviewedConfirmed: number;
    reviewedCorrected: number;
    reviewedRejected: number;
    avgAiConfidence: number; // e.g. 91.2
    correctionRate: number;  // e.g. 14.5
  };
  recentAiClassifications?: RecentAiClassification[];
  reviewQueue: {
    inspectionId: string;
    assetCode: string;
    assetName: string;
    date: string;
    findingsCount: number;
    highestProposedSeverity: SeverityLevel;
    lowestConfidence: number;
    ageDays: number;
    status?: string;
    method?: string;
    imagesCount?: number;
    inspectorName?: string;
  }[];
  crackTypeCounts: {
    type: string;
    count: number;
    code: string;
  }[];
  selectedAssetMeasurements: {
    assetCode: string;
    assetName: string;
    latestInspectionDate: string;
    previousInspectionDate: string;
    latestLength: { value: number; unit: "px" | "mm"; isCalibrated: boolean; label: string };
    latestMaxWidth: { value: number; unit: "px" | "mm"; isCalibrated: boolean; label: string };
    previousLength: { value: number; unit: "px" | "mm"; isCalibrated: boolean; label: string };
    previousMaxWidth: { value: number; unit: "px" | "mm"; isCalibrated: boolean; label: string };
    progression: {
      canCompare: boolean;
      changeText: string;
      warningNotice: string | null;
    };
  };
  severityDistribution: {
    aiProposed: { minor: number; moderate: number; severe: number; critical: number };
    engineerFinal: { minor: number; moderate: number; severe: number; critical: number };
  };
  conditionHistory: {
    inspectionDate: string;
    inspectionId: string;
    reviewedSeverity: SeverityLevel;
    score: number;
  }[];
  reports: InspectionReportItem[];
  aiPredictions: DefectDetection[];
}

export interface ManagerDashboardPayload {
  kpis: {
    totalAssets: number;
    totalInspectionsPeriod: number;
    damagedAssetsCount: number;
    highPriorityFindingsCount: number;
    maintenanceProgressPct: number;
    maintenanceOpenCount: number;
    maintenanceOverdueCount: number;
    inspectionCompletionRatePct: number;
  };
  damageTrends: {
    date: string;
    minorCount: number;
    moderateCount: number;
    severeCount: number;
    urgentReviewCount: number;
  }[];
  hotspots: {
    region: string;
    summary: string;
    severeCount: number;
    assetsCount: number;
    representativeLat: number;
    representativeLng: number;
  }[];
  byAssetType: {
    type: string;
    good: number;
    fair: number;
    poor: number;
  }[];
  workOrderSummary: {
    unassigned: number;
    open: number;
    inProgress: number;
    closed: number;
    overdueList: MaintenanceItem[];
    avgResolutionDays: number;
  };
  overdueInspections: Inspection[];
  upcomingInspections: Inspection[];
  priorityList: {
    rank: number;
    assetCode: string;
    assetName: string;
    latestSeverity: SeverityLevel;
    progressionStatus: string;
    importance: string;
    recommendationReason: string;
  }[];
  regionSummary: {
    region: string;
    assets: number;
    inspections: number;
    findingsReviewed: number;
    openWorkOrders: number;
  }[];
  recentInspections?: {
    id: string;
    assetCode: string;
    assetName: string;
    assetType: string;
    status: string;
    method: string;
    imagesCount: number;
    inspectorName: string;
    date: string;
  }[];
}

export interface MaintenanceDashboardPayload {
  kpis: {
    myOpenWorkOrders: number;
    dueThisWeek: number;
    overdue: number;
    closedThisMonth: number;
  };
  workOrders: MaintenanceItem[];
  urgentReviewBanner: {
    active: boolean;
    message: string;
    itemCount: number;
  };
  followUpInspections: {
    assetCode: string;
    assetName: string;
    scheduledDate: string;
    reason: string;
    assignedInspector: string;
  }[];
  deadlineAlerts: {
    id: string;
    assetCode: string;
    action: string;
    dueDate: string;
    isOverdue: boolean;
    daysRemaining: number;
  }[];
}

export interface AdminDashboardPayload {
  kpis: {
    activeUsers: number;
    usersInvitedPending: number;
    deployedModelsCount: number;
    failedJobs24h: number;
  };
  users: User[];
  dataQuality: {
    id: string;
    assetCode: string;
    assetName: string;
    missingField: string;
    severity: "low" | "medium" | "high";
  }[];
  models: MLModelRecord[];
  systemActivity: {
    date: string;
    logins: number;
    edits: number;
    approvals: number;
    exports: number;
  }[];
  auditLogs: AuditLogItem[];
  platformHealth: {
    apiLatencyP50Ms: number;
    apiLatencyP95Ms: number;
    inferenceTimePerImageSec: number;
    gpuUtilizationPct: number;
    queueDepth: number;
    uploadAvgTimeSec: number;
    dashboardLoadTimeSec: number;
    reportGenTimeSec: number;
    concurrentUsers: number;
    statusTargets: {
      apiLatency: "green" | "amber" | "red";
      inference: "green" | "amber" | "red";
      gpu: "green" | "amber" | "red";
      queue: "green" | "amber" | "red";
    };
  };
}

/* ------------------------------------------------------------------ */
/* Seed Mock Records (Section 8)                                      */
/* ------------------------------------------------------------------ */

export const MOCK_ASSETS: Asset[] = [
  {
    id: "BR-101",
    code: "BR-101",
    name: "Riverside Expressway Viaduct",
    type: "bridge",
    material: "Reinforced Concrete",
    address: "West River Parkway, Pier 4-6, New York (40.7128, -74.0060)",
    latitude: 40.7128,
    longitude: -74.0060,
    construction_year: 2014,
    department: "Infrastructure Engineering",
    inspection_frequency_months: 12,
    importance: "high",
    latest_severity: "moderate",
    open_work_orders_count: 1,
  },
  {
    id: "TU-204",
    code: "TU-204",
    name: "Hudson River North Tunnel",
    type: "tunnel",
    material: "Precast Concrete Liners",
    address: "Hudson River Crossing, Bore 2, New York (40.7589, -73.9851)",
    latitude: 40.7589,
    longitude: -73.9851,
    construction_year: 2018,
    department: "Tunnel Operations",
    inspection_frequency_months: 6,
    importance: "high",
    latest_severity: "minor",
    open_work_orders_count: 0,
  },
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    organization_id: "org-1",
    level: "critical",
    type: "engineering_review_required",
    title: "Qualified engineering review required: INF-005 Pier 7",
    body: "AI proposed 'Critical / Requires Urgent Engineering Review' on deep shear crack. Engineer confirmation required.",
    entity_type: "inspection",
    entity_id: "insp-15",
    created_at: "2026-10-20T08:14:00Z",
    read_at: null,
    role_target: ["engineer", "manager"],
  },
  {
    id: "notif-2",
    organization_id: "org-1",
    level: "high",
    type: "severe_damage_identified",
    title: "Severe damage flagged in Region North",
    body: "INF-004 Harbor Tunnel inspection identified 4 severe transverse crack segments.",
    entity_type: "inspection",
    entity_id: "insp-14",
    created_at: "2026-10-20T07:45:00Z",
    read_at: null,
    role_target: ["engineer", "manager"],
  },
  {
    id: "notif-3",
    organization_id: "org-1",
    level: "medium",
    type: "inspection_assigned",
    title: "Inspection assigned: INF-002 Road section 12",
    body: "Routine survey assigned to your schedule. Scheduled target date: 2026-10-24.",
    entity_type: "inspection",
    entity_id: "insp-16",
    created_at: "2026-10-19T14:30:00Z",
    read_at: null,
    role_target: ["inspector"],
  },
  {
    id: "notif-4",
    organization_id: "org-1",
    level: "medium",
    type: "maintenance_deadline_approaching",
    title: "Maintenance due in 48 hours: WO-23",
    body: "Crack sealing on INF-002 assigned to Team B is approaching scheduled deadline.",
    entity_type: "work_order",
    entity_id: "WO-23",
    created_at: "2026-10-19T11:00:00Z",
    read_at: "2026-10-19T16:20:00Z",
    role_target: ["maintenance", "manager"],
  },
  {
    id: "notif-5",
    organization_id: "org-1",
    level: "low",
    type: "inspection_report_generated",
    title: "Certified inspection report ready: INF-001 #13",
    body: "Engineer sign-off completed by Civil Engineer Dr. Aris Thorne. Ready for download.",
    entity_type: "report",
    entity_id: "rep-013",
    created_at: "2026-10-18T10:15:00Z",
    read_at: "2026-10-18T12:00:00Z",
    role_target: ["inspector", "manager", "engineer"],
  },
];

export const MOCK_WORK_ORDERS: MaintenanceItem[] = [
  {
    id: "WO-22",
    asset_id: "asset-1",
    asset_code: "INF-001",
    asset_name: "Bridge deck A",
    action: "High-pressure epoxy resin injection & joint seal",
    priority: "medium",
    assignee_team: "Team A (Structural Repair)",
    due_date: "2026-10-15",
    status: "closed",
    is_urgent_review_request: false,
  },
  {
    id: "WO-23",
    asset_id: "asset-2",
    asset_code: "INF-002",
    asset_name: "Road section 12",
    action: "Hot-pour crack sealing & surface re-profiling",
    priority: "medium",
    assignee_team: "Team B (Pavement Maintenance)",
    due_date: "2026-10-22",
    status: "in_progress",
    is_urgent_review_request: false,
  },
  {
    id: "WO-24",
    asset_id: "asset-3",
    asset_code: "INF-003",
    asset_name: "Retaining wall 3",
    action: "Qualified engineer on-site inspection for drainage relief",
    priority: "low",
    assignee_team: "Geotech Engineering Crew",
    due_date: "2026-11-05",
    status: "open",
    is_urgent_review_request: false,
  },
  {
    id: "WO-25",
    asset_id: "asset-5",
    asset_code: "INF-005",
    asset_name: "Overpass Pier 7",
    action: "Urgent engineering review requested for shear diagnostic probe",
    priority: "urgent_engineering_review",
    assignee_team: "Senior Structural Assessment Team",
    due_date: "2026-10-21",
    status: "open",
    is_urgent_review_request: true,
  },
];

export const MOCK_MODELS: MLModelRecord[] = [
  {
    id: "model-1",
    name: "ResNet50 Infrastructure Classifier",
    version: "v1.0.4",
    task: "classification",
    deployed: true,
    metrics: { dice: 0.81, iou: 0.72, map50: 0.84, recall: 0.88, macro_f1: 0.85 },
    sample_metric_label: "Validation Benchmark (Sample value)",
    last_evaluated: "2026-10-14",
  },
  {
    id: "model-2",
    name: "SegFormer Sub-Pixel Damage Segmentation",
    version: "v2.1.0",
    task: "segmentation",
    deployed: true,
    metrics: { dice: 0.89, iou: 0.81, map50: 0.88, recall: 0.91, macro_f1: 0.87 },
    sample_metric_label: "Hold-out Benchmark (Sample value)",
    last_evaluated: "2026-10-18",
  },
  {
    id: "model-3",
    name: "Multi-Model Ensemble Diagnostic Pipeline",
    version: "v3.0.0-rc",
    task: "multi_model",
    deployed: false,
    metrics: { dice: 0.92, iou: 0.85, map50: 0.93, recall: 0.94, macro_f1: 0.91 },
    sample_metric_label: "Staging Evaluation (Sample value)",
    last_evaluated: "2026-10-19",
  },
];

export const MOCK_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: "audit-1",
    actor: "Admin (admin@demo.infrascan)",
    action: "MODEL_DEPLOY",
    entity: "SegFormer v2.1.0",
    timestamp: "2026-10-18T14:10:02Z",
    ip: "192.168.1.10",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    details: "Promoted SegFormer v2.1.0 to primary segmentation tier. Audit verified.",
  },
  {
    id: "audit-2",
    actor: "Engineer (engineer@demo.infrascan)",
    action: "REVIEW_CONFIRMATION",
    entity: "INF-001 Inspection #13",
    timestamp: "2026-10-18T11:24:55Z",
    ip: "192.168.1.22",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    details: "Confirmed AI finding D10 longitudinal crack (412 px uncalibrated). Certified report #013 issued.",
  },
  {
    id: "audit-3",
    actor: "Manager (manager@demo.infrascan)",
    action: "WORK_ORDER_DISPATCH",
    entity: "WO-25 Pier 7",
    timestamp: "2026-10-19T09:05:12Z",
    ip: "192.168.1.15",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    details: "Dispatched Urgent Engineering Review request to Senior Structural Assessment Team.",
  },
  {
    id: "audit-4",
    actor: "Inspector (inspector@demo.infrascan)",
    action: "IMAGE_BATCH_UPLOAD",
    entity: "INF-001 Inspection #14",
    timestamp: "2026-10-20T07:22:18Z",
    ip: "192.168.1.41",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    details: "Uploaded 18 high-resolution walkdown frames. 2 frames rejected (blur & low-light).",
  },
];

/* ------------------------------------------------------------------ */
/* API Service Implementation                                         */
export const apiService = {
  async getInspectorDashboard(): Promise<InspectorDashboardPayload> {
    if (USE_MOCKS) {
      return {
        kpis: {
          assigned: 3,
          pending: 4,
          defectsPendingReview: 14,
          highPriority: 2,
        },
        myInspections: [
          {
            id: "insp-14",
            asset_id: "asset-1",
            asset_code: "INF-001",
            asset_name: "Bridge deck A (Riverside Expressway)",
            asset_type: "Bridge",
            inspector_id: "u-insp",
            inspector_name: "Sarah Lin",
            date: "2026-09-14",
            status: "pending_review",
            next_due_date: "2027-03-14",
            previous_inspection_id: "insp-13",
            images_uploaded_count: 18,
            findings_count: 5,
            highest_proposed_severity: "moderate",
            lowest_confidence: 0.88,
            days_to_due: -36,
            assigned_reviewer: "Dr. Aris Thorne (Civil Eng)",
            days_waiting_review: 4,
          },
          {
            id: "insp-16",
            asset_id: "asset-2",
            asset_code: "INF-002",
            asset_name: "Road section 12",
            asset_type: "Road",
            inspector_id: "u-insp",
            inspector_name: "Sarah Lin",
            date: "2026-10-24",
            status: "assigned",
            next_due_date: "2026-10-24",
            images_uploaded_count: 0,
            findings_count: 0,
            highest_proposed_severity: "no_visible_damage",
            lowest_confidence: 1.0,
            days_to_due: 4,
          },
          {
            id: "insp-17",
            asset_id: "asset-7",
            asset_code: "INF-007",
            asset_name: "Transit HQ Column 4B",
            asset_type: "Building",
            inspector_id: "u-insp",
            inspector_name: "Sarah Lin",
            date: "2026-11-02",
            status: "assigned",
            next_due_date: "2026-11-02",
            images_uploaded_count: 0,
            findings_count: 0,
            highest_proposed_severity: "no_visible_damage",
            lowest_confidence: 1.0,
            days_to_due: 13,
          },
        ],
        pendingReview: [
          {
            inspectionId: "insp-14",
            assetCode: "INF-001",
            assetName: "Bridge deck A",
            reviewerName: "Dr. Aris Thorne",
            daysWaiting: 4,
            highestProposedSeverity: "moderate",
          },
          {
            inspectionId: "insp-15",
            assetCode: "INF-005",
            assetName: "Overpass Pier 7",
            reviewerName: "Elena Rostova",
            daysWaiting: 2,
            highestProposedSeverity: "critical",
          },
        ],
        damageTrend: [
          { month: "May", reviewedMinor: 12, reviewedModerate: 5, reviewedSevere: 1, aiProposedPending: 3 },
          { month: "Jun", reviewedMinor: 15, reviewedModerate: 7, reviewedSevere: 2, aiProposedPending: 4 },
          { month: "Jul", reviewedMinor: 18, reviewedModerate: 6, reviewedSevere: 2, aiProposedPending: 2 },
          { month: "Aug", reviewedMinor: 14, reviewedModerate: 8, reviewedSevere: 3, aiProposedPending: 5 },
          { month: "Sep", reviewedMinor: 19, reviewedModerate: 9, reviewedSevere: 4, aiProposedPending: 6 },
          { month: "Oct", reviewedMinor: 16, reviewedModerate: 10, reviewedSevere: 3, aiProposedPending: 8 },
        ],
        uploadQuality: {
          uploadedThisWeek: 42,
          rejectedCount: 3,
          topRejectionReason: "Motion blur exceeding Laplacian threshold (σ² < 100)",
          retakeNeededList: [
            { imageId: "img-902", assetCode: "INF-001", reason: "Motion Blur", capturedAt: "2026-10-19 14:12" },
            { imageId: "img-905", assetCode: "INF-001", reason: "Low Light / Under-exposed", capturedAt: "2026-10-19 14:18" },
          ],
        },
        upcomingInspections: [
          { assetCode: "INF-002", assetName: "Road section 12", dueDate: "2026-10-24", daysUntil: 4, importance: "Medium" },
          { assetCode: "INF-007", assetName: "Transit HQ Column 4B", dueDate: "2026-11-02", daysUntil: 13, importance: "Medium" },
          { assetCode: "INF-003", assetName: "Retaining wall 3", dueDate: "2026-11-05", daysUntil: 16, importance: "High" },
        ],
        recentActivity: [
          { id: "act-1", time: "10 mins ago", text: "AI Pipeline completed detection on 16 frames for INF-001", type: "analysis" },
          { id: "act-2", time: "1 hour ago", text: "Quality check rejected 2 images (blur/lighting) on INF-001", type: "upload" },
          { id: "act-3", time: "Yesterday", text: "Civil Engineer approved findings on INF-003 with zero corrections", type: "review" },
          { id: "act-4", time: "2 days ago", text: "Sarah Lin uploaded 18 raw camera frames for INF-001", type: "upload" },
        ],
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/inspector`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const raw = await res.json();
        return {
          kpis: {
            assigned: raw.kpis?.assigned ?? raw.assignedCount ?? 0,
            pending: raw.kpis?.pending ?? raw.pendingCount ?? 0,
            defectsPendingReview: raw.kpis?.defectsPendingReview ?? raw.findingsRecordedCount ?? 0,
            highPriority: raw.kpis?.highPriority ?? 0,
          },
          myInspections: Array.isArray(raw.myInspections) ? raw.myInspections : [],
          pendingReview: Array.isArray(raw.pendingReview) ? raw.pendingReview : [],
          damageTrend: Array.isArray(raw.damageTrend) ? raw.damageTrend : [],
          uploadQuality: raw.uploadQuality || {
            uploadedThisWeek: raw.uploadedImagesCount ?? 0,
            rejectedCount: raw.rejectedImagesCount ?? 0,
            topRejectionReason: "Blur / low illumination",
            retakeNeededList: [],
          },
          upcomingInspections: Array.isArray(raw.upcomingInspections) ? raw.upcomingInspections : [],
          recentActivity: Array.isArray(raw.recentActivity) ? raw.recentActivity : [],
        };
      }
    } catch (e) {
      console.warn("Failed to fetch inspector dashboard:", e);
    }
    return {
      kpis: { assigned: 0, pending: 0, defectsPendingReview: 0, highPriority: 0 },
      myInspections: [],
      pendingReview: [],
      damageTrend: [],
      uploadQuality: { uploadedThisWeek: 0, rejectedCount: 0, topRejectionReason: "None", retakeNeededList: [] },
      upcomingInspections: [],
      recentActivity: [],
    };
  },

  async getEngineerDashboard(): Promise<EngineerDashboardPayload> {
    if (USE_MOCKS) {
      const prog = evaluateProgression(412, 320, false, false, true, true);

      return {
        kpis: {
          awaitingReview: 5,
          reviewedConfirmed: 38,
          reviewedCorrected: 5,
          reviewedRejected: 2,
          avgAiConfidence: 91.4,
          correctionRate: 15.5,
        },
        reviewQueue: [
          {
            inspectionId: "insp-15",
            assetCode: "INF-005",
            assetName: "Overpass Pier 7 - North Junction",
            date: "2026-10-19",
            findingsCount: 4,
            highestProposedSeverity: "critical",
            lowestConfidence: 0.84,
            ageDays: 1,
          },
          {
            inspectionId: "insp-14",
            assetCode: "INF-001",
            assetName: "Bridge deck A (Riverside Expressway)",
            date: "2026-09-14",
            findingsCount: 5,
            highestProposedSeverity: "moderate",
            lowestConfidence: 0.88,
            ageDays: 4,
          },
          {
            inspectionId: "insp-18",
            assetCode: "INF-004",
            assetName: "Harbor Tunnel South Tube",
            date: "2026-10-18",
            findingsCount: 6,
            highestProposedSeverity: "severe",
            lowestConfidence: 0.79,
            ageDays: 2,
          },
        ],
        crackTypeCounts: [
          { type: "Longitudinal", code: "D10", count: 28 },
          { type: "Transverse", code: "D40", count: 19 },
          { type: "Alligator / Map", code: "D11", count: 11 },
          { type: "Pothole", code: "D50", count: 7 },
          { type: "Spalling", code: "D20", count: 9 },
          { type: "Hairline", code: "D00", count: 34 },
        ],
        selectedAssetMeasurements: {
          assetCode: "INF-001",
          assetName: "Bridge deck A",
          latestInspectionDate: "2026-09-14 (Inspection #14)",
          previousInspectionDate: "2026-03-02 (Inspection #13)",
          latestLength: formatMeasurement(412, null),
          latestMaxWidth: formatMeasurement(6, null),
          previousLength: formatMeasurement(320, null),
          previousMaxWidth: formatMeasurement(4.5, null),
          progression: {
            canCompare: prog.canCompare,
            changeText: prog.changeText,
            warningNotice: prog.warningNotice,
          },
        },
        severityDistribution: {
          aiProposed: { minor: 24, moderate: 15, severe: 6, critical: 2 },
          engineerFinal: { minor: 27, moderate: 14, severe: 4, critical: 1 },
        },
        conditionHistory: [
          { inspectionDate: "2024-03-10", inspectionId: "insp-09", reviewedSeverity: "minor", score: 88 },
          { inspectionDate: "2024-09-15", inspectionId: "insp-10", reviewedSeverity: "minor", score: 85 },
          { inspectionDate: "2025-03-20", inspectionId: "insp-11", reviewedSeverity: "minor", score: 82 },
          { inspectionDate: "2025-09-18", inspectionId: "insp-12", reviewedSeverity: "minor", score: 79 },
          { inspectionDate: "2026-03-02", inspectionId: "insp-13", reviewedSeverity: "minor", score: 76 },
          { inspectionDate: "2026-09-14", inspectionId: "insp-14", reviewedSeverity: "moderate", score: 68 },
        ],
        reports: [
          {
            id: "rep-013",
            inspection_id: "insp-13",
            asset_code: "INF-001",
            asset_name: "Bridge deck A",
            version: "v1.2",
            file_url: "/reports/REP-INF001-13.pdf",
            status: "issued",
            issued_at: "2026-03-05",
            engineer_signature: "Dr. Aris Thorne, PE #48291",
          },
          {
            id: "rep-014",
            inspection_id: "insp-14",
            asset_code: "INF-001",
            asset_name: "Bridge deck A",
            version: "v0.9-draft",
            file_url: "/reports/REP-INF001-14-draft.pdf",
            status: "draft",
            issued_at: "2026-09-16",
          },
        ],
        aiPredictions: [
          {
            id: "det-101",
            image_id: "img-901",
            asset_code: "INF-001",
            defect_type: "longitudinal",
            defect_type_name: "Longitudinal Crack",
            confidence: 0.91,
            proposed_severity: "moderate",
            length_px: 412,
            max_width_px: 6,
            mm_per_pixel: null,
            model_version: "v2.1 SegFormer",
            review_status: "pending",
            model_agreement: "3/3 models",
          },
          {
            id: "det-102",
            image_id: "img-903",
            asset_code: "INF-001",
            defect_type: "hairline",
            defect_type_name: "Hairline Crack Network",
            confidence: 0.88,
            proposed_severity: "minor",
            length_px: 185,
            max_width_px: 2,
            mm_per_pixel: null,
            model_version: "v2.1 SegFormer",
            review_status: "pending",
            model_agreement: "2/3 models",
          },
          {
            id: "det-103",
            image_id: "img-907",
            asset_code: "INF-005",
            defect_type: "transverse",
            defect_type_name: "Transverse Shear Crack",
            confidence: 0.94,
            proposed_severity: "critical",
            length_px: 620,
            max_width_px: 14,
            mm_per_pixel: null,
            model_version: "v3.0 Multi-Model",
            review_status: "pending",
            model_agreement: "3/3 models",
          },
        ],
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/engineer`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const raw = await res.json();
        return {
          kpis: {
            awaitingReview: raw.kpis?.awaitingReview ?? raw.awaitingReviewCount ?? 0,
            reviewedConfirmed: raw.kpis?.reviewedConfirmed ?? raw.reviewedThisPeriodCount ?? 0,
            reviewedCorrected: raw.kpis?.reviewedCorrected ?? raw.verifiedCount ?? 0,
            reviewedRejected: raw.kpis?.reviewedRejected ?? 0,
            avgAiConfidence: raw.kpis?.avgAiConfidence ?? 91.2,
            correctionRate: raw.kpis?.correctionRate ?? 0,
          },
          reviewQueue: Array.isArray(raw.reviewQueue) ? raw.reviewQueue : [],
          crackTypeCounts: Array.isArray(raw.crackTypeCounts) ? raw.crackTypeCounts : [],
          selectedAssetMeasurements: raw.selectedAssetMeasurements || {
            assetCode: "INF-001",
            assetName: "Infrastructure Asset",
            latestInspectionDate: new Date().toISOString().split("T")[0],
            previousInspectionDate: "N/A",
            latestLength: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
            latestMaxWidth: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
            previousLength: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
            previousMaxWidth: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
            progression: {
              canCompare: false,
              changeText: "No previous comparison baseline",
              warningNotice: null,
            },
          },
          severityDistribution: raw.severityDistribution || {
            aiProposed: { minor: 0, moderate: 0, severe: 0, critical: 0 },
            engineerFinal: { minor: 0, moderate: 0, severe: 0, critical: 0 },
          },
          conditionHistory: Array.isArray(raw.conditionHistory) ? raw.conditionHistory : [],
          reports: Array.isArray(raw.reports) ? raw.reports : [],
          aiPredictions: Array.isArray(raw.aiPredictions) ? raw.aiPredictions : [],
        };
      }
    } catch (e) {
      console.warn("Failed to fetch engineer dashboard:", e);
    }
    return {
      kpis: { awaitingReview: 0, reviewedConfirmed: 0, reviewedCorrected: 0, reviewedRejected: 0, avgAiConfidence: 0, correctionRate: 0 },
      reviewQueue: [],
      crackTypeCounts: [],
      selectedAssetMeasurements: {
        assetCode: "INF-001",
        assetName: "Infrastructure Asset",
        latestInspectionDate: new Date().toISOString().split("T")[0],
        previousInspectionDate: "N/A",
        latestLength: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
        latestMaxWidth: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
        previousLength: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
        previousMaxWidth: { value: 0, unit: "px", isCalibrated: false, label: "0 px" },
        progression: { canCompare: false, changeText: "No previous baseline", warningNotice: null },
      },
      severityDistribution: {
        aiProposed: { minor: 0, moderate: 0, severe: 0, critical: 0 },
        engineerFinal: { minor: 0, moderate: 0, severe: 0, critical: 0 },
      },
      conditionHistory: [],
      reports: [],
      aiPredictions: [],
    };
  },

  async getManagerDashboard(): Promise<ManagerDashboardPayload> {
    if (USE_MOCKS) {
      return {
        kpis: {
          totalAssets: 48,
          totalInspectionsPeriod: 32,
          damagedAssetsCount: 9,
          highPriorityFindingsCount: 6,
          maintenanceProgressPct: 76.5,
          maintenanceOpenCount: 4,
          maintenanceOverdueCount: 1,
          inspectionCompletionRatePct: 93.8,
        },
        damageTrends: [
          { date: "May 2026", minorCount: 18, moderateCount: 6, severeCount: 2, urgentReviewCount: 0 },
          { date: "Jun 2026", minorCount: 22, moderateCount: 7, severeCount: 1, urgentReviewCount: 0 },
          { date: "Jul 2026", minorCount: 20, moderateCount: 8, severeCount: 3, urgentReviewCount: 1 },
          { date: "Aug 2026", minorCount: 25, moderateCount: 9, severeCount: 2, urgentReviewCount: 0 },
          { date: "Sep 2026", minorCount: 28, moderateCount: 11, severeCount: 4, urgentReviewCount: 1 },
          { date: "Oct 2026", minorCount: 24, moderateCount: 10, severeCount: 4, urgentReviewCount: 1 },
        ],
        hotspots: [
          {
            region: "Region North (Hudson-Highland Corridor)",
            summary: "Cluster of 4 severe findings across bridge piers & retaining walls under seasonal freeze-thaw cycles.",
            severeCount: 4,
            assetsCount: 14,
            representativeLat: 40.8651,
            representativeLng: -73.8992,
          },
          {
            region: "Region East (Coastal Bypass)",
            summary: "Mild surface salt crystallization and early spalling on marine concrete substructures.",
            severeCount: 1,
            assetsCount: 11,
            representativeLat: 40.7831,
            representativeLng: -73.9712,
          },
          {
            region: "Central Metro Sub-grade",
            summary: "Routine micro-fissuring and hairline shrinkage in tunnel linings; within acceptable service limits.",
            severeCount: 1,
            assetsCount: 16,
            representativeLat: 40.7412,
            representativeLng: -74.0045,
          },
        ],
        byAssetType: [
          { type: "Bridges", good: 14, fair: 6, poor: 2 },
          { type: "Roads", good: 12, fair: 3, poor: 1 },
          { type: "Tunnels", good: 4, fair: 2, poor: 1 },
          { type: "Retaining Walls", good: 5, fair: 2, poor: 0 },
          { type: "Dams / Marine", good: 2, fair: 1, poor: 1 },
        ],
        workOrderSummary: {
          unassigned: 1,
          open: 2,
          inProgress: 3,
          closed: 14,
          overdueList: [
            MOCK_WORK_ORDERS[0],
          ],
          avgResolutionDays: 9.4,
        },
        overdueInspections: [
          {
            id: "insp-08",
            asset_id: "asset-6",
            asset_code: "INF-006",
            asset_name: "Canyon Spillway Concrete Apron",
            asset_type: "Dam",
            inspector_id: "u-insp",
            inspector_name: "Unassigned",
            date: "2026-10-01",
            status: "assigned",
            next_due_date: "2026-10-01",
            images_uploaded_count: 0,
            findings_count: 0,
            highest_proposed_severity: "no_visible_damage",
            lowest_confidence: 1.0,
            days_to_due: -19,
          },
        ],
        upcomingInspections: [
          {
            id: "insp-16",
            asset_id: "asset-2",
            asset_code: "INF-002",
            asset_name: "Road section 12",
            asset_type: "Road",
            inspector_id: "u-insp",
            inspector_name: "Sarah Lin",
            date: "2026-10-24",
            status: "assigned",
            next_due_date: "2026-10-24",
            images_uploaded_count: 0,
            findings_count: 0,
            highest_proposed_severity: "no_visible_damage",
            lowest_confidence: 1.0,
            days_to_due: 4,
          },
        ],
        priorityList: [
          {
            rank: 1,
            assetCode: "INF-005",
            assetName: "Overpass Pier 7 - North Junction",
            latestSeverity: "critical",
            progressionStatus: "Newly surfaced shear crack",
            importance: "High",
            recommendationReason: "Qualified engineering review requested. High traffic load corridor.",
          },
          {
            rank: 2,
            assetCode: "INF-004",
            assetName: "Harbor Tunnel South Tube",
            latestSeverity: "severe",
            progressionStatus: "Active moisture infiltration detected",
            importance: "High",
            recommendationReason: "Sub-grade drainage relief assessment warranted.",
          },
          {
            rank: 3,
            assetCode: "INF-001",
            assetName: "Bridge deck A (Riverside Expressway)",
            latestSeverity: "moderate",
            progressionStatus: "Length 412 px (uncalibrated scale comparison warning)",
            importance: "High",
            recommendationReason: "Periodic structural progression tracking under heavy axle routing.",
          },
          {
            rank: 4,
            assetCode: "INF-006",
            assetName: "Canyon Spillway Concrete Apron",
            latestSeverity: "severe",
            progressionStatus: "Overdue inspection (19 days past due)",
            importance: "High",
            recommendationReason: "Seasonal water discharge preparedness survey required.",
          },
          {
            rank: 5,
            assetCode: "INF-008",
            assetName: "Northway Viaduct Span 14",
            latestSeverity: "severe",
            progressionStatus: "Thermal expansion joint distress",
            importance: "High",
            recommendationReason: "Upcoming winter maintenance season scheduling.",
          },
        ],
        regionSummary: [
          { region: "Region North", assets: 14, inspections: 12, findingsReviewed: 26, openWorkOrders: 3 },
          { region: "Region East", assets: 11, inspections: 8, findingsReviewed: 14, openWorkOrders: 1 },
          { region: "Metro Central", assets: 16, inspections: 10, findingsReviewed: 18, openWorkOrders: 1 },
          { region: "West Valley", assets: 7, inspections: 2, findingsReviewed: 4, openWorkOrders: 0 },
        ],
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/manager`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const raw = await res.json();
        return {
          kpis: {
            totalAssets: raw.kpis?.totalAssets ?? raw.totalAssets ?? 0,
            totalInspectionsPeriod: raw.kpis?.totalInspectionsPeriod ?? raw.totalInspections ?? 0,
            damagedAssetsCount: raw.kpis?.damagedAssetsCount ?? raw.damagedAssetsCount ?? 0,
            highPriorityFindingsCount: raw.kpis?.highPriorityFindingsCount ?? raw.highPriorityCount ?? 0,
            maintenanceProgressPct: raw.kpis?.maintenanceProgressPct ?? raw.maintenanceProgress?.completionRate ?? 100,
            maintenanceOpenCount: raw.kpis?.maintenanceOpenCount ?? (raw.maintenanceProgress ? (raw.maintenanceProgress.total - raw.maintenanceProgress.closed) : 0),
            maintenanceOverdueCount: raw.kpis?.maintenanceOverdueCount ?? raw.maintenanceProgress?.overdue ?? 0,
            inspectionCompletionRatePct: raw.kpis?.inspectionCompletionRatePct ?? 100,
          },
          damageTrends: Array.isArray(raw.damageTrends) ? raw.damageTrends : [],
          hotspots: Array.isArray(raw.hotspots) ? raw.hotspots : [],
          byAssetType: Array.isArray(raw.byAssetType) ? raw.byAssetType : [],
          workOrderSummary: raw.workOrderSummary || {
            unassigned: 0,
            open: 0,
            inProgress: 0,
            closed: 0,
            overdueList: [],
            avgResolutionDays: 0,
          },
          overdueInspections: Array.isArray(raw.overdueInspections) ? raw.overdueInspections : [],
          upcomingInspections: Array.isArray(raw.upcomingInspections) ? raw.upcomingInspections : [],
          priorityList: Array.isArray(raw.priorityList) ? raw.priorityList : [],
          regionSummary: Array.isArray(raw.regionSummary) ? raw.regionSummary : [],
          recentInspections: Array.isArray(raw.recentInspections) ? raw.recentInspections : [],
        };
      }
    } catch (e) {
      console.warn("Failed to fetch manager dashboard:", e);
    }
    return {
      kpis: { totalAssets: 0, totalInspectionsPeriod: 0, damagedAssetsCount: 0, highPriorityFindingsCount: 0, maintenanceProgressPct: 100, maintenanceOpenCount: 0, maintenanceOverdueCount: 0, inspectionCompletionRatePct: 100 },
      damageTrends: [],
      hotspots: [],
      byAssetType: [],
      workOrderSummary: { unassigned: 0, open: 0, inProgress: 0, closed: 0, overdueList: [], avgResolutionDays: 0 },
      overdueInspections: [],
      upcomingInspections: [],
      priorityList: [],
      regionSummary: [],
    };
  },

  async getMaintenanceDashboard(): Promise<MaintenanceDashboardPayload> {
    if (USE_MOCKS) {
      return {
        kpis: {
          myOpenWorkOrders: 3,
          dueThisWeek: 2,
          overdue: 1,
          closedThisMonth: 14,
        },
        workOrders: MOCK_WORK_ORDERS,
        urgentReviewBanner: {
          active: true,
          message: "Urgent engineering review requested on WO-25 (Pier 7). This is a review request, not a safety declaration.",
          itemCount: 1,
        },
        followUpInspections: [
          {
            assetCode: "INF-001",
            assetName: "Bridge deck A",
            scheduledDate: "2026-11-15",
            reason: "Post-epoxy resin cure visual verification & non-destructive rebound test",
            assignedInspector: "Sarah Lin",
          },
          {
            assetCode: "INF-002",
            assetName: "Road section 12",
            scheduledDate: "2026-11-20",
            reason: "Post-seal asphalt smoothness and joint cohesion check",
            assignedInspector: "David Chen",
          },
        ],
        deadlineAlerts: [
          {
            id: "WO-25",
            assetCode: "INF-005",
            action: "Urgent engineering review requested for shear diagnostic probe",
            dueDate: "2026-10-21",
            isOverdue: false,
            daysRemaining: 1,
          },
          {
            id: "WO-23",
            assetCode: "INF-002",
            action: "Hot-pour crack sealing & surface re-profiling",
            dueDate: "2026-10-22",
            isOverdue: false,
            daysRemaining: 2,
          },
          {
            id: "WO-22",
            assetCode: "INF-001",
            action: "Resin repair verification documentation sign-off",
            dueDate: "2026-10-15",
            isOverdue: true,
            daysRemaining: -5,
          },
        ],
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/maintenance`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const raw = await res.json();
        return {
          kpis: {
            myOpenWorkOrders: raw.kpis?.myOpenWorkOrders ?? raw.openOrdersCount ?? 0,
            dueThisWeek: raw.kpis?.dueThisWeek ?? ((raw.openOrdersCount ?? 0) + (raw.inProgressCount ?? 0)),
            overdue: raw.kpis?.overdue ?? raw.overdueCount ?? 0,
            closedThisMonth: raw.kpis?.closedThisMonth ?? raw.closedCount ?? 0,
          },
          workOrders: Array.isArray(raw.workOrders) ? raw.workOrders : [],
          urgentReviewBanner: raw.urgentReviewBanner || {
            active: (raw.urgentCount ?? 0) > 0,
            message: `${raw.urgentCount ?? 0} work order(s) require urgent engineering review`,
            itemCount: raw.urgentCount ?? 0,
          },
          followUpInspections: Array.isArray(raw.followUpInspections) ? raw.followUpInspections : [],
          deadlineAlerts: Array.isArray(raw.deadlineAlerts) ? raw.deadlineAlerts : [],
        };
      }
    } catch (e) {
      console.warn("Failed to fetch maintenance dashboard:", e);
    }
    return {
      kpis: { myOpenWorkOrders: 0, dueThisWeek: 0, overdue: 0, closedThisMonth: 0 },
      workOrders: [],
      urgentReviewBanner: { active: false, message: "", itemCount: 0 },
      followUpInspections: [],
      deadlineAlerts: [],
    };
  },

  async getAdminDashboard(): Promise<AdminDashboardPayload> {
    if (USE_MOCKS) {
      return {
        kpis: {
          activeUsers: 24,
          usersInvitedPending: 3,
          deployedModelsCount: 2,
          failedJobs24h: 0,
        },
        users: [
          { id: "u-1", name: "Dr. Aris Thorne", email: "engineer@demo.infrascan", role: "engineer", status: "active", organization_id: "org-1", mfa_enabled: true },
          { id: "u-2", name: "Sarah Lin", email: "inspector@demo.infrascan", role: "inspector", status: "active", organization_id: "org-1" },
          { id: "u-3", name: "Marcus Vance", email: "manager@demo.infrascan", role: "manager", status: "active", organization_id: "org-1" },
          { id: "u-4", name: "Javier Santos", email: "maintenance@demo.infrascan", role: "maintenance", status: "active", organization_id: "org-1" },
          { id: "u-5", name: "Platform Admin", email: "admin@demo.infrascan", role: "admin", status: "active", organization_id: "org-1" },
          { id: "u-6", name: "Kavita Rao", email: "pending@demo.infrascan", role: "engineer", status: "pending_approval", organization_id: "org-1" },
          { id: "u-7", name: "Former Field Worker", email: "locked@demo.infrascan", role: "inspector", status: "locked", organization_id: "org-1" },
        ],
        dataQuality: [
          { id: "dq-1", assetCode: "INF-006", assetName: "Canyon Spillway Concrete Apron", missingField: "GPS Coordinates not calibrated to sub-meter stationing", severity: "medium" },
          { id: "dq-2", assetCode: "INF-007", assetName: "Transit HQ Column 4B", missingField: "Missing baseline optical standoff calibration target", severity: "high" },
        ],
        models: MOCK_MODELS,
        systemActivity: [
          { date: "Oct 14", logins: 45, edits: 12, approvals: 8, exports: 5 },
          { date: "Oct 15", logins: 52, edits: 18, approvals: 14, exports: 9 },
          { date: "Oct 16", logins: 49, edits: 15, approvals: 11, exports: 6 },
          { date: "Oct 17", logins: 58, edits: 22, approvals: 16, exports: 12 },
          { date: "Oct 18", logins: 64, edits: 25, approvals: 19, exports: 14 },
          { date: "Oct 19", logins: 61, edits: 20, approvals: 15, exports: 10 },
          { date: "Oct 20", logins: 38, edits: 14, approvals: 7, exports: 4 },
        ],
        auditLogs: MOCK_AUDIT_LOGS,
        platformHealth: {
          apiLatencyP50Ms: 142,
          apiLatencyP95Ms: 388, // Target < 500 ms for metadata
          inferenceTimePerImageSec: 1.84, // Target < 3 s per image
          gpuUtilizationPct: 44.5,
          queueDepth: 0,
          uploadAvgTimeSec: 2.1,
          dashboardLoadTimeSec: 0.78,
          reportGenTimeSec: 1.45,
          concurrentUsers: 18,
          statusTargets: {
            apiLatency: "green",
            inference: "green",
            gpu: "green",
            queue: "green",
          },
        },
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const raw = await res.json();
        return {
          kpis: {
            activeUsers: raw.kpis?.activeUsers ?? raw.users?.length ?? 0,
            usersInvitedPending: raw.kpis?.usersInvitedPending ?? raw.pendingApprovalsCount ?? 0,
            deployedModelsCount: raw.kpis?.deployedModelsCount ?? 2,
            failedJobs24h: raw.kpis?.failedJobs24h ?? 0,
          },
          users: Array.isArray(raw.users) ? raw.users : [],
          dataQuality: Array.isArray(raw.dataQuality) ? raw.dataQuality : [],
          models: Array.isArray(raw.models) ? raw.models : [],
          systemActivity: Array.isArray(raw.systemActivity) ? raw.systemActivity : [],
          auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
          platformHealth: {
            apiLatencyP50Ms: raw.platformHealth?.apiLatencyP50Ms ?? raw.avgApiLatencyMs ?? 18,
            apiLatencyP95Ms: raw.platformHealth?.apiLatencyP95Ms ?? ((raw.avgApiLatencyMs ?? 18) * 1.5),
            inferenceTimePerImageSec: raw.platformHealth?.inferenceTimePerImageSec ?? 1.2,
            gpuUtilizationPct: raw.platformHealth?.gpuUtilizationPct ?? 40.0,
            queueDepth: raw.platformHealth?.queueDepth ?? 0,
            uploadAvgTimeSec: raw.platformHealth?.uploadAvgTimeSec ?? 2.1,
            dashboardLoadTimeSec: raw.platformHealth?.dashboardLoadTimeSec ?? 0.8,
            reportGenTimeSec: raw.platformHealth?.reportGenTimeSec ?? 1.4,
            concurrentUsers: raw.platformHealth?.concurrentUsers ?? 10,
            statusTargets: raw.platformHealth?.statusTargets ?? {
              apiLatency: "green",
              inference: "green",
              gpu: "green",
              queue: "green",
            },
          },
        };
      }
    } catch (e) {
      console.warn("Failed to fetch admin dashboard:", e);
    }
    return {
      kpis: { activeUsers: 0, usersInvitedPending: 0, deployedModelsCount: 2, failedJobs24h: 0 },
      users: [],
      dataQuality: [],
      models: [],
      systemActivity: [],
      auditLogs: [],
      platformHealth: {
        apiLatencyP50Ms: 18,
        apiLatencyP95Ms: 25,
        inferenceTimePerImageSec: 1.2,
        gpuUtilizationPct: 40.0,
        queueDepth: 0,
        uploadAvgTimeSec: 2.1,
        dashboardLoadTimeSec: 0.8,
        reportGenTimeSec: 1.4,
        concurrentUsers: 10,
        statusTargets: {
          apiLatency: "green",
          inference: "green",
          gpu: "green",
          queue: "green",
        },
      },
    };
  },

  async getNotifications(level?: string, type?: string, unreadOnly?: boolean): Promise<NotificationItem[]> {
    if (USE_MOCKS) {
      let list = [...MOCK_NOTIFICATIONS];
      if (level) list = list.filter((n) => n.level === level);
      if (type) list = list.filter((n) => n.type === type);
      if (unreadOnly) list = list.filter((n) => n.read_at === null);
      return list;
    }
    try {
      const params = new URLSearchParams();
      if (level) params.append("level", level);
      if (type) params.append("type", type);
      if (unreadOnly) params.append("unread_only", "true");
      const res = await fetch(`${API_BASE_URL}/notifications?${params}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      return rawList.map((item: any) => ({
        id: item.id || `notif-${Math.random()}`,
        organization_id: item.organization_id || "org-1",
        level: item.level || (item.eventType === "critical_defect" ? "critical" : "informational"),
        type: item.type || item.eventType || "inspection_assigned",
        title: item.title || "Notification",
        body: item.body || item.message || "",
        entity_type: item.entity_type || (item.link ? "inspection" : "asset"),
        entity_id: item.entity_id || item.link || "",
        created_at: item.createdAt || item.created_at || new Date().toISOString(),
        read_at: item.isRead || item.read_at ? (item.read_at || new Date().toISOString()) : null,
      }));
    } catch (e) {
      console.warn("Failed to fetch notifications:", e);
      return [];
    }
  },

  async markNotificationRead(id: string): Promise<boolean> {
    if (USE_MOCKS) {
      const item = MOCK_NOTIFICATIONS.find((n) => n.id === id);
      if (item) item.read_at = new Date().toISOString();
      return true;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async markAllNotificationsRead(): Promise<boolean> {
    if (USE_MOCKS) {
      const now = new Date().toISOString();
      MOCK_NOTIFICATIONS.forEach((n) => {
        n.read_at = now;
      });
      return true;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async deployModel(modelId: string): Promise<boolean> {
    if (USE_MOCKS) {
      const m = MOCK_MODELS.find((mod) => mod.id === modelId);
      if (m) {
        m.deployed = true;
        MOCK_AUDIT_LOGS.unshift({
          id: `audit-${Date.now()}`,
          actor: "Admin (admin@demo.infrascan)",
          action: "MODEL_DEPLOY",
          entity: `${m.name} ${m.version}`,
          timestamp: new Date().toISOString(),
          ip: "127.0.0.1",
          user_agent: navigator.userAgent,
          details: `Manual model deployment executed by Administrator for ${m.version}.`,
        });
      }
      return true;
    }
    const res = await fetch(`${API_BASE_URL}/models/${modelId}/deploy`, { method: "POST" });
    return res.ok;
  },

  async rollbackModel(modelId: string): Promise<boolean> {
    if (USE_MOCKS) {
      const m = MOCK_MODELS.find((mod) => mod.id === modelId);
      if (m) {
        m.deployed = false;
        MOCK_AUDIT_LOGS.unshift({
          id: `audit-${Date.now()}`,
          actor: "Admin (admin@demo.infrascan)",
          action: "MODEL_ROLLBACK",
          entity: `${m.name} ${m.version}`,
          timestamp: new Date().toISOString(),
          ip: "127.0.0.1",
          user_agent: navigator.userAgent,
          details: `Model rollback executed by Administrator on ${m.version}. Reverted to previous stable checkpoint.`,
        });
      }
      return true;
    }
    const res = await fetch(`${API_BASE_URL}/models/${modelId}/rollback`, { method: "POST" });
    return res.ok;
  },

  async getAuditLogs(actor?: string, action?: string): Promise<AuditLogItem[]> {
    if (USE_MOCKS) {
      let logs = [...MOCK_AUDIT_LOGS];
      if (actor) logs = logs.filter((l) => l.actor.toLowerCase().includes(actor.toLowerCase()));
      if (action) logs = logs.filter((l) => l.action.toLowerCase().includes(action.toLowerCase()));
      return logs;
    }
    const res = await fetch(`${API_BASE_URL}/audit-log`);
    return res.json();
  },

  async getPipelineCounts(): Promise<{
    images_uploaded: number;
    quality_check: number;
    ai_analysing: number;
    needs_engineer_review: number;
    reviewed: number;
    reported: number;
    work_orders_open: number;
    last_refreshed_at: string;
  }> {
    if (USE_MOCKS) {
      return {
        images_uploaded: 42,
        quality_check: 8,
        ai_analysing: 5,
        needs_engineer_review: 6,
        reviewed: 18,
        reported: 12,
        work_orders_open: 3,
        last_refreshed_at: new Date().toISOString(),
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/pipeline/counts`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        return {
          images_uploaded: 0,
          quality_check: 0,
          ai_analysing: 0,
          needs_engineer_review: 0,
          reviewed: 0,
          reported: 0,
          work_orders_open: 0,
          last_refreshed_at: new Date().toISOString(),
        };
      }
      return res.json();
    } catch {
      return {
        images_uploaded: 0,
        quality_check: 0,
        ai_analysing: 0,
        needs_engineer_review: 0,
        reviewed: 0,
        reported: 0,
        work_orders_open: 0,
        last_refreshed_at: new Date().toISOString(),
      };
    }
  },

  async getReviewQueue(params: {
    search?: string;
    status?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: {
      id: string;
      assetCode: string;
      assetName: string;
      defectType: string;
      confidence: number;
      proposedSeverity: SeverityLevel;
      status: "ai_analysing" | "needs_review" | "reviewed";
      submittedAt: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 10;

    if (USE_MOCKS) {
      let all = [
        { id: "REV-101", assetCode: "INF-001", assetName: "Bridge deck A", defectType: "Longitudinal crack", confidence: 0.94, proposedSeverity: "moderate" as SeverityLevel, status: "needs_review" as const, submittedAt: "2026-10-20T08:14:00Z" },
        { id: "REV-102", assetCode: "INF-004", assetName: "Harbor Tunnel", defectType: "Transverse crack", confidence: 0.91, proposedSeverity: "severe" as SeverityLevel, status: "needs_review" as const, submittedAt: "2026-10-20T07:45:00Z" },
        { id: "REV-103", assetCode: "INF-005", assetName: "Overpass Pier 7", defectType: "Shear fracture", confidence: 0.88, proposedSeverity: "critical" as SeverityLevel, status: "needs_review" as const, submittedAt: "2026-10-19T14:30:00Z" },
        { id: "REV-104", assetCode: "INF-002", assetName: "Road section 12", defectType: "Alligator fatigue", confidence: 0.86, proposedSeverity: "moderate" as SeverityLevel, status: "reviewed" as const, submittedAt: "2026-10-18T11:20:00Z" },
        { id: "REV-105", assetCode: "INF-003", assetName: "Retaining wall 3", defectType: "Hairline fissure", confidence: 0.79, proposedSeverity: "minor" as SeverityLevel, status: "reviewed" as const, submittedAt: "2026-10-18T09:15:00Z" },
        { id: "REV-106", assetCode: "INF-008", assetName: "Northway Viaduct", defectType: "Surface spalling", confidence: 0.82, proposedSeverity: "severe" as SeverityLevel, status: "ai_analysing" as const, submittedAt: "2026-10-20T09:00:00Z" },
      ];

      if (params.search) {
        const q = params.search.toLowerCase();
        all = all.filter((i) => i.assetCode.toLowerCase().includes(q) || i.assetName.toLowerCase().includes(q) || i.defectType.toLowerCase().includes(q));
      }

      if (params.status && params.status !== "all") {
        all = all.filter((i) => i.status === params.status);
      }

      const total = all.length;
      const start = (page - 1) * pageSize;
      const items = all.slice(start, start + pageSize);

      return { items, total, page, pageSize };
    }

    const query = new URLSearchParams();
    if (params.search) query.append("search", params.search);
    if (params.status) query.append("status", params.status);
    if (params.sort) query.append("sort", params.sort);
    query.append("page", String(page));
    query.append("pageSize", String(pageSize));

    const res = await fetch(`${API_BASE_URL}/review-queue?${query}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { items: [], total: 0, page, pageSize };
    return res.json();
  },

  async searchGlobal(q: string): Promise<{
    assets: { id: string; code: string; name: string; type: string }[];
    inspections: { id: string; assetCode: string; date: string; status: string }[];
  }> {
    const term = q.trim().toLowerCase();
    if (USE_MOCKS) {
      if (!term) return { assets: [], inspections: [] };
      const assets = MOCK_ASSETS.filter((a) =>
        a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || a.type.toLowerCase().includes(term)
      ).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }));

      const inspections = [
        { id: "insp-13", assetCode: "INF-001", date: "2026-10-18", status: "reviewed" },
        { id: "insp-14", assetCode: "INF-004", date: "2026-10-20", status: "pending_review" },
        { id: "insp-15", assetCode: "INF-005", date: "2026-10-19", status: "pending_review" },
      ].filter((i) => i.id.toLowerCase().includes(term) || i.assetCode.toLowerCase().includes(term));

      return { assets, inspections };
    }
    const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(term)}`);
    return res.json();
  },

  async exportDashboardCsv(role: string, from?: string, to?: string): Promise<string> {
    if (USE_MOCKS) {
      const header = "AssetCode,AssetName,DefectType,SeverityProposal,Confidence,ReviewStatus,Date\n";
      const rows = [
        "INF-001,Bridge deck A,Longitudinal crack,Moderate,0.94,Pending Review,2026-10-20",
        "INF-004,Harbor Tunnel,Transverse crack,Severe,0.91,Pending Review,2026-10-20",
        "INF-005,Overpass Pier 7,Shear fracture,Critical,0.88,Pending Review,2026-10-19",
        "INF-002,Road section 12,Alligator fatigue,Moderate,0.86,Engineer Confirmed,2026-10-18",
        "INF-003,Retaining wall 3,Hairline fissure,Minor,0.79,Engineer Confirmed,2026-10-18",
      ].join("\n");
      return header + rows;
    }
    const params = new URLSearchParams();
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    params.append("format", "csv");
    const res = await fetch(`${API_BASE_URL}/exports/dashboard/${role}?${params}`);
    return res.text();
  },

  /* ------------------------------------------------------------------ */
  /* Auth & Account API Contract (§5.1, Part 2)                         */
  /* ------------------------------------------------------------------ */
  async getAuthProviders(): Promise<{ providers: string[] }> {
    if (USE_MOCKS) {
      return { providers: ["google", "microsoft"] };
    }
    const res = await fetch(`${API_BASE_URL}/auth/providers`);
    return res.json();
  },

  async getPublicOrganizations(): Promise<{ id: string; name: string }[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/organizations/public`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // fallback if offline
    }
    return [
      { id: "3494b40c-3705-4fbf-9b6a-8c621dcf88ec", name: "Primary Infrastructure Authority" },
    ];
  },

  async register(payload: {
    fullName: string;
    email: string;
    password: string;
    organizationId?: string;
    inviteCode?: string;
    requestedRole: RoleType;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail?.message || data?.message || "Registration failed. Please check your inputs.";
      throw new Error(msg);
    }
    return data;
  },

  async getPendingUsers(): Promise<PendingUser[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/pending-users`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // fallback
    }
    return [];
  },

  async approveUser(userId: string, role?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail?.message || data?.message || "Failed to approve user";
      throw new Error(msg);
    }
    return data;
  },

  async rejectUser(userId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({ reason: reason || "Application criteria not met." }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail?.message || data?.message || "Failed to reject user";
      throw new Error(msg);
    }
    return data;
  },

  async resendVerification(email: string): Promise<{ success: boolean; message: string }> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 400));
      return { success: true, message: "A new verification link has been sent if an account exists." };
    }
    const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 500));
      return { success: true, message: "If an account exists for that address, a reset link has been sent." };
    }
    const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 500));
      if (token === "expired") {
        throw new Error("Password reset link has expired.");
      }
      if (token === "invalid") {
        throw new Error("Invalid password reset token.");
      }
      return { success: true, message: "Your password has been changed. Please log in." };
    }
    const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to reset password" }));
      throw new Error(err.message || "Failed to reset password");
    }
    return res.json();
  },

  async verifyEmail(token: string): Promise<{ success: boolean; status: "verified" | "expired" | "invalid"; message: string }> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 500));
      if (token === "expired") {
        throw new Error("Verification token has expired.");
      }
      if (token === "invalid") {
        throw new Error("Verification token is invalid.");
      }
      return { success: true, status: "verified", message: "E-mail verified successfully." };
    }
    const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Verification failed" }));
      throw new Error(err.message || "Verification failed");
    }
    return res.json();
  },

  async acceptInvitation(token: string, name: string, password: string): Promise<{ success: boolean; message: string }> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 500));
      if (token === "expired" || token === "invalid") {
        throw new Error("This invitation is invalid or has expired.");
      }
      return { success: true, message: "Invitation accepted. Welcome to InfraScan!" };
    }
    const res = await fetch(`${API_BASE_URL}/auth/invitations/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to accept invitation" }));
      throw new Error(err.message || "Failed to accept invitation");
    }
    return res.json();
  },

  async getAssets(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/assets`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || data;
  },

  async getAsset(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/assets/${id}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json();
  },

  async createAsset(payload: {
    id?: string;
    name: string;
    asset_type: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    construction_year?: number;
    material?: string;
    department?: string;
    inspection_frequency?: string;
    importance?: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/assets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || (typeof err.detail === "string" ? err.detail : "Failed to register asset"));
    }
    return res.json();
  },

  async updateAsset(id: string, payload: {
    name?: string;
    asset_type?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    construction_year?: number;
    material?: string;
    department?: string;
    inspection_frequency?: string;
    importance?: string;
    assigned_inspector_id?: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/assets/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || (typeof err.detail === "string" ? err.detail : "Failed to update asset"));
    }
    return res.json();
  },

  async getInspections(params?: { status?: string; asset_id?: string; page?: number; page_size?: number }): Promise<any> {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== "all") searchParams.append("status", params.status);
    if (params?.asset_id) searchParams.append("asset_id", params.asset_id);
    if (params?.page) searchParams.append("page", String(params.page));
    if (params?.page_size) searchParams.append("page_size", String(params.page_size));
    const url = `${API_BASE_URL}/inspections${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const res = await fetch(url, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  },

  async preprocessImage(imageId: string, profileName: string = "standard_crack_enhancement"): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/preprocess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({ profile_name: profileName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || (typeof err.detail === "string" ? err.detail : "Failed to preprocess image"));
    }
    return res.json();
  },

  async getInspectors(): Promise<{ id: string; name: string; email: string; role: string }[]> {
    const res = await fetch(`${API_BASE_URL}/inspections/inspectors`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createInspection(payload: {
    asset_id: string;
    inspector_id?: string;
    inspection_date?: string;
    due_date?: string;
    inspection_method?: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail?.message || (typeof err.detail === "string" ? err.detail : err.message || `Failed to create inspection (${res.status})`);
      throw new Error(msg);
    }
    return res.json();
  },

  async assignAssetToInspector(assetId: string, payload: {
    inspector_id: string;
    inspection_method?: string;
    due_date?: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/assets/${assetId}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail?.message || (typeof err.detail === "string" ? err.detail : err.message || `Failed to assign asset (${res.status})`);
      throw new Error(msg);
    }
    return res.json();
  },

  async reassignInspection(inspectionId: string, payload: {
    inspector_id: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/reassign`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail?.message || (typeof err.detail === "string" ? err.detail : err.message || `Failed to reassign inspection (${res.status})`);
      throw new Error(msg);
    }
    return res.json();
  },

  async getInspection(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${id}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Inspection not found");
    }
    return res.json();
  },

  async getInspectionImages(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${id}/images`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { items: [] };
    return res.json();
  },

  async getInspectionDetections(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/detections`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { items: [] };
    return res.json();
  },

  async createDetection(inspectionId: string, payload: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/detections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to create finding");
    }
    return res.json();
  },

  async verifyGeometry(detectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/detections/${detectionId}/verify-geometry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ confirmed: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to verify geometry");
    }
    return res.json();
  },

  async markNoDefects(inspectionId: string, notes?: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/mark-no-defects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to mark no defects");
    }
    return res.json();
  },

  async submitInspection(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/submit`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to submit inspection");
    }
    return res.json();
  },

  async claimInspection(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/claim`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to claim inspection");
    }
    return res.json();
  },

  async releaseClaim(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/release-claim`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to release claim");
    }
    return res.json();
  },

  async signOffInspection(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/sign-off`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to sign off inspection");
    }
    return res.json();
  },

  async confirmPriority(inspectionId: string, payload: { priority: string; reason?: string; suggested_action?: string }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/confirm-priority`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to confirm priority");
    }
    return res.json();
  },

  async getInspectionReports(inspectionId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/reports`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async generateReports(inspectionId: string, format: string = "all"): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ format }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to generate report");
    }
    return res.json();
  },

  async getWorkOrders(params?: { status?: string; priority?: string; asset_id?: string; assignee_id?: string }): Promise<any[]> {
    let url = `${API_BASE_URL}/work-orders`;
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.priority) query.append("priority", params.priority);
    if (params?.asset_id) query.append("asset_id", params.asset_id);
    if (params?.assignee_id) query.append("assignee_id", params.assignee_id);
    const qs = query.toString();
    if (qs) url += `?${qs}`;

    const res = await fetch(url, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async getWorkOrder(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/work-orders/${id}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Work order not found");
    }
    return res.json();
  },

  async createWorkOrder(payload: any): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to create work order");
    }
    return res.json();
  },

  async transitionWorkOrder(id: string, payload: { to_status: string; note?: string }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/work-orders/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to update work order status");
    }
    return res.json();
  },

  async getRepairTemplates(): Promise<any[]> {
    const res = await fetch(`${API_BASE_URL}/repair-templates`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  },

  async getImageLimits(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/config/image-limits`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json();
  },

  async assessImageQuality(file: File | Blob, inspectionId?: string): Promise<any> {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append("file", file);
    } else {
      formData.append("file", file, "capture.jpg");
    }
    if (inspectionId) {
      formData.append("inspection_id", inspectionId);
    }
    const headers = authHeaders();
    delete headers["Content-Type"];

    const res = await fetch(`${API_BASE_URL}/images/assess`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Quality assessment failed");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async uploadAssessedImage(
    file: File | Blob,
    inspectionId?: string,
    allowWarning: boolean = false,
    source: string = "upload",
    gps?: { lat: number; lng: number },
    drone?: { altitude?: number; gimbalPitch?: number }
  ): Promise<any> {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append("file", file);
    } else {
      formData.append("file", file, "capture.jpg");
    }
    if (inspectionId) {
      formData.append("inspection_id", inspectionId);
    }
    formData.append("source", source);
    formData.append("allow_warning", String(allowWarning));
    if (gps) {
      formData.append("gps_lat", String(gps.lat));
      formData.append("gps_lng", String(gps.lng));
    }
    if (drone) {
      if (drone.altitude !== undefined) formData.append("drone_altitude", String(drone.altitude));
      if (drone.gimbalPitch !== undefined) formData.append("drone_gimbal_pitch", String(drone.gimbalPitch));
    }

    const headers = authHeaders();
    delete headers["Content-Type"];

    const res = await fetch(`${API_BASE_URL}/images/upload`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Image upload failed");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async getImageDetails(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err: any = new Error("Failed to load image details");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async getImageGeometry(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/geometry`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err: any = new Error("Failed to load crack geometry");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async calculateImageGeometry(imageId: string, payload?: { force_recompute?: boolean; mm_per_pixel?: number; min_region_area_px?: number }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/geometry`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      const err: any = new Error("Failed to calculate crack geometry");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async retryImageProcessing(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/processing/retry`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err: any = new Error("Failed to retry preprocessing");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async replaceImage(imageId: string, file: File | Blob, allowWarning: boolean = false): Promise<any> {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append("file", file);
    } else {
      formData.append("file", file, "replace.jpg");
    }
    formData.append("allow_warning", String(allowWarning));
    const headers = authHeaders();
    delete headers["Content-Type"];

    const res = await fetch(`${API_BASE_URL}/images/${imageId}/replace`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Failed to replace image");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async deleteImage(imageId: string, inspectionId?: string): Promise<any> {
    const url = inspectionId
      ? `${API_BASE_URL}/inspections/${inspectionId}/images/${imageId}`
      : `${API_BASE_URL}/images/${imageId}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to delete image");
    }
    return res.json();
  },

  async reviewImage(imageId: string, payload: {
    decision: "accepted" | "rejected" | "warned" | "manual_review";
    manual_classification?: "crack" | "no_crack" | "uncertain" | null;
    override_reason?: string;
    notes?: string;
  }, inspectionId?: string): Promise<any> {
    const url = inspectionId
      ? `${API_BASE_URL}/inspections/${inspectionId}/images/${imageId}/review`
      : `${API_BASE_URL}/images/${imageId}/review`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to update photo review");
    }
    return res.json();
  },

  async annotateImage(imageId: string, payload: {
    bbox: { x: number; y: number; w: number; h: number };
    defect_type?: string;
    severity?: string;
    notes?: string;
  }, inspectionId?: string): Promise<any> {
    const url = inspectionId
      ? `${API_BASE_URL}/inspections/${inspectionId}/images/${imageId}/annotations`
      : `${API_BASE_URL}/images/${imageId}/annotations`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to save defect annotation");
    }
    return res.json();
  },

  async triggerAIAnalysis(inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/analyze`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to run AI analysis");
    }
    return res.json();
  },

  async analyzeSingleImage(inspectionId: string, imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/images/${imageId}/analyze`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to analyze image");
    }
    return res.json();
  },

  async analyzeImage(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/analyze`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to analyze image");
    }
    return res.json();
  },

  async getActiveModel(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/models/active`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json();
  },


  async uploadInspectionImage(
    inspectionId: string,
    file: File | Blob,
    source: string = "upload",
    allowWarning: boolean = false,
    gps?: { lat: number; lng: number },
    drone?: { altitude?: number; gimbalPitch?: number }
  ): Promise<any> {
    const formData = new FormData();
    if (file instanceof File) {
      formData.append("file", file);
    } else {
      formData.append("file", file, "camera_capture.jpg");
    }
    formData.append("source", source);
    formData.append("allow_warning", String(allowWarning));
    if (gps) {
      formData.append("gps_lat", String(gps.lat));
      formData.append("gps_lng", String(gps.lng));
    }
    if (drone) {
      if (drone.altitude !== undefined) formData.append("drone_altitude", String(drone.altitude));
      if (drone.gimbalPitch !== undefined) formData.append("drone_gimbal_pitch", String(drone.gimbalPitch));
    }

    const headers = authHeaders();
    delete headers["Content-Type"];

    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/images`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Image upload failed");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async transformImage(
    imageId: string,
    payload: {
      rotation_deg?: number;
      crop_x?: number;
      crop_y?: number;
      crop_w?: number;
      crop_h?: number;
      flip_h?: boolean;
      flip_v?: boolean;
      src_quad?: number[][];
    }
  ): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Failed to transform image");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async getImageAugmentations(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/augmentations`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err: any = new Error("Failed to load augmentations");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async getDatasetSamples(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/datasets/samples`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err: any = new Error("Failed to load dataset samples");
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  async importDatasetSample(sampleId: string, inspectionId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/datasets/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify({ sample_id: sampleId, inspection_id: inspectionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.detail?.message || data.detail || "Failed to import dataset sample");
      err.response = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  async calibrateImage(inspectionId: string, imageId: string, payload: { method: string; mm_per_pixel?: number; reference_line_length_mm?: number; pixel_length?: number }): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/images/${imageId}/calibrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to calibrate image scale");
    }
    return res.json();
  },

  async confirmImageWarning(imageId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/images/${imageId}/confirm-warning`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to confirm warning");
    }
    return res.json();
  },

  async compareInspections(inspectionId: string, otherId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/compare/${otherId}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to compare inspections");
    }
    return res.json();
  },

  async getRoleDashboard(role: string, days: number = 30): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/dashboards/${role}?days=${days}`, {
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || err.detail || "Failed to fetch dashboard metrics");
    }
    return res.json();
  },
};

export const api = apiService;


