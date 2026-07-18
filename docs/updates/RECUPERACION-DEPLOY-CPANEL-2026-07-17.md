# Recuperación del despliegue cPanel — 17 de julio de 2026

**Estado:** implementado y validado; pendiente actualizar y desplegar el nuevo commit en cPanel

## Evidencia

- cPanel descargó correctamente `b065d63`;
- el último SHA desplegado continuó en `c1b71ad`;
- la API siguió sin el bloque `deployment` nuevo;
- ninguna tabla operativa cambió: solo `service_locations` existía;
- por tanto, los intentos no alcanzaron la primera migración.

## Causa compatible con la evidencia

El último commit desplegado correctamente usaba tareas breves y directas en
`.cpanel.yml`. Las configuraciones posteriores delegaron toda la ejecución a un
proceso Bash largo con bloqueo, límites y redirección persistente. Ese recorrido
no llega a ejecutarse correctamente en el task runner actual del hosting.

La recuperación elimina esa dependencia del camino crítico. Cada tarea vuelve a
ser visible y controlada directamente por cPanel.

## Nuevo flujo

1. Copia aditiva de `api/` al runtime.
2. Limpieza de caché de Laravel.
3. Migraciones operativas explícitas, una por tarea.
4. Verificación exhaustiva de tablas, columnas y permisos.
5. Reparaciones idempotentes de almacenamiento, COD, geodatos y documentos.
6. Migraciones financieras explícitas.
7. Marcador de éxito con el SHA real del repositorio administrado por cPanel.

No usa en el camino crítico:

- `deploy-cpanel-release.sh`;
- `deploy-cpanel.sh`;
- `timeout`;
- `flock`;
- redirecciones `2>&1`;
- variables exportadas entre tareas;
- WhatsApp;
- reparación del índice diario de rutas.

## Seguridad operativa

El API nuevo contiene un guard global del ingreso. Entre la copia y la
finalización del esquema, los endpoints responden 503 y no registran paquetes
parciales. Las migraciones y reparaciones son aditivas e idempotentes; no borran
clientes, usuarios, pilotos ni sedes.

## Marcadores

`write-cpanel-deployment-marker.php` resuelve el commit desde `.git/HEAD` y
`packed-refs` sin ejecutar comandos de shell. Registra:

- `schema_core`;
- `runtime_repairs`;
- `financial_schema`;
- `complete`.

Un `last-attempt` en `running` identifica el último grupo iniciado. Un
`last-success` con el SHA esperado confirma la finalización.

## Validación requerida

1. Actualizar desde remoto al nuevo commit.
2. Pulsar una sola vez **Desplegar commit HEAD**.
3. Confirmar que el último SHA desplegado coincide con el HEAD.
4. Consultar `/api/runtime-check` y exigir:
   - HTTP 200;
   - `operational_intake_ready: true`;
   - `deployment.status: success`;
   - `deployment.phase: complete`.
5. Registrar un paquete QA y verificar solicitud, guía, recepción, custodia e
   idempotencia.

## Verificación automatizada

- `.cpanel.yml` carga como YAML válido y contiene exactamente 22 tareas;
- contrato de recuperación: 7 pruebas y 54 aserciones;
- backend completo: 393 pruebas y 1.960 aserciones;
- formato PHP y `git diff --check`: aprobados.
