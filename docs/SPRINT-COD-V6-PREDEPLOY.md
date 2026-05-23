# 🚀 SPRINT-COD-V6 — Pre-Deploy + E2E + Polish

> **Proyecto:** P16-DHE-Admin-Web (+ P14 Portal)  
> **Fecha:** 15 mayo 2026  
> **Tipo:** Sprint de ejecución — delegable  
> **Baseline:** 173 tests ✅ | 612 assertions | 31 E2E specs | build ✅  
> **Duración estimada:** ~2.5 horas

---

## 1. Contexto

El ecosistema está **100% funcional en desarrollo**. Este sprint prepara todo para producción:
- E2E del módulo financiero (la página más importante — 0 cobertura Playwright)
- Dashboard: conectar el P&L real del nuevo endpoint `daily-summary`
- Endpoint faltante para "Marcar pagado" desde la tabla de deudores
- Tests de Export CSV
- Pre-deploy checklist

### Estado Actual de Cobertura E2E

| Página | E2E Specs | Estado |
|--------|-----------|--------|
| Login | ✅ 1 | Cubierto |
| Dashboard | ✅ 1 | Cubierto |
| Pedidos | — | Sin cobertura |
| Conductores | ✅ 1 | Cubierto |
| Rutas | ✅ 8 | Cubierto fuerte |
| Zonas | ✅ 8 | Cubierto fuerte |
| Novedades | — | Sin cobertura |
| **Pagos** | ✅ 1 | **Obsoleto** (pre-tabs) |
| Auditoría | ✅ 1 | Cubierto |
| Configuración | ✅ 1 | Cubierto |
| Notificaciones | ✅ 3 | Cubierto |
| Usuarios/Reportes | ✅ 1 | Cubierto |
| Métricas | — | Sin cobertura |
| Clientes | — | Sin cobertura |

---

## 2. Bloque 1 — Backend: Endpoint Faltante + Tests Export (~30 min)

---

### 2.1 [NUEVO] Endpoint: Liquidar envíos de un cliente

**Problema:** Tab "Quién me debe" tiene botón "Marcar pagado" pero no hay endpoint para liquidar todos los envíos pendientes de un cliente específico.

#### [MODIFY] `api/app/Http/Controllers/Api/ClientController.php`

Agregar método:
```php
/**
 * Liquidar todas las cuentas pendientes de un cliente.
 * POST /api/clients/{client}/settle-receivables
 */
public function settleReceivables(Client $client): JsonResponse
{
    $count = Shipment::where('client_id', $client->id)
        ->where('payment_type', 'post_sale')
        ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
        ->update(['financial_status' => 'settled']);

    AuditLog::log('financial.client_settled', $client,
        null,
        ['shipments_settled' => $count],
        "Cuentas liquidadas: {$count} envíos del cliente {$client->company}"
    );

    return response()->json([
        'message' => "{$count} envíos liquidados.",
        'count' => $count,
    ]);
}
```

#### [MODIFY] `api/routes/api.php`

```php
// Dentro del grupo de clientes o financiero:
Route::post('/clients/{client}/settle-receivables', [ClientController::class, 'settleReceivables'])
    ->middleware('permission:financial.settle');
```

### 2.2 [NUEVO] `api/tests/Feature/ExportExtendedTest.php`

Tests para los 3 nuevos exports CSV del sprint anterior:

```php
test_admin_can_export_receivables_csv()
  → GET /api/reports/export/receivables → assertOk
  → Verificar header Content-Type: text/csv
  → Verificar que contenido tiene encabezados CSV

test_admin_can_export_payroll_csv()
  → GET /api/reports/export/payroll → assertOk
  → Content-Type CSV

test_admin_can_export_expenses_csv()
  → GET /api/reports/export/expenses → assertOk
  → Content-Type CSV

test_admin_can_settle_client_receivables()
  → POST /api/clients/{client}/settle-receivables → assertOk
  → assertDatabaseHas financial_status = 'settled'

test_settle_creates_audit_log()
  → POST settle-receivables → assertDatabaseHas audit_logs

test_operador_cannot_settle_receivables()
  → actingAs operador → assertForbidden
```

~6 tests, ~18 assertions

### Verificación Bloque 1

```bash
cd P16-DHE-Admin-Web/api
php artisan test --filter=ExportExtended   # 6 nuevos
php artisan test                            # Todo
# Meta: ≥ 179 tests
```

---

## 3. Bloque 2 — E2E Playwright: Módulo Financiero (~45 min)

---

### 3.1 [MODIFY] `frontend/e2e/regression.spec.ts`

**Actualizar** el test existente de pagos (está obsoleto post-refactor a tabs):

```typescript
// Reemplazar el test actual "pagos module renders finance, expenses and payroll sections"
// con uno que valide la nueva estructura de tabs:

test("pagos module renders 5 tab navigation", async ({ page }) => {
  // Navegar a /pagos
  // Verificar que existen los 5 tabs: Resumen, Quién me debe, Conductores, Gastos y Nómina, Conciliación
  // Verificar que Tab 1 (Resumen) está activo por defecto
  // Verificar que KPIs están visibles
});
```

