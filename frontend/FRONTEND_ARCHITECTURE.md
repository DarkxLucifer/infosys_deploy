# InfraScan Frontend Architecture Documentation

**Platform**: InfraScan - AI-Assisted Infrastructure Inspection & Damage Assessment  
**Author / Auditor**: Frontend Architecture Subagent (`frontend_auditor`)  
**Target Repository**: `project/infosys/frontend`  
**Core Technologies**: React 19, TypeScript ~6.0, Vite ^8.3, Tailwind CSS ^4.3, Lucide React ^1.59, Leaflet ^1.9, Chart.js ^4.5, Sonner ^2.0  
**Verification Status**: All 33 engineering unit tests passing; TypeScript compilation and Vite production build verified (zero errors).

---

## Table of Contents

1. [Executive Summary & Core Principles](#1-executive-summary--core-principles)
2. [Component Hierarchy & Application Tree](#2-component-hierarchy--application-tree)
3. [Routing Architecture & Role-Based Access Control (RBAC)](#3-routing-architecture--role-based-access-control-rbac)
4. [State Management Architecture](#4-state-management-architecture)
   - 4.1 [Authentication Context (`auth-context.tsx`)](#41-authentication-context-auth-contexttsx)
   - 4.2 [Application Store (`app.tsx`)](#42-application-store-apptsx)
   - 4.3 [Feature Flags Engine (`features.ts`)](#43-feature-flags-engine-featurests)
5. [Role-Based Dashboard Suite](#5-role-based-dashboard-suite)
   - 5.1 [Infrastructure Inspector Dashboard](#51-infrastructure-inspector-dashboard)
   - 5.2 [Civil Engineer Dashboard](#52-civil-engineer-dashboard)
   - 5.3 [Infrastructure Manager Dashboard](#53-infrastructure-manager-dashboard)
   - 5.4 [Maintenance Engineer Dashboard](#54-maintenance-engineer-dashboard)
   - 5.5 [Administrator Dashboard](#55-administrator-dashboard)
6. [Inspection Review, Optical Calibration & AI Quality Components](#6-inspection-review-optical-calibration--ai-quality-components)
   - 6.1 [Photo Inspection Suite (`photo-inspection-suite.tsx`)](#61-photo-inspection-suite-photo-inspection-suitetsx)
   - 6.2 [Crack Frame Visualizer (`crack-frame.tsx`)](#62-crack-frame-visualizer-crack-frametsx)
   - 6.3 [Crack Geometry Engine (`crack-geometry-section.tsx`)](#63-crack-geometry-engine-crack-geometry-sectiontsx)
   - 6.4 [Image Quality & Damage Assessment Suite (`image-quality-components.tsx`)](#64-image-quality--damage-assessment-suite-image-quality-componentstsx)
   - 6.5 [Optical Calibration Modal (`optical-calibration-modal.tsx`)](#65-optical-calibration-modal-optical-calibration-modaltsx)
7. [API Client Integration Layer (`api.ts`)](#7-api-client-integration-layer-apits)
8. [Build Configuration, Tooling & Design System](#8-build-configuration-tooling--design-system)
   - 8.1 [Vite 8 & Bundling Strategy](#81-vite-8--bundling-strategy)
   - 8.2 [TypeScript 6 Configuration](#82-typescript-6-configuration)
   - 8.3 [Tailwind CSS v4 & Theming Tokens](#83-tailwind-css-v4--theming-tokens)
   - 8.4 [Static Assets & Reporting Engine](#84-static-assets--reporting-engine)
9. [Engineering Rules Compliance Audit](#9-engineering-rules-compliance-audit)

---

## 1. Executive Summary & Core Principles

InfraScan's frontend is an enterprise civil engineering inspection and decision-support workspace. It adheres strictly to seven non-negotiable engineering principles:

```
+-----------------------------------------------------------------------------------------+
|                               NON-NEGOTIABLE CORE PRINCIPLES                            |
+-----------------------------------------------------------------------------------------+
| Rule 1: AI Decision Support, Never a Verdict                                           |
|         - Detections are labeled "AI suggestion" until an engineer signs off.          |
| Rule 2: Never Declare Structure "Unsafe"                                                |
|         - Maximum severity is "Critical / Requires Urgent Engineering Review".          |
| Rule 3: Pixels vs Millimetres Gate                                                      |
|         - Null mm_per_pixel displays in "px" with explicit "(not calibrated)" note.     |
| Rule 4: Visual Progression Comparison Gate                                              |
|         - Growth % requires identical viewpoint, registered surface, & valid scale.     |
| Rule 5: Absence of Detections != Proof of No Damage                                     |
|         - Labeled "No defects detected by AI in reviewed images", never "all clear".    |
| Rule 6: Strict Role-Based Access Control                                                |
|         - 5 distinct roles: Inspector, Civil Engineer, Manager, Maintenance, Admin.     |
| Rule 7: Reviewed-Only Reporting for Executive Views                                    |
|         - Unreviewed findings flagged as pending; certificates require licensed sign-off.|
+-----------------------------------------------------------------------------------------+
```

---

## 2. Component Hierarchy & Application Tree

```
index.html
└── src/main.tsx
    └── StrictMode
        └── BrowserRouter
            └── App (src/App.tsx)
                ├── ThemeProvider (light / dark mode, localStorage: "infrascan-theme")
                ├── AuthProvider (src/store/auth-context.tsx)
                │   ├── In-Memory JWT Access Token State
                │   ├── HttpOnly Cookie Refresh Sync
                │   ├── Idle Timeout Monitor (28m warning, 30m logout, 12h absolute)
                │   └── BroadcastChannel ("infrascan_auth_channel" cross-tab sync)
                └── AppStoreProvider (src/store/app.tsx)
                    ├── Routes
                    │   │
                    │   ├── Public / Landing Pages:
                    │   │   ├── "/" ───────────────────────> LandingPage
                    │   │   ├── "/privacy" ────────────────> PrivacyPage
                    │   │   ├── "/terms" ──────────────────> TermsPage
                    │   │   ├── "/accessibility" ──────────> AccessibilityPage
                    │   │   └── "/contact" ────────────────> ContactPage
                    │   │
                    │   ├── Authentication Suite:
                    │   │   ├── "/login" & "/signin" ──────> LoginPage
                    │   │   ├── "/register" ───────────────> RegisterPage
                    │   │   ├── "/setup" ──────────────────> SetupPage
                    │   │   ├── "/forgot-password" ────────> ForgotPasswordPage
                    │   │   ├── "/reset-password" ─────────> ResetPasswordPage
                    │   │   ├── "/verify-email" ───────────> VerifyEmailPage
                    │   │   ├── "/two-factor" & "/mfa" ────> TwoFactorPage
                    │   │   ├── "/oauth/callback" ─────────> OAuthCallbackPage
                    │   │   ├── "/accept-invite" ──────────> AcceptInvitationPage
                    │   │   ├── "/signed-out" ─────────────> SignedOutPage
                    │   │   ├── "/access-denied" & "/403" ─> AccessDeniedPage
                    │   │   └── "/account-locked" ─────────> AccountLockedPage
                    │   │
                    │   ├── Protected App Shell ("/app/*" & legacy "/dashboard/*"):
                    │   │   └── RequireSession (Auth Guard)
                    │   │       └── DashboardShell
                    │   │           └── DashboardNavigationProvider
                    │   │               └── DashboardLayout (Astrix Watermelon System)
                    │   │                   ├── DashboardSidebar (Role-Aware Navigation)
                    │   │                   ├── DashboardTopbar (Search, User, Notifications)
                    │   │                   ├── Mandatory Disclaimer Banner (Section 5)
                    │   │                   └── DashboardErrorBoundary
                    │   │                       └── Outlet
                    │   │                           ├── "dashboard" ─────────> DashboardRoleDispatcher
                    │   │                           │                          ├── InspectorDashboard
                    │   │                           │                          ├── CivilEngineerDashboard
                    │   │                           │                          ├── InfrastructureManagerDashboard
                    │   │                           │                          ├── MaintenanceEngineerDashboard
                    │   │                           │                          └── AdministratorDashboard
                    │   │                           ├── "review" ────────────> ReviewQueuePage
                    │   │                           ├── "review/:id" ────────> AnalysisDetailPage
                    │   │                           ├── "analysis/:id" ──────> AnalysisDetailPage
                    │   │                           ├── "inspections" ───────> InspectionsPage
                    │   │                           ├── "inspections/new" ───> InspectionNewPage
                    │   │                           ├── "inspections/:id" ───> InspectionDetailPage
                    │   │                           ├── "assets" ────────────> AssetsPage
                    │   │                           ├── "assets/:id" ────────> AssetDetailPage
                    │   │                           ├── "map" ───────────────> DamageMapPage (Leaflet)
                    │   │                           ├── "analytics" ─────────> DamageAnalyticsPage (Chart.js)
                    │   │                           ├── "maintenance" ───────> MaintenancePage
                    │   │                           ├── "maintenance/:id" ───> MaintenancePage
                    │   │                           ├── "notifications" ─────> NotificationsCenter
                    │   │                           └── "profile" ───────────> ProfilePage
                    │   │
                    │   └── 404 Catch-All:
                    │       └── "*" ───────────────────────> NotFoundPage
                    │
                    ├── SessionTimeoutModal (Idle logout warning countdown dialog)
                    ├── CommandPalette (Global quick search CMD+K)
                    └── Toaster (Sonner notification toasts)
```

---

## 3. Routing Architecture & Role-Based Access Control (RBAC)

### 3.1 Route Guards & Bridges

The routing subsystem in `src/App.tsx` employs `RequireSession` as a security boundary:

1. **State Sync**: Bridges `AuthContext` (database/token authenticated identity) with `AppStore` (client-side workspace data).
2. **Session Restoration**: When bootstrapping, a spinning loader displays while `/api/v1/auth/refresh` checks the HttpOnly cookie.
3. **Redirection**: Unauthenticated attempts store the target route in navigation state (`{ from: location.pathname }`) and redirect to `/login`.

### 3.2 Dynamic Role Dispatcher (`DashboardRoleDispatcher`)

Navigating to `/app/dashboard` or `/dashboard` triggers dynamic dispatching:

```typescript
function DashboardRoleDispatcher() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role;
  if (role === "inspector") return <InspectorDashboard />;
  if (role === "manager") return <InfrastructureManagerDashboard />;
  if (role === "maintenance" || role === "maintenance-engineer") return <MaintenanceEngineerDashboard />;
  if (role === "admin") return <AdministratorDashboard />;
  return <CivilEngineerDashboard />; // Default: Civil Engineer
}
```

### 3.3 Role Permission Matrix (`src/lib/rules.ts`)

| Route Path | Inspector | Civil Engineer | Infrastructure Manager | Maintenance Engineer | Administrator |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/dashboard/inspector` | **Yes** | No | No | No | **Yes** |
| `/dashboard/engineer` | No | **Yes** | No | No | **Yes** |
| `/dashboard/manager` | No | No | **Yes** | No | **Yes** |
| `/dashboard/maintenance-console` | No | No | No | **Yes** | **Yes** |
| `/dashboard/admin` | No | No | No | No | **Yes** |
| `/dashboard/assets` | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| `/dashboard/inspections` | **Yes** | **Yes** | **Yes** | No | **Yes** |
| `/dashboard/inspections/new` | **Yes** | No | No | No | **Yes** |
| `/dashboard/analysis` | No | **Yes** | No | No | **Yes** |
| `/dashboard/damage-map` | **Yes** (scoped) | **Yes** | **Yes** | **Yes** | **Yes** |
| `/dashboard/maintenance` | No | No | **Yes** | **Yes** | **Yes** |
| `/dashboard/reports` | No | **Yes** | **Yes** | No | **Yes** |
| `/dashboard/settings` | No | No | No | No | **Yes** |

---

## 4. State Management Architecture

### 4.1 Authentication Context (`auth-context.tsx`)

The authentication layer follows zero-trust security standards:

- **No JWT in LocalStorage**: Access tokens are kept exclusively in memory (`useState<string | null>(null)` and `setAuthToken(...)` in `api.ts`).
- **Rotating Refresh Tokens**: Uses HttpOnly secure cookies hitting `/api/v1/auth/refresh`.
- **Idle Timeout Enforcement**:
  - `IDLE_WARNING_MS = 28 * 60 * 1000` (28 minutes: warning modal appears with 120-second countdown).
  - `IDLE_TIMEOUT_MS = 30 * 60 * 1000` (30 minutes: automatic session termination).
  - `ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000` (12 hours maximum session lifespan).
- **Cross-Tab Synchronization**: `BroadcastChannel("infrascan_auth_channel")` broadcasts `SIGNOUT` across all active browser tabs instantly.

### 4.2 Application Store (`app.tsx`)

`AppStoreProvider` acts as the primary client-side reactive store:

- **State Interface (`AppState`)**:
  - `session`: Current user profile.
  - `users`: List of registered engineering personnel.
  - `assets`: Concrete viaducts, tunnels, bridges, roads, dams.
  - `inspections`: Survey runs, metadata, frame catalogs, findings.
  - `reports`: Generated integrity certificates, CSV audits, JSON datasets.
  - `workOrders`: Maintenance dispatches with priority, status, and target findings.
  - `notifications`: Real-time toast and notification center items.
  - `models`: Active ML model cards (e.g., `ResNet-18`, `RF-DETR`, `YOLOv8`, `UNet`).
  - `settings`: Organizational thresholds (confidence gate: default 0.65; retention days: 180).
- **Optimistic Mutation Actions**:
  - `registerAsset`, `updateAsset`
  - `createInspection`, `runAnalysis`, `addFinding`, `reviewFinding`, `deleteFinding`
  - `escalateInspection`, `signOffInspection`
  - `createWorkOrder`, `updateWorkOrder`
  - `generateReport` (asynchronous generation with ready simulation)
- **Local Persistence**: Stores client UI workspace data to `localStorage` under `infrascan-state-v5` (excluding sensitive auth credentials).

### 4.3 Feature Flags Engine (`features.ts`)

Prevents broken links or unconfigured views from rendering:

- `dashboard`, `reviewQueue`, `assetsList`, `inspectionsList`, `notifications`, `profile`, `damageMap` -> `true`
- `maintenanceRoute`, `reportsRoute`, `adminUsersRoute`, `adminModelsRoute`, `adminAuditRoute`, `adminHealthRoute`, `assetCreateEdit`, `inspectionCreate`, `engineerReviewScreen` -> controlled by feature gates.

---

## 5. Role-Based Dashboard Suite

### 5.1 Infrastructure Inspector Dashboard (`inspector-dashboard.tsx`)
- **Target Persona**: Field inspector executing walkdowns, drone surveys, or vehicle scans.
- **Key Metrics (KPIs)**: Assigned inspections, Pending capture, Defects awaiting review, High priority assets.
- **Workflow Tools**:
  - "Start New Inspection" button triggering GPS & asset binding.
  - Interactive `InspectionPipelineBoard` visualizing inspection pipeline stages.
  - Real-time `RecentAiClassificationsFeed` streaming live ResNet50 classification results.
  - Paged inspection assignment list with date range filter (7d, 30d, 90d, 12m).

### 5.2 Civil Engineer Dashboard (`engineer-dashboard.tsx`)
- **Target Persona**: Licensed PE / Civil Engineer certifying infrastructure integrity.
- **Key Metrics (KPIs)**: Pending engineering reviews, Critical findings requiring urgent review, Signed off inspections, Avg review turnaround time.
- **Workflow Tools**:
  - High-priority review callout cards directing engineers to unverified findings.
  - Review queue launcher with direct access to `/app/review/:id`.
  - Filterable defect breakdown by damage classification (D00 Hairline, D10 Longitudinal, D11 Alligator, D20 Spalling, D40 Lateral, D50 Block).

### 5.3 Infrastructure Manager Dashboard (`manager-dashboard.tsx`)
- **Target Persona**: Portfolio asset manager overseeing municipal infrastructure health.
- **Key Metrics (KPIs)**: Portfolio health index, Asset compliance rate, High/Critical risk structures, Overdue inspections.
- **Workflow Tools**:
  - Full Leaflet GIS Map embedded in dashboard view with custom colored marker pins indicating asset severity status.
  - Filter toggle between "All Assets" and "Severe / Critical Only".
  - Quick export of dashboard analytics to CSV via `/api/v1/exports/dashboard/manager`.

### 5.4 Maintenance Engineer Dashboard (`maintenance-dashboard.tsx`)
- **Target Persona**: Maintenance lead coordinating repairs and corrective work orders.
- **Key Metrics (KPIs)**: Open work orders, Scheduled repairs, In-progress rehabilitations, Closed work orders.
- **Workflow Tools**:
  - Live work order status board (open, scheduled, in-progress, closed).
  - Priority transition controls (High / Medium / Low).
  - Finding reference linkage mapping work orders directly to crack measurements.

### 5.5 Administrator Dashboard (`admin-dashboard.tsx`)
- **Target Persona**: System administrator & ML operations manager.
- **Key Metrics (KPIs)**: Active user accounts, Pending registrations, Model inference health, Audit events.
- **Workflow Tools**:
  - Pending user approval and rejection modal dialogs.
  - Model deployment & rollback management interface (switching active model versions).
  - System audit log inspector with filterable timestamps and actor identities.

---

## 6. Inspection Review, Optical Calibration & AI Quality Components

### 6.1 Photo Inspection Suite (`photo-inspection-suite.tsx`)
A production-grade image analysis suite providing:
- **`PhotoZoomModal`**: Pan and zoom inspection canvas (up to 4x) with coordinate tracking.
- **`PhotoAnnotationModal`**: Interactive canvas for bounding box placement, defect tagging, and notes.
- **`PhotoManualClassificationModal`**: Manual override modal allowing engineers to reclassify damage classes.
- **`PhotoReplaceModal` & `PhotoDeleteDialog`**: Safe image replacement and audited deletion flows.
- **`MultiFileUploadZone`**: Drag-and-drop batch upload area with format validation (`.jpg`, `.jpeg`, `.png`, `.webp`).

### 6.2 Crack Frame Visualizer (`crack-frame.tsx`)
A multi-layered surface visualizer supporting 4 viewing modes:
1. `raw`: Original high-resolution field photograph.
2. `mask`: Binary / multi-class segmentation mask overlay (UNet pixel masks).
3. `heatmap`: Normalized defect activation heatmaps highlighting high-probability damage zones.
4. `detections`: Bounding boxes with confidence ratings, severity badges, and measurement tags.

### 6.3 Crack Geometry Engine (`crack-geometry-section.tsx`)
An engineering analytics component (1,384 lines) calculating physical crack properties:
- **Metric Controls**: Supports controlling metrics: Maximum Width ($w_{max}$), 95th Percentile Width ($w_{95}$), Mean Width ($w_{mean}$), and Equivalent Crack Width ($w_{eq}$).
- **Geometric Outputs**: Length (px / mm), Maximum Width, Mean Width, Orientation angle ($0^\circ - 180^\circ$), Tortuosity index ($\tau = L_{curve} / L_{euclidean}$).
- **Visual Progression Gate**: Validates whether two historical inspections share the same viewpoint, registered surface, and optical scale before computing $\Delta\%$ growth.

### 6.4 Image Quality & Damage Assessment Suite (`image-quality-components.tsx`)
The largest module in the inspection domain (3,866 lines), featuring 10 specialized subcomponents:
- `QualityBadge`: Visual score for illumination, blur/sharpness, glare, and resolution.
- `ProcessingBadge`: Real-time status indicator (Uploaded -> Preprocessing -> Analyzing -> Ready).
- `ClassificationBadge`: ResNet binary defect tag (Cracked vs Sound Surface).
- `ImageCompare`: Side-by-side split slider or overlay comparison between inspection images.
- `ImageDetailsDrawer`: Slide-over drawer detailing EXIF, optical calibration, crack geometry, and AI pipeline logs.
- `ImageTransformModal`: Perspective transformation, rotation ($90^\circ, 180^\circ, 270^\circ$), horizontal/vertical flips, and cropping.
- `ImageQualityCard`: Card displaying blur metric (Laplacian variance), illumination (lux), and resolution compliance.
- `BatchSummaryCard`: Aggregated pass/warning/reject breakdown for an entire image upload session.
- `SessionDamageAssessmentCard`: Overall inspection session damage rating.
- `PhotoDamageSeverityCard`: Severity badge and justification for individual photos.

### 6.5 Optical Calibration Modal (`optical-calibration-modal.tsx`)
Allows engineers to calibrate millimeter-to-pixel ratio ($mm/px$):
- Interactive target placement with draggable crosshairs.
- Physical reference input (e.g., standard 100mm optical gauge target).
- Automatic calculation of `mm_per_pixel` scale with live precision feedback.
- Updates all associated crack measurements from uncalibrated `px` to calibrated `mm`.

---

## 7. API Client Integration Layer (`api.ts`)

`src/lib/api.ts` is the central API integration client (3,131 lines). It exports the unified `api` / `apiService` object containing **95 asynchronous service methods**:

```typescript
export const apiService = {
  // Dashboards
  getInspectorDashboard, getEngineerDashboard, getManagerDashboard,
  getMaintenanceDashboard, getAdminDashboard, getRoleDashboard,

  // Assets
  getAssets, getAssetsMapSummary, getAsset, createAsset, updateAsset,
  assignAssetToInspector,

  // Inspections
  getInspections, getInspection, createInspection, reassignInspection,
  submitInspection, claimInspection, releaseClaim, signOffInspection,
  confirmPriority, markNoDefects, compareInspections,

  // Images & Quality
  uploadInspectionImage, uploadAssessedImage, getImageDetails,
  assessImageQuality, retryImageProcessing, replaceImage, deleteImage,
  reviewImage, annotateImage, transformImage, calibrateImage,
  deleteImageCalibration, confirmImageWarning, confirmSoundSurface,

  // AI & Detection Pipelines
  triggerAIAnalysis, analyzeSingleImage, analyzeImage, getActiveModel,
  deployModel, rollbackModel, getInspectionDetections, createDetection,
  updateDetection, deleteDetection, verifyGeometry,

  // Crack Geometry
  getImageGeometry, calculateImageGeometry,

  // Maintenance & Work Orders
  getWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder,
  transitionWorkOrder, getRepairTemplates, getPriorityPreview,

  // Analytics & Reports
  getAnalyticsOverview, getDamageDistribution, getCrackProgression,
  getRiskMatrix, getMaintenanceVelocity, exportDamageAnalyticsCsv,
  downloadInspectionReport, getInspectionReports, generateReports,

  // Auth & Admin
  getAuthProviders, getPublicOrganizations, register, getPendingUsers,
  approveUser, rejectUser, resendVerification, forgotPassword,
  resetPassword, verifyEmail, acceptInvitation, getAuditLogs,
  getNotifications, markNotificationRead, markAllNotificationsRead,
  searchGlobal, exportDashboardCsv, updateProfile,
};
```

### Key Network Characteristics:
- **Default Base URL**: `/api/v1` (proxied to `http://localhost:8000` via Vite development server).
- **Dual Mode**: `USE_MOCKS = false` connects to live FastAPI backend; fallbacks seamlessly to realistic mocks when backend services are unavailable.
- **Latency Target**: All dashboard metadata calls designed for $<500\text{ ms}$ response times.

---

## 8. Build Configuration, Tooling & Design System

### 8.1 Vite 8 & Bundling Strategy (`vite.config.ts`)
```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```
- Bundles 2,167 modules in 1.30s.
- Total production output: `index-C1G630ub.js` (1.65 MB minified / 440 kB gzip) and `index-BgIju21H.css` (179 kB minified / 29.7 kB gzip).

### 8.2 TypeScript 6 Configuration (`tsconfig.app.json`)
- Strict modern compiler settings: `target: "es2023"`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `noUnusedLocals: true`, `noUnusedParameters: true`.
- Path aliases: `@/*` mapped to `./src/*`.

### 8.3 Tailwind CSS v4 & Theming Tokens (`src/index.css`)
Tailwind CSS v4 is configured via the new `@theme inline` engine and custom CSS variables based on the Realtime Colors palette (`#050315-fbfbfe-2f27ce-dedcff-433bff` with Inter variable font):

| Semantic Token | Light Mode (Default) | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--brand-primary` / `--primary` | `#2f27ce` | `#433bff` | Primary buttons, active states, key icons |
| `--brand-bg` / `--background` | `#fbfbfe` | `#050315` | Canvas background |
| `--brand-text` / `--foreground`| `#050315` | `#fbfbfe` | Primary headings, body copy |
| `--card` | `#ffffff` | `#0d0a2b` | Card container background |
| `--destructive` | `#c62828` | `#d16055` | Deletions, severe error alerts |
| `--critical` | `#7f1d1d` | `#f87171` | Urgent engineering review badge |
| `--warning` | `#92400e` | `#d89a4a` | Moderate defects, uncalibrated scale |
| `--success` | `#166534` | `#4caf7d` | Signed off, calibrated, sound surface |

### 8.4 Static Assets & Reporting Engine
- **Static Public Files** (`frontend/public/`):
  - `infrascan-logo.png` & `logo.png` (1.09 MB): Official InfraScan brand lockup.
  - `hero-inspection.jpg` (942 kB): Civil infrastructure viaduct imagery used on the landing page.
  - `favicon.svg` (430 B): Scalable brand mark icon.
- **Client-Side Report Engine (`report-download.ts`)**:
  - Implements a pure, zero-dependency client-side PDF-1.4 binary stream generator (`buildPdf`).
  - Generates official **Integrity Certificates**, **Inspection Audit Logs** (CSV), and **Findings Datasets** (JSON) directly in the browser.

---

## 9. Engineering Rules Compliance Audit

The frontend codebase was audited against the engineering rules test suite (`src/lib/rules.test.ts`):

```
=== Running InfraScan Engineering Rules Unit Tests ===

[Test Suite 1: Rule 3 - Pixels vs Millimetres]
  PASS: Null mm_per_pixel outputs px unit
  PASS: isCalibrated is false when mm_per_pixel is null
  PASS: Includes 'not calibrated' annotation
  PASS: Label contains '412 px (not calibrated)'
  PASS: Calibrated scale outputs mm unit
  PASS: isCalibrated is true when scale exists
  PASS: Calculates correct millimeters
  PASS: No warning annotation when calibrated

[Test Suite 2: Rule 4 - Progression Comparison Gate]
  PASS: canCompare is false when uncalibrated
  PASS: changePercent is null without calibration
  PASS: Warning notice is provided
  PASS: Outputs raw pixel delta (+92 px)
  PASS: canCompare is false when viewpoints differ
  PASS: Detects viewpoint mismatch
  PASS: canCompare is true when fully calibrated and aligned
  PASS: Calculates +33.3% growth correctly
  PASS: Outputs formatted change text
  PASS: No warning notice when compliant

[Test Suite 3: Rule 2 & 5 - Severity Safety Terminology]
  PASS: Critical wording avoids 'unsafe'/'dangerous'
  PASS: Does NOT contain 'unsafe'
  PASS: Does NOT contain 'collapse'
  PASS: Absence of defects uses precise non-destructive wording
  PASS: Does NOT say 'all clear'

[Test Suite 4: Rule 1 - AI Decision Support Dispositions]
  PASS: Unreviewed detections labeled 'AI suggestion'
  PASS: Not marked approved
  PASS: Reviewed findings labeled 'Engineer confirmed'
  PASS: Marked as engineer approved

[Test Suite 5: Rule 6 - Role-Based Access Control Matrix]
  PASS: Inspector can access inspector dashboard
  PASS: Inspector cannot access admin dashboard
  PASS: Engineer can access engineer dashboard
  PASS: Manager can access damage map
  PASS: Admin can access admin dashboard
  PASS: Admin can access all dashboards

=== Test Results: 33 Passed, 0 Failed ===
```

### Remediation Note:
During the oxlint static audit, a conditional hook call was identified in `src/components/inspection/image-quality-components.tsx` (`useState` positioned after an early return). The hook was lifted above the guard clause, resulting in **0 errors** across 100 source files. Both `tsc -b && vite build` and `oxlint` now succeed cleanly.
