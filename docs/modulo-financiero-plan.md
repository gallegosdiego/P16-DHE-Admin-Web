# 💰 Módulo Financiero — Plan de Implementación

> **Proyecto:** P16-DHE-Admin-Web  
> **Fecha:** 15 mayo 2026  
> **Base:** Requisitos de Danhei (reunión 12-may) + análisis del codebase actual + mejores prácticas industria logística

---

## Contexto

El módulo financiero **ya tiene una base funcional** implementada en Fase 1. Este plan detalla las mejoras necesarias para convertirlo en el sistema financiero completo que Danhei necesita para operar Danhei Express sin "olvidar quién le debe".

---

## Estado Actual — Lo que YA existe ✅

### Backend (API)
| Componente | Estado | Archivos |
|-----------|--------|----------|
| **Tabla `shipments`** | ✅ Campos financieros: `payment_type`, `shipping_cost`, `cod_amount`, `financial_status`, `driver_paid`, `driver_fee`, `is_outsourced`, `outsource_company`, `outsource_amount` | `create_core_tables.php` |
| **Tabla `fixed_expenses`** + `expense_payments` | ✅ CRUD completo + marcar pagado | `create_financial_tables.php` |
| **Tabla `employees`** + `payroll_payments` | ✅ CRUD completo + registrar pago | `create_financial_tables.php` |
| **Tabla `driver_payouts`** | ✅ Migración creada | Migración existe, **sin controller** |
| **Tabla `cod_settlements`** | ✅ Migración creada | Migración existe, **sin controller** |
| **Tabla `audit_logs`** | ✅ Funcional, registra collect/settle/driver_paid | `AuditLog.php` |
| **FinancialController** | ✅ overview, driverBoard, markCollected, settleShipment, markDriverPaid, settleBatch | 236 líneas |
| **ExpenseController** | ✅ index, store, update, markPaid | 116 líneas |
| **PayrollController** | ✅ index, store, update, markPaid | 113 líneas |
| **ReportController** | ✅ stats, exportShipments (CSV), exportFinancial (CSV) | 206 líneas |
| **Cuentas por cobrar** | ✅ `ClientController::accountsReceivable()` — "¿Quién me debe?" | Funcional |
| **Enum PaymentType** | ✅ cash_on_delivery, post_sale, prepaid | 3 tipos |
| **Enum FinancialStatus** | ✅ pending, collected, invoiced, settled, overdue | 5 estados |
| **RBAC permisos** | ✅ financial.view, financial.collect, financial.settle, financial.expenses, financial.payroll | 5 permisos |

### Frontend (Next.js)
| Componente | Estado |
|-----------|--------|
| **Página `/pagos`** | ✅ 531 líneas — KPIs, "Quién me debe", Board por conductor, Gastos fijos, Nómina, formulario nuevo gasto |
| **Página `/reportes`** | ✅ Stats con filtro de periodo, export CSV operativo y financiero |
| **Dashboard widget** | ✅ Widget financiero en dashboard principal |

### Dominio DDD
```
Domain/Financial/
├── Actions/     → Vacío
├── DTOs/        → Vacío
├── Enums/       → FinancialStatus.php ✅
├── Events/      → Vacío
├── Models/      → Vacío (usa DB:: facade directo)
├── Services/    → Vacío
```

---

## Diagnóstico — Brechas vs Requisitos de Danhei

### 🔴 Brechas Críticas (lo que falta según la reunión del 12 mayo)

