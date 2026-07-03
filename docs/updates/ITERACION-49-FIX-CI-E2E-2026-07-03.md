# Iteración 49 · Fix de CI E2E en GitHub

Fecha: 2026-07-03

## Contexto

El workflow `frontend-ci` estaba fallando en GitHub Actions, específicamente en el paso `E2E smoke` del run `#164` (`62ca6c4`).

## Diagnóstico

Los pasos `lint`, `typecheck` y `build` estaban correctos. El error real estaba concentrado en tres pruebas E2E:

- `regression.spec.ts` → `conductores board and detail render key metrics`
- `regression.spec.ts` → `configuracion renders profile and company settings`
- `zones.spec.ts` → `creates a new zone from modal form`

### Causas raíz

1. **Selector desactualizado en Configuración**
   - La UI ahora renderiza `Configuración` con tilde.
   - El test seguía buscando `Configuracion`.

2. **Selector desactualizado en Zonas**
   - El formulario ya no depende de placeholder para `Nombre`.
   - El test seguía usando `getByPlaceholder("Nombre")`.

3. **Mock E2E incompleto para detalle de conductor**
   - El detalle del piloto esperaba `documents.count_present`, `count_required`, `items`, etc.
   - El mock de `/api/drivers/:id` no entregaba esa estructura y el detalle rompía en runtime.

4. **Helper de sesión poco portable**
   - `withSession` fijaba la cookie solo para `http://localhost:3000`.
   - Eso hacía difícil reproducir correctamente en puertos/hosts alternos durante depuración local.

## Correcciones aplicadas

### `frontend/e2e/support/mock-api.ts`

- Se añadió `e2eBaseUrl` basado en `E2E_BASE_URL`.
- La cookie E2E ahora usa esa URL en vez de un host fijo.
- Se agregó `buildDriverDocuments()` para simular correctamente el payload documental del detalle de pilotos.
- Se completó la respuesta mock de `/api/drivers/:id` con `documents`.

### `frontend/e2e/regression.spec.ts`

- Se actualizó el assertion de Configuración a un matcher tolerante:
  - `/Configuraci[oó]n/i`

### `frontend/e2e/zones.spec.ts`

- Se migró el llenado del campo de:
  - `getByPlaceholder("Nombre")`
  - a `getByLabel("Nombre")`

## Validación

Se ejecutó localmente la suite completa E2E contra un frontend levantado en puerto alterno:

- `npx playwright test`

Resultado:

- `41 passed`

## Resultado

Queda corregido el motivo del fallo recurrente en GitHub Actions para `frontend-ci`, y la suite E2E vuelve a reflejar la UI y mocks actuales del panel administrativo.
