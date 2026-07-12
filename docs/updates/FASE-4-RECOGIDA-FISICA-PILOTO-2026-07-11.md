# Fase 4 — Recogida física por piloto

Fecha: 2026-07-11

Estado: recogida por piloto, recepción directa en sede y traspaso de recolector autorizado implementados. Pendientes: comprobante descargable y evidencia fotográfica obligatoria.

## Flujo implementado

1. P16 aprueba y materializa las guías de la solicitud.
2. P16 asigna la tarea a un piloto desde `/recogidas/tareas`.
3. La tarea aparece en la pestaña **Recogidas** de P15.
4. El piloto acepta la tarea.
5. El piloto inicia el desplazamiento.
6. Al llegar, P15 captura ubicación cuando existe permiso.
7. Se abre un lote con todos los paquetes esperados.
8. El piloto marca cada paquete como recibido, faltante o rechazado.
9. El backend exige que todos los esperados queden conciliados.
10. El lote cierra completo o con diferencias.
11. La solicitud y la tarea adoptan el resultado correspondiente.
12. Cada guía recibida genera la primera transferencia de custodia cliente → piloto.

## Invariantes

- No se asigna una recogida si todavía existen paquetes sin guía materializada.
- Un piloto solo puede operar tareas asignadas a su `driver_id`.
- No se abre lote antes de que la tarea esté `in_progress`.
- Abrir dos veces reutiliza el lote activo.
- No se cierra el lote con paquetes omitidos o duplicados.
- Un paquete faltante o rechazado no genera custodia.
- Una recogida con diferencias no puede cerrar como completa.
- El estado `picked_up` solo aparece después de lote conciliado y custodia de las guías recibidas.

## Endpoints

- `GET /api/operational-tasks`
- `POST /api/operational-tasks/{operationalTask}/assign`
- `GET /api/driver/pickup-tasks`
- `POST /api/driver/pickup-tasks/{operationalTask}/transition`
- `POST /api/driver/pickup-tasks/{operationalTask}/batch`
- `POST /api/driver/pickup-batches/{pickupBatch}/reconcile`

## P15

Nueva pestaña `/recogidas` con:

- listado de asignaciones;
- llamada al contacto;
- aceptar e iniciar;
- llegada con GPS opcional;
- conciliación individual;
- cierre y mensaje de diferencias.

El serializador `FormData` ahora soporta arreglos de objetos anidados, necesario para enviar resultados paquete por paquete a servidores LiteSpeed.

## Operación en sede y recolector autorizado

P16 incorpora dos recorridos adicionales:

- **Recibir en sede** (`/recogidas/recepcion`): asigna el operador, inicia la recepción, concilia cada paquete y deja la custodia directamente en la sede.
- **Recolector autorizado** (`/recogidas/tareas`): permite asignar una persona externa identificada por nombre; cuando termina la recogida, operaciones selecciona la sede receptora y registra el traspaso recolector → sede.

El traspaso solo se admite para tareas terminadas o parcialmente terminadas que tengan lote conciliado. Es idempotente para una misma guía y sede.

## Verificación

- Flujo backend completo, faltante, recepción en sede y recolector → sede: **4 pruebas, 34 aserciones**.
- Suite focalizada acumulada después de Fase 4: **89 pruebas, 477 aserciones, todas aprobadas**.
- P15: TypeScript aprobado y exportación Expo web completada (856 módulos).
- P16: TypeScript, lint de pantallas afectadas y build de producción aprobados.

## Pendiente de la Fase 4

- comprobante descargable de recepción;
- confirmación del cliente;
- evidencia fotográfica obligatoria según tipo de novedad.
