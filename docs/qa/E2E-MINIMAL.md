# E2E minima (Playwright)

## Objetivo
Validar rapidamente los flujos que no pueden romperse:
- Login.
- Dashboard live render.
- Pantalla Usuarios.
- Pantalla Reportes (botones export).
- Command Palette (`Ctrl+K`).

## Archivos
- Config: `frontend/playwright.config.ts`
- Tests: `frontend/e2e/smoke.spec.ts`

## Ejecucion

### 1) Instalar dependencias frontend
```bash
cd frontend
npm install
```

### 2) Instalar navegador de pruebas
```bash
npm run test:e2e:install
```

### 3) Levantar API y frontend en terminales separadas
```bash
# Terminal A
cd api
php artisan serve --host=127.0.0.1 --port=8000

# Terminal B
cd frontend
npm run dev
```

### 4) Ejecutar tests
```bash
cd frontend
npm run test:e2e
```

## Ejecucion en CI
- El workflow `frontend-ci` ejecuta Playwright smoke automaticamente.
- En CI, `playwright.config.ts` levanta un `webServer` propio (`build + start`) para ejecutar la suite de forma deterministica.

## Variables opcionales
- `E2E_BASE_URL` (default: `http://localhost:3000`)

## Criterio de pase
- 4 pruebas smoke en verde.
- Sin errores de navegación ni auth.
