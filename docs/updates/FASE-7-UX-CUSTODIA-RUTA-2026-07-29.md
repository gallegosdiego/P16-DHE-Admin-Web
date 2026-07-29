# Fase 7 — Revisión de custodia antes de iniciar la ruta

**Fecha:** 29 de julio de 2026  
**Estado:** implementada localmente, pendiente de PR

## Objetivo

Hacer visible en el panel que una ruta no se puede iniciar mientras tenga paquetes sin aceptación física del piloto.

## Cambios

- Las tarjetas de rutas muestran cuántos paquetes tienen piloto, cuántos siguen en sede y cuántos están pendientes de custodia.
- En una ruta planificada con custodia pendiente, el botón cambia de **Iniciar** a **Revisar custodia**.
- El botón abre directamente el manifiesto de solo lectura con el contador y el detalle de las guías.
- Si una versión antigua del backend responde `route_custody_pending`, el panel muestra un mensaje accionable y abre el manifiesto.
- Se actualizó la prueba E2E para cubrir el bloqueo visual antes de iniciar.

## Validación

- `npm run test:e2e -- e2e/routes.spec.ts`: 12 pruebas aprobadas.
- `npm run lint -- "src/app/(admin)/rutas/page.tsx" e2e/routes.spec.ts`.
- `npm run typecheck`.
- `npm run build`.

## Criterio de cierre

El despachador puede distinguir la planificación de la custodia y sabe exactamente dónde revisar antes de activar la salida. La autoridad final sigue siendo el escaneo/entrega autorizada y el bloqueo contractual del backend.
