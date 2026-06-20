# Iteración 1 — Bugfixes operativos y mobile

Fecha: 2026-06-20
Rama: `dev`
Commit base de la corrección: `0b1c479 fix(ops): localize statuses and preserve issue stops`

---

## Objetivo

Ejecutar una primera capa de correcciones seguras sobre el panel administrativo y la API, dejando `main` libre como rama de producción.

---

## Cambios realizados

### Estados en español

Archivos:

- `frontend/src/lib/utils.ts`
- `frontend/src/app/(admin)/pedidos/page.tsx`
- `frontend/src/app/(admin)/page.tsx`

Acciones:

- Se agregó `shipmentStatusLabel()`.
- Se reemplazaron badges y confirmaciones críticas que mostraban estados como `Registered` o `Delivered`.

### Safe area móvil del admin

Archivos:

- `frontend/src/app/(admin)/layout.tsx`
- `frontend/src/app/globals.css`

Acciones:

- Se agregó `.admin-mobile-safe-area`.
- El contenido principal del admin tiene aire inferior en móvil usando `env(safe-area-inset-bottom)`.

### Novedad no se pisa como entregada

Archivos:

- `api/app/Http/Controllers/Api/RouteController.php`
- `api/tests/Feature/RouteTest.php`

Acciones:

- `completeStop()` ya no cambia a `delivered` un envío que ya está en `issue`.
- Se agregó `test_complete_stop_preserves_issue_status`.

---

## Validación realizada

Frontend:

```powershell
npx tsc --noEmit --incremental false
npx eslint -- "src/app/(admin)/pedidos/page.tsx" "src/app/(admin)/page.tsx" "src/app/(admin)/layout.tsx" "src/lib/utils.ts"
```

API:

```powershell
$env:LOG_CHANNEL='null'; .\vendor\bin\phpunit.bat --filter complete_stop --do-not-cache-result tests\Feature\RouteTest.php
```

Resultado:

- TypeScript P16: OK.
- ESLint archivos tocados: OK.
- PHPUnit puntual: OK.

---

## Omisiones detectadas para Iteración 1.1

1. Completar traducción de estados en command palette, clientes, reportes, rutas y conductores.
2. Corregir acentos/textos críticos visibles.
3. Revisar modales móviles con `100dvh`.
4. Diseñar contrato formal de outcome para entrega/novedad/devolución.
5. Pasar luego a Iteración 2: auditoría de Juan, endpoints, producción y base de datos.
