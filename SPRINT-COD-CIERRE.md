# Sprint Cod CIERRE — P16 Admin Web Final

> **Auditoría:** Popus — 20 mayo 2026
> **Ejecutor:** Cod
> **Objetivo:** Cerrar los gaps restantes del frontend P16 y preparar para deploy.
> **Base:** Cruce entre SPRINT-COD-V2.1 (13 mayo) y código actual (20 mayo)

---

## Estado: Lo que YA está hecho (NO tocar)

Cod ejecutó V2.1 → V3 → V4 → V5 → V6 + Financiero. Resultado:

| Bloque V2.1 | Estado | Evidencia |
|-------------|--------|-----------|
| B1: Usuarios CRUD | ✅ COMPLETO | `usuarios/page.tsx` (18K) — CRUD completo con roles |
| B2: Audit Log | ✅ COMPLETO | `auditoria/page.tsx` (14K) — tabla paginada |
| B3: Dashboard Live | ✅ COMPLETO | `page.tsx` (22K) — sin imports de mock-data, datos reales |
| B3.1: Polling 30s | ✅ COMPLETO | useEffect con setInterval, dot verde, AbortController |
| B3.2: Chart Live | ✅ COMPLETO | Barra segmentada por estado, datos reales |
| B3.3: Timeline Live | ✅ COMPLETO | Últimos envíos reales de la API |
| B3.4: Widget Financiero | ✅ COMPLETO | ReceivableResponse integrado |
| B3.5: Acciones Rápidas | ✅ COMPLETO | router.push funcional |
| B4: Reportes Export | ✅ COMPLETO | `reportes/page.tsx` (13K) — stats reales, export CSV |
| B5: Conductores Stats | ✅ COMPLETO | `conductores/[id]/page.tsx` (14K) — tasa, recaudo, tabs |
| B6: Clientes Tabs | ✅ COMPLETO | `clientes/page.tsx` (28K) — tabs Resumen/Envíos/Direcciones |
| B7: Pedidos Batch | ✅ COMPLETO | `pedidos/page.tsx` (39K) — checkbox, batch assign/status |
| Sprint Financiero | ✅ COMPLETO | `pagos/page.tsx` (30K) — 5 tabs, conciliación COD |
| Zonas | ✅ EXTRA | `zonas/page.tsx` (17K) — módulo completo |
| Rutas | ✅ EXTRA | `rutas/page.tsx` (14K) — módulo completo |
| Métricas | ✅ EXTRA | `metricas/page.tsx` (11K) — módulo completo |

**Mock data:** 0 imports de `mock-data.ts` en todo el frontend. ✅
**Dark mode:** Todas las clases dark aplicadas en todos los módulos. ✅
**Components:** 9 componentes reutilizables (skeleton, toast, pagination, print-receipt, etc.). ✅

---

## Gaps Reales Pendientes

### Categoría A: Backend pendiente para producción

| # | Gap | Archivo/Ruta | Prioridad |
|---|-----|-------------|-----------|
| A1 | Tests ScopedEndpoint (5 tests) | `api/tests/Feature/ScopedEndpointTest.php` | MEDIA |
| A2 | Queries SQLite → MySQL audit | Toda la app | ALTA |
| A3 | ProductionSeeder con datos reales | `api/database/seeders/ProductionSeeder.php` | ALTA |
| A4 | `.htaccess` para cPanel | `api/public/.htaccess` | ALTA |
| A5 | ProfitCalculator `DB::table()` limpieza | `api/app/Domain/Financial/Services/ProfitCalculator.php` | BAJA |

### Categoría B: Validación de builds

| # | Gap | Comando | Prioridad |
|---|-----|---------|-----------|
| B1 | Frontend build | `cd frontend && npm install && npm run build` | CRÍTICA |
| B2 | Backend tests | `cd api && php artisan test` | CRÍTICA |
| B3 | Frontend lint | `cd frontend && npm run lint` | ALTA |

### Categoría C: Deploy

| # | Gap | Detalle | Prioridad |
|---|-----|---------|-----------|
| C1 | API → cPanel | `api.danheiexpress.com` → Laravel, MySQL, SSL | ALTA |
| C2 | Admin → Vercel | `admin.danheiexpress.com` → Next.js SSR/static | ALTA |
| C3 | Portal → Vercel | `portal.danheiexpress.com` → P14 Next.js | ALTA |
| C4 | DNS subdominios | A/CNAME records | ALTA |
| C5 | UptimeRobot | Monitoreo de salud | MEDIA |

### Categoría D: Polish pendiente (Sprint Financiero)

| # | Gap | Detalle | Prioridad |
|---|-----|---------|-----------|
| D1 | Exports CSV nuevos | `receivables`, `payroll`, `expenses` — endpoints y rutas en api.php | BAJA |
| D2 | Rama Codex sin merge | `codex-sprint-cod-v2-1-ajustes` en remote | BAJA |

---

## Orden de Ejecución

```
FASE 1 — VALIDACIÓN (30 min)
  1. cd frontend && npm install && npm run build
  2. cd api && php artisan test
  3. cd frontend && npm run lint
  → Si alguno falla: arreglar ANTES de seguir

FASE 2 — BACKEND PRODUCCIÓN (2-3h)
  4. Auditar queries para MySQL (LIKE, date functions, JSON columns)
  5. ProductionSeeder con admin real + datos demo
  6. .htaccess para cPanel
  7. Tests ScopedEndpoint pendientes (5 tests)
  8. (Opcional) ProfitCalculator: reemplazar DB::table() por Eloquent

FASE 3 — DEPLOY (2-3h)
  9. Crear BD MySQL en cPanel
  10. Clonar API, configurar .env, migrate + seed
  11. SSL + subdominio API
  12. Deploy P16 a Vercel
  13. Deploy P14 a Vercel
  14. DNS records
  15. Smoke test completo en producción

FASE 4 — LIMPIEZA (30 min)
  16. Revisar rama codex-sprint-cod-v2-1-ajustes (merge o eliminar)
  17. Actualizar README con URLs de producción
  18. Cerrar PENDIENTES-DHE-19MAY.txt
```

---

## DoD para cerrar el proyecto

```
[ ] npm run build → 0 errores
[ ] npm run lint → 0 warnings nuevos
[ ] php artisan test → 133+ tests, 0 failures
[ ] Login funcional en producción
[ ] Dashboard con datos reales y auto-refresh
[ ] 15 módulos navegables sin errores
[ ] Dark mode funcional en todos los módulos
[ ] Mobile 375px: todo legible y funcional
[ ] Ctrl+K: búsqueda global funciona
[ ] API: https://api.danheiexpress.com/api/health → 200 OK
[ ] Admin: https://admin.danheiexpress.com → carga login
```

---

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| **Módulos frontend** | 15 páginas completas |
| **Controladores backend** | 17 controllers |
| **Tests backend** | 133 tests / 479 assertions |
| **Componentes reutilizables** | 9 |
| **Endpoints API** | 77+ |
| **Mock data restante** | 0 |
| **Trabajo pendiente** | ~5-6h (validación + deploy) |
| **Riesgo principal** | Compatibilidad SQLite → MySQL |

**La app web de administración está funcionalmente completa.** Lo que falta es validación de build, hardening para MySQL, y deploy a producción.
