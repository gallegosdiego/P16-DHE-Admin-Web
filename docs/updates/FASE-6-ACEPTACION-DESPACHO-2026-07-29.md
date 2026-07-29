# Fase 6 — Aceptación de despacho y bloqueo de salida incompleta

**Fecha:** 29 de julio de 2026  
**Rama:** `agent/fase-6-aceptacion-despacho-2026-07-29`  
**Estado:** implementación local pendiente de PR

## Objetivo

Cerrar la brecha entre una ruta propuesta y la transferencia física de paquetes al piloto. Una ruta trazable no debe iniciar mientras existan paquetes que siguen en sede.

## Cambios en P16

- `POST /api/routes/{route}/start` devuelve `422 route_custody_pending` con los paquetes pendientes cuando la ruta tiene eventos de custodia y alguno no pertenece todavía al piloto.
- La activación directa de una ruta (`activate=true`) aplica la misma validación para los nuevos paquetes.
- La compatibilidad histórica se conserva solo para paquetes sin ningún evento de custodia; los ingresos nuevos, que sí tienen trazabilidad, deben escanearse o confirmarse manualmente con motivo.
- Se agregó una prueba de bloqueo, transferencia válida y posterior activación.

## Cambios coordinados en P15

- Nueva pantalla **Recibir despacho** con contador, detalle de guías y escáner.
- La app valida localmente que la guía pertenezca a la salida y usa el endpoint idempotente existente para registrar la transferencia.
- Los paquetes no aceptados quedan visibles como **En sede**.
- **Iniciar Ruta** se deshabilita mientras haya custodia pendiente.

## Criterios de aceptación

1. Una ruta con un último custodio `hub` no puede activarse.
2. Después de aceptar todos los paquetes, la misma ruta sí puede activarse.
3. Un escaneo de una guía de otra salida se rechaza sin crear custodia.
4. Un reintento no duplica el evento.
5. Un manifiesto parcial no convierte paquetes pendientes en `in_transit`.

## Validación

- P16: `php artisan test --filter=RouteTest` debe cubrir la nueva regla y el contrato de handover.
- P15: `npx tsc --noEmit` y prueba manual en Android con cámara y entrada manual.
- UAT cruzado sobre P16 `main` y la rama P15 después de publicar ambos cambios.
