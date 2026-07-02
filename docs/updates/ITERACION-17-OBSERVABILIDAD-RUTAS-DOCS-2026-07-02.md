# Iteracion 17 - observabilidad de rutas y limpieza documental

Fecha: 2026-07-02

## Objetivo

Seguir con los pendientes reales sin abrir un frente gigante nuevo:

- reforzar observabilidad del flujo piloto;
- dejar trazabilidad operativa en backend;
- alinear documentacion con el estado verdadero del codigo.

## Backend reforzado

Se agregaron eventos estructurados en `RouteController` para:

- sincronizacion/creacion/reapertura de jornada:
  - `driver.route_day.synced`
- optimizacion de ruta:
  - `driver.route.optimized`
- optimizacion omitida por geodata faltante:
  - `driver.route.optimization_skipped_missing_geo`
  - `driver.route.smart_route_missing_geo`
- optimizacion sin origen GPS:
  - `driver.route.smart_route_optimized_without_origin`
- avance operativo:
  - `driver.route.stop_completed`
  - `driver.route.stop_removed`
  - `driver.route.finalized`

Ademas, los warnings del fallback de optimizacion ahora incluyen mejor contexto de `route_id`, `driver_id` y conteos de paradas.

## Documentacion actualizada

### P16

- `docs/operations/OBSERVABILITY-RUNBOOK.md`
- `docs/PENDIENTES-MAESTROS-PLATAFORMAS-2026-07-01.md`
- `docs/ARCHITECTURE.md`

### P15

- `README.md`
- `docs/ARCHITECTURE.md`

## Impacto

- cuando vuelva a fallar una ruta o el mapa, ya no dependemos solo del mensaje del celular;
- queda mas claro si el problema fue:
  - geocodificacion,
  - optimizacion,
  - continuidad de jornada,
  - desasignacion/finalizacion,
  - o estado del piloto.

## Pendientes que siguen abiertos

- QA completo en dispositivo real;
- geocodificacion confiable de todos los pedidos enroutables;
- visualizacion administrativa mas rica del recorrido del piloto;
- endurecimiento final de deploy y auth admin.
