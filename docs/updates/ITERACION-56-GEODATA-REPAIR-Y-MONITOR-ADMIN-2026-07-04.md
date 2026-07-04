# Iteracion 56 - geodata repair y monitoreo admin

Fecha: `2026-07-04`

## Objetivo

Cerrar dos pendientes operativos:

1. que pedidos sin coordenadas no se queden indefinidamente bloqueando rutas/mapa;
2. que el modulo administrativo de rutas comunique mejor el estado vivo del piloto.

## Cambios backend

### Reparacion de geodatos bajo demanda

Se agrega:

- `POST /api/shipments/repair-geodata`

Capacidad:

- recibe hasta `25` `shipment_ids`;
- vuelve a ejecutar `ShipmentGeodataService::repair()` sobre cada pedido;
- resuelve ciudad si falta;
- intenta geocodificar direccion;
- si no hay match exacto, usa fallback por zona;
- devuelve resumen de reparados, ya listos y aun faltantes.

## Cambios frontend admin

### Pedidos

La seccion **Cobertura geografica** ahora permite:

- reintentar la geocodificacion visible;
- o reparar los pedidos seleccionados visibles sin salir del modulo.

Esto reduce friccion cuando un pedido existe, pero todavia no quedo listo para mapa/ruta.

### Rutas

El **Centro de monitoreo activo** ahora agrega:

- nivel de atencion operativa (`estable`, `atencion`, `riesgo`);
- linea operativa con hitos legibles;
- lectura mas clara de ping del piloto, parada actual, siguiente parada y degradacion por geodatos.

## Cobertura

- regresion backend para `repair-geodata`;
- `php artisan test --filter='ShipmentTest|RouteTest|ScopedEndpointTest'`;
- `npm run typecheck` en frontend admin;
- `eslint` focalizado sobre rutas/pedidos admin.
