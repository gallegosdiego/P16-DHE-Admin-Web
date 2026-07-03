# Iteración 50 - Endurecimiento runner E2E - 2026-07-03

## Contexto

Durante la auditoría posterior a los fallos de `frontend-ci` se detectó una fragilidad adicional en la configuración local de Playwright:

- `frontend/playwright.config.ts` tomaba `E2E_BASE_URL`
- pero el `webServer.command` seguía forzando `next start -p 3000`

Eso dejaba un comportamiento inconsistente:

- si el puerto `3000` ya estaba ocupado localmente, el runner podía quedarse esperando o fallar
- aunque se intentara validar con otra URL/puerto mediante `E2E_BASE_URL`

## Cambio aplicado

Se actualizó `frontend/playwright.config.ts` para derivar el puerto real desde `E2E_BASE_URL`:

- se parsea `baseURL` con `new URL(baseURL)`
- se calcula `webServerPort`
- `webServer.command` ahora usa `npx next start -p ${webServerPort}`

## Beneficio

- el entorno E2E queda coherente entre `url` y `command`
- mejora la reproducibilidad local cuando `3000` está ocupado
- reduce falsos negativos por colisión de puertos durante auditorías o validaciones manuales

## Validación ejecutada

### Frontend

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `CI=true E2E_BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/regression.spec.ts`
- `CI=true E2E_BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/zones.spec.ts`

Resultado:

- `regression.spec.ts`: 7/7 OK
- `zones.spec.ts`: 9/9 OK

### Backend

- `composer test`

Resultado:

- `250` pruebas OK

## Estado

- CI de frontend ya había quedado corregido en la iteración 49
- esta iteración agrega robustez operativa al runner E2E y cierra una omisión detectada durante la auditoría
