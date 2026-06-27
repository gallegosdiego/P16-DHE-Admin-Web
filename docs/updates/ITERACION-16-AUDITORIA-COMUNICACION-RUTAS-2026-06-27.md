# Iteracion 16 - Auditoria comunicacion rutas piloto/admin

Fecha: 2026-06-27

## Objetivo

Auditar comunicacion entre app piloto, panel administrativo y API para corregir omisiones que podian causar:

- `Server Error` en `/driver/my-route`.
- Paquetes en ruta activa que desaparecian despues de cerrar sesion.
- Paquetes duplicados como disponibles cuando seguian en una ruta activa antigua.
- Dependencia innecesaria de Google Routes cuando no hay llave configurada.

## Cambios backend

- `/driver/my-route` ahora prioriza cualquier ruta `active` del piloto, aunque sea de una fecha anterior.
- Las rutas `planned` siguen limitadas al dia actual.
- `assigned-shipments`, `routable-shipments` y la recuperacion de paradas antiguas usan la misma regla:
  - ruta `active`: bloquea paquetes sin importar fecha;
  - ruta `planned`: bloquea paquetes solo si es del dia actual.
- `RouteOptimizationService` usa optimizacion local directamente si `GOOGLE_MAPS_API_KEY` no esta configurada.

## Pruebas agregadas

- Ruta activa de dia anterior vuelve en `/driver/my-route`.
- Paquete dentro de ruta activa antigua no aparece como asignado sin ruta.
- Panel no ofrece como enrutable un paquete que sigue dentro de ruta activa antigua.

## Validacion

- `php -l app/Http/Controllers/Api/RouteController.php`
- `php -l app/Domain/Shipment/Services/RouteOptimizationService.php`
- `php artisan test --filter=ScopedEndpointTest`
- `php artisan test --filter=RouteTest`
- `php artisan test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Resultado final: backend 214 pruebas pasadas, panel compilado correctamente.

## Auditoria de contratos API

Se cruzaron 93 llamadas API desde app piloto y panel administrativo contra `php artisan route:list --json --path=api`.

Resultado: 0 endpoints faltantes.
