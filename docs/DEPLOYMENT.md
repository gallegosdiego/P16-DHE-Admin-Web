# Despliegue del ecosistema Danhei

**Última actualización:** 28 de julio de 2026

**Estado:** guía operativa vigente

**Alcance:** P13 landing, P14 portal cliente, P15 app piloto y P16 API/panel administrativo

Esta guía describe qué se despliega y qué debe verificarse. No reemplaza los respaldos, la revisión de variables de entorno ni el QA posterior al despliegue.

## Matriz de componentes

| Componente | Repositorio | Destino | Modalidad |
|---|---|---|---|
| Landing pública | `P13-DHE-Landing-Page-` | cPanel, `/home/danheiex/public_html/` | Git Version Control de cPanel |
| Portal cliente | `P14-DHE-app-Cliente-/p14-cliente-web` | hosting web vinculado al repositorio | confirmar despliegue y dominio en el proveedor |
| App piloto | `P15-DHE-App-Repartidor` | APK Android | compilación e instalación manual para QA |
| Panel administrativo | `P16-DHE-Admin-Web/frontend` | Vercel | integración Git; verificar el deployment generado |
| API central | `P16-DHE-Admin-Web/api` | cPanel, `/home/danheiex/api.danheiexpress.com/` | Git Version Control de cPanel y `.cpanel.yml` |

## Reglas antes de publicar

1. Confirmar que el commit a publicar está en la rama correcta y en GitHub.
2. Revisar que no se incluyan archivos `.env`, llaves, tokens ni respaldos de base de datos.
3. Ejecutar las validaciones del componente modificado.
4. Respaldar la base de datos antes de cambios de esquema o datos en producción.
5. Registrar commit, fecha, responsable, resultado y evidencia del despliegue.
6. No declarar una versión como aprobada hasta terminar el UAT correspondiente.

## P16: API Laravel en cPanel

### Validación previa

Desde `P16-DHE-Admin-Web/api`:

```powershell
composer install
php artisan test
```

La API usa PHP 8.3, Laravel 13 y Sanctum. Las variables de producción se administran en el servidor y nunca deben copiarse al repositorio.

### Publicación

1. Subir el commit aprobado a `origin/main`.
2. Abrir **Git Version Control** en cPanel.
3. Seleccionar el repositorio `P16-DHE-Admin-Web`.
4. Actualizar el repositorio desde el remoto.
5. Confirmar visualmente que el HEAD coincide con el commit aprobado.
6. Ejecutar **Deploy HEAD Commit**.
7. Conservar la salida del despliegue como evidencia.

El archivo `.cpanel.yml` realiza actualmente estas acciones:

- conserva exactamente 3 tareas directas para el task runner de cPanel;
- crea `storage/logs`, copia `api/.` al destino y ejecuta `deploy-cpanel-all.php` desde el directorio real de la aplicación;
- mantiene juntas dentro del proceso PHP las migraciones, reparaciones y verificaciones críticas del ingreso;
- limpia cachés de Laravel, recupera tablas/columnas/permisos faltantes y exige `operational_intake_ready=true` antes de declarar éxito;
- deja WhatsApp y la optimización secundaria del índice diario fuera del camino crítico;
- registra la tarea exacta en `vc_*_git_deploy.log` y avanza por las fases `schema_core`, `runtime_repairs` y `financial_schema`;
- escribe `deploy-cpanel.last-success` solo cuando el despliegue queda operativo y `deploy-cpanel.last-failure` cuando falla una fase crítica.

Las migraciones y reparaciones son idempotentes y se ejecutan desde el tercer paso del archivo `.cpanel.yml`; no deben volver a agregarse como tareas individuales. Las ampliaciones futuras requieren revisión del contrato de tres tareas, pruebas y una estrategia de reversión.

`GET /api/runtime-check` devuelve HTTP 503 y `status: RUNTIME_BLOCKED` cuando falta una tabla o columna crítica de ingresos o finanzas. Un `health` en verde solo confirma que Laravel responde; no sustituye esta verificación de esquema.

No se debe asumir que ejecuta `composer install`, seeders o todas las migraciones pendientes. Cualquier ampliación del flujo requiere revisión previa y una estrategia de reversión.

