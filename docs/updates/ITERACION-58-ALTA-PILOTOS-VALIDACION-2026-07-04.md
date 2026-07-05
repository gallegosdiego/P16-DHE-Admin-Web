# Iteracion 58 - alta de pilotos mas robusta

Fecha: 2026-07-04
Modulo: `api/app/Http/Controllers/Api/DriverController.php` y `frontend/src/app/(admin)/conductores/page.tsx`

## Problema

El alta de nuevos pilotos podia romperse por incoherencias entre formulario, validacion y esquema:

- la UI permitia enviar el piloto sin telefono;
- el backend aceptaba `phone` nullable aunque `drivers.phone` es obligatorio en base;
- el backend enviaba `daily_rate = null` aunque la columna real no admite nulos.

Resultado: el guardado terminaba en `500` en vez de responder una validacion clara.

## Correccion aplicada

- `phone` ahora es obligatorio en `POST /api/drivers`;
- el backend recorta y valida que no llegue vacio;
- `daily_rate` ahora cae en `0` si la UI no lo manda;
- el formulario web de pilotos ahora exige telefono antes de enviar.

## Validacion

- `php artisan test --filter="test_admin_can_create_driver_with_mobile_access|test_admin_cannot_create_driver_without_phone" --do-not-cache-result`
- `npm run typecheck`
- `npx eslint "src/app/(admin)/conductores/page.tsx"`

## Impacto

- alta de pilotos mas estable;
- errores de usuario convertidos en `422` legibles;
- menos riesgo de `500` por payload incompleto desde el panel.