# Trigger de Activacion del Chat - WhatsApp V1

Fecha: 2026-07-07

## Decision oficial

La activacion del flujo de toma de pedido por WhatsApp en Danhei queda definida asi:

- trigger visible para el cliente: `Solicitar recogida`
- trigger tecnico real: confirmacion del Flow `pickup_request`

## Lo que si activa el flujo

- el cliente entra al chat oficial de Danhei
- el sistema le presenta menu
- el cliente elige `Solicitar recogida`
- se abre el Flow estructurado
- el cliente confirma el Flow

## Lo que no activa la creacion del pedido en el estado actual

- escribir `pedido`
- escribir `recogida`
- escribir `solicitar recogida` como texto libre
- cualquier mensaje libre no estructurado

## Semantica correcta

`Solicitar recogida` activa la experiencia conversacional.

`pickup_request` activa la creacion tecnica cuando el usuario confirma el Flow.

## Motivo de esta decision

Esta regla evita:

- ambiguedad operativa;
- pedidos creados por texto libre;
- errores por mensajes incompletos;
- mezcla entre chat humano y captura estructurada.

## Regla para futuras iteraciones

Si se habilita texto libre como disparador, debe funcionar solo como:

- atajo para abrir el Flow;
- nunca como mecanismo directo para crear el `PickupRequest`.
