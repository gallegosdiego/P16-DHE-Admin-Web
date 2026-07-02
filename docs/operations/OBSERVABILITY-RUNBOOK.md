# Observability Runbook

## Objective

Detect and triage incidents quickly across auth, shipments, routes, map flow, finance, and reporting.

## Signals to Watch

### API health

- `GET /api/health` status and latency
- login success/error rate
- 401/403 spikes
- 5xx error spikes

### Driver route flow

- `GET /api/driver/operational-state` availability
- `POST /api/driver/smart-route` success/error rate
- `POST /api/routes/{id}/finalize` success/error rate
- `POST /api/routes/{id}/optimize` success/error rate
- `POST /api/routes/{id}/stops/{stopId}/complete` success/error rate
- `POST /api/driver/location` freshness for active routes

### Route operation logs

Search for these structured events in backend logs:

- `driver.route_day.synced`
- `driver.route.optimized`
- `driver.route.optimization_skipped_missing_geo`
- `driver.route.smart_route_missing_geo`
- `driver.route.smart_route_optimized_without_origin`
- `driver.route.stop_completed`
- `driver.route.stop_removed`
- `driver.route.finalized`

### Frontend quality

- build/lint/typecheck pipeline status (`frontend-ci`)
- E2E smoke pass/fail trend
- console/runtime error frequency during UAT

### Business indicators

- dashboard load success
- report export success rate
- batch action success in shipments (`batch-status`, `batch-assign`)
- route-day continuity after relogin
- new assigned shipments visible to the pilot on the same day

## Incident Severity

- `SEV-1`: complete outage, login broken, route creation broken for all pilots, major 5xx storm.
- `SEV-2`: critical module degraded (route continuity, delivery close, map flow, payments/reports/users CRUD blocked).
- `SEV-3`: partial degradation, workaround exists.

## Triage Flow

1. Confirm blast radius:
   - single user / role / route?
   - all users?
2. Check backend health and logs first.
3. Check recent deploy/commit and CI status.
4. Reproduce with staging/admin test account.
5. Confirm whether issue is:
   - auth/session
   - route-day continuity
   - missing geodata
   - optimization provider
   - mobile app cache/state
6. Apply rollback or hotfix decision.

## Standard Playbooks

### A) Login failures

- Verify `/api/health`.
- Verify Sanctum config and token issuance.
- Confirm frontend `NEXT_PUBLIC_API_URL`.
- Validate `GET /api/me` with issued token.

### B) Pilot sees no route or no assigned shipments

- Re-test `GET /api/driver/operational-state`.
- Check same pilot directly in admin:
  - assigned shipments
  - open route
  - route-day rows
- Search backend logs for:
  - `driver.route_day.synced`
  - `driver.route.finalized`
  - `driver.route.stop_removed`
- Verify shipments are not trapped in stale `route_stops`.

### C) Smart route or map errors

- Re-test `POST /api/driver/smart-route`.
- Re-test `POST /api/routes/{id}/optimize`.
- Re-test `GET /api/shipments/geo-summary`.
- Search logs for:
  - `driver.route.optimization_skipped_missing_geo`
  - `driver.route.smart_route_missing_geo`
  - `Route optimization API failed, using fallback`
- Confirm affected shipments have `recipient_lat` and `recipient_lng`.
- If there are many historical gaps, run `php artisan shipments:geocode-missing --limit=100 --json`.

### D) Delivery closes but route does not advance

- Re-test `POST /api/shipments/{id}/status`.
- Re-test `POST /api/routes/{id}/stops/{stopId}/complete`.
- Search logs for `driver.route.stop_completed`.
- Verify `route_stops.status`, `routes.completed_stops`, and shipment final status.

### E) Financial module errors

- Verify `financial.view` / `financial.collect` / `financial.settle`.
- Check downstream data dependencies (`shipments`, `driver-board`, `expenses`, `employees`).

## Post-Incident

- Capture timeline and root cause.
- Create corrective actions with owners and due dates.
- Update this runbook and QA evidence docs.
