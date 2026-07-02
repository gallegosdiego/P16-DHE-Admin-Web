# Iteracion 20 - autorreparacion de geodatos en pedidos y rutas

Fecha: 2026-07-02
Repositorio: `P16-DHE-Admin-Web`

## Problema auditado

La app piloto ya no se cerraba al abrir el mapa, pero seguia entrando en modo seguro con el mensaje:

- `Ruta sin coordenadas`

El analisis del flujo detecto un hueco real entre:

1. formulario admin de pedidos;
2. modelo `Shipment`;
3. optimizacion de rutas;
4. lectura de ruta activa desde la app piloto.

## Causa raiz confirmada

El formulario admin envia:

- `recipient_address`
- `recipient_zone`

pero no envia `recipient_city`.

La base de datos tiene default para `recipient_city`, pero ese default se aplica **despues** del hook `saving` del modelo.  
En consecuencia:

- el pedido se guardaba;
- la ciudad quedaba en DB;
- pero el intento de geocodificacion no ocurria en ese guardado;
- la ruta quedaba existente pero sin `recipient_lat` y `recipient_lng`.

## Correccion implementada

### 1. Servicio central de geodatos

Se creo:

- `api/app/Domain/Shipment/Services/ShipmentGeodataService.php`

Responsabilidades:

- resolver `recipient_city` desde la zona (`zones.slug -> zones.city`);
- aplicar fallback final con `SHIPMENT_DEFAULT_CITY`;
- volver a geocodificar cuando cambia direccion/ciudad/zona;
- limpiar coordenadas viejas si la direccion cambio y la geo previa ya no es confiable.

### 2. Blindaje en el modelo `Shipment`

`Shipment` ahora delega la reparacion geodata en el hook `saving`, por lo que:

- pedidos nuevos sin ciudad ya no se quedan sin geo por depender del default SQL;
- cambios de direccion o zona ya no conservan coordenadas viejas silenciosamente.

### 3. Autorreparacion cuando el piloto abre o crea ruta

`RouteController` ahora intenta reparar geodatos:

- al abrir `GET /api/driver/my-route`;
- al consultar `GET /api/driver/operational-state`;
- al crear/extender `POST /api/driver/smart-route`;
- al optimizar `POST /api/routes/{route}/optimize`;
- al agregar una parada a una ruta existente.

Esto permite que rutas activas o reabiertas se “curen” solas si el pedido tenia direccion y zona validas pero le faltaban coordenadas.

### 4. Backfill historico mas amplio

El comando:

- `php artisan shipments:geocode-missing`

ya no se limita a `pendingGeocoding()`; ahora audita todos los pedidos sin coordenadas con direccion, intenta resolver ciudad y luego geocodifica.

## Validacion ejecutada

Se validaron:

- `php artisan test --filter="ShipmentTest|GeocodeMissingShipmentsCommandTest|ScopedEndpointTest"`
- `php artisan test`

Resultado:

- `236` pruebas aprobadas
- `938` aserciones aprobadas

## Impacto esperado en produccion

Despues de desplegar este backend:

1. pedidos nuevos creados desde panel deben salir con ciudad resuelta y coordenadas;
2. rutas existentes con paradas sin coordenadas pueden repararse al abrir la ruta del piloto;
3. paquetes nuevos agregados a la jornada del piloto ya no deberian quedarse fuera del mapa por faltar `recipient_city`.

## Lo que aun depende de QA o entorno

Sigue pendiente verificar en produccion:

1. que el deploy actual quede activo en cPanel;
2. que las zonas productivas tengan `slug/city` coherentes;
3. que el pedido puntual visible en app (`#DHE00005` en la evidencia) reciba coordenadas al reabrir la ruta o tras correr backfill si sigue legado;
4. si no hay Google API key, confirmar que el fallback de geocodificacion y el centro de zona cubren los casos operativos esperados.

## Nota operativa

No se agrego ningun despliegue automatico en codigo.  
El flujo sigue siendo compatible con despliegue manual por cPanel.
