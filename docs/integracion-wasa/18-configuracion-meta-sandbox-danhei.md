# Configuracion Meta Sandbox - Danhei

Fecha: 2026-07-07

## 1. Objetivo

Dejar el paso a paso exacto para conectar Danhei con `Meta WhatsApp Cloud API` en entorno sandbox o staging controlado.

## 2. Resultado esperado

Al finalizar esta guia debe quedar posible:

- recibir eventos en `GET/POST /api/integrations/whatsapp/webhook`
- enviar mensajes salientes desde Danhei
- ver estados `accepted`, `sent`, `delivered` o `read`
- ejecutar una prueba real de `Solicitar recogida`

## 3. Variables que debemos obtener de Meta

Estas variables son las minimas para Danhei:

- `META_APP_ID`
- `META_APP_SECRET`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_BASE_URL`
- `WHATSAPP_CLOUD_API_VERSION`
- `WHATSAPP_OUTBOUND_ENABLED`

Valores recomendados para sandbox:

- `WHATSAPP_CLOUD_API_BASE_URL=https://graph.facebook.com`
- `WHATSAPP_CLOUD_API_VERSION=v23.0`
- `WHATSAPP_OUTBOUND_ENABLED=true`

## 4. Paso a paso en Meta

## 4.1 Crear o abrir la app

1. Entrar a `Meta for Developers`
2. Crear una app o abrir la app existente de Danhei
3. Agregar el producto `WhatsApp`

## 4.2 Ir a API Setup

En la app de Meta:

1. abrir `WhatsApp`
2. entrar a `API Setup`

Desde ahi normalmente se obtiene:

- un `temporary access token` para pruebas
- el `whatsapp business account id`
- el `phone number id`
- el numero de prueba o numero conectado

## 4.3 Guardar credenciales

Copiar y guardar en secretos del entorno:

- `META_APP_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_PHONE_NUMBER_ID`

Luego, desde configuracion general de la app, guardar:

- `META_APP_SECRET`

## 4.4 Definir verify token propio

Danhei define este valor, no Meta.

Crear un string fuerte, por ejemplo:

- `WHATSAPP_VERIFY_TOKEN=danhei-whatsapp-verify-staging-2026`

Ese mismo valor debe ponerse:

- en `.env` del backend
- en la configuracion del webhook de Meta

Este token solo sirve para la verificacion inicial del `GET` del webhook.

Los eventos reales que llegan por `POST` deben validarse aparte con:

- `X-Hub-Signature-256`
- `META_APP_SECRET`

## 5. Configuracion del backend Danhei

En el entorno staging o sandbox del backend cargar:

```env
META_APP_SECRET=...
META_APP_ID=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_CLOUD_API_BASE_URL=https://graph.facebook.com
WHATSAPP_CLOUD_API_VERSION=v23.0
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_PICKUP_REQUIRED_PERMISSION=CREATE_PICKUP
WHATSAPP_PICKUP_DEFAULT_CITY=Bogota
```

Referencia de ejemplo:

- [api/.env.whatsapp-staging.example](D:/DHE%20dev/P16-DHE-Admin-Web/api/.env.whatsapp-staging.example)

## 6. Configuracion del webhook en Meta

Endpoint Danhei:

- `GET /api/integrations/whatsapp/webhook`
- `POST /api/integrations/whatsapp/webhook`

Callback URL esperada:

- `https://TU-DOMINIO-API/api/integrations/whatsapp/webhook`

Pasos:

1. En Meta abrir `WhatsApp > Configuration` o `Webhooks`
2. Pegar la `Callback URL`
3. Pegar el mismo `WHATSAPP_VERIFY_TOKEN`
4. Guardar y verificar

Si la verificacion falla, revisar:

- que la URL sea publica
- que el backend responda `200`
- que el `verify token` coincida exactamente
- que no haya firewall bloqueando Meta

## 7. Suscripciones recomendadas

Para esta V1 nos interesan sobre todo los eventos de:

- mensajes entrantes
- estados de mensajes salientes

Eso permite:

- crear la recogida desde el Flow
- actualizar `whatsapp_messages` con `sent`, `delivered` o `read`

## 8. Preparacion del numero de prueba

Para entorno sandbox o desarrollo controlado:

- usar numero de prueba o numero sandbox conectado en Meta
- usar un telefono real controlado como destinatario/autorizado para la prueba

En modo test o desarrollo puede ser necesario registrar manualmente el telefono destino permitido desde la seccion de `API Setup` de Meta.

## 9. Configuracion minima en Danhei

Antes de probar el chat:

1. activar el cliente en panel admin
2. agregar el telefono autorizado
3. dejar permiso `CREATE_PICKUP`
4. confirmar que `/recogidas` muestre `Lista para sandbox Meta`

## 10. Prueba punta a punta recomendada

1. escribir al numero oficial o de prueba de Danhei
2. elegir `Solicitar recogida`
3. completar el Flow `pickup_request`
4. confirmar la solicitud
5. revisar en Danhei:
   - `whatsapp_webhook_inbox`
   - `whatsapp_flow_submissions`
   - `pickup_requests`
   - `whatsapp_messages`
6. revisar en `/recogidas`:
   - nueva solicitud
   - estado visible al cliente
   - trazabilidad WhatsApp
7. aprobar o pedir datos
8. validar que Meta devuelva estados de entrega del mensaje

## 11. Errores mas probables

### Webhook verifica pero no llegan mensajes

Revisar:

- suscripciones activas
- numero correcto conectado en Meta
- app en modo correcto
- eventos del producto `WhatsApp`

### Mensaje sale `accepted` pero nunca `delivered`

Revisar:

- si el numero destino esta habilitado para pruebas
- si el mensaje cae fuera de politica o ventana
- si Meta exige plantilla para ese caso

### No responde el backend

Revisar:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- logs del webhook

## 12. Criterio de listo para sandbox

Podemos marcar la conexion como lista cuando:

1. Meta verifica el webhook
2. Danhei recibe un evento real de WhatsApp
3. Danhei envia un mensaje saliente real
4. Meta devuelve al menos `sent` o `delivered`
5. `/recogidas` refleja la trazabilidad completa

## 13. Nota practica

La interfaz de Meta puede cambiar ligeramente de nombres o ubicaciones, pero los elementos clave que necesitamos no cambian:

- app con producto WhatsApp
- app id
- access token
- business account id
- phone number id
- app secret
- webhook callback URL
- verify token

## 14. Referencias oficiales

- [Meta - WhatsApp Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta - Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens)
- [Meta - Webhooks Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Meta - Create a Webhook Endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/)
- [Meta - Sending a Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow)
