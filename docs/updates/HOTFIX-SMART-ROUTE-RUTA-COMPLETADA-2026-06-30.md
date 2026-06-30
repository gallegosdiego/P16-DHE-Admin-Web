# Hotfix - smart-route despues de completar la ruta del dia

Fecha: 2026-06-30  
Repo: `P16-DHE-Admin-Web`  
Rama local al aplicar: `main`

## Sintoma reportado

Despues de entregar los pedidos previos del dia, la app piloto mostraba:

- `1 paquete asignado`
- `Sin ruta activa` en mapa
- error `Error del servidor en /driver/smart-route` al tocar `Agregar a mi ruta`

## Causa confirmada

Cuando el piloto completaba todas las paradas, la ruta del dia quedaba en estado `completed`.

Luego, si administracion asignaba un nuevo paquete ese mismo dia, `POST /api/driver/smart-route` buscaba solo rutas `planned` o `active`. Al no encontrar una, intentaba crear una nueva fila `routes` para el mismo `driver_id` y `route_date`.

La tabla `routes` tiene restriccion unica por piloto y fecha:

```text
unique(driver_id, route_date)
```

Eso provocaba el error `500`.

## Correccion aplicada

- Si ya existe una ruta del mismo dia en estado `completed`, `smart-route` la reabre en `active` o `planned` segun el flujo.
- Antes de reabrirla, recalcula `total_stops` y `completed_stops` desde las paradas reales.
- Luego agrega el nuevo paquete como parada pendiente sin romper el historico de entregas ya completadas.

## Validacion local

Pruebas ejecutadas:

```powershell
php -l api/app/Http/Controllers/Api/RouteController.php
php -l api/tests/Feature/ScopedEndpointTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php --filter test_driver_smart_route_reopens_completed_route_for_same_day_new_package
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php
LOG_CHANNEL=null vendor/bin/phpunit --do-not-cache-result tests/Feature/RouteTest.php
```

Resultados:

- Caso nuevo: `1` prueba, `8` aserciones verdes.
- Scope piloto: `22` pruebas, `85` aserciones verdes.
- Rutas: `11` pruebas, `36` aserciones verdes.

## Efecto esperado en la app

Despues del deploy:

1. El piloto podra tocar `Agregar a mi ruta` sin error `500`.
2. La ruta del dia volvera a mostrarse en mapa y pedidos.
3. Las entregas ya completadas del dia seguiran contando en la misma ruta reabierta.
