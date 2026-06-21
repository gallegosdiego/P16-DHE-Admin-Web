# Iteración 14 - Auditoría de logs y filtros reales

Fecha: 2026-06-21
Repositorio: `P16-DHE-Admin-Web`
Rama: `dev`
Commit de código auditado: `04cb2a2 fix(audit): align audit log contract and filters`
Estado de producción: no desplegado a `main`.

## Contexto

Durante la revisión del módulo `/auditoria` se detectó que la documentación y las pruebas E2E describían un inspector de `metadata`, pero el backend real persiste los cambios de auditoría en `old_values` y `new_values`.

También se detectó que los filtros de la pantalla eran locales a la página cargada. Con muchos registros, una búsqueda podía devolver vacío aunque el evento existiera en otra página de la paginación.

## Problemas corregidos

1. `AuditLog::log()` serializaba manualmente arrays con `json_encode`.
   - Riesgo: los casts JSON de Laravel podían devolver strings JSON en vez de objetos/arrays.
   - Corrección: se entregan arrays directamente a los campos casteados `old_values` y `new_values`.

2. `/api/audit-logs` solo aceptaba `page` y `per_page`.
   - Riesgo: la UI filtraba una sola página, no todo el histórico.
   - Corrección: el API ahora filtra en backend por `search`, `action`, `user_id`, `date_from` y `date_to`.

3. La UI de `/auditoria` dependía de `metadata`.
   - Riesgo: el inspector podía no mostrar los cambios reales guardados por el backend.
   - Corrección: la UI construye el inspector desde `old_values/new_values` y mantiene soporte defensivo para `metadata` legacy.

4. La ruta temporal `/drivers/debug-juan` estaba registrada dentro de rutas autenticadas generales.
   - Riesgo: herramienta de diagnóstico específica disponible fuera del contexto de desarrollo.
   - Corrección: queda limitada a entornos `local` y `testing`.

## Contrato actual de `/api/audit-logs`

Parámetros soportados:

| Parámetro | Descripción |
|---|---|
| `page` | Página de paginación. |
| `per_page` | Tamaño de página, máximo `100`. |
| `search` | Busca en acción, descripción o nombre de usuario. |
| `action` | Filtra por acción exacta. |
| `user_id` | Filtra por usuario exacto. |
| `date_from` | Fecha mínima sobre `occurred_at`, formato `YYYY-MM-DD`. |
| `date_to` | Fecha máxima sobre `occurred_at`, formato `YYYY-MM-DD`. |

Campos relevantes de respuesta:

```ts
{
  id: number;
  user_id: number;
  action: string;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
  user?: { id: number; name: string } | null;
}
```

## Archivos modificados

- `api/app/Domain/Shared/Models/AuditLog.php`
- `api/routes/api.php`
- `api/tests/Feature/RbacExtendedTest.php`
- `frontend/src/app/(admin)/auditoria/page.tsx`
- `frontend/src/lib/types.ts`
- `frontend/e2e/support/mock-api.ts`

## Documentación actualizada

- `docs/API-CONTRACTS.md`
- `docs/CHANGELOG.md`
- `docs/QA-EVIDENCE.md`
- `docs/operations/STAGING-UAT-CHECKLIST.md`
- `README.md`
- `docs/updates/RESUMEN-AUDITORIA-FINAL-BUGS-2026-06-20.md`
- `docs/updates/ITERACION-14-AUDITORIA-LOGS-FILTROS-2026-06-21.md`

## Validación ejecutada

Backend:

```powershell
php -l app\Domain\Shared\Models\AuditLog.php
php -l routes\api.php
php -l tests\Feature\RbacExtendedTest.php
$env:LOG_CHANNEL='null'; .\vendor\bin\phpunit.bat --do-not-cache-result tests\Feature\OperationalIntegrityCommandTest.php tests\Feature\RbacExtendedTest.php
```

Resultado:

- PHP lint: correcto.
- PHPUnit: `25 tests`, `75 assertions`, correcto.

Frontend:

```powershell
npx tsc --noEmit --incremental false
npx eslint -- "src/app/(admin)/auditoria/page.tsx" "src/lib/types.ts" "e2e/support/mock-api.ts"
$env:CI='true'; npx playwright test e2e/regression.spec.ts --project=chromium --reporter=list
```

Resultado:

- TypeScript: correcto.
- ESLint focalizado: correcto.
- Playwright regression: los 7 tests reportaron `ok`, incluido `/auditoria`.
- Nota local: el proceso Playwright agotó timeout después de terminar los tests por teardown del servidor en Windows.

## Estado Git

- Código subido a `origin/dev` en `04cb2a2`.
- Esta documentación se agrega como seguimiento en `dev`.
- `main` no fue modificado ni desplegado.

## Pendientes antes de producción

1. Validar `/api/audit-logs` con datos reales de staging o producción.
2. Confirmar que los perfiles esperados siguen cumpliendo la matriz de permisos.
3. Ejecutar UAT visual de `/auditoria` con más de una página de logs.
4. Decidir si se crea permiso dedicado `audit.view` en una iteración posterior; por ahora se conserva `financial.view` para evitar ruptura de permisos existentes.
