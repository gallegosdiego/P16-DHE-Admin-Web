# P16-DHE-Admin-Web

Plataforma administrativa y API central de Danhei Express para operación, finanzas, trazabilidad, reportes y gobierno.

**Estado vigente:** consultar [docs/ESTADO-ACTUAL.md](./docs/ESTADO-ACTUAL.md).

**Pendientes vigentes:** consultar [docs/ROADMAP-ACTIVO.md](./docs/ROADMAP-ACTIVO.md).

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
- `/recogidas`, `/recogidas/nueva`, `/recogidas/tareas`, `/recogidas/recepcion`
- `/operacion`
- `/clientes`
- `/conductores` and `/conductores/[id]`
- `/rutas`
- `/zonas`
- `/novedades`
- `/pagos`
- `/reportes`
- `/usuarios`
- `/auditoria`
- `/metricas`
- `/configuracion`
- `/configuracion/sedes`

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

Run from `api/`:

```bash
php artisan test
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

GitHub Actions workflows:

- `.github/workflows/frontend-ci.yml`
- `.github/workflows/backend-ci.yml`

Quality gates on push/PR to `main` y `dev`:
- lint
- typecheck
- build
- e2e smoke
- PHP syntax and Laravel tests, isolated by test file

## Documentation Index

El índice canónico es [docs/README.md](./docs/README.md).

- Estado actual: [docs/ESTADO-ACTUAL.md](./docs/ESTADO-ACTUAL.md)
- Roadmap activo: [docs/ROADMAP-ACTIVO.md](./docs/ROADMAP-ACTIVO.md)
- Plan maestro: [docs/PLAN-MAESTRO-IMPLEMENTACION-ECOSISTEMA-OPERATIVO-COD.md](./docs/PLAN-MAESTRO-IMPLEMENTACION-ECOSISTEMA-OPERATIVO-COD.md)
- Arquitectura: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Contratos API: [docs/API-CONTRACTS.md](./docs/API-CONTRACTS.md)
- Cierre financiero: [docs/modulo-financiero-plan.md](./docs/modulo-financiero-plan.md)
- Operación y despliegue: [docs/operations/PLAYBOOK-OPERATIVO.md](./docs/operations/PLAYBOOK-OPERATIVO.md) y [docs/DEPLOY-CPANEL.md](./docs/DEPLOY-CPANEL.md)
- Gobierno documental: [docs/GOBERNANZA-DOCUMENTAL.md](./docs/GOBERNANZA-DOCUMENTAL.md)
- Changelog actual: [docs/CHANGELOG-ACTUAL.md](./docs/CHANGELOG-ACTUAL.md)

Los archivos `SPRINT-*`, las listas de pendientes fechadas y `docs/documentacion-legacy/` son históricos. No deben utilizarse como backlog vigente.
