# Hotfix — Fundación de ingreso aislada de WhatsApp

**Fecha:** 16 de julio de 2026

**Módulo:** P16 Admin/API — Ingreso de paquetes

**Estado:** implementado y validado en código; requiere despliegue manual de API en cPanel

## Incidente observado

El panel publicado permitía completar el formulario `/recogidas/nueva`, pero `Registrar y recibir` terminaba con `Error interno del servidor`.

La consulta autenticada de `GET /api/runtime-check` confirmó el estado real de producción:

- `service_locations: true`;
- `pickup_requests`, `pickup_packages` y `pickup_review_events: false`;
- `operational_tasks`, lotes, elementos de lote, custodia e idempotencia: false`;
- `operational_intake_ready: false`.

El primer acceso fallido del recorrido era la consulta idempotente a `idempotency_records`, antes de crear cualquier solicitud o guía.

## Causa raíz

La fundación de solicitudes y paquetes estaba dentro de la migración histórica de WhatsApp y se ejecutaba después de ocho tablas de esa integración. Dos nombres automáticos de índice superaban el máximo de 64 caracteres de MySQL:

- índice único de cliente + contacto;
- llave foránea de permisos + contacto.

MySQL podía detener la migración antes de alcanzar `pickup_requests`. Como `.cpanel.yml` copia el código antes de ejecutar el esquema, el servidor quedaba con controladores nuevos y base antigua.

## Corrección

1. Se crea `2026_07_16_140000_create_core_pickup_foundation.php`.
2. La migración core crea de forma idempotente:
   - `service_locations`;
   - `pickup_requests`;
   - `pickup_packages`;
   - `pickup_review_events`.
3. `customer_whatsapp_contact_id` queda nullable e indexado, sin convertir WhatsApp en dependencia crítica.
4. El despliegue ejecuta primero la fundación core.
5. WhatsApp se ejecuta como paso opcional y aislado.
6. Los identificadores MySQL demasiado largos reciben nombres explícitos y seguros.
7. El rollback de WhatsApp deja intactas las tablas que ahora pertenecen al núcleo.
8. Los endpoints de ingreso devuelven 503 explicativo cuando el esquema no está listo.
9. `runtime-check` inspecciona tablas y columnas completas y marca `RUNTIME_BLOCKED` ante una base parcial.

## Verificación requerida después del despliegue

1. Actualizar el repositorio de cPanel al commit del hotfix.
2. Ejecutar `Desplegar commit HEAD`.
3. Confirmar que el registro contiene:
   - `OK migrate isolated core pickup foundation`;
   - `OK verify and repair operational intake schema`;
   - finalización completa del despliegue.
4. Consultar `GET /api/runtime-check` con una cuenta autorizada.
5. Exigir:
   - HTTP 200;
   - `status: ok`;
   - `operational_intake_ready: true`;
   - todas las entradas de `operational_intake_tables` en `true`.
6. Repetir `Registrar y recibir` con un paquete QA.
7. Verificar solicitud, guía, tarea, lote, estado `in_warehouse`, custodia y auditoría.

## Criterio de cierre

El incidente se cierra únicamente cuando la validación productiva devuelve 201 al registrar el ingreso y `runtime-check` permanece completamente verde. El endpoint `/api/health` por sí solo no certifica el esquema.
