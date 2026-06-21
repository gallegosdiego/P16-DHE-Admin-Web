# QA Evidence

## Scope
Verification of current frontend release readiness after module closeout and technical hardening.

Date: 2026-05-13  
Repository: `D:\DHE dev\P16-DHE-Admin-Web`

## Executed Checks (Frontend)

Working directory: `frontend/`

1. `npm run lint`
- Result: PASS
- Output summary: no ESLint errors.

2. `npm run typecheck`
- Result: PASS
- Output summary: TypeScript `tsc --noEmit` completed without errors.

3. `npm run build`
- Result: PASS
- Output summary:
  - Next.js 16 build compiled successfully.
  - static pages generated for admin modules including:
    - `/auditoria`
    - `/conductores`
    - `/metricas`
    - `/reportes`
    - `/usuarios`
  - dynamic route confirmed:
    - `/conductores/[id]`

## E2E Smoke Suite

Playwright tests live in:
- `frontend/e2e/smoke.spec.ts`
- `frontend/e2e/regression.spec.ts`

Covered scenarios:
- Login page render
- Authenticated dashboard render
- Usuarios + Reportes route availability
- Command palette keyboard invocation
- Conductores board and detail KPIs
- Auditoria backend filters and `old_values/new_values` expansion
- Pagos financial sections render
- Configuracion sections render

Execution mode:
- Local: against running frontend server
- CI: automated via `.github/workflows/frontend-ci.yml`

Latest local execution (2026-05-13):
```bash
cd frontend
npx next start -p 3000
npx playwright test e2e/smoke.spec.ts e2e/regression.spec.ts --reporter=list --workers=1
```
Result:
- 8 passed
  - smoke: login, dashboard, usuarios/reportes, command palette
  - regression: conductores, auditoria, pagos, configuracion

## Extended Session Validation (2026-05-13)

In this session, E2E was executed end-to-end from the workspace with frontend bootstrapped automatically and API mocked by Playwright routes (`frontend/e2e/support/mock-api.ts`).

Executed command groups:
```bash
cd frontend
npm run test:e2e:smoke
npm run test:e2e:regression
npm run test:e2e
```

Observed results:
- `test:e2e:smoke`: 4/4 passed
- `test:e2e:regression`: 4/4 passed
- `test:e2e` (full suite): 8/8 passed

Validated pages/modules in this run:
- `/login`
- `/` (dashboard live shell + quick actions + command palette)
- `/usuarios`
- `/reportes`
- `/conductores` and `/conductores/[id]`
- `/auditoria`
- `/pagos`
- `/configuracion`

Important scope note:
- This E2E layer validates frontend behavior with deterministic mocked API responses.
- Backend-integrated UAT (real auth/permissions/data) remains a separate final validation pass.

## Backend-Integrated API UAT (2026-05-13)

Environment:
- API reset with demo fixtures via:
  - `php artisan migrate:fresh --seed`
- Demo credentials:
  - superadmin: `admin@danheiexpress.com`
  - operador: `operador@danheiexpress.com`

Backend tests executed:
- `php artisan test --filter=ProfileTest` -> 9/9 PASS
- `php artisan test --filter=ShipmentTest` -> 6/6 PASS
- `php artisan test --filter=UserAndReportTest` -> 10/10 PASS
- `php artisan test --filter=RbacTest` -> 6/6 PASS

API smoke (real HTTP, authenticated):
- Superadmin expected `200`:
  - `/api/me`
  - `/api/dashboard`
  - `/api/dashboard/hourly`
  - `/api/shipments?per_page=5`
  - `/api/clients`
  - `/api/drivers`
  - `/api/clients-receivable`
  - `/api/users`
  - `/api/audit-logs`
  - `/api/reports/stats`
  - `/api/reports/export/shipments` (`text/csv`)
  - `/api/reports/export/financial` (`text/csv`)
- Operador expected `403`:
  - `/api/users`
  - `/api/audit-logs`
  - `/api/financial/overview`
  - `/api/reports/stats`
  - `/api/clients-receivable`

Issue found and fixed during UAT:
- `GET /api/audit-logs` returned `500` because `Request` in route closure resolved to Facade, causing `Request::query()` failure.
- Fix applied: import `Illuminate\\Http\\Request` in `api/routes/api.php`.

## Audit Log Contract Validation (2026-06-21)

Scope:
- Commit validated on branch `dev`: `04cb2a2 fix(audit): align audit log contract and filters`.
- Production branch `main` was not modified.

Backend validation:
```bash
cd api
php -l app/Domain/Shared/Models/AuditLog.php
php -l routes/api.php
php -l tests/Feature/RbacExtendedTest.php
$env:LOG_CHANNEL='null'; .\vendor\bin\phpunit.bat --do-not-cache-result tests\Feature\OperationalIntegrityCommandTest.php tests\Feature\RbacExtendedTest.php
```

Result:
- PHP syntax checks: PASS.
- PHPUnit: `25 tests`, `75 assertions`, PASS.

Frontend validation:
```bash
cd frontend
npx tsc --noEmit --incremental false
npx eslint -- "src/app/(admin)/auditoria/page.tsx" "src/lib/types.ts" "e2e/support/mock-api.ts"
$env:CI='true'; npx playwright test e2e/regression.spec.ts --project=chromium --reporter=list
```

Result:
- TypeScript: PASS.
- ESLint: PASS.
- Playwright regression: the 7 regression tests reported `ok`, including `/auditoria`.
- Local caveat: the Playwright command timed out after tests completed while waiting for process teardown on Windows.

Contract verified:
- `/api/audit-logs` accepts backend filters: `search`, `action`, `user_id`, `date_from`, `date_to`.
- Audit change payload is exposed as `old_values/new_values`.
- Frontend keeps defensive support for legacy `metadata`, but current backend contract is `old_values/new_values`.
- `/drivers/debug-juan` is limited to `local` and `testing`, not production.

## Remaining Risks

1. Environment dependency
- Backend auth/permission fixtures may vary across non-demo environments.

2. Browser-only race conditions
- E2E smoke validates critical route availability but does not replace full regression.
3. Mocked API scope
- Playwright routes mock backend responses in `e2e/support/mock-api.ts`.
- Real backend UAT is still required for permissions, export payload fidelity, and production-like data variability.
4. Windows local CI-mode caveat
- On local Windows runs with Playwright-managed `webServer`, process teardown can hang after tests complete.
- CI workflow runs on Linux (`ubuntu-latest`), where this teardown issue is not expected.

## Mitigation

- CI enforces quality gates on every push/PR to `main`:
  - lint
  - typecheck
  - production build
  - playwright smoke

- Operational fallback:
  - `docs/operations/PLAYBOOK-OPERATIVO.md`
