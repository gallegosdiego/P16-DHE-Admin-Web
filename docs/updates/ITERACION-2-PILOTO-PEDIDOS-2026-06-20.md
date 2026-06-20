# Iteración 2 — Pedidos asignados al piloto que no aparecen

Fecha: 2026-06-20  
Rama: `dev`  
Alcance: backend API del panel administrativo y app repartidor

## Bug auditado

Después de cerrar sesión o crear/asignar pedidos desde el panel, el piloto podía quedar sin ver paquetes en la app móvil aunque el panel administrativo mostrara pedidos asignados a ese piloto.

## Diagnóstico

El endpoint móvil `GET /api/driver/assigned-shipments` excluía cualquier pedido que tuviera registros en `route_stops`.

Eso dejaba paquetes invisibles cuando existía una parada obsoleta:

- parada de una ruta de días anteriores;
- parada en una ruta cerrada/completada;
- parada en una ruta de otro piloto después de reasignar el pedido;
- parada incoherente creada por cambios de estado o pruebas operativas.

En esos casos el pedido no aparecía en:

- `GET /api/driver/my-route`, porque solo devuelve ruta abierta del piloto para hoy;
- `GET /api/driver/assigned-shipments`, porque cualquier `route_stop` lo bloqueaba.

## Corrección aplicada

Se cambió la regla de bloqueo:

- antes: cualquier `route_stop` bloqueaba el pedido;
- ahora: solo bloquea una parada dentro de una ruta abierta vigente del mismo piloto, del día actual y con estado `planned` o `active`.

Además, al crear una ruta inteligente con `POST /api/driver/smart-route`, el backend:

1. detecta paradas obsoletas de los pedidos seleccionados;
2. elimina únicamente esas paradas obsoletas;
3. recalcula `total_stops` y `completed_stops` de las rutas afectadas;
4. agrega el pedido a la ruta abierta actual del piloto;
5. actualiza el pedido a `in_transit` cuando la ruta queda activa.

## Archivos modificados

- `api/app/Http/Controllers/Api/RouteController.php`
- `api/tests/Feature/ScopedEndpointTest.php`

## Pruebas agregadas

- El piloto no ve como asignado un paquete que ya está en su ruta abierta vigente.
- El piloto sí ve como asignado un paquete con parada obsoleta.
- La ruta inteligente recupera un paquete con parada obsoleta, limpia la parada vieja y recalcula contadores.

## Validación ejecutada

```bash
LOG_CHANNEL=null ./vendor/bin/phpunit --filter driver_ --do-not-cache-result tests/Feature/ScopedEndpointTest.php
```

Resultado: 5 pruebas, 16 aserciones, OK.

```bash
LOG_CHANNEL=null ./vendor/bin/phpunit --do-not-cache-result tests/Feature/ScopedEndpointTest.php tests/Feature/RouteTest.php
```

Resultado: 20 pruebas, 60 aserciones, OK.

```bash
git diff --check
```

Resultado: OK.

## Autoauditoría de omisiones

Esta iteración corrige una causa real de paquetes invisibles para el piloto, pero no cierra todavía todos los bugs reportados.

Pendientes detectados:

- verificar integridad entre `users.driver_id` y `drivers.id` para evitar pilotos autenticados sin alcance operativo;
- revisar carga de pedidos con foto de evidencia inicial;
- revisar creación de pedidos con `payment_type = mercado_libre`;
- mejorar labels persistentes sobre campos de creación de pedido;
- optimizar responsive mobile del panel administrativo;
- revisar métricas del dashboard que aparecen en cero aunque hay pedidos;
- revisar UX móvil cuando existe ruta `planned`: el dashboard permite iniciarla, pero la pestaña de pedidos muestra estado vacío hasta activar.

