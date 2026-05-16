# 💰 SPRINT-COD — Módulo Financiero Completo ✅ COMPLETADO

> **Proyecto:** P16-DHE-Admin-Web  
> **Fecha:** 15 mayo 2026  
> **Ejecutado por:** COD  
> **Estado:** ✅ COMPLETADO  
> **Resultado:** 173 tests | 612 assertions | 0 failures | build ✅ | lint ✅  
> **Nota:** Tab "Quién me debe" → botón "Marcar pagado" es informativo (sin endpoint de liquidación individual por deudor — pendiente para siguiente sprint)

---

## 1. Contexto

El módulo financiero del admin tiene una **base sólida** ya implementada. Este sprint cierra los gaps restantes para dejarlo 100% operativo.

### Lo que YA funciona (NO tocar)

| Componente | Líneas | Endpoints |
|-----------|--------|-----------|
| `FinancialController` | 315 | overview, driverBoard, markCollected, settleShipment, markDriverPaid, settleBatch, collectBatch, driverPaidBatch, dailySummary, profitLoss |
| `CodSettlementController` | 169 | index, dailySummary, store, close |
| `DriverPayoutController` | 169 | index, pending, generate, markPaid |
| `ExpenseController` | 110 | index, store, update, markPaid, history |
| `PayrollController` | 119 | index, store, update, markPaid, history |
| `ProfitCalculator` | 160 | dailySummary, profitLoss |
| 6 modelos Eloquent | — | FixedExpense, ExpensePayment, Employee, PayrollPayment, DriverPayout, CodSettlement |
| 28 rutas financieras | — | Todas con RBAC |
| 36 tests | — | FinancialTest + FinancialEdgeCaseTest |

### Lo que FALTA (scope del sprint)

| # | Brecha | Tipo |
|---|--------|------|
| G1 | `CodSettlementController` y `DriverPayoutController` sin tests | Backend |
| G2 | `dailySummary` y `profitLoss` sin tests | Backend |
| G3 | `collectBatch` y `driverPaidBatch` sin tests | Backend |
| G4 | `ProfitCalculator` usa `DB::table()` en L44-51 y L96-99 | Deuda técnica |
| G5 | `ReportController` sin export de receivables, payroll, expenses | Backend |
| G6 | Frontend monolítico (530 líneas, 1 archivo, sin tabs) | Frontend |
| G7 | Board de conductores opera envío por envío (endpoints batch existen pero frontend no los usa) | Frontend |
| G8 | Conciliación COD sin UI (controller existe, frontend no) | Frontend |
| G9 | WhatsApp recordatorio de cobro no implementado | Frontend |

---

## 2. Bloque 1 — Backend: Tests + Limpieza Técnica

**Objetivo:** Subir cobertura de 36 a ~57 tests financieros. Limpiar deuda técnica.

---

### 2.1 [NUEVO] `api/tests/Feature/CodSettlementTest.php`

Crear tests para `CodSettlementController`. Usar el mismo patrón de `FinancialTest.php` (seed + actingAs admin).

```php
// Tests requeridos:
test_admin_can_list_settlements()
  → GET /api/cod-settlements → assertOk, assertJsonStructure con paginación

test_admin_can_get_daily_summary()
  → GET /api/cod-settlements/daily-summary?date={hoy} → assertOk
  → Verificar estructura: date, drivers[], totals{}

test_admin_can_create_settlement()
  → POST /api/cod-settlements con { driver_id, date, total_settled, notes }
  → assertCreated, verificar cálculo de difference

test_admin_can_close_settlement()
  → POST /api/cod-settlements/{id}/close → assertOk
  → assertDatabaseHas status = 'settled'

test_cannot_close_already_settled()
  → Crear settlement con status 'settled', intentar close → assertUnprocessable

test_settlement_creates_audit_log()
  → Crear settlement → assertDatabaseHas audit_logs action = 'financial.cod_settlement'

test_operador_cannot_access_settlements()
  → actingAs operador → GET /api/cod-settlements → assertForbidden
```