### 3.2 [NUEVO] `frontend/e2e/financial.spec.ts`

E2E completo del módulo financiero con mock API:

```typescript
import { test, expect } from "@playwright/test";
import { mockFinancialApi } from "./support/mock-api";

test.describe("Financial Module — Tabs", () => {

  test("tab resumen shows daily KPIs and P&L", async ({ page }) => {
    // Mock: GET /financial/daily-summary → datos de prueba
    // Navegar a /pagos
    // Verificar KPIs: Paquetes hoy, Ingreso bruto, Costo conductores, Ganancia bruta
    // Verificar barra COD visible
    // Verificar tabla mini P&L
  });

  test("tab quien me debe shows debtors with filters", async ({ page }) => {
    // Mock: GET /clients-receivable → clientes con deuda
    // Click tab "Quién me debe"
    // Verificar lista de deudores
    // Click filtro "Vencidos" → solo deudores >15 días
    // Verificar botón WhatsApp tiene href wa.me
  });

  test("tab quien me debe whatsapp link has correct format", async ({ page }) => {
    // Mock con teléfono conocido
    // Click tab deudas
    // Verificar href del link WhatsApp:
    //   - Contiene wa.me/57
    //   - Contiene texto "le recordamos"
    //   - Contiene formatCOP del monto
  });

  test("tab conductores shows batch actions", async ({ page }) => {
    // Mock: GET /financial/driver-board → conductores
    // Click tab "Conductores"
    // Verificar cards de conductores
    // Verificar botones batch: "Recaudar todo", "Liquidar todo", "Pagar todo"
  });

  test("tab conductores batch collect triggers API", async ({ page }) => {
    // Mock: POST /financial/collect-batch → OK
    // Click "Recaudar todo" en un conductor
    // Verificar toast "COD recaudado"
  });

  test("tab gastos shows expenses and payroll split", async ({ page }) => {
    // Mock: GET /expenses, GET /employees
    // Click tab "Gastos y Nómina"
    // Verificar sección gastos con totales
    // Verificar sección nómina con totales
  });

  test("tab gastos expand history works", async ({ page }) => {
    // Mock: GET /expenses/{id}/history → pagos
    // Click "Ver historial" en un gasto
    // Verificar tabla de pagos aparece
  });

  test("tab conciliacion shows daily summary table", async ({ page }) => {
    // Mock: GET /cod-settlements/daily-summary → data por conductor
    // Click tab "Conciliación"
    // Verificar tabla: Conductor, Paquetes, Esperado, Cobrado, Diferencia
  });

  test("tab conciliacion create settlement", async ({ page }) => {
    // Mock: POST /cod-settlements → created
    // Click "Crear conciliación"
    // Llenar form: conductor, monto
    // Submit → verificar toast
  });

  test("tabs dark mode renders correctly", async ({ page }) => {
    // Activar dark mode
    // Navegar por todos los tabs
    // Verificar que no hay texto invisible (dark on dark)
    // Verificar bordes dark:border-[#2a2a3e]
  });

  test("tabs mobile scroll horizontal works", async ({ page }) => {
    // Viewport: 375x667 (iPhone SE)
    // Verificar que el tab bar tiene overflow-x-auto
    // Verificar que se puede hacer scroll a Conciliación
  });
});
```

~11 E2E tests nuevos

### 3.3 [MODIFY] `frontend/e2e/support/mock-api.ts`

Agregar mocks financieros:

```typescript
export function mockFinancialApi(page: Page) {
  // Mock daily-summary
  await page.route("**/api/financial/daily-summary**", (route) => route.fulfill({
    json: {
      date: "2026-05-15",
      packages: { total_today: 45, delivered_today: 32, total_week: 210, total_month: 890 },
      revenue: { gross_income: 4500000, driver_cost: 1800000, gross_profit: 2700000, fixed_expenses_month: 800000, payroll_month: 1200000 },
      cod: { collected_today: 1200000, pending_today: 350000, drivers_with_cash: 2 },
      receivables: { total_owed: 3200000, overdue_count: 3, oldest_days: 22 },
      outsourcing: { service_income: 600000, driver_cost: 240000, profit: 360000, packages: 8 },
    },
  }));

  // Mock cod-settlements/daily-summary
  await page.route("**/api/cod-settlements/daily-summary**", (route) => route.fulfill({
    json: {
      date: "2026-05-15",
      drivers: [
        { driver_id: 1, driver_name: "Carlos Repartidor", packages: 12, total_expected: 850000, collected: 700000, pending: 150000, difference: 150000 },
        { driver_id: 2, driver_name: "María Conductora", packages: 8, total_expected: 420000, collected: 420000, pending: 0, difference: 0 },
      ],
      totals: { total_expected: 1270000, total_collected: 1120000, total_pending: 150000 },
    },
  }));
}
```

### Verificación Bloque 2

