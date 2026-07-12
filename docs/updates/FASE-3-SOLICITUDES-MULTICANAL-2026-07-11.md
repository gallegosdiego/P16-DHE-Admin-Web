# Fase 3 — Solicitudes multicanal

Fecha: 2026-07-11

## Resultado

P14 y P16 crean la misma `pickup_request` mediante el caso de uso `CreatePickupRequest`. El canal solo identifica el origen; las reglas, la idempotencia, la tarea operativa y la auditoría viven en el backend.

Flujos disponibles:

1. recogida en el local del cliente;
2. entrega planificada por el cliente en una sede;
3. ingreso espontáneo registrado por personal de sede.

Los dos flujos en sede crean una tarea `hub_intake` y no crean rutas ni paradas ficticias.

## Backend

Nuevos endpoints:

- `GET /api/service-locations`
- `POST /api/service-locations`
- `PUT /api/service-locations/{serviceLocation}`
- `POST /api/pickup-intakes`

La creación exige `Idempotency-Key`. Un reintento idéntico devuelve la misma solicitud y no duplica paquetes ni tareas.

Seguridad aplicada:

- un usuario cliente solo puede operar sobre su `client_id`;
- el origen del usuario cliente se normaliza a `client_portal`;
- un cliente no puede registrar `walk_in_at_hub`;
- el ingreso espontáneo queda reservado al personal autorizado;
- sedes inactivas no se aceptan para nuevas solicitudes;
- crear o modificar una sede genera auditoría.

El seeder del portal cliente ahora asigna los roles `web` y `sanctum`, corrigiendo el permiso real `shipments.create` para el usuario de demostración.

## P14 — Portal cliente

Ruta: `/recogidas`

El cliente puede:

- solicitar que Danhei recoja en su local;
- seleccionar una sede activa;
- indicar fecha estimada de entrega en sede;
- registrar contacto, destinatario, dirección, COD y manejo frágil;
- recibir el código de la solicitud.

También se consolidó Inter con `next/font`, eliminando la carga duplicada desde Google y la advertencia de CSS.

## P16 — Administración

Rutas:

- `/recogidas/nueva`
- `/configuracion/sedes`

El administrador puede registrar cualquiera de las tres modalidades y mantener el catálogo mínimo de sedes antes de usarlas en recepción.

## Verificación

- Backend focalizado: **85 pruebas, 443 aserciones, todas aprobadas**.
- API multicanal: **8 pruebas**, incluidos aislamiento entre clientes, ingreso espontáneo restringido, catálogo de sedes e idempotencia.
- P14: lint completo, TypeScript y build de producción aprobados.
- P16: TypeScript, lint de archivos afectados y build de producción aprobados.

## Pendiente para Fase 4

- asignación de la tarea a piloto o recolector autorizado;
- recepción física paquete por paquete;
- cierre del lote con faltantes/rechazados;
- comprobante de recepción;
- primera transferencia de custodia;
- vista móvil P15 para recogidas.

No se creó una sede ficticia en la base local porque falta confirmar nombre y dirección reales. P16 ya permite configurarla sin tocar código.