### 2.2 [NUEVO] `api/tests/Feature/DriverPayoutTest.php`

```php
test_admin_can_list_payouts()
  → GET /api/driver-payouts → assertOk, paginación

test_admin_can_get_pending_payouts()
  → GET /api/driver-payouts/pending → assertOk
  → Verificar estructura: date, drivers[], total_pending

test_admin_can_generate_payout()
  → Crear envío delivered con driver_paid=false
  → POST /api/driver-payouts/generate con { driver_id, date }
  → assertCreated, verificar packages_count y total_amount

test_cannot_generate_duplicate_payout()
  → Generar payout, intentar de nuevo mismo driver+date → assertUnprocessable

test_admin_can_mark_payout_paid()
  → POST /api/driver-payouts/{id}/pay → assertOk
  → Verificar que shipments asociados tienen driver_paid=true

test_cannot_pay_already_paid_payout()
  → Payout con status 'paid', intentar pay → assertUnprocessable

test_payout_creates_audit_log()
  → Generar + pagar → assertDatabaseHas audit_logs

test_generate_with_no_shipments_fails()
  → POST generate con fecha sin envíos → assertUnprocessable
```

### 2.3 [NUEVO] `api/tests/Feature/DailySummaryTest.php`

```php
test_admin_can_get_daily_summary()
  → GET /api/financial/daily-summary → assertOk
  → assertJsonStructure: date, packages, revenue, cod, receivables, outsourcing

test_daily_summary_packages_are_integers()
  → Verificar que todos los valores numéricos son int

test_admin_can_get_profit_loss()
  → GET /api/financial/profit-loss?from=2026-01-01&to=2026-12-31 → assertOk
  → assertJsonStructure: period, income, costs, net_profit, margin_percent

test_profit_loss_validates_dates()
  → GET sin from/to → assertUnprocessable

test_collect_batch_works()
  → POST /api/financial/collect-batch con { driver_id } → assertOk
  → Verificar count >= 0

test_driver_paid_batch_works()
  → POST /api/financial/driver-paid-batch con { driver_id } → assertOk
```

### 2.4 [MODIFICAR] `api/app/Domain/Financial/Services/ProfitCalculator.php`

Reemplazar las 3 ocurrencias de `DB::table()` por modelos Eloquent:

```diff
// Línea 7: eliminar
-use Illuminate\Support\Facades\DB;
+use App\Domain\Financial\Models\ExpensePayment;
+use App\Domain\Financial\Models\PayrollPayment;
+use App\Domain\Financial\Models\Employee;

// Líneas 44-47:
-$fixedExpenses = (int) DB::table('expense_payments')
-    ->whereBetween('paid_at', [$from, $to])
-    ->where('status', 'paid')
-    ->sum('amount');
+$fixedExpenses = (int) ExpensePayment::whereBetween('paid_at', [$from, $to])
+    ->where('status', 'paid')
+    ->sum('amount');

// Líneas 48-51:
-$payroll = (int) DB::table('payroll_payments')
-    ->whereBetween('paid_at', [$from, $to])
-    ->where('status', 'paid')
-    ->sum('amount');
+$payroll = (int) PayrollPayment::whereBetween('paid_at', [$from, $to])
+    ->where('status', 'paid')
+    ->sum('amount');

// Líneas 96-99:
-$payrollMonth = (int) DB::table('employees')
-    ->where('is_active', true)
-    ->whereNull('deleted_at')
-    ->sum('salary');
+$payrollMonth = (int) Employee::active()->sum('salary');
```

### 2.5 [MODIFICAR] `api/app/Http/Controllers/Api/ReportController.php`

Agregar 3 endpoints de exportación CSV:

