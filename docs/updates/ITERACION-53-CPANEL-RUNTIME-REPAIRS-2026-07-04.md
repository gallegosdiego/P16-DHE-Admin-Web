# Iteracion 53 - Reparadores runtime cPanel

Fecha: 2026-07-04

## Objetivo

Cerrar dos pendientes tecnicos que seguian abiertos en produccion por el modelo de deploy manual en cPanel:

1. columnas documentales de pilotos que existian en codigo pero no siempre en la base activa;
2. indice heredado unico `driver_id + route_date` en `routes`, que dejaba a produccion por detras del soporte actual para continuidad y reapertura de rutas del mismo dia.

## Cambios

- Nuevo script `api/scripts/repair-driver-documents-schema.php`.
  - agrega de forma idempotente:
    - `driver_license_photo`
    - `vehicle_registration_photo`
    - `soat_photo`
    - `technical_inspection_photo`
    - `national_id_front_photo`
    - `national_id_back_photo`
    - `driver_license_expires_at`
    - `soat_expires_at`
    - `technical_inspection_expires_at`

- Nuevo script `api/scripts/repair-route-day-index.php`.
  - detecta en MySQL si `routes` conserva el indice unico heredado sobre `driver_id, route_date`;
  - elimina ese indice unico;
  - crea el indice no unico esperado por la arquitectura actual.

- `.cpanel.yml` ahora ejecuta ambos scripts durante `Desplegar commit HEAD`.

- `api/tests/Feature/AuthTest.php` ahora verifica en `/api/deploy-check`:
  - `driver_document_ready = true`
  - `driver_document_expiry_ready = true`
  - `route_day_index_optimized = true`

## Validacion

- `php -l api/scripts/repair-driver-documents-schema.php`
- `php -l api/scripts/repair-route-day-index.php`
- `php artisan test --filter=AuthTest --do-not-cache-result`
- `php artisan test --filter=ScopedEndpointTest --do-not-cache-result`

## Resultado esperado despues del deploy manual

`https://api.danheiexpress.com/api/deploy-check` debe reflejar:

```json
"driver_document_ready": true,
"driver_document_expiry_ready": true,
"route_day_index_optimized": true
```

## Nota operativa

Estos reparadores no sustituyen migraciones generales; solo cierran la brecha entre el codigo ya desplegado y la realidad de produccion cuando cPanel hace un deploy manual sin `php artisan migrate --force`.
