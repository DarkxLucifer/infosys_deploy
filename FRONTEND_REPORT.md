# InfraScan — Frontend Report

**Project:** InfraScan — AI-Powered Crack & Damage Assessment for Civil Infrastructure
**Location:** `project/infosys/frontend`
**Date:** October 20, 2026

---

## 1. What this is

A complete, fully functional **frontend-only** implementation of the InfraScan product:

- A marketing **landing page** (modern SaaS style — no pricing anywhere, per requirements).
- A **sign-in** screen with five seeded demo personas.
- A full **engineer console (dashboard)** covering the whole inspection lifecycle:
  asset register → capture → AI analysis → engineer review → escalation/maintenance → reports.

The app is a **standalone functional demo**. There is no backend: all state lives in a typed
React store persisted to `localStorage`, and every workflow — including the AI-pass
simulation, PDF/CSV/JSON generation and role switching — actually works end-to-end.

The 10 wireframe screens supplied in the project were used **only as design inspiration**
(structure, data, labels); the visual design, layout and styling are original
(InfraScan navy/blue palette, NOT the wireframe CSS).

---

## 2. How to run

```bash
cd project/infosys/frontend
npm install          # already installed in this workspace
npm run dev          # dev server (http://localhost:5173)
npm run build        # tsc -b && vite build  → dist/
npm run preview      # serve the production build
```

- Verified: `npm run build` compiles clean under the project's strict TypeScript settings
  (`noUnusedLocals`, `verbatimModuleSyntax`, etc.).
