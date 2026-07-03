# Iteración 51 - hotfix legacy delivery - 2026-07-03

## Contexto

En producción se reportó un error al entregar pedidos desde la app piloto:

- `Error del servidor en /shipments/{id}/status`

El fallo aparecía sobre todo en pedidos heredados que seguían teniendo valores legacy en base de datos, por ejemplo:

- `status = route`
- `payment_type = contra_entrega`
- `financial_status = pending_collection`

`/api/driver/my-route` ya sobrevivía esos registros por serialización segura, pero `ShipmentController::changeStatus()` seguía trabajando sobre casts enum directos del modelo y podía romper con error 500.

## Cambio aplicado

En `api/app/Http/Controllers/Api/ShipmentController.php`:

- se agregó normalización previa para valores legacy antes de ejecutar la transición;
- se mapean:
  - `route` -> `in_transit`
  - `contra_entrega` / `contra entrega` -> `cash_on_delivery`
  - `post_venta` / `post venta` -> `post_sale`
  - `prepago` -> `prepaid`
  - `mercado libre` -> `mercado_libre`
  - `pending_collection` / `none` -> `pending`
  - `paid` -> `settled`
- además, las transiciones inválidas ahora responden `422` en vez de dejar caer un `500`.

## Cobertura agregada

Se añadió prueba en `api/tests/Feature/ScopedEndpointTest.php` para confirmar que un envío con enums legacy puede pasar a `delivered` sin error del servidor.

## Validación ejecutada

- `php artisan test --filter=ScopedEndpointTest`
- resultado: `38` pruebas OK

## Impacto esperado

- la entrega desde P15 deja de fallar por registros legacy;
- el backend responde de forma más segura y diagnosticable cuando una transición no es válida.
