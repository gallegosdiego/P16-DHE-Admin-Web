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
- Auditoria filters and metadata expansion
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
