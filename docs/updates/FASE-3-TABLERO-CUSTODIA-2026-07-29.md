# Fase 3: tablero de custodia y base para propuesta de despacho

**Fecha:** 29 de julio de 2026  
**Estado:** implementado en rama; pendiente PR, despliegue de migración y UAT

## Objetivo

Dejar visible, antes de crear una ruta, qué paquetes están realmente en custodia de una sede Danhei. La ruta no se propone desde todos los envíos registrados: se parte únicamente de paquetes físicamente recibidos, sin una salida abierta y con un último evento de custodia en sede.

## Cambios

- Se agregan a `shipments` los atributos operativos `size_code`, `is_fragile` y `approx_weight_kg`.
- La materialización de paquetes de ingreso conserva esos atributos en la guía cuando las columnas están disponibles.
- Se publica `GET /api/routes/dispatch-board` con filtros por zona, ciudad, tamaño y búsqueda.
- El contrato agrupa por localidad/zona y entrega contadores por tamaño, frágiles, coordenadas faltantes y peso aproximado.
- La respuesta conserva la última sede custodio y la fecha del evento; no infiere custodia a partir de `driver_id`.
- El panel `/rutas` muestra un tablero responsive de custodia, filtros y detalle expandible por grupo.
- Los paquetes con ruta planificada/activa abierta o cuyo último custodio ya es el piloto no se ofrecen como disponibles.

## Invariantes

1. Solo se proponen envíos con estado `in_warehouse`.
2. El último evento de `custody_events` debe tener `new_custodian_type = hub`.
3. La creación de una ruta sigue siendo una acción humana; este tablero no despacha ni optimiza automáticamente.
4. Un esquema incompleto responde `409 dispatch_board_schema_pending` para no mostrar una lista vacía engañosa.

## Verificación local

- `php artisan test`: **397/397** pruebas, **2020** aserciones.
- `php artisan test --filter=RouteTest`: **19/19** pruebas, **111** aserciones.
- `php artisan test --filter='UnifiedIntakeApiTest|PickupIntakeApiTest|WhatsAppPickupFlowProcessingTest'`: **22/22** pruebas, **134** aserciones.
- Frontend: `npm run lint`, `npm run typecheck`, `npm run build` correctos.
- E2E de rutas: **10/10** correctos, incluyendo tablero agrupado por zona y tamaño.
- `git diff --check`: correcto.

## Despliegue y UAT

1. Ejecutar la migración nueva en el API antes de probar el tablero en producción.
2. Compilar el panel si el hosting no lo hace automáticamente.
3. Verificar un paquete pequeño, uno mediano, uno grande y uno frágil.
4. Confirmar que un paquete con último custodio piloto no aparece en el tablero.
5. Confirmar que el contador de custodia cambia después del escaneo del piloto.

La siguiente iteración puede usar este contrato para construir la propuesta balanceada por piloto, localidad, capacidad y punto de salida, y después generar el manifiesto de despacho.
