# Iteración 12 — CI remoto backend para rama dev

Fecha: 2026-06-20  
Rama: `dev`  
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Completar la protección remota de `dev` agregando un workflow de backend equivalente al guardrail ya creado para frontend.

La estrategia se mantiene:

- `dev` es rama de integración y validación.
- `main` queda libre para producción.
- El despliegue automático de API sigue limitado a `main`.

## Hallazgo

Hasta esta iteración no existía un workflow dedicado para validar el backend en GitHub Actions.

Esto dejaba sin protección remota cambios críticos como:

- Permisos y seeders.
- Reglas de borrado de pedidos.
- Persistencia financiera.
- Scope de piloto/usuario.
- Auditoría de integridad operacional.

## Corrección

Se agregó `.github/workflows/backend-ci.yml`.

El workflow corre en:

- `push` a `dev`
- `push` a `main`
- `pull_request` hacia `dev`
- `pull_request` hacia `main`
- `workflow_dispatch`

Con filtros de paths para backend:

- `api/**`
- `.github/workflows/backend-ci.yml`

## Qué valida

El workflow ejecuta:

1. Checkout del repositorio.
2. Setup de PHP `8.3`.
3. Instalación de extensiones requeridas:
   - `mbstring`
   - `dom`
   - `fileinfo`
   - `pdo_sqlite`
   - `sqlite3`
4. Cache de Composer.
5. `composer install`.
6. Preparación de Laravel:
   - copiar `.env.example`
   - generar `APP_KEY`
   - limpiar configuración
7. Revisión de sintaxis PHP en `app`, `database`, `routes` y `tests`.
8. PHPUnit completo con `LOG_CHANNEL=null`.

## Validación local

Antes del commit se ejecutó localmente:

- Sintaxis PHP: `106` archivos OK.
- PHPUnit completo: `204` pruebas aprobadas, `717` aserciones.

## Validación remota

Después del push a `dev`, GitHub Actions ejecutó correctamente los checks:

### Backend

- Workflow: `backend-ci`
- Run: `27889948633`
- Rama: `dev`
- Commit: `aad93ede0203cc3e3332273dd8909755e4114c15`
- Estado: `completed`
- Conclusión: `success`
- URL: https://github.com/gallegosdiego/P16-DHE-Admin-Web/actions/runs/27889948633

### Frontend

- Workflow: `frontend-ci`
- Run: `27889948614`
- Rama: `dev`
- Commit: `aad93ede0203cc3e3332273dd8909755e4114c15`
- Estado: `completed`
- Conclusión: `success`
- URL: https://github.com/gallegosdiego/P16-DHE-Admin-Web/actions/runs/27889948614

## Auditoría propia

### Omisiones buscadas

- Que el workflow no despliegue desde `dev`.
- Que use PHP compatible con `composer.json`.
- Que no dependa de una base externa.
- Que cubra seeders, rutas, controladores y tests.
- Que se pueda disparar manualmente si hace falta.

### Mejoras incorporadas

- `dev` tendrá validación remota real de backend.
- `main` sigue protegido como rama productiva.
- El backend y frontend quedan ambos cubiertos por CI remoto.

### Riesgo residual

- El CI usa SQLite en memoria como la suite actual; no sustituye una prueba de producción contra MySQL/MariaDB.
- Los permisos en producción todavía requieren sincronización/seed controlado antes del despliegue final.

## Estado

Workflow configurado, subido y validado con `backend-ci` exitoso en `dev`.
