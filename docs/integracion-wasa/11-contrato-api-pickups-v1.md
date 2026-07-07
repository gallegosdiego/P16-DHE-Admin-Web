# Contrato API Inicial - Pickups V1

Fecha: 2026-07-07

## 1. Objetivo

Definir el contrato API inicial para la integracion `WhatsApp -> Pickups` en Danhei, alineado con:

- `Laravel 13`
- `Sanctum Bearer`
- admin `Next.js 16`
- modulo nuevo `Pickup`
- integracion directa con `Meta WhatsApp Cloud API`

## 2. Convenciones

### Base URL

`https://<host>/api`

### Autenticacion

- endpoints publicos de webhook: sin token, con validacion de firma y/o challenge Meta;
- endpoints admin: `Authorization: Bearer <token>`.

### Envelope recomendado

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "errors": []
}
```

### Error shape recomendado

```json
{
  "success": false,
  "data": null,
  "meta": {
    "correlation_id": "wa_01J..."
  },
  "errors": [
    {
      "code": "PICKUP_OUT_OF_COVERAGE",
      "message": "La direccion esta fuera de cobertura.",
      "field": "pickup_address"
    }
  ]
}
```

## 3. Estados de dominio

### Pickup request

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

### Customer WhatsApp status

```text
DISABLED
PENDING_CONFIGURATION
ACTIVE
SUSPENDED
```

### Customer visible status

```text
request_received
pending_review
accepted
delivery_confirmed
```

### Coverage status

```text
IN_COVERAGE
NEAR_BOUNDARY
OUT_OF_COVERAGE
UNRESOLVED
```

## 4. Endpoints publicos de integracion

### `GET /api/integrations/whatsapp/webhook`

Uso:

- verificacion inicial del webhook por Meta.

Query params esperados:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Respuesta exitosa:

```text
200 text/plain
<hub.challenge>
```

Respuesta invalida:

```json
{
  "success": false,
  "data": null,
  "meta": {},
  "errors": [
    {
      "code": "WEBHOOK_VERIFICATION_FAILED",
      "message": "Webhook verification failed."
    }
  ]
}
```

### `POST /api/integrations/whatsapp/webhook`

Uso:

- recepcion de eventos de mensajes, estados y notificaciones de Meta.

Headers obligatorios:

- `X-Hub-Signature-256`

Comportamiento esperado:

1. validar firma con raw body;
2. registrar evento en `WebhookInbox`;
3. deduplicar por `external_event_id` o hash;
4. encolar procesamiento;
5. responder rapido.

Respuesta recomendada:

```json
{
  "success": true,
  "data": {
    "accepted": true
  },
  "meta": {
    "correlation_id": "wa_evt_01J..."
  },
  "errors": []
}
```

### `POST /api/integrations/whatsapp/flows/data-exchange`

Uso:

- endpoint de intercambio de datos para WhatsApp Flows.

Comportamiento:

- descifrar payload;
- validar schema;
- responder datos dinamicos del Flow;
- nunca crear operacion final directamente sin capa de dominio.

Respuesta ejemplo:

```json
{
  "screen": "pickup_packages",
  "data": {
    "pickup_windows": [
      {
        "code": "today_am",
        "label": "Primera jornada"
      },
      {
        "code": "today_pm",
        "label": "Segunda jornada"
      }
    ]
  }
}
```

## 5. Endpoints de dominio `Pickups`

### `GET /api/pickups`

Uso:

- bandeja admin.

Filtros recomendados:

- `status`
- `review_reason`
- `customer_id`
- `source`
- `coverage_status`
- `date_from`
- `date_to`
- `search`
- `per_page`
- `page`

Respuesta:

```json
{
  "success": true,
  "data": [
    {
      "id": 125,
      "pickup_code": "PK-20260707-00125",
      "source": "whatsapp",
      "status": "pending_review",
      "review_reason": "ADDRESS_AMBIGUOUS",
      "customer": {
        "id": 42,
        "name": "Comercializadora ABC"
      },
      "contact_name": "Maria Lopez",
      "contact_phone": "3001112233",
      "package_count": 3,
      "requested_cod_total": 180000,
      "coverage_status": "UNRESOLVED",
      "pickup_window_code": "today_pm",
      "created_at": "2026-07-07T15:10:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 20,
    "total": 1
  },
  "errors": []
}
```

### `GET /api/pickups/{id}`

Uso:

- detalle admin.

Debe incluir:

- datos de recogida;
- paquetes;
- review reasons;
- audit trail resumido;
- contacto WhatsApp;
- correlation ids clave.

### `POST /api/pickups`

Uso:

- creacion interna o manual desde admin;
- no debe ser el endpoint publico del webhook.

Body recomendado:

```json
{
  "customer_id": 42,
  "source": "admin",
  "contact_name": "Maria Lopez",
  "contact_phone": "3001112233",
  "pickup_address": {
    "line1": "Cra 80 # 12-35",
    "complement": "Bodega 2",
    "zone": "Engativa",
    "city": "Bogota"
  },
  "pickup_window_code": "today_pm",
  "special_instructions": "Llamar al llegar",
  "packages": [
    {
      "recipient_name": "Ana Perez",
      "recipient_phone": "3000000000",
      "delivery_address": {
        "line1": "Cl 100 # 20-30",
        "complement": "Apto 302",
        "zone": "Usaquen",
        "city": "Bogota"
      },
      "is_cod": true,
      "requested_cod_amount": 180000,
      "is_fragile": false
    }
  ]
}
```

### `POST /api/pickups/{id}/approve`

Uso:

- aprobar solicitud en `pending_review`.

Comportamiento:

- revalidacion completa de reglas;
- transicion esperada:
  - `pending_review -> submitted`
  - `submitted -> accepted`
  - `accepted -> ready_for_assignment`

Body opcional:

```json
{
  "notes": "Direccion validada manualmente."
}
```

### `POST /api/pickups/{id}/request-customer-input`

Uso:

- pedir informacion adicional al cliente por WhatsApp.

Body:

```json
{
  "reason_code": "ADDRESS_CONFIRMATION_REQUIRED",
  "message_template": "Confirma tu direccion de entrega.",
  "requested_fields": [
    "delivery_address",
    "delivery_complement"
  ]
}
```

Transicion:

```text
pending_review -> needs_customer_input
```

### `POST /api/pickups/{id}/reject`

Body:

```json
{
  "reason_code": "OUT_OF_COVERAGE",
  "notes": "La direccion esta fuera de la cobertura habilitada."
}
```

### `POST /api/pickups/{id}/cancel`

Uso:

- cancelacion de solicitud no operativa o no asignada.

Guardrails:

- si la solicitud ya esta `assigned`, requiere flujo mas estricto o bloqueo.

## 6. Endpoints de configuracion por cliente

### `GET /api/clients/{id}/whatsapp-settings`

Respuesta:

```json
{
  "success": true,
  "data": {
    "customer_id": 42,
    "status": "ACTIVE",
    "cod_enabled": true,
    "automatic_package_limit": 5,
    "manual_review_package_limit": 20,
    "automatic_cod_limit": 500000,
    "manual_review_cod_limit": 1000000,
    "automatic_cod_total_limit": 2000000,
    "allowed_windows": [
      "today_am",
      "today_pm"
    ],
    "contacts": [
      {
        "id": 18,
        "wa_id": "573001112233",
        "phone": "3001112233",
        "display_name": "Maria Lopez",
        "status": "authorized",
        "permissions": [
          "CREATE_PICKUP",
          "VIEW_OWN_PICKUPS",
          "USE_SAVED_ADDRESSES",
          "CREATE_COD_SHIPMENT"
        ]
      }
    ]
  },
  "meta": {},
  "errors": []
}
```

Regla:

- un cliente puede tener varios contactos autorizados;
- esos contactos solo se habilitan, suspenden o revocan desde admin.

### `PUT /api/clients/{id}/whatsapp-settings`

Body:

```json
{
  "status": "ACTIVE",
  "cod_enabled": true,
  "automatic_package_limit": 5,
  "manual_review_package_limit": 20,
  "automatic_cod_limit": 500000,
  "manual_review_cod_limit": 1000000,
  "automatic_cod_total_limit": 2000000,
  "allowed_windows": [
    "today_am",
    "today_pm"
  ]
}
```

### `POST /api/clients/{id}/whatsapp-contacts`

Uso:

- autorizar contacto existente o crear uno interno ya conocido.

Body:

```json
{
  "wa_id": "573001112233",
  "phone": "3001112233",
  "display_name": "Maria Lopez",
  "permissions": [
    "CREATE_PICKUP",
    "VIEW_OWN_PICKUPS",
    "USE_SAVED_ADDRESSES"
  ]
}
```

### `PUT /api/clients/{id}/whatsapp-contacts/{contactId}`

Uso:

- cambiar permisos o estado del contacto.

### `POST /api/clients/{id}/whatsapp-contacts/{contactId}/suspend`

Uso:

- suspender contacto sin borrar historial.

## 7. Bandeja de vinculacion

### `GET /api/whatsapp/link-requests`

Uso:

- ver solicitudes de numeros no autorizados.

Filtros:

- `status`
- `customer_id`
- `search`

### `POST /api/whatsapp/link-requests/{id}/approve`

Uso:

- aprobar vinculacion de contacto nuevo.

### `POST /api/whatsapp/link-requests/{id}/reject`

Uso:

- rechazar solicitud de vinculacion.

## 8. Endpoint de contexto para Flows

### `GET /api/whatsapp/contacts/{waId}/context`

Uso:

- resolver rapidamente contexto del contacto para experiencia cliente frecuente.

Respuesta:

```json
{
  "success": true,
  "data": {
    "known_contact": true,
    "customer_id": 42,
    "customer_name": "Comercializadora ABC",
    "whatsapp_status": "ACTIVE",
    "permissions": [
      "CREATE_PICKUP",
      "USE_SAVED_ADDRESSES"
    ],
    "saved_pickup_addresses": [
      {
        "id": 7,
        "label": "Bodega principal",
        "line1": "Cra 80 # 12-35"
      }
    ],
    "preferred_windows": [
      "today_am",
      "today_pm"
    ]
  },
  "meta": {},
  "errors": []
}
```

## 9. Codigos de error recomendados

```text
WEBHOOK_VERIFICATION_FAILED
WEBHOOK_SIGNATURE_INVALID
WHATSAPP_CUSTOMER_DISABLED
WHATSAPP_CONTACT_NOT_AUTHORIZED
PICKUP_OUT_OF_COVERAGE
PICKUP_COVERAGE_UNRESOLVED
PICKUP_WINDOW_UNAVAILABLE
PICKUP_PACKAGE_LIMIT_EXCEEDED
PICKUP_COD_LIMIT_EXCEEDED
PICKUP_DUPLICATE_DETECTED
PICKUP_REVIEW_REQUIRED
PICKUP_ALREADY_PROCESSED
LINK_REQUEST_ALREADY_EXISTS
LINK_REQUEST_NOT_ALLOWED
```

## 10. Regla final de contrato

El webhook publico nunca debe crear operaciones activas directamente.

La secuencia correcta es:

```text
Webhook publico
-> Inbox
-> Cola
-> Dominio Pickup
-> Persistencia
-> Panel
```