```php
public function exportReceivables(): StreamedResponse
// Lógica: reusar ClientController::accountsReceivable() data
// Columnas: cliente, empresa, teléfono, envíos_pendientes, total_deuda, días_más_antiguo
// Ruta: GET /api/reports/export/receivables

public function exportPayroll(Request $request): StreamedResponse
// Lógica: PayrollPayment con Employee, filtrado por periodo
// Columnas: empleado, cargo, salario, periodo_inicio, periodo_fin, pagado_el, monto
// Ruta: GET /api/reports/export/payroll

public function exportExpenses(Request $request): StreamedResponse
// Lógica: ExpensePayment con FixedExpense, filtrado por periodo
// Columnas: gasto, monto, periodo, estado, pagado_el
// Ruta: GET /api/reports/export/expenses
```

### 2.6 [MODIFICAR] `api/routes/api.php`

Agregar dentro del grupo de reportes existente:

```php
Route::get('/reports/export/receivables', [ReportController::class, 'exportReceivables']);
Route::get('/reports/export/payroll', [ReportController::class, 'exportPayroll']);
Route::get('/reports/export/expenses', [ReportController::class, 'exportExpenses']);
```

### Verificación Bloque 1

```bash
cd P16-DHE-Admin-Web/api
php artisan test                           # Todo (debe pasar)
php artisan test --filter=CodSettlement    # 7 nuevos
php artisan test --filter=DriverPayout     # 8 nuevos
php artisan test --filter=DailySummary     # 6 nuevos
grep -r "DB::table" app/Domain/Financial/  # Debe dar 0 resultados
```

**Meta:** ≥ 57 tests financieros, 0 failures, 0 `DB::table` en Financial domain.

---

## 3. Bloque 2 — Frontend: Refactor a Tabs + Batch Actions

**Objetivo:** Transformar `/pagos` de 530 líneas monolíticas a sistema de tabs profesional.

---

### 3.1 [MODIFICAR] `frontend/src/lib/types.ts`

Agregar estas interfaces al final del archivo:

```typescript
// ── Financial Module Types ──────────────────────

export interface DailySummary {
  date: string;
  packages: {
    total_today: number;
    delivered_today: number;
    total_week: number;
    total_month: number;
  };
  revenue: {
    gross_income: number;
    driver_cost: number;
    gross_profit: number;
    fixed_expenses_month: number;
    payroll_month: number;
  };
  cod: {
    collected_today: number;
    pending_today: number;
    drivers_with_cash: number;
  };
  receivables: {
    total_owed: number;
    overdue_count: number;
    oldest_days: number;
  };
  outsourcing: {
    service_income: number;
    driver_cost: number;
    profit: number;
    packages: number;
  };
}

export interface ProfitLoss {
  period: { from: string; to: string };
  income: {
    direct_revenue: number;
    outsource_revenue: number;
    gross_income: number;
  };
  costs: {
    driver_fees: number;
    fixed_expenses: number;
    payroll: number;
    total_costs: number;
  };
  net_profit: number;
  margin_percent: number;
}

export interface CodSettlement {
  id: number;
  driver_id: number;
  settlement_date: string;
  total_collected: number;
  total_settled: number;
  difference: number;
  status: "pending" | "partial" | "settled";
  notes: string | null;
  settled_by: number;
  driver?: { id: number; name: string };
  created_at: string;
}

export interface CodDailySummaryDriver {
  driver_id: number;
  driver_name: string;
  packages: number;
  total_expected: number;
  collected: number;
  pending: number;
  difference: number;
}

export interface DriverPayout {
  id: number;
  driver_id: number;
  payout_date: string;
  packages_count: number;
  total_amount: number;
  status: "pending" | "paid";
  paid_at: string | null;
  driver?: { id: number; name: string };
}
```

### 3.2 [MODIFICAR] `frontend/src/app/(admin)/pagos/page.tsx`

Refactor completo. La estructura debe ser:

