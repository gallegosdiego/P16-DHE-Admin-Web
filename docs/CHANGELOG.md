# Changelog

All notable changes are documented in this file.

## 2026-06-30 - Hotfix entrega COD desde app piloto

### Fixed
- `POST /api/shipments/{id}/status` ya no falla con error `500` cuando la app piloto intenta entregar un pedido COD que todavía está en `assigned_to_route`.
- El backend normaliza el cierre móvil aplicando primero `assigned_to_route -> in_transit` y luego `in_transit -> delivered`, conservando el flujo auditado de estados.
- La entrega COD mantiene `cod_collected_amount`, `cod_payment_method`, `cod_collected_at` y el cierre financiero en `collected`.

### Quality
- Agregada regresión para entrega COD directa desde ruta asignada.
- Validado con suite completa backend: `215` pruebas y `758` aserciones.
- Documento operativo: `docs/updates/HOTFIX-ENTREGA-COD-ASSIGNED-ROUTE-2026-06-30.md`.

---

## 2026-06-25 - Retiro de automatismos cPanel

### Changed
- `.cpanel.yml` queda limitado al deploy manual de cPanel: copia archivos `api/` hacia `/home/danheiex/api.danheiexpress.com/` y ejecuta solo el parche COD idempotente.
- Se retiro el workflow `deploy-api` de GitHub Actions para evitar intentos automaticos de deploy a cPanel.
- Agregado `api/scripts/repair-cod-schema.php` para crear unicamente las columnas COD faltantes durante `Desplegar commit HEAD`.

### Removed
- Eliminado `api/deploy-fix.php`.
- Eliminado el comando temporal `dhe:repair-cod-schema`.
- El deploy de cPanel ya no ejecuta `composer`, `artisan`, migraciones generales, caches ni seeders.

---

## 2026-06-25 - Recaudo COD desde app piloto

### Added
- Nueva migracion para registrar recaudo real de contra entrega:
  - `cod_collected_amount`
  - `cod_payment_method`
  - `cod_collected_at`
- `POST /api/shipments/{id}/status` ahora acepta monto y metodo COD cuando el piloto entrega un envio `cash_on_delivery`.
- `GET /api/driver/my-route` retorna campos de recaudo COD para que la app movil pueda mostrar lo cobrado.

### Changed
- El flujo movil de piloto debe registrar COD durante la entrega, no mediante `/api/financial/shipments/{id}/collect`.
- Si un pedido COD fue creado con `cod_amount = 0` y el piloto ingresa un monto real, el backend actualiza tambien `cod_amount` para mantener compatibilidad con reportes financieros existentes.
- `completeStop()` conserva el comportamiento de marcar COD como recaudado cuando una parada se completa directamente.

### Quality
- Validado con PHP lint en controladores/modelo/migracion modificados.
- Validado con:
  - `php artisan test --do-not-cache-result --filter=ScopedEndpointTest`
  - `php artisan test --do-not-cache-result --filter=FinancialTest`
  - `php artisan test --do-not-cache-result --filter=FinancialEdgeCaseTest`
  - `php artisan test --do-not-cache-result --filter=RouteTest`

### Hotfix post-deploy
- `/api/driver/my-route` ya no selecciona `financial_status` para el payload movil, evitando fallos por datos heredados como `pending_collection` o `none`.
- `/api/driver/my-route` selecciona los campos nuevos COD solo si la base ya tiene esas columnas.
- Las escrituras COD verifican si las columnas nuevas existen antes de usarlas; si no existen, no tumban la entrega/ruta.
- `/api/deploy-check` ahora expone `database.cod_collection_ready` para confirmar si la migracion COD quedo aplicada.

---

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
