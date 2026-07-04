# Iteracion 55 - reconciliacion de rutas del dia

Fecha: `2026-07-04`

## Problema

En produccion se estaban mezclando dos verdades:

- la **jornada del dia** ya aparecia completa;
- pero todavia podia existir una fila de `routes` abierta (`planned` o `active`) sin paradas pendientes.

Eso generaba sintomas como:

- app movil mostrando `Ruta Programada / EN CURSO` con `0 de 0 completados`;
- boton de finalizar visible aunque ya no hubiera nada por entregar;
- fallback legacy (`/api/driver/my-route`) devolviendo estados incoherentes frente a `/api/driver/operational-state`.

## Correccion aplicada

Se agrego una reconciliacion preventiva en `api/app/Http/Controllers/Api/RouteController.php` antes de exponer la ruta del conductor:

1. recorre todas las rutas del piloto del dia actual;
2. recalcula `total_stops` y `completed_stops` desde `route_stops`;
3. elimina rutas abiertas vacias (`planned`/`active` con `0` paradas reales);
4. marca como `completed` cualquier ruta del dia que ya no tenga pendientes;
5. resincroniza snapshots de metricas, geometria y estado operativo del piloto.

Adicionalmente:

- `findDriverNavigableRouteRow()` ahora solo considera rutas con al menos una parada `pending`;
- `aggregateRouteDayStatus()` devuelve `completed` si el dia ya no tiene pendientes, incluso si habia una fila abierta incoherente;
- el endpoint legacy `GET /api/driver/my-route` tambien ejecuta la reconciliacion, no solo `GET /api/driver/operational-state`.

## Impacto esperado

- si el ultimo paquete ya fue entregado, la app deja de ver una ruta navegable fantasma;
- el dashboard del piloto puede apoyarse en `routeDay` sin pelear contra una `route` vacia;
- el fallback legacy queda alineado con el endpoint operativo nuevo.

## Cobertura

Se agregaron regresiones en `api/tests/Feature/ScopedEndpointTest.php` para validar:

- cierre automatico de una ruta activa que ya tenia todas sus paradas completadas;
- limpieza de rutas abiertas vacias al consultar `GET /api/driver/my-route`.
