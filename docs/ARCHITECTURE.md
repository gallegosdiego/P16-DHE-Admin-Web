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
- Route source of truth: `GET /api/driver/my-route`, scoped to the authenticated driver's active/planned route.
- Delivery closure: the mobile app closes a stop in two backend steps:
  - `POST /api/shipments/{id}/status` with `status = delivered`, optional evidence photo, and COD collection fields.
  - `POST /api/routes/{route}/stops/{stop}/complete` to complete the route stop.
- Status guardrail: if the app delivers a shipment still in `assigned_to_route`, the API normalizes the valid chain `assigned_to_route -> in_transit -> delivered` instead of throwing a server error.
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
