# Capture Field Photos Page Notes & Component Inventory

## 1. Route & Context
- **Route**: `/app/inspections/new`
- **Component**: `InspectionNewPage` in `frontend/src/components/dashboard/inspection-new.tsx`
- **Workflow Step**: "Step 2 of 2: Photo Capture"
- **User Role**: Primary workflow for `Infrastructure Inspector` (`inspector@infrascan.local`), accessible also to Engineers and Administrators.

## 2. Component Inventory & UI Tokens

### Layout & Shell
- `PageShell` and `PageHeader` from `frontend/src/components/dashboard/page-shell.tsx`.
- Dark-mode Astrix theme using semantic tokens (`bg-card`, `bg-muted`, `border-border`, `text-primary`, `text-muted-foreground`, `text-foreground`).
- 2-column responsive layout: `lg:col-span-3` (Photo capture grid and actions) + `lg:col-span-2` (Side info cards and statutory notice).

### Photo Card (`PhotoCard`)
- Container: Rounded card (`rounded-xl overflow-hidden border border-border bg-card group`).
- Image element: Aspect ratio `aspect-video object-cover`.
- Badges:
  - Status badge (currently simple string status).
  - Source badge (`Camera`, `Upload`, `Mobile`).
  - GPS caption bar (`absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 font-mono text-[10px] text-primary/90`).
- Remove button: Absolute positioned icon button (`size-6 rounded-full bg-destructive/80 text-white`).

### Dropzone & Input Controls
- Empty state dropzone: `rounded-2xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/40 p-12`.
- Grid "Add more" tile: `rounded-xl border-2 border-dashed border-border aspect-video`.
- Hidden file inputs: `<input type="file" accept="image/*" multiple />`.
- Camera modal: `CameraCaptureModal` using native `navigator.mediaDevices.getUserMedia` and canvas snapshot.

### Buttons & Navigation
- Source triggers: `Take Photo` (primary button), `Upload Files` (outline button), `Mobile Cam` (card-styled label).
- Action buttons: `Skip & Open Workspace` (`variant="outline"`), `Done — Open Inspection` (`variant="default"` with check icon).

### Side Panels
- `Inspection Created` card: summary with ID, Asset, Method, Status.
- `Photo Quality Guide` card: bullet list of requirements and pixel-versus-mm calibration notice.
- `ComplianceNote`: Statutory engineering gate disclaimer.

### Feedback & Notification
- Toast: `sonner` (`toast.success()`, `toast.error()`, `toast.warning()`).
- Badges: `Badge` from `components/ui/badge`.
- Dialogs: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter` from `components/ui/dialog`.

## 3. Allowed Changes Plan
- Upgrade `PhotoCard` to `ImageQualityCard` with dual status badges (`QualityBadge` and `ProcessingBadge`).
- Ensure contrast on badges and GPS overlay is >= 4.5:1.
- Add one-line assessment/processing message under each thumbnail.
- Add `Details` button and `⋯` context menu (Replace, Remove, Calibrate, Retry).
- Add `ImageDetailsDrawer` sheet with Quality, Preprocessing, and Metadata tabs.
- Add `ImageCompare` viewer with Original / Processed / Compare slider.
- Add `BatchSummaryCard` in right column.
- Turn bottom text into live `status line` driving the state of the two action buttons.
- Connect `PhotoQualityGuide` to dynamic limits from `/api/v1/config/image-limits`.
