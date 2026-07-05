# Iteracion 60 - endurecimiento de geodata y tracking P15-P16

## Objetivo

Cerrar dos huecos de robustez entre la app piloto y el panel/admin API:

1. evitar pedidos con pares de coordenadas incompletos;
2. volver mas resistente el tracking en segundo plano del piloto frente a red inestable.

## Hallazgos

### 1. Coordenadas manuales parciales

El backend aceptaba `recipient_lat` y `recipient_lng` como campos opcionales independientes.  
Eso dejaba abierta una ventana para que un pedido quedara con solo latitud o solo longitud.

Consecuencias:

- el mapa del piloto no podia dibujar la parada;
- el panel mostraba rutas con datos geograficos ambiguos;
- `repair-geodata` podia operar sobre registros heredados con una sola coordenada.

### 2. Tracking background menos robusto que el foreground

La app piloto ya tenia un flujo de tracking foreground mas tolerante a fallos, pero el task de background seguia con un `fetch` directo:

- sin timeout explicito;
- sin retry corto;
- sin tratamiento fino por codigos HTTP operativos.

## Cambios implementados

### Backend P16

- `ShipmentController` ahora exige pares consistentes:
  - `recipient_lat` requiere `recipient_lng`;
  - `recipient_lng` requiere `recipient_lat`.
- `ShipmentGeodataService` ahora normaliza pares huerfanos:
  - si llega solo una coordenada, limpia ambas;
  - tambien limpia `geocoded_at` para dejar el registro listo para reparacion posterior.
- pruebas agregadas en `ShipmentTest` para:
  - rechazar coordenadas manuales parciales al crear;
  - rechazar coordenadas manuales parciales al editar;
  - limpiar coordenadas huerfanas en `repair-geodata`.

### App P15

- `lib/driver-location-task.ts` ahora usa:
  - timeout explicito;
  - retry corto controlado;
  - tolerancia a `401`, `403`, `409` y `422` sin romper el task;
  - supresion de ruido visual cuando la falla es transitoria en background.

## Validacion ejecutada

- `php -l api/app/Http/Controllers/Api/ShipmentController.php`
- `php -l api/app/Domain/Shipment/Services/ShipmentGeodataService.php`
- `php -l api/tests/Feature/ShipmentTest.php`
- `php artisan test --filter=ShipmentTest --do-not-cache-result`
- `npx tsc --noEmit` en `P15-DHE-App-Repartidor`

## Impacto esperado

- menos pedidos nuevos sin geodata utilizable;
- menos rutas "existentes pero no dibujables" por coordenadas parciales;
- tracking de piloto mas estable en fondo cuando la conectividad fluctua;
- contrato mas claro entre captura de pedidos, reparacion geodata y visualizacion operativa.

## Pendiente real que queda

No queda abierto el contrato tecnico de pares de coordenadas.  
Lo que sigue pendiente es validar en QA/produccion que:

- los pedidos reales nazcan con coordenadas completas o entren a cola de reparacion;
- el tracking background reporte con frescura consistente en operacion de calle.
