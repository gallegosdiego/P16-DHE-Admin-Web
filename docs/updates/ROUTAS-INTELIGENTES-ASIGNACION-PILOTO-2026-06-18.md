# Rutas inteligentes y asignacion directa a piloto

Fecha: 2026-06-18
Repos relacionados:
- P16-DHE-Admin-Web: backend Laravel + panel admin Next.js
- P15-DHE-App-Repartidor: app Android piloto

## Problema corregido

El panel administrativo permitia crear pedidos y asignarlos a un piloto, pero la app Android del piloto solo consultaba `/driver/my-route`. Si el pedido estaba asignado con `shipments.driver_id`, pero todavia no tenia `route_stops`, el piloto no lo veia y no podia tomarlo para transporte.

La regla de negocio definida queda asi:

1. El admin/operador crea el pedido.
2. El admin/operador asigna un piloto al pedido.
3. La app del piloto muestra esos pedidos en una bandeja de paquetes asignados.
4. El piloto selecciona los pedidos que va a transportar.
5. El piloto crea una ruta inteligente desde la app.
6. El backend crea o reutiliza una ruta abierta del dia, agrega paradas, actualiza estados y optimiza el orden cuando hay coordenadas.

No se debe exigir que el admin cree una ruta antes para que el piloto vea sus pedidos.

## Cambios backend

### Nuevos endpoints de piloto

- `GET /api/driver/assigned-shipments`
  - Devuelve pedidos asignados al piloto autenticado.
  - Excluye pedidos entregados, devueltos, cancelados o ya incluidos en una ruta.
  - Usa `scope` para tomar `_scoped_driver_id` desde el token.

- `POST /api/driver/smart-route`
  - Recibe `shipment_ids` y opcionalmente `driver_lat`, `driver_lng`.
  - Solo acepta pedidos asignados al piloto autenticado.
  - Crea o reutiliza una ruta abierta del dia.
  - Activa la ruta y pasa los pedidos a `in_transit`.
  - Ordena paradas con `RouteOptimizationService` si hay coordenadas suficientes.

### Rutas admin

- `GET /api/routes/routable-shipments`
  - Lista pedidos que pueden entrar a ruta.
  - Excluye pedidos terminales o que ya tengan `route_stops`.
  - Permite filtrar por piloto y busqueda.

- `POST /api/routes`
  - Ahora crea o agrega pedidos a una ruta abierta del dia.
  - Acepta `activate`, `driver_lat`, `driver_lng`.
  - Solo permite pedidos sin piloto o ya asignados al piloto seleccionado.

### Seguridad

- Los endpoints operativos de rutas ahora aplican `scope`.
- Un piloto no puede ver, iniciar, completar, optimizar o remover paradas de rutas de otro piloto.
- Los clientes quedan bloqueados en endpoints operativos de rutas; deben usar el portal cliente.
- `ClientController::myDashboard()` ahora lee `_scoped_client_id` desde atributos internos del request, no desde input manipulable.
- `ScopeClient` reconoce roles reales y legacy: `administrador`, `operador`, `driver`, `conductor`, `client`, `cliente`.
- `ProductionSeeder` sincroniza permisos para roles legacy `conductor` y `cliente`.

## Cambios panel admin

Archivo principal: `frontend/src/app/(admin)/rutas/page.tsx`

- Rediseño del modulo de rutas como tablero operativo.
- Bandeja de "Pedidos por enrutar".
- Creacion de ruta inteligente seleccionando pedidos.
- Filtro por piloto y busqueda.
- Opcion de activar la ruta inmediatamente.
- Geolocalizacion del navegador como origen opcional para optimizacion.

Tambien se corrigio `frontend/src/app/(admin)/pedidos/page.tsx` para que el typecheck no falle cuando falte `display_code` o `tracking_code` en acciones de eliminar.

## Cambios de modelo

`Shipment` ahora tiene relacion:

```php
public function routeStops(): HasMany
{
    return $this->hasMany(RouteStop::class);
}
```

Esto permite filtrar de forma segura pedidos que ya estan en una ruta.

## Verificacion ejecutada

Backend:

```bash
php -l app/Http/Controllers/Api/RouteController.php
php -l app/Http/Middleware/ScopeClient.php
php -l app/Http/Controllers/Api/ClientController.php
php artisan test --filter=RouteTest
php artisan test --filter=ScopedEndpointTest
```

Frontend P16:

```bash
npm run typecheck
```

App P15:

```bash
npx tsc --noEmit
```

Resultados:

- `RouteTest`: 9/9 passed
- `ScopedEndpointTest`: 7/7 passed
- Typecheck P16: passed
- Typecheck P15: passed

## Pendientes operativos

- Desplegar backend P16 manualmente al servidor.
- Desplegar frontend P16 por Vercel despues del push.
- Publicar o distribuir build actualizado de P15 para que el piloto reciba la bandeja de paquetes asignados.
- Configurar Google Maps API key si se quiere optimizacion real con matriz/rutas externas. Sin API key queda fallback local.
- Revisar geocodificacion masiva de pedidos antiguos sin `recipient_lat` / `recipient_lng`.

## Auditoria final

Estado: aprobado para subir.

Puntos reforzados durante la auditoria:

- Se corrigio exposicion potencial de rutas operativas a usuarios cliente.
- Se evito que una ruta completada del mismo dia oculte nuevos paquetes asignados al piloto.
- Se robustecio `addStop` para impedir duplicados, paquetes terminales o paquetes de otro piloto.
- Se agregaron tests de seguridad para cliente y piloto.

Riesgo residual:

- La optimizacion depende de coordenadas. Si un pedido no tiene lat/lng, se ubica al final del orden optimizado.
- Si se requiere multiples rutas simultaneas por piloto en el mismo dia, hoy el sistema reutiliza una ruta abierta por piloto/dia. Si ya esta completada, crea una nueva ruta abierta cuando se agregan nuevos pedidos.
