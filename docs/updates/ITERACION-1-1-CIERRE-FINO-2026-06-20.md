# Iteración 1.1 — Cierre fino de UI, traducciones y documentación

Fecha: 2026-06-20
Rama: `dev`

---

## Objetivo

Cerrar las omisiones detectadas después de la Iteración 1 antes de avanzar a auditoría de producción y datos reales de Juan.

---

## Cambios incluidos

### Documentación versionada

- Se agregó el cierre de Iteración 1 dentro del repo P16:
  - `docs/updates/ITERACION-1-BUGFIXES-2026-06-20.md`

### Traducciones de dominio

Se ampliaron helpers en:

- `frontend/src/lib/utils.ts`

Helpers agregados o ampliados:

- `shipmentStatusLabel()`
- `routeStatusLabel()`
- `routeStopStatusLabel()`
- `driverStatusLabel()`
- `billingTypeLabel()`
- `financialStatusLabel()`
- `auditActionLabel()`

Pantallas cubiertas:

- pedidos;
- dashboard;
- command palette;
- clientes;
- reportes;
- rutas;
- conductores;
- auditoría.

### Textos y acentos críticos

Se corrigieron textos visibles como:

- `envio` → `envío`
- `Direccion` → `Dirección`
- `accion` → `acción`
- `Metricas` → `Métricas`
- `Auditoria` → `Auditoría`
- `Post-venta` → `Cobro post entrega`

### Modal móvil

- El modal de detalle de pedido ahora usa `mobile-modal-safe-area`.
- Esto reduce el riesgo de que controles o contenido queden tapados por barras móviles.

---

## Pendientes para Iteración 2

1. Auditar producción y datos reales de Juan.
2. Confirmar versión de APK instalada.
3. Revisar `users.driver_id`, `drivers.user_id`, rutas y `route_stops`.
4. Diagnosticar creación con foto y Mercado Libre desde logs/Network.
5. Corregir dashboard con una semántica de métricas definida.

---

## Criterio de cierre

La Iteración 1.1 se considera cerrada si:

- los estados operativos principales ya no aparecen en inglés;
- los textos visibles más críticos están corregidos;
- la documentación está versionada en `dev`;
- el frontend pasa TypeScript y ESLint en los archivos tocados.
