# Evidencia de entrega desde app piloto

Fecha: `2026-07-10`

## Problema

La app piloto podia mostrar `Server Error` al tomar foto como evidencia y confirmar entrega.

El riesgo principal estaba en el guardado de `evidence_photo`: si el disco publico de Laravel/cPanel no permitia crear o escribir `public/evidence`, el flujo podia caer como error de servidor.

## Correccion

Se centralizo el guardado de evidencia en `App\Support\ShipmentEvidenceStorage`.

El servicio ahora:

- valida que el archivo enviado sea valido;
- crea/verifica la carpeta `evidence` en el disco `public`;
- comprueba que el archivo haya quedado escrito;
- registra warning tecnico si falla el disco;
- devuelve `422` con mensaje claro para la app en vez de `500 Server Error`.

## Endpoints cubiertos

- `POST /api/routes/{route}/stops/{stop}/resolve`
- `POST /api/shipments/{shipment}/status`

## Validacion

- `php artisan test --filter='test_driver_can_resolve_cod_stop_with_evidence_atomically'`
- `php artisan test --filter='test_driver_can_deliver_legacy_cod_with_evidence_photo_and_human_labels_without_server_error'`
- `php artisan test --filter='driver_can'`

Las pruebas COD con evidencia ahora tambien verifican que el archivo exista en el disco `public`.
