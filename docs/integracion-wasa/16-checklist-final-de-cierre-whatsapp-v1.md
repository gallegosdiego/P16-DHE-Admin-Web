# Checklist Final de Cierre - WhatsApp V1

Fecha: 2026-07-07

## 1. Objetivo

Definir el criterio de "terminado" para la V1 de recogidas por WhatsApp en Danhei.

## 2. Cierre tecnico minimo

- webhook Meta configurado y verificando correctamente
- firma `X-Hub-Signature-256` validada
- inbox de eventos operativo
- `PickupRequest` funcionando con revision manual
- mensajes salientes registrados en `whatsapp_messages`
- estados del proveedor (`sent`, `delivered`, `read`) actualizando trazabilidad
- reintento manual disponible desde `/recogidas`

## 3. Cierre de configuracion

- `META_APP_ID` cargado
- `META_APP_SECRET` cargado
- `WHATSAPP_BUSINESS_ACCOUNT_ID` cargado
- `WHATSAPP_VERIFY_TOKEN` cargado
- `WHATSAPP_ACCESS_TOKEN` cargado
- `WHATSAPP_PHONE_NUMBER_ID` cargado
- `WHATSAPP_OUTBOUND_ENABLED=true` en sandbox o produccion controlada
- cliente piloto activo en panel admin
- telefono piloto autorizado en panel admin

## 4. Cierre de prueba funcional

1. cliente autorizado escribe al numero oficial
2. cliente selecciona `Solicitar recogida`
3. cliente completa y confirma el Flow `pickup_request`
4. Danhei recibe evento y crea solicitud
5. operaciones ve la solicitud en `/recogidas`
6. operaciones aprueba o pide datos
7. Danhei emite mensaje saliente
8. Meta devuelve `status`
9. el panel refleja la trazabilidad correcta
10. al menos una solicitud termina con entrega confirmada

## 5. Cierre operativo

- runbook sandbox documentado
- runbook de reintentos documentado
- criterio de activacion por cliente definido
- criterio de suspension rapida definido
- responsables operativos identificados

## 6. Cierre de seguridad previo a produccion

- `/api/deploy-check` cerrado o restringido
- acceso a documentos de pilotos auditado
- secretos separados por entorno
- revisado el riesgo de plantillas y ventana conversacional
- validado el comportamiento ante duplicados y replays

## 7. Como saber si ya estamos listos

La V1 puede considerarse lista para sandbox serio cuando:

- el tablero `/recogidas` muestre estado `Lista para sandbox Meta`
- los checks de configuracion esten completos
- el flujo punta a punta pase al menos una vez

La V1 puede considerarse lista para produccion controlada cuando:

- el sandbox ya paso satisfactoriamente
- seguridad `P0` esta cerrada
- operaciones ya probo el flujo real
- existe responsable de monitoreo y soporte
