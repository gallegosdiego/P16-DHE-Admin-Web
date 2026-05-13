# Permission Verification Matrix

## Purpose
Define minimum authorization checks required before production release.

## Roles
- `superadmin`
- `administrador`
- `operador`
- `conductor`
- `cliente`

## Endpoint Families and Expected Access

| Endpoint Family | Required Permission | superadmin | administrador | operador | conductor | cliente |
|---|---|---:|---:|---:|---:|---:|
| `/api/users*`, `/api/roles` | `users.view/create/edit` | ✅ | ✅ (if granted) | ❌ | ❌ | ❌ |
| `/api/audit-logs` | `financial.view` | ✅ | ✅ (if granted) | ❌ | ❌ | ❌ |
| `/api/financial/*` | `financial.*` | ✅ | ✅ (if granted) | ❌ | ❌ | ❌ |
| `/api/reports/*` | `reports.view` | ✅ | ✅ (if granted) | ⚠ depends | ❌ | ❌ |
| `/api/shipments` read | `shipments.view` | ✅ | ✅ | ✅ | ⚠ own scope | ⚠ own scope |
| `/api/shipments` write | `shipments.create/edit/change_status/assign` | ✅ | ✅ | ✅ (scoped) | ❌ | ❌ |
| `/api/drivers*` | `drivers.view/create/edit/toggle_status` | ✅ | ✅ | ✅ (view/assign scope) | ❌ | ❌ |
| `/api/clients*` | `clients.view/create/edit` | ✅ | ✅ | ✅ | ❌ | ⚠ own scope |

## Verification Procedure

1. Log in with each role profile.
2. Call representative endpoints from each family.
3. Confirm expected result:
   - authorized: `200/201`
   - unauthorized: `401/403`
4. Confirm frontend behavior:
   - no silent failures
   - proper error messages/toasts

## Mandatory Negative Tests

- `operador` cannot access `/api/users`.
- `conductor` cannot access `/api/financial/overview`.
- `cliente` cannot access `/api/audit-logs`.
- unauthorized access never returns `500`.

## Release Gate

All mandatory negative tests must pass before production rollout.