| # | Requisito de Danhei | Estado Actual | Brecha |
|---|-------------------|---------------|--------|
| B1 | **Facturación post-venta formal** — "Te hice 5 entregas, me debes $X" | Solo marca status individual por envío | **No hay entidad Invoice** para agrupar envíos en una factura |
| B2 | **Conciliación diaria de COD** — cuánto recaudó cada repartidor | `cod_settlements` tabla existe pero **sin controller ni UI** | Tabla huérfana |
| B3 | **Pagos a repartidores consolidados** — control diario | `driver_payouts` tabla existe pero **sin controller ni UI** | Tabla huérfana |
| B4 | **Tercerización triple flujo** — recaudo, devolución, cobro servicio | Campos `is_outsourced`, `outsource_company`, `outsource_amount` existen | **Sin lógica de conciliación** ni dashboard separado |
| B5 | **Recordatorios de gastos fijos** — "La luz se paga el 25" | `is_due_soon` y `is_overdue` calculados pero **sin notificación** | Solo visual, no push/alerta |
| B6 | **Dashboard financiero completo** — resumen del día con P&L | `overview` devuelve COD/post-sale/drivers | **Sin ganancia bruta, sin costos operativos, sin P&L** |
| B7 | **Historial de pagos por gasto** | `expense_payments` existe | **Sin endpoint de historial** |
| B8 | **Conteo de paquetes como KPI financiero** | Existe en dashboard operativo | **No integrado en dashboard financiero** |

### 🟡 Deuda Técnica

| # | Problema | Impacto |
|---|---------|---------|
| DT1 | `ExpenseController` y `PayrollController` usan `DB::` facade en lugar de Eloquent Models | Inconsistente con patrón DDD del resto del proyecto |
| DT2 | `Domain/Financial/Models/` está vacío | Los modelos financieros no existen como clases Eloquent |
| DT3 | `Domain/Financial/Actions/` y `Services/` vacíos | Toda la lógica está en controllers |
| DT4 | No hay tests para endpoints financieros | Los 133 tests cubren Auth/Shipment/RBAC/Profile/User, pero **0 tests financieros** |
| DT5 | Board de conductores retorna un solo `shipment_id` por acción | Debería operar en batch (todos los COD pendientes de un conductor) |

---

## User Review Required

> [!IMPORTANT]
> **Decisión: ¿Facturación formal (Invoice)?**  
> Danhei dijo "te hice 5 entregas, me debes $X". Esto implica crear una entidad `Invoice` que agrupe envíos post-venta de un cliente en un documento formal con número consecutivo, fecha de vencimiento, y estado de pago. ¿Quieres implementar esto completo o mantener el tracking por envío individual?

> [!IMPORTANT]  
> **Decisión: ¿Recordatorios por qué canal?**  
> Los recordatorios de gastos fijos próximos a vencer pueden ser: (A) Solo visual en dashboard (badge/alerta), (B) Notificación in-app (campana), (C) WhatsApp automático, o (D) Email. ¿Cuál prefieres para el MVP?

> [!WARNING]
> **Migración de datos:** La migración `2026_05_13_041000` ya creó las tablas `driver_payouts` y `cod_settlements`. Agregaremos nuevos campos via migraciones incrementales (no destructivas).

---

## Open Questions

1. **¿Impresión de guía?** El requisito de etiqueta/guía imprimible con QR — ¿lo incluimos en este sprint o lo dejamos como feature separado? (La impresión térmica 80mm ya existe en `print-receipt.tsx`)
2. **¿Límite de efectivo por repartidor?** Danhei mencionó implícitamente preocupación por el dinero en calle. ¿Implementamos un límite configurable de COD por conductor activo?
3. **¿Exportar factura como PDF?** Para post-venta, ¿necesitamos generar un PDF de factura descargable?

---

## Proposed Changes

Las mejoras se organizan en **4 fases incrementales**, cada una desplegable de forma independiente.

---

### Fase A — Modelos DDD + Deuda Técnica (Backend Foundation)

Migrar la lógica financiera al patrón DDD del proyecto, crear modelos Eloquent, y cubrir con tests.

#### [NEW] `api/app/Domain/Financial/Models/FixedExpense.php`
- Modelo Eloquent para `fixed_expenses`
- Relación `hasMany` → `ExpensePayment`
- Scopes: `active()`, `dueSoon()`, `overdue()`
- Accessor: `current_month_status`, `days_until_due`

#### [NEW] `api/app/Domain/Financial/Models/ExpensePayment.php`
- Modelo Eloquent para `expense_payments`
- Relación `belongsTo` → `FixedExpense`

#### [NEW] `api/app/Domain/Financial/Models/Employee.php`
- Modelo Eloquent para `employees`
- Relación `hasMany` → `PayrollPayment`
- SoftDeletes

