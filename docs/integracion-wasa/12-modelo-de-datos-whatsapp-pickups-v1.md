# Modelo De Datos - WhatsApp Pickups V1

Fecha: 2026-07-07

## 1. Objetivo

Definir el modelo de datos inicial para soportar:

- solicitudes de recogida por WhatsApp;
- multiples paquetes por solicitud;
- configuracion por cliente;
- contactos autorizados;
- inbox de webhooks;
- trazabilidad;
- revision manual separada de la operacion activa.

## 2. Principios

1. Reutilizar `customers`, direcciones y auditoria existentes.
2. No mezclar review domain con operacion activa.
3. Persistir idempotencia en base de datos.
4. Mantener trazabilidad completa por `correlation_id`.
5. Separar autorizacion de contacto de reglas operativas de la solicitud.

## 3. Entidades nuevas recomendadas

## `customer_whatsapp_settings`

Configura si un cliente puede operar recogidas por WhatsApp y con que limites.

Campos recomendados:

```text
id
customer_id unique
status
cod_enabled
automatic_package_limit
manual_review_package_limit
automatic_cod_limit
manual_review_cod_limit
automatic_cod_total_limit
allowed_windows_json
default_pickup_address_id nullable
activated_at nullable
activated_by nullable
suspended_at nullable
suspended_by nullable
suspension_reason nullable
created_at
updated_at
```

Estados:

```text
DISABLED
PENDING_CONFIGURATION
ACTIVE
SUSPENDED
```

Indices:

- `unique(customer_id)`
- `index(status)`

## `whatsapp_contacts`

Identidad tecnica del numero WhatsApp.

Campos:

```text
id
wa_id unique
phone
display_name nullable
verification_status
last_verified_at nullable
blocked_at nullable
created_at
updated_at
```

Estados sugeridos:

```text
UNKNOWN
KNOWN
VERIFIED
BLOCKED
```

Indices:

- `unique(wa_id)`
- `index(phone)`

## `customer_whatsapp_contacts`

Relacion entre contacto WhatsApp y cuenta cliente.

Campos:

```text
id
customer_id
whatsapp_contact_id
role
status
authorized_at nullable
authorized_by nullable
revoked_at nullable
revoked_by nullable
created_at
updated_at
```

Estados:

```text
PENDING
AUTHORIZED
SUSPENDED
REVOKED
```

Indices:

- `unique(customer_id, whatsapp_contact_id)`
- `index(customer_id, status)`

## `customer_whatsapp_contact_permissions`

Permisos por contacto y cuenta.

Campos:

```text
id
customer_whatsapp_contact_id
permission
created_at
```

Permisos iniciales:

```text
CREATE_PICKUP
VIEW_OWN_PICKUPS
USE_SAVED_ADDRESSES
CREATE_COD_SHIPMENT
CANCEL_UNASSIGNED_PICKUP
```

Indices:

- `unique(customer_whatsapp_contact_id, permission)`

## `whatsapp_link_requests`

Bandeja separada para telefonos no autorizados.

Campos:

```text
id
whatsapp_contact_id
requested_customer_id nullable
requested_company_name nullable
status
requested_by_phone
notes nullable
approved_by nullable
approved_at nullable
rejected_by nullable
rejected_at nullable
rejection_reason nullable
created_at
updated_at
```

Estados:

```text
PENDING
APPROVED
REJECTED
EXPIRED
```

Indices:

- `index(status, created_at)`
- `index(whatsapp_contact_id)`

## `whatsapp_webhook_inbox`

Registro bruto e idempotente de eventos entrantes.

Campos:

```text
id
provider
external_event_id nullable
event_type
payload_hash
signature_valid
processing_status
received_at
processed_at nullable
correlation_id
payload_json
headers_json nullable
error_code nullable
error_message nullable
created_at
updated_at
```

Estados:

```text
RECEIVED
DEDUPED
QUEUED
PROCESSED
FAILED
IGNORED
```

Indices y restricciones:

- `unique(provider, external_event_id)` cuando exista
- `unique(payload_hash)` cuando aplique a submissions
- `index(processing_status, received_at)`
- `index(correlation_id)`

## `whatsapp_messages`

Mensajes entrantes y salientes ya interpretados.

Campos:

```text
id
whatsapp_contact_id nullable
customer_id nullable
direction
provider_message_id unique
message_type
message_status nullable
related_entity_type nullable
related_entity_id nullable
correlation_id
payload_json
sent_at nullable
received_at nullable
created_at
updated_at
```

Indices:

- `unique(provider_message_id)`
- `index(whatsapp_contact_id, created_at)`
- `index(related_entity_type, related_entity_id)`

## `whatsapp_flow_submissions`

Submissions de Flow con capacidad de idempotencia.

Campos:

```text
id
submission_id unique
flow_id
whatsapp_contact_id nullable
customer_id nullable
pickup_request_id nullable
status
payload_json
payload_hash
processed_at nullable
correlation_id
created_at
updated_at
```

Estados:

```text
RECEIVED
VALIDATED
PROCESSED
FAILED
DUPLICATE
```

Indices:

- `unique(submission_id)`
- `index(customer_id, created_at)`
- `index(correlation_id)`

