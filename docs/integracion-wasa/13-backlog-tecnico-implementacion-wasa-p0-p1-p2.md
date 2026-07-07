# Backlog Tecnico - Implementacion Wasa P0 P1 P2

Fecha: 2026-07-07

## 1. Objetivo

Traducir la especificacion funcional y la arquitectura aprobada en un backlog tecnico ejecutable para `P16/api` y `P16/frontend`.

## 2. Criterio de priorizacion

### `P0`

Bloquea arquitectura segura, consistencia del dominio y preparacion de sandbox.

### `P1`

Construye el MVP funcional usable por operaciones y clientes piloto.

### `P2`

Endurece rollout, experiencia operativa, observabilidad y escalamiento.

## 3. P0 - Fundacion y seguridad

### API

- crear modulo `Pickup` en `api/app/Domain/Pickup`
- crear modulo `Integrations/WhatsApp` en `api/app/Integrations/WhatsApp`
- definir enums o value objects para:
  - `pickup status`
  - `coverage status`
  - `customer whatsapp status`
  - `review reason`
- crear migraciones base:
  - `customer_whatsapp_settings`
  - `whatsapp_contacts`
  - `customer_whatsapp_contacts`
  - `customer_whatsapp_contact_permissions`
  - `whatsapp_link_requests`
  - `whatsapp_webhook_inbox`
  - `whatsapp_messages`
  - `whatsapp_flow_submissions`
  - `pickup_requests`
  - `pickup_packages`
  - `pickup_review_events`
- agregar restricciones `UNIQUE` de idempotencia
- definir `PickupRequest` como dominio separado de `Shipment`

### Seguridad

- implementar `GET /api/integrations/whatsapp/webhook`
- implementar `POST /api/integrations/whatsapp/webhook`
- validar firma `X-Hub-Signature-256`
- persistir raw payload en inbox
- deduplicar eventos por `external_event_id` y/o `payload_hash`
- implementar cola asincronica minima para procesamiento
- cerrar o restringir `/api/deploy-check`
- revisar riesgo real de documentos de pilotos en disco `public`

### Cliente y autorizacion

- agregar configuracion `Recogidas por WhatsApp` por cliente
- modelar contactos autorizados por cuenta
- modelar permisos:
  - `CREATE_PICKUP`
  - `VIEW_OWN_PICKUPS`
  - `USE_SAVED_ADDRESSES`
  - `CREATE_COD_SHIPMENT`
  - `CANCEL_UNASSIGNED_PICKUP`
- definir regla de doble validacion de estado `ACTIVE`:
  - al iniciar
  - al confirmar

### Infra y sandbox