#### [NEW] `api/app/Domain/Financial/Models/PayrollPayment.php`
- Modelo Eloquent para `payroll_payments`
- Relación `belongsTo` → `Employee`

#### [NEW] `api/app/Domain/Financial/Models/DriverPayout.php`
- Modelo Eloquent para `driver_payouts` (tabla ya existe)
- Relación `belongsTo` → `Driver`

#### [NEW] `api/app/Domain/Financial/Models/CodSettlement.php`
- Modelo Eloquent para `cod_settlements` (tabla ya existe)
- Relaciones: `belongsTo` → `Driver`, `belongsTo` → `User` (settled_by)

#### [MODIFY] [ExpenseController.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Http/Controllers/Api/ExpenseController.php)
- Reemplazar `DB::table()` por modelo `FixedExpense` Eloquent
- Agregar endpoint `GET /expenses/{id}/history` → historial de pagos
- Agregar scope de periodo configurable
- Mover lógica `is_due_soon`/`is_overdue` al modelo

#### [MODIFY] [PayrollController.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Http/Controllers/Api/PayrollController.php)
- Reemplazar `DB::table()` por modelo `Employee` Eloquent
- Agregar endpoint `GET /employees/{id}/payments` → historial de pagos
- Agregar validación de periodo duplicado (no pagar dos veces el mismo periodo)

#### [NEW] `api/tests/Feature/FinancialTest.php`
- Tests para FinancialController (overview, markCollected, settleShipment, markDriverPaid, settleBatch)
- Tests para ExpenseController (CRUD + markPaid + history)
- Tests para PayrollController (CRUD + markPaid + duplicate prevention)
- ~15-20 tests, ~60 assertions

---

### Fase B — Conciliación COD + Pagos a Conductores (Core Financial)

Activar las tablas huérfanas `cod_settlements` y `driver_payouts` con lógica de negocio completa.

#### [NEW] `api/app/Http/Controllers/Api/CodSettlementController.php`
Endpoints:
- `GET /cod-settlements` → Lista de conciliaciones con filtro por conductor y fecha
- `GET /cod-settlements/daily-summary?date=` → Resumen del día: por conductor, cuánto cobró vs cuánto entregó
- `POST /cod-settlements` → Crear conciliación diaria (automática o manual)
- `POST /cod-settlements/{id}/close` → Cerrar conciliación (marcar como liquidada)

Lógica:
- Al crear, calcula automáticamente `total_collected` sumando `cod_amount` de envíos del conductor con `financial_status = collected` en esa fecha
- Calcula `difference = total_collected - total_settled`
- Si `difference > 0` → alerta: el conductor debe dinero
- Si `difference = 0` → status `settled`
- AuditLog en cada operación

#### [NEW] `api/app/Http/Controllers/Api/DriverPayoutController.php`
Endpoints:
- `GET /driver-payouts` → Lista de pagos a conductores con filtro por fecha y estado
- `GET /driver-payouts/pending` → Conductores con pagos pendientes del día
- `POST /driver-payouts/generate?date=` → Genera registro de pago consolidado para un conductor (suma `driver_fee` de envíos entregados)
- `POST /driver-payouts/{id}/pay` → Marca como pagado

Lógica:
- Al generar, cuenta envíos entregados por el conductor en esa fecha
- `total_amount = SUM(driver_fee)` de envíos entregados ese día
- Actualiza `driver_paid = true` en los envíos incluidos
- AuditLog: "Pago conductor $X por N paquetes"

#### [MODIFY] [FinancialController.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Http/Controllers/Api/FinancialController.php)
- Mejorar `driverBoard()` para soportar operaciones batch (todos los COD de un conductor, no solo el primer `shipment_id`)
- Agregar `POST /financial/collect-batch` → Marcar múltiples envíos como recaudados
- Agregar `POST /financial/driver-paid-batch` → Pagar todos los envíos pendientes de un conductor

#### [MODIFY] [api.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/routes/api.php)
- Agregar rutas para `CodSettlementController` y `DriverPayoutController`
- Middleware: `permission:financial.settle`