- No Python/runtime dependencies. (The workspace `.venv`/`uv` rules don't apply here.)

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + TypeScript 6 (strict) |
| UI | React 19 |
| Styling | Tailwind CSS v4 (`@theme inline` tokens in `src/index.css`) |
| Components | shadcn/ui (Radix primitives, 25 components) |
| Dashboard shell | `astrix-dashboard` block from the Watermelon registry, **re-written** for InfraScan |
| Routing | react-router-dom v7 |
| Icons | lucide-react |
| Toasts | sonner |
| State | Custom React context store (`src/store/app.tsx`) — no external state lib |

**Design tokens** (`src/index.css`): navy ink `#17293D`, action blue `#1C528F`, mist
background `#F5F7FA`, hairline `#DEE6ED`, plus status accents
(success/warning/destructive/danger-soft) shared by every page and the SVG frame renderer.

---

## 4. Architecture

```
src/
├─ main.tsx                      BrowserRouter → App
├─ App.tsx                       Route table + guards + <Toaster/>
├─ store/app.tsx                 THE single source of truth (types, seeds, actions)
├─ pages/
│  ├─ landing.tsx                Marketing site
│  └─ signin.tsx                 Persona picker
├─ components/
│  ├─ dashboard/                 Console pages
│  │  ├─ page-shell.tsx          PageShell/PageHeader/StatCard/ComplianceNote/MetaItem
│  │  ├─ assets.tsx              Register + NewAssetDialog
│  │  ├─ asset-detail.tsx        Record, KPIs, work orders, findings, history
│  │  ├─ inspections.tsx         Survey list (search/filter)
│  │  ├─ inspection-new.tsx      Capture staging form (<- ?asset= prefill)
│  │  ├─ inspection-detail.tsx   Run AI / processing / frames / findings / history
│  │  ├─ analysis-detail.tsx     Engineer review workbench (+ work orders)
│  │  ├─ maintenance.tsx         Work-order board (status flow, manual orders)
│  │  └─ settings.tsx            Org, confidence gate, automation, model registry
│  ├─ inspection/crack-frame.tsx Deterministic synthetic frame renderer (SVG)
│  ├─ watermelon/astrix-dashboard/  Adapted dashboard shell (sidebar/topbar/overview/…)
│  └─ ui/                        shadcn primitives
└─ lib/report-download.ts        Real PDF / CSV / JSON builders + download trigger
```

### 4.1 The store (`src/store/app.tsx`)

A `nitro-free`, hand-rolled context store. Highlights:

- **Domain types**: `Asset`, `Inspection` (frames + findings + progress), `Finding`
  (bbox, confidence, `mmPerPx`, px↔mm `measurements`, review state), `WorkOrder`,
  `GeneratedReport`, `ModelCard`, `Settings`, `User/Role`, notifications.
- **Damage taxonomy**: `D00` hairline, `D10` longitudinal, `D11` alligator, `D20`
  spalling/fragment, `D40` lateral, `D50` block — with severity thresholds on crack width
  (`<0.5 mm → low`, `<3 mm → medium`, `<10 mm → high`, otherwise **critical**).
- **Seeded demo data** mapped from the wireframes: 6 assets (BR-018, BR-031, TU-2042,
  RD-1142, RW-0081, ST-0910), inspections INSP-017…INSP-028 (incl. the July baseline
  INSP-017 vs. current INSP-024 pair on BR-018 and the escalated INSP-019 → MW-021),
  3 work orders, 4 reports, 3 models, 5 personas.
- **Actions** (all functional, all persisted): `signIn/signOut`, `registerAsset`,
  `updateAsset`, `createInspection`, `runAnalysis` (timed pipeline, progress ticker),
  `addFinding`, `reviewFinding`, `deleteFinding`, `escalateInspection`,
  `signOffInspection`, `generateReport`, `createWorkOrder`, `updateWorkOrder`,
  notification dismiss, `updateSettings`, plus `assetById`/`inspectionById` helpers.
- **Persistence**: whole state ↔ `localStorage` under `infrascan-state-v1`
  (exported `STORAGE_KEY`). Inspections caught mid-processing resume and finalize after a
  reload, so navigation/reload never bricks the queue.
- **Confidence gate** (`settings.confidenceGate`, default 0.65) filters generated findings;
  a floor rule keeps the strongest detection so review always has material in the demo.

### 4.2 Simulated capture frames (`src/components/inspection/crack-frame.tsx`)

There are no real photographs. `CrackFrame` renders a **deterministic SVG scene** from a
numeric seed (mulberry32 RNG): concrete texture/aggregate/patch shadows + a crack
polylines tree with three view modes (**annotated** with class/confidence chips,
**segmentation mask**, **severity heat**). `FrameCard` (method badge, timestamp, mode
toggle) and `FrameClassStrip` are used on every inspection/analysis surface — and on the
landing hero for a real "product console" look. Bounding boxes are clickable and highlight
the selected finding.

### 4.3 Real file generation (`src/lib/report-download.ts`)

`buildReportBlob` produces **genuine files** (no print-hacks):

- `integrity` → real PDF (hand-rolled PDF 1.4 with xref, Helvetica, paginated lines),
- `audit` → CSV of the inspection log,
- `findings` → JSON dataset export,
- `maintenance` → PDF summary of work orders.

`triggerDownload(blob, name)` saves them; the Reports page is wired to it, as is
"Download certificate" on inspection/analysis pages.

---

## 5. Routes & feature walkthrough

| Route | Page | Works because of |
|---|---|---|
| `/` | Landing | hero console fed by real store data (INSP-024), bento (measurement delta 0.11→0.36 mm), pipeline diagram, model cards, FAQ, CTA; **no pricing** |
| `/signin` | Persona picker | 5 seeded users w/ roles → `signIn()` → `/dashboard`; auto-redirect if a session exists |
| `/dashboard` | Overview | `DashboardContent` (store-derived KPIs, pipeline, priority alerts, exportable report) |
| `/dashboard/assets` | Register | search + type filter, **Register asset** dialog (validated ID pattern `XX-###`, uniqueness) → detail |
| `/dashboard/assets/:id` | Asset record | KPIs, open work orders, top findings (→ shows up in review with the finding pre-selected), full inspection history, editable condition/notes |
| `/dashboard/inspections` | Surveys | status filter + search, deep links per status (review/prepare/detail) |
| `/dashboard/inspections/new` | New capture | asset select (prefilled via `?asset=`), method cards (drone/walkdown/vehicle), frame count, optional frame labels + notes, live simulated preview → creates INSP |
| `/dashboard/inspections/:id` | Inspection | **Run AI analysis** (5s simulated pipeline w/ stage panel; page is the processing monitor when you return), overview timeline, frames grid, findings table, **History tab** with baseline side-by-side comparison + mm deltas |
| `/dashboard/analysis` | Queue | store-driven queue (segments, search, pagination) — reused Astrix component |
| `/dashboard/analysis/:id` | Review workbench | frame grid with selection sync, per-finding **Confirm / Flag-with-note / Discard**, measurements, decision-progress bar, **Raise work order** dialog (priority auto from severity), **Escalate**, **Sign off review** (bulk-confirms the rest → `reviewed`) |
| `/dashboard/reports` | Reports | 4 generator cards (integrity/audit/findings/maintenance) with **real downloads**, per-row re-download, filters |
| `/dashboard/maintenance` | Board | priority-sorted orders, status Flow dropdown (open→scheduled→in-progress→closed), overdue/7-day KPIs, **manual order** dialog |
| `/dashboard/settings` | Admin | org profile, retention, **confidence gate** select, auto-priority work-order checkbox, model registry with metric bars, demo-data reset |

Chrome (sidebar/topbar) is the adapted Astrix shell: active-link bridging to the router,
live "Analysis" badge (awaiting-review count), demo-database compliance chip, working
**⌘/Ctrl-K search** across assets+inspections, notifications dropdown, sign-out.

**Safety boundary** ("AI priorities are recommendations. Qualified personnel must validate
repairs…") appears on the analysis workbench, asset detail, inspection detail, overview,
maintenance and settings — matching the wireframe spec.

---

## 6. Workflow simulation semantics

1. New inspection is staged (`in-progress`, frames pre-registered).
2. **Run AI analysis** → `processing` with progress ticker (capture intake → quality &
   flattening → UNet segmentation → morphology & measurement → severity scoring).
3. After ~5s (`finishAnalysis`): findings are generated deterministically per frame,
   filtered by the config-confidence gate, status → `awaiting-review`, notification
   created. Reload mid-pass resumes + finalizes reliably.
4. Engineer review: every finding gets **confirmed / flagged (with note) / discarded**;
   sign-off flips the inspection to `reviewed` and stamps reviewer+time on pending items.
5. Escalation (from a high/critical review) sets `escalated` + reason and mirrors
   INSP-019's flow into maintenance (work order MW-021 in the seed).
6. Reports generate in-register (`RPT-###`) and download as real files.

---

## 7. Notable implementation details

- **No pricing anywhere** (verified across landing, app copy and report generators).
- Astrix block files substantially rewritten (median: `navigation.tsx` bridging to the
  router, `shared.tsx` InfraScan badge set, `pipeline-sample.tsx` native-SVG pipeline,
  dashboard tokens re-mapped to InfraScan hex) — the block is a *shell*, not a theme copy.
- Strict TS `verbatimModuleSyntax` honored (`import type` everywhere).
- `erasableSyntaxOnly` honored (no enums/namespaces).
- The store intentionally exposes actions as stable callbacks; overview counters derive
  from the store so KPIs stay live while processing runs (350 ms tick).
- Demo reset: Settings → "Reset demo data" clears `STORAGE_KEY` and reloads.

## 8. Extension points

- Swap the store's simulated `runAnalysis`/`seedFindingForFrame` for a real API (the
  action signatures are the service contract).
- Replace `CrackFrame` SVG sources with real frame rasters keyed by `Frame.seed`.
- Roles are display-level today; add permission gating where `session.role` is read.