```bash
cd P16-DHE-Admin-Web/frontend
npx playwright test e2e/financial.spec.ts   # 11 nuevos
npx playwright test                           # Todo
# Meta: ≥ 42 E2E specs
```

---

## 4. Bloque 3 — Dashboard: Conectar P&L Real (~20 min)

---

### 4.1 [MODIFY] `frontend/src/app/(admin)/page.tsx`

El dashboard actualmente consume `/dashboard` para datos financieros básicos. Mejorar la card "Financiero" para usar `/financial/daily-summary` que ya tiene datos más ricos:

**Actual (L270-343):** Card financiero con 4 líneas estáticas + expandible con top 3 deudores.

**Cambio:**
1. Agregar llamada a `apiGet<DailySummary>("/financial/daily-summary")` en el `loadDashboard`
2. En la card financiero, agregar:
   - **Progress bar COD:** `collected_today / (collected_today + pending_today)`
   - **Alert badge** si `drivers_with_cash > 0`: "N conductores con dinero en calle"
   - **Outsourcing line:** `Tercerización: ${formatCOP(outsourcing.profit)}`
3. En el expandible, agregar:
   - **Gastos fijos mes:** `${formatCOP(revenue.fixed_expenses_month)}`
   - **Nómina mes:** `${formatCOP(revenue.payroll_month)}`
   - **Resultado neto mes:** `gross_profit - fixed_expenses - payroll`

#### [MODIFY] `frontend/src/lib/types.ts`

Verificar que `DailySummary` interface (ya agregada en sprint anterior) está importable desde el dashboard.

### Verificación Bloque 3

```bash
cd P16-DHE-Admin-Web/frontend
npm run build    # 0 errores
npm run lint     # 0 warnings
```

Verificación visual:
- Dashboard → Card financiero muestra progress bar COD
- Dashboard → Expandir → muestra gastos fijos, nómina, resultado neto

---

## 5. Bloque 4 — Pre-Deploy Checklist (~15 min)

---

### 5.1 [MODIFY] `frontend/src/app/(admin)/pagos/page.tsx`

**Conectar el botón "Marcar pagado"** en Tab 2 al nuevo endpoint:

```tsx
const settleClient = async (clientId: number) => {
  try {
    setActionLoadingKey(`settle-${clientId}`);
    await apiSend(`/clients/${clientId}/settle-receivables`, "POST", {});
    showToast("Cuentas liquidadas", "success");
    await loadData();
  } catch {
    showToast("No se pudo liquidar", "error");
  } finally {
    setActionLoadingKey("");
  }
};
```

### 5.2 [NUEVO] `.env.production.example` — Verificación

Verificar que el archivo `.env.production.example` incluye las variables para los 3 exports:
```env
# No se necesitan variables nuevas para exports CSV
# Solo verificar que CORS permite descargas desde admin.danheiexpress.com
```

### 5.3 Pre-Deploy Checklist

Validar antes de deployar (NO ejecutar deploy en este sprint, solo preparar):

```bash
# Backend
cd P16-DHE-Admin-Web/api
php artisan test                    # ≥ 179 tests, 0 failures
php artisan route:list | wc -l     # Contar endpoints (meta: ≥ 82)
php artisan config:cache            # Verificar que no hay errores de config
php artisan optimize                # Cache de rutas y vistas

# Frontend
cd P16-DHE-Admin-Web/frontend
npm run build                       # 0 errores
npm run lint                        # 0 warnings

# E2E
npx playwright test                 # ≥ 42 specs, 0 failures
```

---

## 6. Criterios de Aceptación

| # | Criterio | Verificación |
|---|----------|-------------|
| 1 | Tests backend ≥ 179 | `php artisan test` |
| 2 | E2E Playwright ≥ 42 | `npx playwright test` |
| 3 | Frontend build 0 errores | `npm run build` exit 0 |
| 4 | "Marcar pagado" funcional en Tab 2 | Click en Tab 2 → liquidar cliente → toast success |
| 5 | Dashboard P&L real | Card financiero muestra COD bar + gastos + nómina |
| 6 | 3 exports CSV descargan | GET /reports/export/receivables\|payroll\|expenses |
| 7 | E2E financiero cubre 5 tabs | `npx playwright test financial.spec.ts` |
| 8 | E2E dark mode tab | Spec pasa con dark mode |
| 9 | E2E mobile scroll | Spec pasa con viewport 375px |

---

## 7. Archivos Tocados

| Archivo | Acción |
|---------|--------|
| `api/app/Http/Controllers/Api/ClientController.php` | MODIFICAR |
| `api/routes/api.php` | MODIFICAR |
| `api/tests/Feature/ExportExtendedTest.php` | NUEVO |
| `frontend/e2e/financial.spec.ts` | NUEVO |
| `frontend/e2e/support/mock-api.ts` | MODIFICAR |
| `frontend/e2e/regression.spec.ts` | MODIFICAR |
| `frontend/src/app/(admin)/page.tsx` | MODIFICAR |
| `frontend/src/app/(admin)/pagos/page.tsx` | MODIFICAR |

**Total:** 2 archivos nuevos, 6 modificados
