# Fase 2 — Fundación del dominio operativo

Fecha: 2026-07-11

Estado: fundación backend implementada; APIs y pantallas multicanal continúan en la Fase 3.

## Resultado

El núcleo ya no depende de WhatsApp ni presupone que todo paquete nace en una ruta. Los tres ingresos físicos comparten el mismo modelo:

1. `pickup_at_client_location`: Danhei recoge en el local del cliente.
2. `planned_dropoff_at_hub`: el cliente anuncia que llevará paquetes a una sede.
3. `walk_in_at_hub`: una persona llega con paquetes sin solicitud previa y el sistema crea el ingreso auditable en ese momento.

## Esquema implementado

| Tabla | Responsabilidad |
|---|---|
| `service_locations` | Sedes y puntos operativos Danhei. Se conserva durante limpiezas operativas. |
| `operational_tasks` | Trabajo asignable: recogida, recepción, entrega, devolución, transferencia o entrega de dinero. |
| `pickup_batches` | Conciliación física entre paquetes esperados y realmente recibidos. |
| `pickup_batch_items` | Resultado individual: recibido, rechazado, faltante o con novedad. |
| `delivery_attempts` | Cada intento real de entrega, su resultado y el recaudo registrado. |
| `shipment_evidence` | Metadatos, ubicación, hash y rutas de evidencia original/sellada. |
| `custody_events` | Transferencias inmutables de responsabilidad física sobre una guía. |
| `idempotency_records` | Protección frente a reintentos o doble envío desde web, móvil o integraciones. |

`pickup_requests` ahora incluye `intake_mode`, `service_location_id` y `planned_dropoff_at`.

## Reglas incorporadas

- Una entrega o recepción en sede exige una `service_location`.
- Una solicitud no puede tener dos tareas operativas activas.
- Una tarea no puede pasar a asignada si no tiene responsable.
- Las tareas avanzan mediante una máquina de estados y sellan su cronología.
- Un lote solo cierra cuando todos los paquetes esperados están contabilizados.
- Si hay faltantes o rechazados, el lote debe cerrar con diferencias.
- Los eventos de custodia no se pueden editar ni eliminar.
- El nuevo custodio de un evento se convierte automáticamente en custodio anterior del siguiente.
- Una llave idempotente repetida con el mismo contenido devuelve el mismo registro; con contenido diferente es rechazada.
- Creación y transiciones generan auditoría transversal en `audit_logs`.

## Servicios centrales

- `OperationalTaskService`: creación única y transiciones de tareas.
- `PickupBatchService`: cierre conciliado de lotes físicos.
- `CustodyRecorder`: cadena de custodia continua y append-only.
- `IdempotencyService`: ejecución única de operaciones que crean modelos.

Los controladores futuros deberán consumir estos servicios; no deben escribir estados críticos directamente.

## Compatibilidad

- `PickupRequest` conserva todos sus campos y estados anteriores.
- Los registros existentes reciben por defecto `pickup_at_client_location`.
- `Shipment` conserva la evidencia heredada y agrega relaciones a intentos, evidencia estructurada y custodia.
- WhatsApp puede seguir originando una solicitud cuando se habilite, pero no posee el dominio de recogidas.
- El reset operativo elimina las nuevas transacciones y conserva `service_locations`.

## Migraciones y rollback

Migraciones:

- `2026_07_11_180000_create_operational_foundation_tables.php`
- `2026_07_11_181000_create_idempotency_records_table.php`

Se validó el ciclo real `up → down → up` contra la base local. Ambas migraciones fueron revertidas y reaplicadas correctamente.

## Verificación

- Suite focalizada de compatibilidad de recogidas, envíos, aislamiento y nueva fundación: **80 pruebas, 425 aserciones, todas aprobadas**.
- Suite específica de fundación y reset después de idempotencia/auditoría: **9 pruebas, 47 aserciones, todas aprobadas**.
- Migraciones históricas y nuevas: todas en estado `Ran`.

## Próximo bloque

La Fase 3 debe exponer casos de uso, no escritura directa de tablas:

1. crear solicitud manual desde P16;
2. crear solicitud desde P14;
3. registrar ingreso espontáneo en sede;
4. administrar catálogo de sedes;
5. asignar recogida a piloto o recolector autorizado;
6. crear lote y comprobante de recepción;
7. mostrar la modalidad y trazabilidad en la interfaz.