```
<TabBar>
  [Resumen] [Quién me debe] [Conductores] [Gastos y Nómina] [Conciliación]
</TabBar>

<TabContent>
  {activeTab === "resumen" && <TabResumen />}
  {activeTab === "deudas" && <TabDeudas />}
  {activeTab === "conductores" && <TabConductores />}
  {activeTab === "gastos" && <TabGastos />}
  {activeTab === "conciliacion" && <TabConciliacion />}
</TabContent>
```

#### Tab 1 — Resumen del Día
- Consumir: `GET /api/financial/daily-summary`
- **KPIs (4 cards):**
  - 📦 Paquetes hoy → `packages.total_today` / `packages.delivered_today`
  - 💰 Ingreso bruto mes → `revenue.gross_income`
  - 🚗 Costo conductores → `revenue.driver_cost`
  - 📈 Ganancia bruta → `revenue.gross_profit`
- **Barra COD:** `cod.collected_today` / (`cod.collected_today` + `cod.pending_today`)
  - Usar progress bar con % visual
- **Alertas:**
  - Si `cod.drivers_with_cash > 0` → badge rojo "N conductores con dinero en calle"
  - Si `receivables.overdue_count > 0` → badge naranja "N clientes vencidos"
- **Mini P&L mes:** tabla simple con:
  - Ingresos → `revenue.gross_income`
  - Conductores → `-revenue.driver_cost`
  - Gastos fijos → `-revenue.fixed_expenses_month`
  - Nómina → `-revenue.payroll_month`
  - **Resultado** → gross_income - driver_cost - fixed_expenses_month - payroll_month

#### Tab 2 — Quién Me Debe
- Reusar la sección existente de receivable (ya funciona)
- **Agregar filtro:** 3 botones pill: "Todos" | "Vencidos (>15d)" | "Recientes"
  ```typescript
  const filtered = receivable.filter(item => {
    if (filter === "overdue") return item.days_oldest_debt > 15;
    if (filter === "recent") return item.days_oldest_debt <= 7;
    return true;
  });
  ```
- **Agregar botón WhatsApp** en cada fila de deudor:
  ```tsx
  <a
    href={`https://wa.me/57${item.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(
      `Hola ${item.company || item.name}, le recordamos que tiene ${item.owed_shipments_count} envíos pendientes de pago por ${formatCOP(item.total_owed)}. Danhei Express`
    )}`}
    target="_blank"
    className="..."
  >📲 WhatsApp</a>
  ```
- **Agregar botón "Marcar pagado"** individual (POST settle por envío)

#### Tab 3 — Conductores
- Reusar las cards de driver board existentes
- **Reemplazar botones individuales** por botones batch:
  ```tsx
  // En vez de runAction(shipmentId, "collect"):
  const collectAll = async (driverId: number) => {
    await apiSend("/financial/collect-batch", "POST", { driver_id: driverId });
    showToast("COD recaudado", "success");
    await loadData();
  };
  ```
- **3 botones por conductor:**
  - "Recaudar todo" → `POST /financial/collect-batch` → `{ driver_id }`
  - "Liquidar todo" → `POST /financial/settle-batch` → `{ shipment_ids: [...] }` (filtrar los collected del conductor)
  - "Pagar todo" → `POST /financial/driver-paid-batch` → `{ driver_id }`

#### Tab 4 — Gastos y Nómina
- Reusar la sección split existente
- **Agregar expandible de historial** en cada gasto:
  ```tsx
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  
  // Al expandir:
  const history = await apiGet(`/expenses/${id}/history`);
  // Mostrar tabla: periodo | monto | estado | fecha_pago
  ```
- Lo mismo para empleados con `/employees/{id}/history`
- Modal de nuevo gasto — reusar el existente

#### Tab 5 — Conciliación COD
- **Selector de fecha** (input date, default hoy)
- **Consumir:** `GET /api/cod-settlements/daily-summary?date={fecha}`
- **Tabla por conductor:**
  | Conductor | Paquetes | Esperado | Cobrado | Pendiente | Diferencia |
  |-----------|----------|----------|---------|-----------|------------|
  - Cada fila con indicador visual: diferencia > 0 = 🔴, diferencia = 0 = 🟢