## `pickup_requests`

Entidad principal de solicitud.

Campos:

```text
id
pickup_code unique
customer_id
customer_whatsapp_contact_id nullable
source
status
review_reason_code nullable
pickup_address_line1
pickup_address_complement nullable
pickup_zone nullable
pickup_city nullable
pickup_lat nullable
pickup_lng nullable
pickup_geocoding_confidence nullable
coverage_status
contact_name
contact_phone
pickup_window_code
pickup_window_label
package_count
requested_cod_total
special_instructions nullable
correlation_id
submitted_at nullable
accepted_at nullable
ready_for_assignment_at nullable
cancelled_at nullable
created_at
updated_at
```

Estados:

```text
draft
pending_review
needs_customer_input
submitted
accepted
ready_for_assignment
assigned
driver_on_the_way
partially_picked_up
picked_up
not_picked_up
cancelled
```

Restricciones e indices:

- `unique(pickup_code)`
- `index(customer_id, status)`
- `index(status, created_at)`
- `index(coverage_status)`
- `index(correlation_id)`

Nota clave:

`pending_review` no debe tratarse como operacion activa.

## `pickup_packages`

Paquetes o envios solicitados dentro de la recogida.

Campos:

```text
id
pickup_request_id
package_index
recipient_name
recipient_phone
delivery_address_line1
delivery_address_complement nullable
delivery_zone nullable
delivery_city nullable
delivery_lat nullable
delivery_lng nullable
delivery_geocoding_confidence nullable
is_cod
requested_cod_amount nullable
is_fragile
package_type nullable
size_code nullable
approx_weight_kg nullable
special_handling_notes nullable
shipment_id nullable
guide_number nullable
qr_reference nullable
created_at
updated_at
```

Indices:

- `unique(pickup_request_id, package_index)`
- `index(shipment_id)`

## `pickup_review_events`

Motivos y acciones sobre solicitudes en revision.

Campos:

```text
id
pickup_request_id
event_type
reason_code nullable
notes nullable
requested_fields_json nullable
old_values_json nullable
new_values_json nullable
actor_type
actor_id nullable
occurred_at
created_at
```

Eventos:

```text
ENTERED_REVIEW
REQUESTED_CUSTOMER_INPUT
APPROVED
CORRECTED
REJECTED
REVALIDATED
```

Indices:

- `index(pickup_request_id, occurred_at)`

## 4. Relaciones principales

```text
customers
  1 -> 1 customer_whatsapp_settings
  1 -> n customer_whatsapp_contacts
  1 -> n pickup_requests

whatsapp_contacts
  1 -> n customer_whatsapp_contacts
  1 -> n whatsapp_messages
  1 -> n whatsapp_flow_submissions
  1 -> n whatsapp_link_requests

pickup_requests
  1 -> n pickup_packages
  1 -> n pickup_review_events
```

## 5. Reuso de tablas existentes

Se deben reutilizar, cuando sea posible:

- `customers`
- `client addresses` o tabla equivalente ya existente
- `audit_logs`
- `shipments`
- `zones`

No es obligatorio duplicar direcciones como entidad separada si el dominio actual ya tiene una solucion fuerte, pero para V1 si conviene persistir snapshot textual dentro de `pickup_requests` y `pickup_packages`.

## 6. Reglas de persistencia clave

### Idempotencia

Debe existir restriccion real de base de datos para:

- `whatsapp_webhook_inbox.external_event_id`
- `whatsapp_flow_submissions.submission_id`
- `whatsapp_messages.provider_message_id`
- `pickup_requests.pickup_code`

### Pending review fuera de operacion

Mientras `pickup_requests.status = pending_review`:

- no crear asignacion;
- no reservar capacidad operativa final;
- no crear transiciones financieras;
- no mostrar en listas de piloto.

### Contacto no autorizado

Si un numero no autorizado intenta operar:

- crear `whatsapp_link_requests`;
- no crear `pickup_requests`.

## 7. Campos configurables por cliente

No deben quedar hardcodeados globalmente:

- `automatic_package_limit`
- `manual_review_package_limit`
- `automatic_cod_limit`
- `manual_review_cod_limit`
- `automatic_cod_total_limit`
- jornadas permitidas
- estado del modulo

## 8. Orden de migraciones recomendado

1. `customer_whatsapp_settings`
2. `whatsapp_contacts`
3. `customer_whatsapp_contacts`
4. `customer_whatsapp_contact_permissions`
5. `whatsapp_link_requests`
6. `whatsapp_webhook_inbox`
7. `whatsapp_messages`
8. `whatsapp_flow_submissions`
9. `pickup_requests`
10. `pickup_packages`
11. `pickup_review_events`

## 9. Decision final de modelo

La V1 necesita separar claramente cuatro planos:

1. configuracion por cliente
2. identidad y autorizacion de contactos
3. ingesta tecnica de WhatsApp
4. dominio operativo `Pickup`

Esa separacion evitara que:

- un numero desconocido cree operaciones reales;
- un webhook duplicado cree dos solicitudes;
- una solicitud dudosa entre a rutas o pilotos antes de tiempo.
