# Iteración 44 - Detalle de conductor móvil admin

Fecha: 2026-07-03

## Objetivo
- Adaptar la vista de detalle del piloto para que funcione mejor en celular sin depender de tablas anchas.

## Cambios aplicados
- Convertí `Envíos asignados hoy` a cards móviles y dejé la tabla solo para `md+`.
- Convertí el detalle de paquetes del historial a cards móviles con pago, estado y ganancia visibles.
- Mejoré la cabecera de acciones del bloque de envíos.
- Ajusté el modal de asignación con select táctil más alto.
- Corregí textos operativos visibles (`Envío`, `Teléfono`, `Vehículo`, `Ganancia del día`, mensajes vacíos e historial`).

## Validación
- `npx eslint 'src/app/(admin)/conductores/[id]/page.tsx'`
- `npm run typecheck`

## Resultado esperado
- El detalle del piloto deja de depender del scroll horizontal para operar en móvil.
- El historial queda más legible cuando se abre una jornada desde el teléfono.
