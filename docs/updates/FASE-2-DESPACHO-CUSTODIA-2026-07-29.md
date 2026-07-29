# Fase 2: despacho y traspaso de custodia al piloto

**Fecha:** 29 de julio de 2026  
**Estado:** contrato, panel administrativo y flujo de escaneo movil implementados; UAT en dispositivo pendiente

## Decisiones de esta iteracion

- Crear una ruta no equivale a entregar fisicamente los paquetes al piloto.
- La transferencia se confirma por cada parada de la ruta.
- El escaneo usa la guia visible (`display_code`) o interna (`tracking_code`).
- El panel conserva una alternativa manual, pero exige una nota justificativa.
- Todo reintento usa `Idempotency-Key`; repetir el escaneo no duplica la custodia.
- Solo se permite transferir un paquete cuyo ultimo custodio sea una sede (`hub`).

## Contrato implementado

- `POST /api/driver/routes/{route}/stops/{stop}/handover` para el celular del piloto.
- `POST /api/routes/{route}/stops/{stop}/handover` para el operador autorizado del panel.
- Evento append-only: `assigned_to_driver`.
- El usuario de sesion queda como actor de auditoria; el piloto queda como nuevo custodio.
- Con la ruta activa, el envio pasa por la cadena validada hasta `in_transit`.

## Panel administrativo implementado

- Cada parada muestra `En sede`, `Con piloto` o `Sin custodia`.
- Las rutas muestran el contador `con piloto / total` y los paquetes que siguen en sede.
- `Despachar al piloto` abre una confirmacion manual por parada y exige una nota de hasta 280 caracteres.
- La confirmacion usa `Idempotency-Key`, refresca la ruta y deja visible el resultado de custodia.
- La accion solo aparece para paradas pendientes de rutas planificadas o activas; no se ejecuta ninguna optimizacion automatica.

## App del piloto conectada

- P15 consume `POST /api/driver/routes/{route}/stops/{stop}/handover` desde el detalle de la parada.
- El piloto puede escanear QR/codigo de barras con la camara o escribir la guia como respaldo.
- Antes de confirmar selecciona la condicion fisica; el envio conserva la guia y el servidor valida que corresponda a la parada.
- P15 agrega `Idempotency-Key` y refresca la jornada despues del traspaso.
- P15 queda versionado como `4.2.21` (`versionCode 438`); la nueva compilacion movil requiere prueba en Android real y no se publica automaticamente desde este cambio.

## Verificacion de esta iteracion

- `php artisan test`: **396/396** pruebas, **2008** aserciones.
- `RouteTest`: incluye transferencia, guia incorrecta, custodia incorrecta y reintento idempotente.
- La API no acepta una transferencia si falta el evento previo de custodia `hub`.
- Frontend: `npm run lint`, `npm run typecheck`, `npm run build` y `npm run test:e2e -- e2e/routes.spec.ts` (9/9).

## Proxima iteracion

1. Mostrar un tablero dedicado de paquetes en custodia, agrupados por localidad/zona y tamano.
2. Convertir la ventana de nueva ruta en una propuesta de despacho: pilotos, cantidad, zona, coordenadas y capacidad visible.
3. Construir el manifiesto de despacho y mostrar el contador de paquetes aceptados por el piloto.
4. Ejecutar UAT con un paquete intacto, un paquete con dano observado, reintento de red y alternativa manual.
