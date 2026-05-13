# Observability Runbook

## Objective
Detect and triage incidents quickly across auth, shipments, finance, and reporting.

## Signals to Watch

### API health
- `GET /api/health` status and latency
- login success/error rate
- 401/403 spikes
- 5xx error spikes

### Frontend quality
- build/lint/typecheck pipeline status (`frontend-ci`)
- E2E smoke pass/fail trend
- console/runtime error frequency during UAT

### Business indicators
- dashboard load success
- report export success rate
- batch action success in shipments (`batch-status`, `batch-assign`)

## Incident Severity

- `SEV-1`: complete outage, login broken, major 5xx storm.
- `SEV-2`: critical module degraded (payments/reports/users CRUD blocked).
- `SEV-3`: partial degradation, workaround exists.

## Triage Flow

1. Confirm blast radius:
   - single user / role / route?
   - all users?
2. Check backend health and logs first.
3. Check recent deploy/commit and CI status.
4. Reproduce with staging admin account.
5. Apply rollback or hotfix decision.

## Standard Playbooks

### A) Login failures
- Verify `/api/health`.
- Verify Sanctum config and token issuance.
- Confirm frontend `NEXT_PUBLIC_API_URL`.
- Validate `GET /api/me` with issued token.

### B) Report export fails
- Re-test `GET /api/reports/stats`.
- Re-test export endpoint directly.
- Validate permission `reports.view`.

### C) Financial module errors
- Verify `financial.view` / `financial.collect` / `financial.settle`.
- Check downstream data dependencies (`shipments`, `driver-board`, `expenses`, `employees`).

## Post-Incident

- Capture timeline and root cause.
- Create corrective actions with owners and due dates.
- Update this runbook and QA evidence docs.