#### [NEW] `api/database/migrations/2026_05_15_010000_add_settlement_fields.php`
- Agregar `settlement_id` nullable FK en `shipments` (vincular envío a conciliación)
- Agregar `payout_id` nullable FK en `shipments` (vincular envío a pago de conductor)

---

### Fase C — Dashboard Financiero Avanzado + Tercerización (Business Intelligence)

El dashboard que Danhei necesita ver todos los días.

#### [MODIFY] [FinancialController.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Http/Controllers/Api/FinancialController.php)
Nuevo endpoint `GET /financial/daily-summary?date=`:
```json
{
  "date": "2026-05-15",
  "packages": {
    "total_today": 200,
    "total_week": 1200,
    "total_month": 4800
  },
  "revenue": {
    "gross_income": 2300000,
    "driver_cost": 600000,
    "gross_profit": 1700000,
    "fixed_expenses_month": 1285000,
    "payroll_month": 4400000
  },
  "cod": {
    "collected_today": 1800000,
    "pending_today": 500000,
    "drivers_with_cash": 4
  },
  "receivables": {
    "total_owed": 885000,
    "overdue_count": 2,
    "oldest_days": 15
  },
  "outsourcing": {
    "total_recaudado": 400000,
    "total_devuelto": 400000,
    "service_income": 180000,
    "driver_cost": 45000,
    "profit": 135000
  }
}
```

Nuevo endpoint `GET /financial/profit-loss?from=&to=`:
- P&L por periodo: ingresos por tipo (directo, tercerización), costos (conductores, gastos fijos, nómina), ganancia neta
- Desglose por semana/mes

#### [MODIFY] [ReportController.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Http/Controllers/Api/ReportController.php)
- Nuevo endpoint `GET /reports/export/receivables` → CSV de cuentas por cobrar
- Nuevo endpoint `GET /reports/export/payroll` → CSV de nómina del periodo
- Nuevo endpoint `GET /reports/export/expenses` → CSV de gastos fijos del periodo
- Enriquecer `stats()` con métricas de tercerización

#### [NEW] `api/app/Domain/Financial/Services/ProfitCalculator.php`
- Servicio que centraliza la lógica de cálculo de ganancia
- Soporta: envío directo (`shipping_cost - driver_fee`), tercerización (`outsource_amount - driver_fee`), y mixto
- Usado por: dashboard, reportes, exports

#### [MODIFY] [Shipment.php](file:///d:/Danhei%20Dev/P16-DHE-Admin-Web/api/app/Domain/Shipment/Models/Shipment.php)
- Agregar relaciones: `belongsTo CodSettlement`, `belongsTo DriverPayout`
- Agregar scope `outsourced()` para filtrar envíos tercerizados
- Mejorar `profit()` para considerar el caso mixto (tercerización con COD)

---

### Fase D — Frontend Financiero Premium (UX)

Transformar la página de pagos en un módulo financiero completo.

#### [MODIFY] `frontend/src/app/(admin)/pagos/page.tsx`
Reestructurar en tabs para organizar la información:

**Tab 1 — Resumen del Día**
- KPIs grandes: Paquetes hoy, Ingreso bruto, Pago repartidores, Ganancia bruta
- Barras de progreso: COD cobrado vs pendiente
- Alertas: gastos próximos a vencer, conductores con dinero en calle

**Tab 2 — Quién me debe** (Cuentas por Cobrar)
- Tabla con clientes que deben, ordenados por antigüedad
- Indicadores de color: 🔴 >15 días, 🟡 >7 días, 🟢 <7 días  
- Botón "Marcar como pagado" (individual y batch)
- Botón "Enviar recordatorio" → abre WhatsApp pre-formateado
- Filtros: todos / vencidos / recientes

**Tab 3 — Conductores** (Recaudo + Pagos)
- Cards por conductor con: COD pendiente, COD recaudado, pago pendiente
- Botones batch: "Recaudar todo", "Liquidar todo", "Pagar todo"
- Conciliación diaria: tabla con resumen por conductor

**Tab 4 — Gastos y Nómina**
- Split view: Gastos fijos (izq) + Nómina (der)
- Historial de pagos expandible por gasto/empleado
- Formularios de creación inline
- Badges: "Vence pronto", "Vencido", "Pagado"