### Validación posterior

- comprobar `https://api.danheiexpress.com/api/health`;
- consultar `GET /api/runtime-check` con una cuenta QA que tenga `settings.view`; `/api/deploy-check` debe responder `404` en producción;
- validar autenticación con una cuenta QA, sin exponer credenciales en evidencias;
- revisar que las rutas críticas no devuelvan errores 5xx;
- comprobar logs de Laravel y del servidor;
- ejecutar el caso funcional afectado desde el panel o la app;
- verificar que no se hayan duplicado registros financieros u operativos.

## P16: panel administrativo en Vercel

### Validación previa

Desde `P16-DHE-Admin-Web/frontend`:

```powershell
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Los workflows `frontend-ci.yml` y `backend-ci.yml` validan cambios en `main` y `dev`. Un workflow exitoso valida el código, pero no sustituye la comprobación del deployment de producción.

### Publicación y verificación

1. Confirmar que Vercel generó un deployment para el commit aprobado.
2. Confirmar que el deployment está asociado al dominio de producción esperado.
3. Abrir login, dashboard y el módulo modificado.
4. Revisar consola del navegador, solicitudes fallidas y URL base de la API.
5. Validar permisos con al menos un administrador y un rol restringido cuando aplique.

No afirmar que el panel está en producción basándose solo en el `git push`; debe verificarse el commit del deployment y realizar smoke test.

## P15: app piloto Android

La versión declarada en el código fuente es `4.2.20` (`versionCode` 437), pero la APK existente fue construida antes de integrar recogidas, tareas mixtas y conciliación. Por tanto, no certifica esas funciones.

El procedimiento vigente de compilación y QA está en:

- [Despliegue de la app piloto](../../P15-DHE-App-Repartidor/docs/DEPLOYMENT.md)
- [Checklist UAT de la app piloto](../../P15-DHE-App-Repartidor/docs/QA-PILOTO-UAT-2026-07-15.md)

Antes del siguiente artefacto se deben incrementar `expo.version`, `android.versionCode` y la versión de `package.json`. Registrar SHA-256, tamaño, fecha, commit fuente y dispositivo de prueba.

## P14: portal cliente

Desde `P14-DHE-app-Cliente-/p14-cliente-web`:

```powershell
npm ci
npm run lint
npm run build
```

Confirmar en el proveedor de hosting qué proyecto y dominio están vinculados. Después del despliegue, validar autenticación, creación y consulta de pedidos, solicitud de recogida y vistas financieras del cliente.

## P13: landing pública en cPanel

La rama de trabajo y publicación vigente de P13 es `dev`.

1. Subir el commit aprobado a `origin/dev`.
2. Actualizar el repositorio en Git Version Control de cPanel.
3. Confirmar que el HEAD coincide con el commit esperado.
4. Ejecutar el despliegue definido en `.cpanel.yml`.
5. Validar portada, navegación, formularios, tracking, documentos legales, sitemap y recursos estáticos.

La existencia de `.cpanel.yml` no demuestra que exista un webhook de despliegue automático. El despliegue debe confirmarse en cPanel.

## Orden recomendado para una entrega coordinada

Cuando hay cambios de contrato entre plataformas:

1. respaldar datos;
2. desplegar y validar la API compatible hacia atrás;
3. desplegar P16 y P14;
4. compilar e instalar P15;
5. ejecutar [UAT integral del ecosistema](./qa/UAT-ECOSISTEMA-2026-07-15.md);
6. documentar resultado, incidencias y decisión de aprobación o reversión.

## Reversión

- **Frontend web:** promover o volver a desplegar el último deployment estable del proveedor.
- **API/cPanel:** desplegar el último commit estable únicamente después de evaluar compatibilidad de esquema. No revertir migraciones destructivamente sin respaldo y plan específico.
- **Landing:** desplegar el último commit estable de `dev`.
- **APK:** reinstalar el artefacto estable anterior; conservar identificadores y hashes de todos los artefactos.

Una reversión de código no deshace automáticamente movimientos financieros, asignaciones, conciliaciones ni migraciones. Esos efectos requieren correcciones auditadas, nunca edición directa improvisada en producción.
