# WhatsApp Saliente y Trazabilidad Operativa

Fecha: 2026-07-07

## 1. Objetivo

Documentar el cierre del tramo que conecta:

- estados internos de `PickupRequest`;
- mensajes salientes al cliente por WhatsApp;
- trazabilidad en `whatsapp_messages`;
- actualizacion por webhooks de estado del proveedor;
- visibilidad operativa dentro de `/recogidas`.

## 2. Lo que ya quedo implementado

### Backend

- notificador `PickupWhatsAppNotifier` para eventos clave:
  - `request_received`
  - `pending_review`
  - `customer_input_required`
  - `accepted`
  - `delivery_confirmed`
- constructor de mensajes `PickupStatusMessageBuilder`
- job `SendWhatsAppMessage`
- cliente `MetaCloudWhatsAppClient`
- actualizador `WhatsAppDeliveryStatusUpdater`
- extractor `MetaMessageStatusExtractor`

### Flujo operativo actual

1. llega una solicitud valida por webhook/Flow
2. se crea `PickupRequest`
3. se registran mensajes salientes en `whatsapp_messages`
4. si `WHATSAPP_OUTBOUND_ENABLED=false`, el sistema marca el despacho como `simulated`
5. si `WHATSAPP_OUTBOUND_ENABLED=true`, el sistema envia el mensaje a Meta Cloud API
6. cuando Meta devuelve webhooks de `statuses`, la fila de `whatsapp_messages` se actualiza
7. el panel `/recogidas` muestra el historial conversacional de la solicitud

## 3. Estados visibles al cliente cubiertos

- `Solicitud recibida`
- `Pendiente de revision`
- `Aceptada`
- `Entrega confirmada`

Adicionalmente existe un mensaje operativo de `customer_input_required` que sigue representando un estado visible de `pending_review`, pero con una instruccion mas precisa para pedir datos faltantes.

## 4. Variables de entorno requeridas

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_BASE_URL`
- `WHATSAPP_CLOUD_API_VERSION`
- `WHATSAPP_OUTBOUND_ENABLED`

## 5. Modo recomendado por entorno

### Local y QA

- `WHATSAPP_OUTBOUND_ENABLED=false`
- permite probar el flujo completo sin enviar mensajes reales
- deja rastro en `whatsapp_messages` con estado `simulated`

### Sandbox Meta

- `WHATSAPP_OUTBOUND_ENABLED=true`
- usar numero sandbox y credenciales separadas
- validar webhooks de `statuses`

### Produccion

- habilitar solo despues de cerrar `P0` de seguridad
- usar secretos propios de produccion
- monitorear errores de `failed`, volumen y duplicados

## 6. Riesgos residuales

- falta validar en ambiente real la politica de ventana conversacional y si algun mensaje debera migrar a plantilla oficial
- el reintento manual ya existe para estados `failed` y `simulated`, pero todavia no hay estrategia de reintento masivo o automatico
- el envio live depende de credenciales correctas y webhook de estados operativo

## 7. Siguiente paso recomendado

1. probar el flujo real en sandbox Meta con un numero controlado
2. definir si `delivery_confirmed` ira como texto libre o plantilla
3. monitorear reintentos manuales y causas de `failed`
4. decidir si hace falta un reenvio automatico limitado por politica
