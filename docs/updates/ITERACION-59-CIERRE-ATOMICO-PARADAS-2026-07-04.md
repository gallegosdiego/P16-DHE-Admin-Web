# Iteracion 59 - cierre atomico de paradas movil-admin

## Objetivo

Robustecer la comunicacion entre `P15-DHE-App-Repartidor` y `P16-DHE-Admin-Web` en el punto mas sensible del flujo: cerrar una entrega o una novedad desde la app piloto sin dejar estados partidos entre envio y parada.

## Problema detectado

El flujo movil historico dependia de dos requests separados:

1. `POST /api/shipments/{id}/status`
2. `POST /api/routes/{route}/stops/{stop}/complete`

Si el primer request quedaba persistido pero el segundo fallaba por red, timeout o reintento del usuario, aparecian sintomas como:

- `Transicion no permitida: Entregado -> Entregado`
- ruta activa con la parada aun abierta;
- dashboard movil desalineado con el estado real del envio;
- necesidad de volver a intentar manualmente sin garantias.

## Solucion implementada

### Backend P16

- nuevo endpoint `POST /api/routes/{route}/stops/{stop}/resolve`
- mismo scope y permisos operativos de cierre de parada
- resuelve de forma atomica:
  - cambio de estado del envio (`delivered` o `issue`)
  - evidencia fotografica
  - nombre del receptor
  - recaudo COD
  - cierre de la parada
  - reconciliacion de progreso y estado de la ruta

### Guardas adicionales

- si el envio sigue en `assigned_to_route`, el backend normaliza la cadena valida hacia `in_transit` antes de `delivered`;
- si el envio ya estaba `delivered` o `issue`, igual cierra la parada pendiente;
- si la parada ya estaba completada, no duplica conteos.

### App P15

- la pantalla `app/parada/[stopId].tsx` usa `resolve` como camino principal;
- si el backend desplegado aun no soporta `resolve` (`404/405`), la app cae al flujo legacy;
- el fallback legacy tolera reintentos de transicion repetida y continua con el cierre de parada;
- tras cada entrega/novedad exitosa, la app refresca `operational-state` antes de volver.

## Validacion ejecutada

- `php artisan test --filter="ScopedEndpointTest|RouteTest|ShipmentEdgeCaseTest" --do-not-cache-result`
- `npx tsc --noEmit` en `P15-DHE-App-Repartidor`
- `php -l api/app/Http/Controllers/Api/RouteController.php`

## Impacto esperado

- menos estados parciales entre envio y ruta;
- menos errores de transicion repetida por reintentos;
- mejor coherencia entre app piloto, panel admin y tracking operativo;
- rollout seguro porque el movil mantiene fallback legacy mientras producción termina de desplegar el backend.