- crear numero sandbox en Meta
- registrar secretos de entorno:
  - `META_APP_SECRET`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_VERIFY_TOKEN`
  - `FLOW_PRIVATE_KEY`
  - `FLOW_PRIVATE_KEY_PASSWORD`
- definir entorno `DEV/SANDBOX`
- definir worker o cron para jobs de WhatsApp

## 4. P1 - MVP funcional

### Dominio Pickup

- crear servicio `PickupApplicationService`
- crear servicio `PickupValidationService`
- crear servicio `PickupReviewService`
- crear servicio `PickupWindowAvailabilityService`
- crear servicio `PickupCoverageService`
- implementar transiciones:
  - `draft -> pending_review|submitted`
  - `pending_review -> needs_customer_input|submitted|cancelled`
  - `submitted -> accepted`
  - `accepted -> ready_for_assignment`
- garantizar que `pending_review` no entre a operacion activa

### Integracion WhatsApp

- implementar adaptador `WhatsAppProvider`
- implementar `MetaCloudProvider`
- dejar interfaz para proveedor alterno futuro
- implementar procesamiento de mensajes entrantes
- implementar procesamiento de submissions de Flow
- implementar respuestas salientes de confirmacion
- implementar solicitud de informacion adicional al cliente

### Contratos API

- exponer:
  - `GET /api/pickups`
  - `GET /api/pickups/{id}`
  - `POST /api/pickups`
  - `POST /api/pickups/{id}/approve`
  - `POST /api/pickups/{id}/request-customer-input`
  - `POST /api/pickups/{id}/reject`
  - `GET /api/clients/{id}/whatsapp-settings`
  - `PUT /api/clients/{id}/whatsapp-settings`
  - `POST /api/clients/{id}/whatsapp-contacts`
  - `GET /api/whatsapp/link-requests`
  - `POST /api/whatsapp/link-requests/{id}/approve`
  - `POST /api/whatsapp/link-requests/{id}/reject`
- normalizar envelope `success/data/meta/errors`
- definir error codes oficiales

### Reglas operativas

- aplicar cobertura actual:
  - Bogota urbana sin Sumapaz
  - Soacha
  - Mosquera
  - Funza
  - Madrid
  - Cota
  - Chia
  - Cajica
  - Zipaquira
- aplicar limites default:
  - automatico hasta 5 paquetes
  - revision de 6 a 20
  - empresarial mas de 20
- aplicar limites COD default:
  - automatico hasta 500000 por paquete
  - revision hasta 1000000
  - no automatico por encima
  - tope total automatico 2000000
- dejar esos limites configurables por cliente

### Frontend admin

- crear modulo `/recogidas`
- crear listado con filtros
- crear detalle de solicitud
- crear bandeja `Pendientes de revision`
- crear bandeja `Solicitudes de vinculacion`
- crear acciones admin:
  - aprobar
  - corregir
  - solicitar informacion
  - rechazar
- crear configuracion por cliente:
  - activar/suspender modulo
  - configurar limites
  - gestionar contactos autorizados

## 5. P2 - Endurecimiento y rollout

### QA y pruebas

- pruebas feature para webhook verification
- pruebas feature para firma invalida
- pruebas de idempotencia por duplicate submission
- pruebas de replay
- pruebas de contacto no autorizado
- pruebas de `pending_review` sin impacto operativo
- pruebas de limites COD
- pruebas de limites por paquetes
- pruebas de transiciones admin

### Observabilidad

- crear `correlation_id` transversal
- registrar `review_reason_code`
- crear dashboard operativo minimo
- alertas por:
  - firma fallida
  - creacion masiva
  - jobs fallidos
  - submissions duplicadas

### Operacion

- runbook de sandbox
- runbook de activacion por cliente
- runbook de suspension inmediata
- runbook de incidentes de WhatsApp
- checklist de despliegue productivo

### Seguridad avanzada

- OTP o aprobacion reforzada para vinculacion de numero nuevo
- auditoria fina de cambios de contactos y permisos
- politicas de retencion y redaccion de logs
- pruebas BOLA/BFLA para endpoints admin

## 6. Orden recomendado de ejecucion

1. seguridad webhook + inbox + migraciones base
2. configuracion por cliente + contactos autorizados
3. dominio `Pickup` + reglas de validacion
4. endpoints admin y contratos API
5. bandeja `/recogidas`
6. bandeja de vinculacion
7. flujo sandbox con Meta
8. piloto controlado con pocos clientes

## 7. Definition of done por fase

### P0 terminado cuando

- webhook verifica firma
- inbox persiste eventos
- migraciones estan aplicadas
- cliente puede quedar `ACTIVE` o `SUSPENDED`
- contactos autorizados existen
- secretos y sandbox estan listos

### P1 terminado cuando

- una solicitud valida crea `PickupRequest`
- una solicitud dudosa cae en `pending_review`
- un telefono no autorizado crea `link_request`
- admin puede operar revisiones y configuracion
- cliente recibe respuesta de confirmacion o revision

### P2 terminado cuando

- existen pruebas criticas automatizadas
- observabilidad minima esta activa
- existe runbook de operacion
- piloto controlado fue ejecutado
- esta lista la decision de rollout productivo
