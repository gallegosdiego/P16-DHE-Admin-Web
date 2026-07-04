# Iteración 52 - hotfix entrega con evidencia y enums legacy

## Problema atendido

En producción todavía podían aparecer errores al entregar pedidos desde la app piloto en `POST /api/shipments/{id}/status`, especialmente cuando coincidían dos factores:

1. el envío venía con valores legacy o humanizados en `status`, `payment_type` o `financial_status`;
2. la entrega incluía foto de evidencia y/o nombre de quien recibió.

## Diagnóstico

El flujo ya normalizaba algunos valores legacy, pero todavía estaba limitado a pocos aliases exactos:

- `route`
- `contra_entrega`
- `contra entrega`
- `pending_collection`
- `none`
- `paid`

Eso dejaba por fuera otras variantes plausibles que sí pueden existir en bases heredadas o datos editados manualmente, por ejemplo:

- `En ruta`
- `Contra entrega`
- `Pendiente`
- `Registrado`, `Entregado`, `Novedad`

Además, el guardado de evidencia no verificaba explícitamente si las columnas `evidence_photo` y `evidence_receiver_name` estaban disponibles en el esquema activo.

## Cambios aplicados

### Backend

Archivo:

- `api/app/Http/Controllers/Api/ShipmentController.php`

Cambios:

- Se agregó una canonicalización interna (`canonicalLegacyEnumValue`) para normalizar mayúsculas, acentos, espacios y separadores antes de mapear enums legacy.
- Se amplió la normalización de `status` con aliases como:
  - `en_ruta`
  - `registrado`
  - `confirmado`
  - `recogido`
  - `en_bodega`
  - `asignado`
  - `entregado`
  - `novedad`
  - `devuelto`
  - `cancelado`
- Se amplió la normalización de `payment_type` con aliases como:
  - `contraentrega`
  - `cashondelivery`
  - `postventa`
  - `postsale`
  - `mercadolibre`
- Se amplió la normalización de `financial_status` con aliases como:
  - `pendiente`
  - `pendiente_de_recaudo`
  - `recaudado`
  - `liquidado`
  - `facturado`
  - `vencido`
- Se blindó el guardado de evidencia para que solo escriba en:
  - `evidence_photo`
  - `evidence_receiver_name`
  cuando esas columnas existen realmente en el esquema.

### Modelo

Archivo:

- `api/app/Domain/Shipment/Models/Shipment.php`

Cambios:

- Se agregaron helpers:
  - `supportsEvidencePhotoField()`
  - `supportsEvidenceReceiverField()`

## Pruebas agregadas

Archivo:

- `api/tests/Feature/ScopedEndpointTest.php`

Nueva cobertura:

- entrega exitosa de un pedido COD legacy con:
  - `status = En ruta`
  - `payment_type = Contra entrega`
  - `financial_status = Pendiente`
  - `evidence_photo`
  - `evidence_receiver_name`

## Validación ejecutada

- `php artisan test --filter="test_driver_can_deliver_legacy_route_cod_without_server_error|test_driver_can_deliver_legacy_cod_with_evidence_photo_and_human_labels_without_server_error|test_driver_can_deliver_cod_with_zero_original_amount_and_collect_real_amount"`
- `php artisan test --filter="ScopedEndpointTest|RouteTest"`

Resultado:

- `53` pruebas OK
- `337` assertions OK

## QA recomendado

1. Tomar un pedido COD con monto real.
2. Entregarlo desde la app piloto con foto.
3. Probar también un pedido heredado que venga de datos viejos.
4. Confirmar:
   - no aparece error del servidor;
   - el pedido queda `delivered`;
   - el recaudo queda en `financial_status = collected`;
   - la foto de evidencia sigue visible en admin si el esquema la soporta.