- **Botón "Crear conciliación":**
  - Abre form: conductor (select), total_settled (input), notas (textarea)
  - POST `/api/cod-settlements` → refresh tabla
- **Historial de conciliaciones:**
  - GET `/api/cod-settlements` → tabla paginada abajo
  - Cada fila con botón "Cerrar" si status !== "settled"

### Estilo y Diseño del Tab Bar

```tsx
const tabs = [
  { key: "resumen", label: "📊 Resumen", icon: "📊" },
  { key: "deudas", label: "💳 Quién me debe", icon: "💳" },
  { key: "conductores", label: "🚗 Conductores", icon: "🚗" },
  { key: "gastos", label: "🏢 Gastos y Nómina", icon: "🏢" },
  { key: "conciliacion", label: "📋 Conciliación", icon: "📋" },
];
```

- Tab activo: `border-b-2 border-primary text-primary font-semibold`
- Tab inactivo: `text-slate-500 hover:text-slate-700`
- Dark mode: seguir el patrón existente `dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-[#e0e0e0]`
- Responsive: en mobile, tabs con scroll horizontal (`overflow-x-auto`)

### Verificación Bloque 2

```bash
cd P16-DHE-Admin-Web/frontend
npm run build    # 0 errores
npm run lint     # 0 warnings
```

---

## 4. Bloque 3 — Verificación Final

### Tests

```bash
cd P16-DHE-Admin-Web/api
php artisan test
# Meta: ≥ 57 tests financieros, 0 failures
```

### Build

```bash
cd P16-DHE-Admin-Web/frontend
npm run build
# Meta: 0 errores de compilación
```

### Visual (Browser)

1. ✅ `/pagos` carga Tab 1 (Resumen) por defecto con KPIs
2. ✅ Tab 2: Lista deudores, filtro funciona, WhatsApp abre link correcto
3. ✅ Tab 3: Batch "Recaudar todo" / "Pagar todo" funciona
4. ✅ Tab 4: Expandir historial de gasto muestra pagos
5. ✅ Tab 5: Crear conciliación y cerrar funciona
6. ✅ Dark mode: todos los tabs se ven bien
7. ✅ Mobile: tabs scroll horizontal funciona

---

## 5. Criterios de Aceptación

| # | Criterio | Cómo verificar |
|---|----------|---------------|
| 1 | Tests financieros ≥ 57 | `php artisan test \| grep "Tests:"` |
| 2 | ProfitCalculator sin `DB::` | `grep "DB::" ProfitCalculator.php` → 0 resultados |
| 3 | Frontend compila | `npm run build` → exit 0 |
| 4 | 5 tabs en /pagos | Navegación visual |
| 5 | Batch collect/pay | Click en Tab 3 → toast "recaudado/pagado" |
| 6 | WhatsApp link | Click en Tab 2 → abre wa.me correcto |
| 7 | Conciliación COD | Tab 5 → crear + cerrar conciliación |
| 8 | 3 exports CSV nuevos | GET /reports/export/receivables\|payroll\|expenses → descarga CSV |
| 9 | 0 regresiones | Tests existentes siguen pasando |

---

## 6. Archivos Tocados

| Archivo | Acción |
|---------|--------|
| `api/tests/Feature/CodSettlementTest.php` | NUEVO |
| `api/tests/Feature/DriverPayoutTest.php` | NUEVO |
| `api/tests/Feature/DailySummaryTest.php` | NUEVO |
| `api/app/Domain/Financial/Services/ProfitCalculator.php` | MODIFICAR |
| `api/app/Http/Controllers/Api/ReportController.php` | MODIFICAR |
| `api/routes/api.php` | MODIFICAR |
| `frontend/src/lib/types.ts` | MODIFICAR |
| `frontend/src/app/(admin)/pagos/page.tsx` | MODIFICAR |

**Total:** 3 archivos nuevos, 5 modificados.
