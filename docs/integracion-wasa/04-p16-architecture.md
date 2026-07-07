# Architecture Overview

## System Context
- Repository: `P16-DHE-Admin-Web`
- Frontend: Next.js 16 (App Router), React 19, Tailwind v4
- Backend: Laravel 13, Sanctum auth, permission middleware
- Runtime model: API-first admin panel consuming `/api/*`

## Top-Level Structure
```text
P16-DHE-Admin-Web/
├── api/                      Laravel backend
├── frontend/                 Next.js admin app
│   ├── src/app/              App Router routes
│   │   ├── (admin)/          Protected admin group
│   │   └── login/            Public login route
│   ├── src/components/       Shared UI and infra components
│   └── src/lib/              Auth, API client, types, helpers
└── docs/                     Operational and delivery docs
```

## Frontend Architecture

### 1) Routing and Layout
- Root layout: `frontend/src/app/layout.tsx`
- Providers composition: `frontend/src/components/providers.tsx`
- Admin shell (sidebar/topbar/palette): `frontend/src/app/(admin)/layout.tsx`
- Main modules:
  - `/` dashboard
  - `/pedidos`, `/clientes`, `/conductores`, `/pagos`
  - `/reportes`, `/usuarios`, `/auditoria`, `/metricas`
  - `/rutas` con tablero por estados + centro de monitoreo activo

### 2) Cross-Cutting Providers
- `AuthProvider` (`src/lib/auth.tsx`)
  - stores bearer token in `localStorage` and cookie (`dhe_auth_token`)
  - resolves session via `GET /api/me`
- `ThemeProvider` (`src/lib/theme.tsx`)
  - toggles `[data-theme="dark"]` for global dark mode
- `ToastProvider` (`src/components/toast.tsx`)
  - user feedback for success/error/network events
- `ErrorBoundary` (`src/components/error-boundary.tsx`)
  - catches runtime render errors
- `OfflineBanner` (`src/components/offline-banner.tsx`)
  - network online/offline state via `useSyncExternalStore`

### 3) Data Access Pattern
- API client abstraction: `src/lib/api.ts`
  - `apiGet<T>(path)`
  - `apiSend<T>(path, method, body)`
- Authenticated transport: `fetchWithAuth` from `src/lib/auth.tsx`
- Contract typing: `src/lib/types.ts`

### 4) UI and State Model
- Each page manages local query state (`filters`, `page`, `loading`, `error`).
- Reusable presentation primitives:
  - `Skeleton`
  - `Pagination`
  - `PrintReceiptButton`
  - `CommandPalette`
- Mobile-first behavior implemented with responsive Tailwind classes.

### 5) Styling and Theme
- Global tokens in `frontend/src/app/globals.css`
- Dark mode strategy:
  - core variables (`--background`, `--foreground`, `--surface`, `--border`)
  - fallback compatibility selectors for legacy utility classes
- Font stack is local-only (no external runtime font fetch dependency).

## Backend Integration Model
- Auth: Sanctum bearer token
- Permissions: route-level permission middleware (`shipments.*`, `users.*`, `reports.*`, etc.)
- Frontend consumes JSON DTOs and CSV exports from backend routes
- Pagination shape normalized with `PaginatedResponse<T>`

## Driver Mobile Integration
- External consumer: `P15-DHE-App-Repartidor`, authenticated with Sanctum bearer token.
- Primary source of truth: `GET /api/driver/operational-state`.
- Legacy fallback: `GET /api/driver/my-route` + `GET /api/driver/assigned-shipments`.
- Domain split:
  - `route`: salida abierta y navegable actual.
  - `route_day`: resumen agregado del dia del piloto.
  - `assigned_shipments`: paquetes asignados aun no enroutados.
- Continuity model:
  - the driver can finalize an open route;
  - pending stops return to the driver's tray;
  - completed stops stay preserved in the same-day history;
  - new shipments can reopen the same operational day without breaking the app flow.
- Live tracking: `POST /api/driver/location` stores the latest driver position for admin monitoring.
- Admin monitoring UX:
  - `frontend/src/app/(admin)/rutas/page.tsx` separa kanban operativo y monitoreo vivo;
  - las rutas activas se enfocan en un panel central de seguimiento;
  - el estado de salud (`sin geo`, `ubicacion vencida`, `trazo aproximado`) se eleva a señal operativa visible.
- Delivery closure:
  - primary contract: `POST /api/routes/{route}/stops/{stop}/resolve`
    - resolves shipment status,
    - persists optional evidence,
    - records COD collection fields,
    - and completes the stop atomically;
  - legacy fallback:
    - `POST /api/shipments/{id}/status`
    - then `POST /api/routes/{route}/stops/{stop}/complete`.
- Route closure: `POST /api/routes/{route}/finalize` returns non-completed shipments to `assigned_to_route` and closes or deletes the route according to completed-stop history.
- Status guardrail: if the app delivers a shipment still in `assigned_to_route`, the API normalizes the valid chain `assigned_to_route -> in_transit -> delivered` instead of throwing a server error.
- Retry guardrail: if the shipment already reached `delivered` or `issue` before the stop was marked complete, `resolve` still closes the pending stop and reconciles the route instead of failing on an invalid repeated transition.
- Audit model: every status change continues to create shipment events, so operational history remains traceable even when the mobile flow skips the explicit `in_transit` action.

## Reliability and Quality
- Lint + typecheck + build required before release
- E2E smoke suite with Playwright (`frontend/e2e/smoke.spec.ts`)
- CI workflow: `.github/workflows/frontend-ci.yml`

## Operational Notes
- Some UI flows intentionally include graceful fallback behavior:
  - unassigned shipment fetch strategy in driver detail
  - resilient empty/error states in dashboard, drivers, audit log
- All production-facing modules include dark-mode compatibility.
