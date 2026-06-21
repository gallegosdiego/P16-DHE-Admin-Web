# Changelog

All notable changes are documented in this file.

## 2026-06-21 - Contrato de auditoría y filtros reales

### Changed
- `/api/audit-logs` ahora filtra en backend por `search`, `action`, `user_id`, `date_from` y `date_to`.
- El endpoint ordena por `occurred_at` y limita `per_page` a un máximo de `100`.
- La vista `/auditoria` envía filtros al API en vez de filtrar únicamente la página cargada.
- El inspector de auditoría muestra `old_values/new_values`, que son los campos reales de la tabla `audit_logs`.

### Fixed
- `AuditLog::log()` ya no guarda `old_values/new_values` con `json_encode`; deja que los casts JSON de Laravel persistan arrays reales.
- El mock E2E de auditoría fue alineado con el contrato real del backend.
- La ruta temporal `/drivers/debug-juan` quedó limitada a entornos `local` y `testing`, fuera de producción.

### Quality
- Agregada prueba backend para filtros de `/api/audit-logs` y exposición de cambios JSON.
- Validado en `dev` con PHP lint, PHPUnit focalizado, TypeScript, ESLint y regression E2E de auditoría.
- Estado de despliegue: commit subido a `origin/dev`; `main` no fue modificado.

---

## 2026-06-19 — Eliminación de pedidos + Monitor de rutas

### Backend
- `ShipmentController::destroy()` — Hard delete con protección financiera (bloquea si `settlement_id` o `payout_id` existen)
- `ShipmentController::batchDestroy()` — Nuevo endpoint `POST /shipments/batch-delete` para eliminación masiva (máx 50)
- Ruta registrada con middleware `permission:shipments.delete`
- CASCADE elimina automáticamente `shipment_events` y `route_stops`; se recalculan métricas de ruta

### Frontend Panel Admin
- **Pedidos:** Botón rojo "Eliminar" en barra de acciones batch con confirmación y feedback de envíos omitidos por liquidación financiera
- **Rutas:** Simplificado a "Monitor de Rutas" — eliminada sidebar de pedidos por enrutar y creación de rutas; Kanban a ancho completo con auto-refresh 30s

### Documentación
- Nuevo documento canónico: `docs/arquitectura/flujo-pedidos-rutas.md` v2.0
- Actualizado `docs/arquitectura/plataforma-general.md` a v1.3 con referencia cruzada

---

## 2026-06-17

### Added
- Closeout documentation for the pilots module review, app access persistence, and Danhei/Angel visual line:
  - `docs/updates/PILOTOS-REVISION-CIERRE-2026-06-17.md`

### Changed
- Pilots module now shows app email consistently in cards, detail modal, and detail page.
- Pilot app access updates support legacy driver/user links.
- Driver app role assignment is normalized for `web` and `sanctum` guards.
- Admin icons in pilots, users, and payments were aligned to the Danhei/Angel visual language with sober SVG/status indicators instead of visible emojis.

### Fixed
- Pilot app access can be persisted from production form posts using `POST /api/drivers/{driver}` fallback with `_method=PUT`.
- Pilot edit errors now surface the backend message instead of a generic failure.
- Pilot delete now supports `POST /api/drivers/{driver}/delete` for production servers that block direct `DELETE` requests.
- Production seed permissions now include `drivers.delete` and explicitly sync full permissions for `superadmin`.
- Pilot edits now repair legacy user links by syncing `users.driver_id` when only `drivers.user_id` existed.

---

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
  - `/auditoria` (audit log view with filters and change inspection)
  - `/metricas` (operational KPI dashboard)
- E2E smoke suite with Playwright:
  - login
  - dashboard
  - usuarios + reportes
  - command palette
- E2E regression suite with Playwright:
  - conductores board/detail
  - auditoria filters + audit change JSON
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
  - `old_values/new_values` JSON expand/collapse
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
