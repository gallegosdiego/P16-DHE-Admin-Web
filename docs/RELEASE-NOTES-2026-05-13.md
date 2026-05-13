# Release Notes - 2026-05-13

## Release Summary
This release finalizes major admin platform blocks, closes high-impact functional gaps, and introduces an automated quality pipeline.

## Delivered

### Functional
- Live dashboard improvements and real API wiring
- Reports with backend CSV export endpoints
- Full users module integration (`/usuarios`)
- Audit log module (`/auditoria`)
- Driver detail and assignment hardening (`/conductores/[id]`)
- Operational metrics board (`/metricas`)

### Quality and Resilience
- Playwright E2E smoke suite added
- Playwright regression suite added (conductores, auditoria, pagos, configuracion)
- Offline/hydration-safe network banner behavior
- Deterministic production build without external runtime font fetch dependency
- Dark mode consistency reinforced in updated modules

### Documentation
- Architecture overview
- API contracts
- QA evidence
- Changelog
- Operations playbook and demo guide
- Staging/UAT checklist
- Observability runbook
- Permission verification matrix

### CI/CD
- GitHub workflow `frontend-ci`:
  - lint
  - typecheck
  - build
  - e2e smoke

## Validation Snapshot
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run build` -> PASS

## Follow-Up Recommendations
1. Add module-specific regression suites beyond smoke (Pedidos, Pagos, Configuracion).
2. Add contract tests between frontend DTOs and backend responses.
3. Add staging deployment gate that requires passing CI plus smoke against staging URL.
