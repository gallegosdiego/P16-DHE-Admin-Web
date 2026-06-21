# Iteración 11 — CI remoto para rama dev

Fecha: 2026-06-20  
Rama: `dev`  
Repositorio: `P16-DHE-Admin-Web`

## Hallazgo

Después de subir las correcciones a `dev`, la API pública de GitHub Actions mostró `0` runs para esa rama.

La causa no era el código: el workflow `frontend-ci` solo se ejecutaba en:

- `push` a `main`
- `pull_request` hacia `main`

Esto dejaba a `dev` sin validación remota, justo cuando la estrategia acordada es mantener `main` como rama limpia de producción.

## Corrección

Se actualizó `.github/workflows/frontend-ci.yml` para ejecutar CI en:

- `push` a `main`
- `push` a `dev`
- `pull_request` hacia `main`
- `pull_request` hacia `dev`

El workflow `deploy-api` no se modificó y sigue limitado a `main`, para no desplegar desde `dev`.

## Validación previa

Antes de activar el guardrail remoto, la misma suite que ejecuta `frontend-ci` pasó localmente:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `CI=true npm run test:e2e`

Resultado: `41` pruebas E2E aprobadas.

## Validación remota

Después del push a `dev`, GitHub Actions disparó correctamente `frontend-ci`:

- Run: `27886847060`
- Rama: `dev`
- Commit: `bbc7ef465a20df21337eef448f47bd657570f6cd`
- Estado: `completed`
- Conclusión: `success`
- URL: https://github.com/gallegosdiego/P16-DHE-Admin-Web/actions/runs/27886847060

## Auditoría propia

### Omisión detectada

La corrección anterior estaba validada localmente, pero `dev` no tenía confirmación remota porque el workflow no corría en esa rama.

### Mejora incorporada

La rama de integración (`dev`) ahora puede fallar temprano sin ensuciar `main`.

### Riesgo residual

GitHub no permitió descargar logs crudos del job público vía API sin autenticación (`403`), así que la comparación de logs se hizo por listado de runs y reproducción local.

## Estado

Guardrail configurado y validado con `frontend-ci` exitoso en `dev`.
