# Changelog

All notable changes are documented in this file.

## 2026-06-09

### Added
- Renamed 'Conductor' to 'Piloto' across entire admin (sidebar, pages, modals, forms, reports, command palette)
- Soft delete (trash) for Users with restore functionality
- Soft delete (trash) for Drivers/Pilotos with restore functionality
- Delete button in data tables and edit modals
- Confirmation modal before deletion
- Permission `drivers.delete` added to seeder
- Migration: `soft_deletes` column on users table
- User model: `SoftDeletes` trait
- UserController: destroy, trashed, restore methods
- API routes: DELETE, trashed, restore for users and drivers
- `apiSend` helper supports DELETE method
- CI: permission seeder added to automatic cPanel deploy

### Changed
- Labels visible on all forms (pilots + users)
- Driver creation now includes email + password for app access

---

## 2026-05-20

### Added
- Complete Financial Module (Phase A):
  - Fixed expenses management (CRUD)
  - Employee/payroll management
  - Driver payouts tracking
  - COD settlement and conciliation
  - Daily profit calculator
  - Financial dashboard with KPIs
- MySQL hardening audit
- NPM security: `.npmrc` with `ignore-scripts=true`
- PostCSS vulnerability fix (CVE-2026-41305)

### Changed
- Backend tests expanded from ~118 to 179 tests / 624 assertions
- API endpoints expanded from ~76 to 116 routes

---

## 2026-05-13

### Added
- New admin modules and routes:
  - `/usuarios` (CRUD + roles integration)
  - `/auditoria` (audit log view with filters and metadata inspection)
  - `/metricas` (operational KPI dashboard)
- E2E smoke suite with Playwright:
  - login
  - dashboard
  - usuarios + reportes
  - command palette
- E2E regression suite with Playwright:
  - conductores board/detail
  - auditoria filters + metadata JSON
  - pagos sections
  - configuracion sections
- Delivery docs:
  - guided demo
  - operations playbook
  - E2E runbook
  - module closeout report

### Changed
- Dashboard:
  - auto-refresh + real API-based blocks
  - improved action flows and status UX
- Reportes:
  - backend-powered CSV export endpoints
  - date-range filters wired to stats and exports
- Conductores:
  - stronger detail flow (`/conductores/[id]`)
  - improved assignment flow + UI robustness
  - dark mode hardening
- Auditoria:
  - action/user/date filters
  - metadata JSON expand/collapse
- Technical hardening:
  - offline banner made SSR/hydration-safe
  - external font dependency removed to guarantee offline build stability
  - fixed backend audit route request typing (`/api/audit-logs`) to prevent 500 in real UAT
  - `.gitignore` updated for Playwright artifacts

### Quality
- Frontend checks passing:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- CI workflow added:
  - `.github/workflows/frontend-ci.yml`
  - includes lint, typecheck, build, playwright smoke
- Staging/UAT and operational docs:
  - `docs/operations/STAGING-UAT-CHECKLIST.md`
  - `docs/operations/OBSERVABILITY-RUNBOOK.md`
  - `docs/security/PERMISSION-VERIFICATION-MATRIX.md`