#### [NEW] `frontend/src/app/(admin)/pagos/conciliacion/page.tsx`
- Página dedicada de conciliación diaria COD
- Selector de fecha
- Tabla: conductor → paquetes → monto esperado → monto entregado → diferencia
- Botón "Cerrar conciliación del día"
- Historial de conciliaciones pasadas

#### [MODIFY] `frontend/src/app/(admin)/reportes/page.tsx`
- Agregar sección "Financiero" con:
  - P&L por periodo (tabla con totales)
  - Export CSV: cuentas por cobrar, nómina, gastos
  - Gráfica de ingresos vs gastos por semana

#### [MODIFY] `frontend/src/lib/types.ts`
- Agregar interfaces: `CodSettlement`, `DriverPayout`, `DailySummary`, `ProfitLoss`, `Invoice` (si se aprueba)

---

## Resumen de Entidades Financieras (Final)

| Entidad | Tabla | Estado | Fase |
|---------|-------|--------|------|
| `FixedExpense` | `fixed_expenses` | ✅ Tabla existe, **falta modelo Eloquent** | A |
| `ExpensePayment` | `expense_payments` | ✅ Tabla existe, **falta modelo Eloquent** | A |
| `Employee` | `employees` | ✅ Tabla existe, **falta modelo Eloquent** | A |
| `PayrollPayment` | `payroll_payments` | ✅ Tabla existe, **falta modelo Eloquent** | A |
| `DriverPayout` | `driver_payouts` | ✅ Tabla existe, **falta modelo + controller** | B |
| `CodSettlement` | `cod_settlements` | ✅ Tabla existe, **falta modelo + controller** | B |
| `Invoice` | `invoices` | ❌ No existe | Pendiente decisión |

---

## Nuevos Permisos RBAC

| Permiso | Roles | Fase |
|---------|-------|------|
| `financial.settlements` | superadmin, administrador | B |
| `financial.driver_payouts` | superadmin, administrador | B |
| `financial.reports_export` | superadmin, administrador | C |

---

## Verificación

### Automated Tests
```bash
# Ejecutar tests existentes (no romper nada)
cd P16-DHE-Admin-Web/api
php artisan test

# Ejecutar solo tests financieros nuevos
php artisan test --filter=FinancialTest

# Verificar build del frontend
cd ../frontend
npm run build
npm run lint
```

### Manual Verification
1. **Seed fresco:** `php artisan migrate:fresh --seed` → verificar datos demo financieros
2. **Flujo COD completo:** Crear envío COD → marcar recaudado → liquidar → pagar conductor
3. **Flujo Post-venta:** Crear envíos post-venta → ver en "Quién me debe" → marcar pagado
4. **Gastos fijos:** Crear gasto → verificar alerta de vencimiento → marcar pagado → ver historial
5. **Conciliación:** Ejecutar conciliación diaria → verificar totales → cerrar
6. **Dashboard financiero:** Verificar que todos los KPIs calculan correctamente
7. **Exports CSV:** Descargar y verificar formatos de cuentas por cobrar, nómina, gastos
8. **RBAC:** Verificar que operador NO puede acceder a módulo financiero
9. **E2E Playwright:** Navegar por cada tab de `/pagos`, verificar acciones

---

## Estimación de Esfuerzo

| Fase | Archivos | Endpoints nuevos | Tests | Complejidad |
|------|----------|-------------------|-------|-------------|
| A — Modelos DDD + Tests | ~10 | 2 | ~20 | 🟢 Baja |
| B — Conciliación + Payouts | ~6 | 8 | ~12 | 🟡 Media |
| C — Dashboard + P&L | ~4 | 5 | ~8 | 🟡 Media |
| D — Frontend Premium | ~5 | 0 | E2E | 🔴 Alta (UX) |
| **Total** | **~25** | **~15** | **~40** | — |

---

## Orden Recomendado de Ejecución

```
Fase A (Foundation) → Fase B (Core) → Fase C (BI) → Fase D (UX)
```

Cada fase es desplegable de forma independiente. La Fase A es prerequisito para B y C. La Fase D puede empezar en paralelo con C si se quiere.
