# P16-DHE-Admin-Web

Admin platform for Danhei Express operations, finance, reporting, and governance.

## Current Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 13 + PHP 8.3 |
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind v4 |
| Auth | Laravel Sanctum (Bearer token) |
| Access Control | Permission middleware (backend) |
| E2E | Playwright (smoke suite) |

## Repository Structure

```text
P16-DHE-Admin-Web/
├── api/                      Laravel backend
├── frontend/                 Next.js admin app
│   ├── src/app/(admin)/      Protected admin routes
│   ├── src/components/       Shared UI + infra components
│   └── src/lib/              API, auth, types, helpers
├── docs/                     Delivery, QA, architecture, contracts
└── .github/workflows/        CI pipelines
```

## Main Frontend Modules

- `/` Dashboard
- `/pedidos`
- `/clientes`
- `/conductores` and `/conductores/[id]`
- `/pagos`
- `/reportes`
- `/usuarios`
- `/auditoria`
- `/metricas`
- `/configuracion`

## Local Setup

### Backend
```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`  
Backend: `http://127.0.0.1:8000`

## Quality Commands

Run from `frontend/`:

```bash
npm run lint
npm run typecheck
npm run build
```

## E2E Smoke

```bash
cd frontend
npm run test:e2e:install
npm run test:e2e:smoke
npm run test:e2e:regression
```

Scenarios:
- login render
- dashboard render
- usuarios/reportes routes
- command palette keyboard shortcut
- conductores board/detail
- auditoria filters + `old_values/new_values` inspector
- pagos sections
- configuracion sections

## CI

GitHub Actions workflow:
- `.github/workflows/frontend-ci.yml`

Quality gates on push/PR to `main`:
- lint
- typecheck
- build
- e2e smoke

## Documentation Index

- Architecture: `docs/ARCHITECTURE.md`
- API contracts: `docs/API-CONTRACTS.md`
- QA evidence: `docs/QA-EVIDENCE.md`
- Changelog: `docs/CHANGELOG.md`
- Demo script: `docs/demo/DEMO-GUIADA-12MIN.md`
- Operations playbook: `docs/operations/PLAYBOOK-OPERATIVO.md`
- Staging + UAT checklist: `docs/operations/STAGING-UAT-CHECKLIST.md`
- Observability runbook: `docs/operations/OBSERVABILITY-RUNBOOK.md`
- Permission matrix: `docs/security/PERMISSION-VERIFICATION-MATRIX.md`
- E2E runbook: `docs/qa/E2E-MINIMAL.md`
- Latest module closeout: `docs/updates/PHASE2-MODULE-CLOSEOUT-2026-05-13.md`
- Latest audit log update: `docs/updates/ITERACION-14-AUDITORIA-LOGS-FILTROS-2026-06-21.md`
