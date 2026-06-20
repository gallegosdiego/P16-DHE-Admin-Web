# Iteración 10 — CI y regresión completa

Fecha: 2026-06-20  
Rama: `dev`  
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Ejecutar una auditoría profunda posterior a las correcciones del plan maestro y cerrar cualquier regresión real detectada por CI local, sin tocar la rama `main`.

## Auditoría ejecutada

### Frontend

Se reprodujo localmente el flujo del workflow `frontend-ci`:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `CI=true npm run test:e2e`

Resultado final: frontend verde, incluyendo `41` pruebas E2E Playwright aprobadas.

### Backend

Se ejecutó la suite completa de PHPUnit:

- `LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result`

Resultado inicial: `6` fallas reales en `204` pruebas.

Resultado final después de corregir: `204` pruebas aprobadas, `717` aserciones.

## Hallazgos cerrados

### 1. E2E desactualizado por textos localizados

Los tests seguían buscando textos sin acentos o copys anteriores:

- `Exportar envios`
- `Asignar envio`
- `Auditoria`
- `leidas`

Corrección aplicada:

- Los selectores aceptan español latino con acentos.
- Se preserva compatibilidad usando expresiones regulares robustas.

Impacto:

- Evita falsos negativos en CI cuando la UI está correctamente localizada.

### 2. Permiso `dashboard.view` ausente

El endpoint `/api/dashboard` exige `dashboard.view`, pero los seeders no lo creaban ni lo asignaban al rol `operador`.

Corrección aplicada:

- Se agregó `dashboard.view` a permisos base.
- Se asignó a `operador` en guard `web`.
- Se asignó a `operador` en guard `sanctum`.
- Se sincronizó también en el seeder de producción.

Impacto:

- El operador vuelve a entrar al dashboard sin error 500.
- La configuración de producción queda alineada con testing.

### 3. `driver_paid` no persistía por mass assignment

El campo `driver_paid` estaba casteado y existía en base de datos, pero no estaba en `$fillable`.

Corrección aplicada:

- Se agregó `driver_paid` al modelo `Shipment`.

Impacto:

- `markDriverPaid` ya persiste el pago al piloto.
- Los seeders pueden crear correctamente pedidos ya pagados al conductor.

### 4. Borrado de pedidos era hard-delete inseguro

El endpoint eliminaba pedidos con `forceDelete()` y permitía borrar envíos en tránsito.

Corrección aplicada:

- Se cambió a soft delete.
- Se bloqueó eliminación si el pedido ya está en operación o en estado final.
- Se mantiene protección financiera por liquidación/payout.
- Se recalculan contadores de ruta desde base de datos para evitar decrementos negativos.
- Se aplicó el mismo criterio a borrado individual y batch.

Impacto:

- Los pedidos registrados pasan a papelera.
- Los pedidos en tránsito no se eliminan accidentalmente.
- Las métricas de ruta quedan consistentes tras eliminar pedidos previos a operación.

### 5. Endpoint de roles no exponía roles legacy existentes

La base de datos ya mantiene roles `conductor` y `cliente`, pero `/api/roles` solo exponía cuatro roles.

Corrección aplicada:

- Se exponen `driver`, `conductor`, `client` y `cliente`.
- Se permite crear/actualizar usuarios con aliases legacy.
- Roles de piloto/cliente se asignan en guards `web` y `sanctum` cuando aplica.

Impacto:

- La UI recupera la lista completa esperada.
- Se mantiene compatibilidad con datos históricos y nombres actuales.

## Validación final

### Frontend

- `npm run lint` — aprobado.
- `npm run typecheck` — aprobado.
- `npm run build` — aprobado.
- `CI=true npm run test:e2e` — aprobado, `41` pruebas.

### Backend

- `php -l` sobre archivos modificados — aprobado.
- PHPUnit focalizado sobre fallas detectadas — aprobado, `63` pruebas.
- PHPUnit completo — aprobado, `204` pruebas, `717` aserciones.

## Auditoría propia

### Omisiones buscadas

- Verificar que la corrección de permisos no solo pase tests sino también producción.
- Verificar que el borrado batch use la misma regla que el borrado individual.
- Verificar que `driver_paid` no dependiera de actualización directa SQL sino del modelo.
- Verificar que los tests E2E no queden acoplados a falta de tildes.
- Verificar que `main` permanezca libre de cambios.

### Mejoras incorporadas

- Recuento de ruta por consulta real en vez de decrementos manuales.
- Soft delete para conservar trazabilidad operativa.
- Compatibilidad de roles legacy sin romper nombres actuales.
- Seeders de testing y producción sincronizados.

### Riesgo residual

- El flujo real de producción debe ejecutar seeders/migraciones de permisos para que `dashboard.view` exista en la base productiva.
- La papelera de pedidos queda respaldada por soft delete; si la UI necesita restauración de pedidos, debe exponerse en una iteración posterior.

## Estado

Iteración 10 lista para commit en `dev`.
