# Iteracion 15 - Auditoria comunicacion piloto/admin

Fecha: 2026-06-27

## Objetivo

Corregir omisiones detectadas entre la app piloto, el panel administrativo y la API Laravel.

## Cambios backend

- Se agrego fallback cPanel `POST /api/routes/{route}/stops/{stop}/delete` para desasignar paradas cuando `DELETE` no este disponible.
- Las respuestas de rutas usan payload seguro desde consultas raw para evitar errores por enums legacy en `shipments`.
- `GET /api/driver/assigned-shipments` tambien usa payload seguro y ya no depende de serializacion Eloquent de `Shipment`.
- `GET /api/routes`, `GET /api/routes/{route}`, `POST /api/routes/{route}/optimize`, `POST /api/driver/smart-route` y desasignacion devuelven un contrato consistente de ruta.

## Cambios app piloto relacionados

- APK objetivo: `4.2.6`.
- La app usa fallback de desasignacion compatible con cPanel.
- Perfil deja de intentar subir avatar porque no existe contrato backend de avatar.
- Detalle de parada evita actualizar estado React durante render.

## Validacion

- `php -l api/app/Http/Controllers/Api/RouteController.php`
- `php artisan test --filter=ScopedEndpointTest`
- `php artisan test --filter=RouteTest`
- `npm run typecheck`
- `npm run lint`

## Orden de despliegue

1. Desplegar este backend en cPanel.
2. Instalar APK piloto `4.2.6`.
3. Probar login, sincronizacion, mapa, crear/optimizar ruta, entregar COD y desasignar parada.
