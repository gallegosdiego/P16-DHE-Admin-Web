# Pendiente: frontend-ci fallando en GitHub Actions

Fecha: 2026-06-16 23:55 America/Bogota
Repositorio: `gallegosdiego/P16-DHE-Admin-Web`
Workflow: `frontend-ci`
Rama: `main`

## Contexto

Estan llegando correos de GitHub Actions indicando:

`Run failed: frontend-ci - main`

El aviso viene del workflow `.github/workflows/frontend-ci.yml`, que ejecuta:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`
5. `npm run test:e2e`

## Lo que se encontro

Primero se reprodujeron fallos locales en frontend:

- `npm run lint` fallaba por uso de `any` en `conductores/page.tsx`.
- `npm run typecheck` fallaba porque `e2e/financial.spec.ts` importaba `mockFinancialApi`, pero ese export no existia.
- `npm run build` si pasaba.

Despues se detecto que Playwright fallaba en el modulo financiero porque la pagina `/pagos` se rompia con:

`Cannot read properties of undefined (reading 'filter')`

La causa era que los mocks E2E no respondian endpoints financieros nuevos y la UI asumia que `agingReport.clients` siempre existia.

## Cambios aplicados

Archivos modificados:

- `frontend/src/app/(admin)/pagos/page.tsx`
- `frontend/e2e/support/mock-api.ts`
- `frontend/e2e/financial.spec.ts`

Resumen:

- Se endurecio el calculo de cartera para no romper si `agingReport.clients` viene ausente.
- Se completaron mocks E2E para endpoints financieros:
  - `/api/financial/kpis`
  - `/api/financial/alerts`
  - `/api/financial/daily-summary`
  - `/api/financial/aging-report`
  - `/api/financial/profitability/by-driver`
  - `/api/financial/cash-flow`
  - `/api/cod-settlements/daily-summary`
  - `/api/cod-settlements`
  - historial de `/api/expenses/{id}/history`
  - historial de `/api/employees/{id}/history`
- Se actualizo `financial.spec.ts` a los nombres reales actuales de la UI:
  - `Cartera`, no `Quien me debe`
  - `Pilotos`, no `Conductores`
  - `COD`, no `Conciliacion`

## Verificacion local completada

Desde `frontend/`:

- `npm run lint`: pasa con warnings, sin errores.
- `npm run typecheck`: pasa.
- `npm run build`: pasa.

Warnings pendientes no bloqueantes:

- Uso de `<img>` en `layout.tsx` y `login/page.tsx`.
- `pct` sin uso en `pagos/page.tsx`.
- dependencia faltante de hook en `pagos/page.tsx`.

## Pendiente por verificar

No se alcanzo a cerrar la verificacion completa de Playwright local porque Windows/sandbox devolvio:

- `spawn EPERM` al intentar levantar Next localmente.
- La ultima ejecucion elevada fue interrumpida manualmente porque se cerro la sesion.

Pendiente para oficina:

1. Confirmar que GitHub Actions corra despues del push.
2. Si falla, abrir el run de `frontend-ci` y mirar especificamente el job `E2E smoke`.
3. Si se quiere reproducir localmente, intentar:

```powershell
cd "D:\Danhei Dev\P16-DHE-Admin-Web\frontend"
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

4. Si Playwright falla solo en Windows local con `spawn EPERM`, validar directamente en GitHub Actions porque Linux CI no deberia tener ese bloqueo.

## Recomendacion

Si el workflow queda verde en GitHub, cerrar este pendiente.

Si vuelve a fallar en E2E, no desactivar el workflow todavia. Primero revisar si el fallo es:

- contrato mock/API desactualizado;
- texto de UI cambiado;
- endpoint financiero nuevo sin mock;
- problema real de render en `/pagos`.

## Nota

Esto aplica a `P16-DHE-Admin-Web` solamente. No toca `P15-DHE-App-Repartidor`.
