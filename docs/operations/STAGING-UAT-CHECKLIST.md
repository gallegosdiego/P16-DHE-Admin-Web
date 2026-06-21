# Staging + UAT Checklist

Date baseline: 2026-05-13

## 0) Local Pre-UAT Status (Session 2026-05-13)

Completed in local workspace before staging UAT:
- [x] `npm run lint` (frontend)
- [x] `npm run typecheck` (frontend)
- [x] `npm run build` (frontend)
- [x] `npm run test:e2e:smoke` (4/4 passed, mocked API)
- [x] `npm run test:e2e:regression` (4/4 passed, mocked API)
- [x] `npm run test:e2e` (8/8 passed, mocked API)

Pending to execute (requires backend/API running and real credentials):
- [ ] Backend-integrated functional pass (real `/api/*` responses).
- [ ] Permission matrix validation with non-admin/non-financial users.

## 1) Staging Readiness

- [ ] Backend `.env` configured for staging DB and Sanctum domain.
- [ ] Frontend `NEXT_PUBLIC_API_URL` points to staging backend.
- [ ] Admin demo account exists with `superadmin` role.
- [ ] Migrations and seed baseline applied.
- [ ] `frontend-ci` workflow green on latest `main`.

## 2) Deployment Steps

1. Deploy backend (API) and verify:
   - [ ] `GET /api/health` returns `200`.
   - [ ] `POST /api/login` works with demo user.
2. Deploy frontend build:
   - [ ] Login page loads.
   - [ ] Authenticated routes resolve without 500/404.
3. Smoke run on staging target:
   - [ ] login
   - [ ] dashboard
   - [ ] usuarios/reportes
   - [ ] command palette

## 3) UAT Functional Checklist

### Core flows
- [ ] Login and logout.
- [ ] Dashboard refresh and connectivity indicator.
- [ ] Pedidos list and quick create modal.
- [ ] Clientes list and detail.
- [ ] Conductores list and `/conductores/[id]` detail.
- [ ] Pagos and financial sections render with live data.
- [ ] Reportes stats and both CSV exports.
- [ ] Usuarios CRUD (create/edit).
- [ ] Auditoria backend filters and `old_values/new_values` inspection.

### UX and quality
- [ ] Dark mode visual pass in all modules.
- [ ] Mobile pass (375px) for admin key routes.
- [ ] Empty states and error toasts are understandable.

## 4) Security/UAT Spot Checks

- [ ] Non-admin profile cannot access `users.*`.
- [ ] Non-financial profile cannot access `financial.*` / `audit-logs`.
- [ ] Unauthorized requests return 401/403 (not 500).

## 5) UAT Signoff

Approver: _____________________  
Date: ________________________  
Decision:
- [ ] Approved for production
- [ ] Approved with conditions
- [ ] Rejected (requires rework)

Notes:
```
<write observations here>
```
