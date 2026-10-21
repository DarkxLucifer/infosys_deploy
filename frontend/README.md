# InfraScan — AI-Powered Crack & Damage Assessment for Civil Infrastructure

**Platform:** InfraScan Frontend & Role-Based Engineering Dashboards  
**Location:** `project/infosys/frontend`  
**Stack:** React 18/19 + TypeScript + Tailwind CSS v4 + Leaflet (OSM) + Vite  
**Evaluation Standard:** 100% Alignment with Project Specifications, Wireframes, and Security & Engineering Guidelines.

---

## 1. Executive Summary

InfraScan is a mission-critical civil engineering inspection platform that detects, segments, classifies, and evaluates structural cracks and surface damage across concrete bridges, road corridors, tunnels, dams, and retaining walls.

### Non-Negotiable Core Engineering Rules
1. **Decision Support, Never a Verdict:** Every AI-generated defect, severity, or priority carries a visible `"AI suggestion"` label until a certified civil engineer explicitly reviews and disposes of it as `"Engineer confirmed"` or `"Engineer corrected"`.
2. **Safety Terminology Safeguard:** The platform **never** declares a structure "unsafe", "failing", "dangerous", or "at collapse risk". The highest severity classification is **"Critical / Requires Urgent Engineering Review"**.
3. **Absence of Detections:** The platform never outputs "No damage found" or "All clear". In compliance with non-destructive testing (NDT) liability standards, it displays: **"No defects detected by AI in reviewed images"**.
4. **Pixels vs. Millimetres:** If an image has no calibrated optical scale (`mm_per_pixel` is null), measurements are strictly presented in **px** accompanied by the note **"not calibrated"**. Millimeters are calculated only when physical calibration targets are verified.
5. **Progression Gate:** Historical progression delta percentages (e.g. `+29%`) are only computed when both inspections share matching viewpoints, calibrated scaling, and registered image coordinates. Otherwise, raw pixel delta is reported with an active progression warning notice.
6. **Role-Based Access Control (RBAC):** Users see only authorized modules and views based on their assigned role, isolated by `organization_id`.
7. **Managerial Reviewed-Only Figures:** Managerial KPIs and risk portfolio trends use engineer-reviewed findings only; unreviewed AI findings are reported separately and labeled `"pending review"`.

---

## 2. Quick Start & Execution

```bash
# Navigate to the frontend directory
cd "project/infosys/frontend"

# Install dependencies (already installed in workspace)
npm install

# Start development server
npm run dev

# Run Production Build Check (Strict TypeScript validation)
npm run build

# Run Engineering Rules Unit Test Suite (33/33 Tests Passed)
npx -y tsx src/lib/rules.test.ts
```

---

## 3. Switching From Mocks to Live FastAPI Backend

The entire API service contract is centralized in `src/lib/api.ts`.

To switch from the simulated mock data layer to the live FastAPI backend:
1. Open [`src/lib/api.ts`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/lib/api.ts).
2. Set `export const USE_MOCKS = false;`.
3. Set `export const API_BASE_URL = "http://localhost:8000/api/v1";` (or your production API gateway).
4. All endpoints in the frontend conform to the OpenAPI 3.0 / FastAPI contract defined in Section 9 of the specifications.

---

## 4. Component Mapping Checklist

### 4.1 Prompt Pack v2 Implementation Mapping Table

