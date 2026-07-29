# Fase 5 — Manifiesto de despacho y contador de custodia

**Fecha:** 29 de julio de 2026  
**Rama:** `agent/fase-5-manifiesto-despacho-2026-07-29`  
**Estado:** implementado en rama, pendiente de PR y despliegue cPanel

## Objetivo

Dar al despachador una vista imprimible y de solo lectura de los paquetes asignados a una ruta, sin confundir la creación de la ruta con la aceptación física por parte del piloto.

## Implementación

- `GET /api/routes/{route}/manifest` devuelve el código derivado `MAN-YYYYMMDD-{route_id}`, datos de ruta/piloto, destinatario, guía, cobro, paquete y último evento de custodia.
- El contador separa `total`, `accepted_by_pilot`, `in_hub`, `pending` y `complete`.
- La aceptación se reconoce únicamente cuando el último custodio es el piloto de la ruta; la asignación de `driver_id` por sí sola no basta.
- El endpoint no escribe en base de datos ni modifica estados, paradas, rutas o eventos de custodia.
- `/rutas` incorpora el botón **Manifiesto**, una ventana con contadores, tabla de paquetes y acción de impresión del navegador.
- La acción de impresión es una representación operativa; la transferencia de custodia continúa mediante escaneo del piloto o entrega manual justificada.

## Verificación realizada

- `php artisan test --filter=RouteTest`: 22 pruebas, 150 aserciones.
- `npm run test:e2e -- e2e/routes.spec.ts`: 12 pruebas, 12 aprobadas.
- Lint, typecheck y build del frontend deben ejecutarse antes de abrir el PR.

## Criterios de no regresión

1. Abrir o imprimir el manifiesto nunca crea eventos de custodia.
2. El contador refleja el último evento de custodia de cada paquete.
3. Una ruta sin paquetes nunca se marca como completa.
4. El permiso `shipments.view` y el alcance de la ruta siguen aplicándose.
5. El piloto continúa siendo quien confirma la recepción física mediante la app.

## Siguiente iteración

Después del PR y del despliegue en cPanel, ejecutar UAT con una ruta real: generar manifiesto, contrastar guías y contador con los paquetes físicos, escanear al menos un paquete desde la app del piloto y comprobar que el contador se actualiza sin recargar datos falsos. La siguiente pieza funcional será el cierre de confirmación/escaneo por lote y su auditoría.
