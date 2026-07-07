# Runbook Sandbox y Reintentos WhatsApp

Fecha: 2026-07-07

## 1. Objetivo

Dejar una guia corta para:

- levantar el canal en sandbox Meta;
- validar que Danhei recibe y responde;
- operar reintentos manuales desde `/recogidas`.

## 2. Configuracion minima del backend

Variables requeridas:

- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_BASE_URL`
- `WHATSAPP_CLOUD_API_VERSION`
- `WHATSAPP_OUTBOUND_ENABLED=true`

## 3. Enlace con Meta

1. crear o usar una app Meta Business
2. activar `WhatsApp Cloud API`
3. registrar numero sandbox o numero productivo controlado
4. configurar webhook:
   - `GET /api/integrations/whatsapp/webhook`
   - `POST /api/integrations/whatsapp/webhook`
5. registrar `WHATSAPP_VERIFY_TOKEN`
6. copiar `access token`, `phone_number_id` y `app secret`

## 4. Prueba punta a punta recomendada

1. habilitar un cliente y un telefono autorizado desde panel admin
2. enviar una solicitud de recogida por WhatsApp
3. validar en backend:
   - `whatsapp_webhook_inbox`
   - `whatsapp_flow_submissions`
   - `pickup_requests`
   - `whatsapp_messages`
4. validar en `/recogidas`:
   - estado de la solicitud
   - historial de revision
   - trazabilidad WhatsApp
5. aprobar o pedir datos
6. confirmar que Meta devuelve `statuses`
7. revisar que `whatsapp_messages.message_status` cambie a:
   - `accepted`
   - `sent`
   - `delivered`
   - `read`

## 5. Reintento manual desde operaciones

Ahora el panel `/recogidas` permite reintentar mensajes salientes cuando el estado quede:

- `failed`
- `simulated`

Comportamiento esperado:

1. el mensaje anterior no se borra
2. se crea una nueva tentativa en `whatsapp_messages`
3. la nueva tentativa queda ligada a la misma `PickupRequest`
4. se registra un evento `WHATSAPP_MESSAGE_RETRIED`
5. si el entorno sigue en simulado, la nueva fila quedara otra vez como `simulated`
6. si el entorno ya esta live, la nueva fila se enviara a Meta

## 6. Cuando usar el reintento

Usarlo solo cuando:

- el mensaje fallo por configuracion temporal;
- el entorno paso de `simulated` a `live`;
- se corrigio token, `phone_number_id` o webhook;
- operaciones necesita volver a disparar una notificacion puntual.

No usarlo para:

- mensajes ya `delivered`
- mensajes ya `read`
- reenviar masivamente sin revisar causa raiz

## 7. Checklist de verificacion

- el telefono del cliente esta autorizado en Danhei
- el cliente esta `ACTIVE` para WhatsApp
- el webhook Meta responde bien
- `WHATSAPP_OUTBOUND_ENABLED` esta en el valor correcto
- el `access token` no esta vencido
- el `phone_number_id` coincide con el numero configurado
- el historial en `/recogidas` muestra la nueva tentativa

## 8. Riesgos operativos

- si Meta exige plantilla fuera de ventana conversacional, un mensaje live puede fallar aunque el codigo este correcto
- un reintento no corrige por si solo problemas de autorizacion de numero o cliente
- si no hay webhook de `statuses`, el panel no podra reflejar confirmacion real del proveedor
