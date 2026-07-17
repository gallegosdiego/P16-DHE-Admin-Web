# Diagnóstico de ingreso en producción — 17 de julio de 2026

**Módulo:** P16 Admin/API — Ingreso de paquetes

**Estado:** corrección implementada y validada en código; API pendiente de despliegue manual en cPanel

**Responsable del despliegue cPanel:** usuario/operación Danhei

## Síntoma confirmado

En `/recogidas/nueva`, la acción **Registrar y recibir** muestra:

> El módulo de ingreso aún no está listo en el servidor. Debe completarse la actualización de la base de datos.

El paquete no se crea. El mensaje es un bloqueo protector y evita guardar una
operación parcial.

## Evidencia productiva

La revisión directa del API produjo los siguientes resultados:

| Comprobación | Resultado | Lectura correcta |
|---|---:|---|
| `GET /up` | 200 | El proceso PHP responde; no certifica la base de datos. |
| `GET /api/runtime-check` autenticado | 503 `RUNTIME_BLOCKED` | El runtime no está listo. |
| `service_locations` | disponible | Las sedes sí existen. |
| solicitudes, paquetes y revisiones | ausentes | El núcleo de ingreso no terminó de migrar. |
| tareas, lotes, intentos, custodia e idempotencia | ausentes | No es seguro registrar paquetes. |
| `GET /api/pickup-requests` | 500 | El API activo no tiene todavía el guard completo publicado. |
| creación de ingreso | 503 protector | El controlador antiguo detecta la base parcial. |

El listado en 500 y la creación en 503 son compatibles con una versión del
API anterior al commit publicado `b7acc43`. Por ello, la actualización del panel
en Vercel no basta: cPanel debe actualizar el checkout y desplegar el `HEAD` del
API.

## Mejoras incorporadas

1. El despliegue deja `last-attempt`, `last-success` y `last-failure`.
2. Los marcadores identifican commit, fecha, estado, fase y código de salida.
3. `runtime-check` devuelve una huella segura del despliegue activo.
4. El 503 de esquema incompleto incluye:
   - `error_id` y encabezado `X-Error-ID`;
   - acción requerida;
   - cantidad de tablas y columnas pendientes;
   - estado seguro del último despliegue.
5. El formulario informa expresamente que el paquete no fue registrado.
6. El listado no presenta ceros ni una lista vacía cuando la consulta falla.
7. Las rutas protegidas siempre responden JSON 401, incluso sin cabecera
   `Accept: application/json`.

## Paso manual requerido en cPanel

1. Abrir **Git Version Control** y entrar a `P16-DHE-Admin-Web`.
2. Presionar **Actualizar desde remoto**.
3. Confirmar que **HEAD Commit** coincida con el commit publicado más reciente.
4. Presionar una sola vez **Desplegar commit HEAD**.
5. Esperar el resultado final; no iniciar un segundo despliegue simultáneo.
6. Si falla, revisar:
   - `storage/logs/deploy-cpanel.last-failure`;
   - `storage/logs/deploy-cpanel.log`.
7. Si termina, confirmar que `last-success` contiene el mismo commit de `HEAD`.

## Criterios de aceptación

El incidente solo se considera cerrado cuando se cumplen todos:

- `/api/runtime-check` responde 200 y `status: ok`;
- `database.operational_intake_ready` es `true`;
- `deployment.status` es `success`;
- `deployment.commit` coincide con el commit desplegado;
- `/api/pickup-requests` responde 200;
- **Registrar y recibir** responde 201;
- se verifican solicitud, paquete/guía, recepción, custodia e idempotencia;
- repetir la misma solicitud con la misma llave no duplica el ingreso.

## Verificación automatizada de la corrección

- backend completo: 391 pruebas y 1.949 aserciones aprobadas;
- frontend: ESLint y TypeScript aprobados;
- compilación de producción de Next.js aprobada;
- E2E completo: 52 escenarios aprobados;
- sintaxis Bash, formato PHP y `git diff --check` aprobados.

## Límite de responsabilidad

La corrección queda publicada en GitHub. El despliegue del API en cPanel lo
realiza Danhei, de acuerdo con la separación operativa acordada. Hasta completar
ese paso, el mensaje de la fotografía seguirá siendo el comportamiento seguro
esperado.