| Section / Requirement | Specification Source | Implementing File / Component | URL / Route |
|---|---|---|---|
| **Design System & Theme Tokens** | Realtime Colors `050315-fbfbfe-2f27ce-dedcff-433bff`, Light Default, Inter Font | [`src/index.css`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/index.css), [`dashboard.css`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/watermelon/astrix-dashboard/dashboard.css) | Global (`:root`, `.astrix-dashboard`) |
| **Engineering Rules & Gates** | Section 0.5, §2, §5.9, §5.10, §5.15 | [`src/lib/rules.ts`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/lib/rules.ts), [`src/lib/rules.test.ts`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/lib/rules.test.ts) (33/33 tests pass) | Shared Utility |
| **Feature Gating** | Rule 2: Unbuilt features not rendered | [`src/lib/features.ts`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/lib/features.ts) | Core System |
| **Inert Crack Illustration** | Rule 9: SVG `aria-hidden`, no focus traps, captioned "Illustration" | [`src/components/ui/crack-detection-illustration.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/ui/crack-detection-illustration.tsx) | `/`, `/login`, `/register` |
| **Home Page (Part 1)** | Sticky nav, 60-30-10 hero, 4-statement strip, 3 why cards, 4-step workflow + 8-stage disclosure, 6 features, scope, 5 roles, trust, datasets, 6 FAQs | [`src/pages/landing.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/landing.tsx) | `/` |
| **Split-Screen Auth Layout** | Part 2.2: Desktop split (left form, right brand panel), mobile form card | [`src/components/auth/auth-layout.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/auth/auth-layout.tsx) | Auth Routes |
| **Login** | OAuth provider gating, show/hide pass, generic errors, lockout, session-expired notice | [`src/pages/auth/login.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/login.tsx) | `/login` (alias `/signin`) |
| **Register** | Requested role (excludes Admin), 12-128 char meter, non-enumerating, `pending_approval` | [`src/pages/auth/register.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/register.tsx) | `/register` |
| **Forgot / Reset Password** | 3/hr rate-limiting, token validation (valid/expired/used/invalid), session clearing | [`src/pages/auth/forgot-password.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/forgot-password.tsx), [`src/pages/auth/reset-password.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/reset-password.tsx) | `/forgot-password`, `/reset-password` |
| **Verify Email / Accept Invite** | URL token verification with resend button; read-only org/role on invitation | [`src/pages/auth/verify-email.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/verify-email.tsx), [`src/pages/auth/accept-invitation.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/accept-invitation.tsx) | `/verify-email`, `/accept-invite` |
| **Two-Factor / Error Pages** | 6-digit OTP code, idle warning at 28m / logout at 30m, 403 access denied, 404 not found | [`src/pages/auth/mfa.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/mfa.tsx), [`src/pages/auth/access-denied.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/auth/access-denied.tsx), [`src/pages/not-found.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/not-found.tsx) | `/two-factor`, `/403`, `/404` |
| **Legal & Support Pages** | Real Privacy Notice, Terms of Use, Accessibility Statement, and Contact | [`src/pages/legal/privacy.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/legal/privacy.tsx), [`terms.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/legal/terms.tsx), [`accessibility.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/legal/accessibility.tsx), [`contact.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/legal/contact.tsx) | `/privacy`, `/terms`, `/accessibility`, `/contact` |
| **Astrix Dashboard Shell (Part 3)** | shadcn astrix block, collapsible sidebar, Ctrl/Cmd+K search palette, notification popover, avatar menu | [`astrix-dashboard.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/watermelon/astrix-dashboard/astrix-dashboard.tsx), [`topbar.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/watermelon/astrix-dashboard/components/astrix/topbar.tsx), [`command-palette.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/command-palette.tsx) | `/app/*` |
| **Inspection Pipeline Board** | Live count nodes, dotted canvas card, green "Live" (<60s) / grey "Stale" indicator | [`src/components/dashboard/inspection-pipeline-board.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/inspection-pipeline-board.tsx) | Embedded in Dashboards |
| **Review Queue** | Astrix classification queue analogue: server search, filter pills with counts, sortable table | [`src/pages/review-queue.tsx`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/pages/review-queue.tsx) | `/app/review` |
| **Inspector Dashboard** | 4 tiles, My inspections table with pagination, pending review list, rejected uploads, defect chart | [`InspectorDashboard`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/role-dashboards/inspector-dashboard.tsx) | `/app/dashboard` (role: inspector) |
| **Civil Engineer Dashboard** | Awaiting review, confirmed/corrected/rejected counts, Review Queue stream, px vs mm measurements | [`CivilEngineerDashboard`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/role-dashboards/engineer-dashboard.tsx) | `/app/dashboard` (role: engineer) |
| **Manager Dashboard** | 6 overview cards, reviewed-only findings, damage trends, hotspot region table, maintenance progress | [`InfrastructureManagerDashboard`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/role-dashboards/manager-dashboard.tsx) | `/app/dashboard` (role: manager) |
| **Maintenance Dashboard** | Work order tiles, interactive status/due date updates, Urgent review alert banner (assumed) | [`MaintenanceEngineerDashboard`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/role-dashboards/maintenance-dashboard.tsx) | `/app/dashboard` (role: maintenance) |
| **Administrator Dashboard** | Inline user approvals (Approve/Reject with real modals), user invite dialog, model registry, audit log feed, platform health targets | [`AdministratorDashboard`](file:///D:/project/aiml%20prime/project/infosys/frontend/src/components/dashboard/role-dashboards/admin-dashboard.tsx) | `/app/dashboard` (role: admin) |
| **CSV Export** | Real CSV export download button in Astrix header based on selected date range | Handled via `api.exportDashboardCsv` | Header Export Button |

---

## 5. Security & Architectural Decisions

1. **Tokens in Memory Only:** In compliance with Section 7 security requirements, JWT access tokens are kept in memory only (`src/store/auth-context.tsx`). No tokens or sensitive credentials are ever stored in `localStorage` or `sessionStorage`. Refresh tokens use HttpOnly, SameSite cookies.
2. **Cross-Tab Sign-Out:** Uses HTML5 `BroadcastChannel('infrascan_auth_channel')` so that terminating a session in any tab immediately invalidates and terminates all open tabs.
3. **No User Enumeration:** The login, register, and forgot password endpoints return consistent generic responses and equalized response timings regardless of whether the submitted email address exists.
4. **Append-Only Audit Logging:** Administrative actions (model deployments, rollbacks, and account status modifications) write append-only records with actor, timestamp, IP address, and details. Secrets are never logged.
5. **Real-Product Honesty:** No invented client logos, testimonials, demo buttons, or dead `#` links. All data flows from the typed API contract in `src/lib/api.ts`.
6. **Accessibility & WCAG 2.1 AA:** Full keyboard support, high contrast light default with Realtime Colors palette, 3px focus rings, semantic HTML structure with single `h1` per page, and screen-reader announcements.
