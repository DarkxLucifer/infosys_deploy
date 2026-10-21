# InfraScan: Test Accounts & Seed Credentials

All accounts are pre-seeded in `infrascan_dev.db` with active, verified status.

**Universal Test Password**: `TestPass123!@#`

---

## Master Role Test Accounts

| Role | Email | Password | Full Name | Organization | Default Landing Route | Key Permissions |
|---|---|---|---|---|---|---|
| **Administrator** | `admin@infrascan.local` | `TestPass123!@#` | Lead Administrator | InfraScan Enterprise (Org 1) | `/app/admin` | User provisioning, audit logs, model registry, platform health |
| **Infrastructure Inspector** | `inspector@infrascan.local` | `TestPass123!@#` | Primary Inspector | InfraScan Enterprise (Org 1) | `/app/dashboard` (Inspector) | Asset registration (pending), inspection intake, image upload, scale calibration, submit for review |
| **Civil Engineer** | `engineer@infrascan.local` | `TestPass123!@#` | Lead Civil Engineer | InfraScan Enterprise (Org 1) | `/app/dashboard` (Engineer) / `/app/review` | Triage queue, defect verification, polyline/polygon annotation, severity override, report sign-off |
| **Infrastructure Manager** | `manager@infrascan.local` | `TestPass123!@#` | Regional Manager | InfraScan Enterprise (Org 1) | `/app/dashboard` (Manager) | Portfolio KPIs, GIS damage map, work order creation, report export |
| **Maintenance Engineer** | `maintenance@infrascan.local` | `TestPass123!@#` | Maintenance Specialist | InfraScan Enterprise (Org 1) | `/app/maintenance` | Work order execution, SLA tracking, status transition (`open` -> `in_progress` -> `closed` with note) |

---

## Secondary Field Inspectors & Tenant Isolation Accounts

| Role | Email | Password | Full Name | Organization | Purpose |
|---|---|---|---|---|---|
| **Field Inspector 2** | `arjun.nair@infrascan.local` | `TestPass123!@#` | Arjun Nair | InfraScan Enterprise (Org 1) | Field assignment testing |
| **Field Inspector 3** | `priya.raghavan@infrascan.local` | `TestPass123!@#` | Priya Raghavan | InfraScan Enterprise (Org 1) | Multi-inspector concurrency testing |
| **Tenant 2 Administrator** | `admin@metro-infra.org` | `TestPass123!@#` | Metro Admin | Metro Infrastructure Authority (Org 2) | Multi-tenant cross-org data isolation (IDOR) tests |

---

## Seeding & Resetting

To reset or re-seed reference taxonomy and initial users:
```powershell
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli seed
```
