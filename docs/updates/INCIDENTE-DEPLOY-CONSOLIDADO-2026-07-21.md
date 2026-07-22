# Incidente de despliegue cPanel — 21 de julio de 2026

**Estado:** resuelto
**Commit de corrección:** `819a9e8`

## Síntoma

Al presionar **Desplegar commit HEAD** en Git Version Control de cPanel, el
despliegue quedaba congelado en *"en curso..."* indefinidamente. El último SHA
desplegado permanecía en `c1b71ad` (12 de julio) sin importar cuántos intentos
se realizaran.

## Causas raíz (3)

### 1. Exceso de tareas en `.cpanel.yml`

El último deploy exitoso (`c1b71ad`, 12 de julio) usaba 7 tareas simples. La
versión actual (`c7a8ad3`) creció a 22 tareas secuenciales con 9 migraciones
individuales, 4 scripts de verificación, 4 marcadores y 5 reparaciones. El task
runner de cPanel en hosting compartido no completaba las 22 tareas dentro de
sus límites internos de tiempo.

### 2. Cambio de patrón de ejecución

El deploy exitoso usaba el patrón:

```
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php script.php 2>&1
```

La versión rota eliminó ambos elementos:

- sin `cd`: PHP resolvía el directorio de trabajo desde el repositorio, donde
  no existe `.env`, provocando fallos de conexión a base de datos;
- sin `2>&1`: los errores de stderr podían confundir al task runner sobre el
  estado de finalización de cada tarea.

### 3. Tarea colgada en la cola interna

Cada intento fallido dejaba una tarea en la cola `UserTasks` de cPanel. La
interfaz web no ofrecía una opción para cancelarla y mostraba la animación de
carga indefinidamente.

## Solución aplicada

Se creó un script PHP consolidado (`api/scripts/deploy-cpanel-all.php`) que
ejecuta internamente todas las migraciones y reparaciones con las siguientes
protecciones:

- `try/catch` en cada paso para no colgarse ante un error;
- timeouts de base de datos (`lock_wait_timeout = 60s`);
- `exit(0)` garantizado para que cPanel actualice el SHA desplegado;
- marcadores de progreso (`schema_core`, `runtime_repairs`, `financial_schema`).

El archivo `.cpanel.yml` se redujo de 22 tareas a 3:

```yaml
---
deployment:
  tasks:
    - /bin/mkdir -p /home/danheiex/api.danheiexpress.com/storage/logs
    - /bin/cp -R api/. /home/danheiex/api.danheiexpress.com/
    - cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/deploy-cpanel-all.php 2>&1
```

La cola interna se verificó vacía mediante el Administrador de Archivos de
cPanel (`/home/danheiex/.cpanel/user_tasks/`).

## Verificación

- PHPUnit `CpanelDeploymentContractTest`: 6 pruebas, 52 aserciones aprobadas.
- Un test automatizado exige máximo 5 tareas en `.cpanel.yml`.
- Push a GitHub: commit `819a9e8` publicado.
- Actualizar desde remoto y Desplegar commit HEAD: completado sin bucle.
- SHA desplegado actualizado correctamente en cPanel.

## Prevención

1. Máximo 5 tareas en `.cpanel.yml` (exigido por test automatizado).
2. Nuevas migraciones se agregan dentro de `deploy-cpanel-all.php`, nunca como
   tareas directas de cPanel.
3. Si un deploy se cuelga: Administrador de Archivos >
   `.cpanel/user_tasks/00000000/` para vaciar la cola.
4. Mantener el patrón `cd ... && ... 2>&1` para la tarea PHP.
