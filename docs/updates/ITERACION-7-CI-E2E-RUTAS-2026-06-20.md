# Iteración 7 — Corrección CI/e2e y flujo de rutas

Fecha: 2026-06-20  
Repositorio: `P16-DHE-Admin-Web`  
Rama: `dev`

## Problema observado

El workflow `frontend-ci` fallaba en GitHub Actions en pruebas Playwright relacionadas con `/rutas`.

Síntomas vistos:

- Timeout buscando el botón `Iniciar`.
- Fallos al validar tarjeta de ruta con piloto/zona.
- Falla potencial al abrir modal `Nueva ruta`.
- Selectores de notificaciones frágiles ante tildes (`leidas` vs `leídas`).

## Causa raíz

La pantalla `/rutas` había quedado desalineada con el flujo operativo que las pruebas esperaban:

- La UI mostraba `Monitor de Rutas`, pero el flujo probado esperaba `Rutas diarias`.
- Las columnas usaban plural (`Planificadas`, `Activas`, `Completadas`) y las pruebas esperaban estados unitarios.
- La acción visible era `Activar`, mientras el flujo operativo esperaba `Iniciar`.
- La creación manual de ruta existía en API (`POST /api/routes`) pero ya no estaba expuesta en la UI.
- El mock e2e no tenía datos para `/api/routes/routable-shipments`.

## Solución aplicada

### UI de rutas

- Se alineó el copy operativo:
  - `Rutas diarias`
  - `Planificada`
  - `Activa`
  - `Completada`
  - botón `Iniciar`
- Se recuperó el botón `Nueva ruta`.
- Se agregó modal de creación con:
  - selector de piloto;
  - campo opcional de zona;
  - lista de paradas disponibles;
  - selección múltiple de paquetes;
  - envío a `POST /routes`.
- Se conecta la lista disponible con `/routes/routable-shipments`.
- Se recarga la vista después de crear ruta.

### E2E y mocks

- Se agregó respuesta mock para `/api/routes/routable-shipments`.
- Se endureció la prueba de notificaciones para aceptar `leidas` y `leídas`.
- Se eliminó una ambigüedad de texto duplicado en el modal que rompía Playwright en modo strict.

## Archivos modificados

- `frontend/src/app/(admin)/rutas/page.tsx`
- `frontend/e2e/support/mock-api.ts`
- `frontend/e2e/zones-routes-notifications.spec.ts`

## Validación ejecutada

- `npx eslint -- "src/app/(admin)/rutas/page.tsx" "e2e/zones-routes-notifications.spec.ts" "e2e/support/mock-api.ts"`
- `npx tsc --noEmit --incremental false`
- `CI=true npx playwright test e2e/routes.spec.ts e2e/zones-routes-notifications.spec.ts --project=chromium --reporter=list`
- `git diff --check`

Resultado Playwright: `11 passed`.

## Auditoría propia de la iteración

### Omisiones encontradas

- El modal permite crear ruta, pero aún no prueba el submit completo en Playwright.
- No se agregó optimización manual desde el panel (`/routes/{route}/optimize`), aunque la API existe.
- La acción `Completar` sigue visible en paradas no completadas sin distinguir visualmente si la ruta está planificada o activa; no se cambió para evitar alterar flujo fuera del bug CI.

### Mejoras recomendadas siguientes

- Agregar e2e de creación completa de ruta seleccionando paquetes.
- Añadir botón de optimización cuando haya coordenadas disponibles.
- Revisar si `Completar` debe ocultarse en rutas planificadas hasta que se pulse `Iniciar`.

