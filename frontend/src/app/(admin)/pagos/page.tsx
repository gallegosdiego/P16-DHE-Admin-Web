"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  AgingReport,
  AgingReportClient,
  CashFlowProjection,
  CodDailySummaryDriver,
  CodSettlement,
  DailySummary,
  DriverBoardItem,
  DriverSettlement,
  Employee,
  Expense,
  FinancialAlert,
  FinancialKpis,
  ProfitabilityRow,
  ProfitLossReport,
  Shipment,
} from "@/lib/types";

type TabKey = "dashboard" | "pyl" | "cartera" | "cod" | "conductores" | "gastos" | "flujo";

// ── Helpers ────────────────────────────────────────────

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
};

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Micro components ──────────────────────────────────

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone || ""}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </article>
  );
}

function AlertBadge({ alert }: { alert: FinancialAlert }) {
  const colors = {
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${colors[alert.severity]}`}>
      <span>{alert.severity === "danger" ? "🔴" : alert.severity === "warning" ? "🟡" : "🔵"}</span>
      {alert.title}: {alert.count}{alert.amount ? ` (${formatCOP(alert.amount)})` : ""}
    </span>
  );
}

function SectionCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ── History types (inline) ────────────────────────────

type HistoryExpense = {
  expense: { id: number; name: string; amount: number };
  payments: Array<{ id: number; period_date: string; amount: number; status: string; paid_at: string | null }>;
};
type HistoryEmployee = {
  employee: { id: number; name: string };
  payments: Array<{ id: number; period_start: string; period_end: string; amount: number; status: string; paid_at: string | null }>;
};

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════

export default function PagosPage() {
  usePageTitle("Finanzas | Danhei Express");

  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [loading, setLoading] = useState(true);
  const [actionLoadingKey, setActionLoadingKey] = useState("");

  // ── Data state ──────────────────────────────────────
  const [kpis, setKpis] = useState<FinancialKpis | null>(null);
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);

  // P&L
  const [plFrom, setPlFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; });
  const [plTo, setPlTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [plReport, setPlReport] = useState<ProfitLossReport | null>(null);
  const [plLoading, setPlLoading] = useState(false);

  // Cartera
  const [agingReport, setAgingReport] = useState<AgingReport | null>(null);
  const [agingFilter, setAgingFilter] = useState<"all" | "overdue" | "90plus">("all");

  // COD
  const [codDate, setCodDate] = useState(new Date().toISOString().split("T")[0]);
  const [codSummaryDrivers, setCodSummaryDrivers] = useState<CodDailySummaryDriver[]>([]);
  const [codSettlements, setCodSettlements] = useState<CodSettlement[]>([]);
  const [newSettlement, setNewSettlement] = useState({ driver_id: 0, total_settled: 0, notes: "" });

  // Conductores
  const [board, setBoard] = useState<DriverBoardItem[]>([]);
  const [profitDrivers, setProfitDrivers] = useState<ProfitabilityRow[]>([]);
  const [settlementDriverId, setSettlementDriverId] = useState(0);
  const [settlementFrom, setSettlementFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; });
  const [settlementTo, setSettlementTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [settlement, setSettlement] = useState<DriverSettlement | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);

  // Gastos
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalMonthlyExpenses, setTotalMonthlyExpenses] = useState(0);
  const [totalMonthlyPayroll, setTotalMonthlyPayroll] = useState(0);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [newExpenseLoading, setNewExpenseLoading] = useState(false);
  const [newExpenseForm, setNewExpenseForm] = useState({ name: "", amount: 0, frequency: "monthly" as "monthly" | "biweekly" | "weekly", due_day: 5, notes: "" });
  const [expenseHistory, setExpenseHistory] = useState<Record<number, HistoryExpense>>({});
  const [employeeHistory, setEmployeeHistory] = useState<Record<number, HistoryEmployee>>({});
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  // Flujo de caja
  const [cashFlow, setCashFlow] = useState<CashFlowProjection | null>(null);

  // ── Data loading ────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [kpiRes, alertRes, summaryRes, agingRes, boardRes, driversProfit, expensesRes, employeesRes, cfRes] = await Promise.allSettled([
        apiGet<FinancialKpis>("/financial/kpis"),
        apiGet<FinancialAlert[]>("/financial/alerts"),
        apiGet<DailySummary>("/financial/daily-summary"),
        apiGet<AgingReport>("/financial/aging-report"),
        apiGet<{ data?: DriverBoardItem[] } | DriverBoardItem[]>("/financial/driver-board"),
        apiGet<ProfitabilityRow[]>("/financial/profitability/by-driver"),
        apiGet<{ expenses: Expense[]; total_monthly: number }>("/expenses"),
        apiGet<{ employees: Employee[]; total_monthly_payroll: number }>("/employees"),
        apiGet<CashFlowProjection>("/financial/cash-flow"),
      ]);

      if (kpiRes.status === "fulfilled") setKpis(kpiRes.value);
      if (alertRes.status === "fulfilled") setAlerts(Array.isArray(alertRes.value) ? alertRes.value : []);
      if (summaryRes.status === "fulfilled") setDailySummary(summaryRes.value);
      if (agingRes.status === "fulfilled") setAgingReport(agingRes.value);
      if (boardRes.status === "fulfilled") { const v = boardRes.value; setBoard(Array.isArray(v) ? v : v.data || []); }
      if (driversProfit.status === "fulfilled") setProfitDrivers(Array.isArray(driversProfit.value) ? driversProfit.value : []);
      if (expensesRes.status === "fulfilled") { setExpenses(expensesRes.value.expenses || []); setTotalMonthlyExpenses(Number(expensesRes.value.total_monthly || 0)); }
      if (employeesRes.status === "fulfilled") { setEmployees(employeesRes.value.employees || []); setTotalMonthlyPayroll(Number(employeesRes.value.total_monthly_payroll || 0)); }
      if (cfRes.status === "fulfilled") setCashFlow(cfRes.value);

      await loadCodData();
    } catch {
      showToast("No se pudo cargar informacion financiera", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadCodData = async (date = codDate) => {
    try {
      const [summary, list] = await Promise.all([
        apiGet<{ date: string; drivers: CodDailySummaryDriver[] }>(`/cod-settlements/daily-summary?date=${date}`),
        apiGet<{ data: CodSettlement[] }>("/cod-settlements"),
      ]);
      setCodSummaryDrivers(summary.drivers || []);
      setCodSettlements(list.data || []);
    } catch { /* fail silently */ }
  };

  const loadPL = async () => {
    setPlLoading(true);
    try {
      const res = await apiGet<ProfitLossReport>(`/financial/profit-loss?from=${plFrom}&to=${plTo}`);
      setPlReport(res);
    } catch { showToast("Error al cargar P&L", "error"); }
    finally { setPlLoading(false); }
  };

  const loadSettlement = async () => {
    if (!settlementDriverId) { showToast("Selecciona un conductor", "info"); return; }
    setSettlementLoading(true);
    try {
      const res = await apiGet<DriverSettlement>(`/financial/driver-settlement/${settlementDriverId}?from=${settlementFrom}&to=${settlementTo}`);
      setSettlement(res);
    } catch { showToast("Error al cargar liquidacion", "error"); }
    finally { setSettlementLoading(false); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, []);

  // ── Actions ─────────────────────────────────────────

  const collectAll = async (driverId: number) => {
    try { setActionLoadingKey(`collect-${driverId}`); await apiSend("/financial/collect-batch", "POST", { driver_id: driverId }); showToast("COD recaudado", "success"); await loadData(); } catch { showToast("No se pudo recaudar", "error"); } finally { setActionLoadingKey(""); }
  };
  const settleAll = async (driverId: number) => {
    try {
      setActionLoadingKey(`settle-${driverId}`);
      const shipmentsRes = await apiGet<{ data?: Shipment[] } | Shipment[]>(`/shipments?driver_id=${driverId}&per_page=100`);
      const shipments = Array.isArray(shipmentsRes) ? shipmentsRes : shipmentsRes.data || [];
      const ids = shipments.filter((s) => s.payment_type === "cash_on_delivery" && s.financial_status === "collected").map((s) => s.id);
      if (ids.length === 0) { showToast("No hay COD recaudado para liquidar", "info"); return; }
      await apiSend("/financial/settle-batch", "POST", { shipment_ids: ids }); showToast("COD liquidado", "success"); await loadData();
    } catch { showToast("No se pudo liquidar", "error"); } finally { setActionLoadingKey(""); }
  };
  const payAll = async (driverId: number) => {
    try { setActionLoadingKey(`pay-${driverId}`); await apiSend("/financial/driver-paid-batch", "POST", { driver_id: driverId }); showToast("Pago aplicado", "success"); await loadData(); } catch { showToast("No se pudo pagar", "error"); } finally { setActionLoadingKey(""); }
  };
  const markExpensePaid = async (id: number) => {
    try { setActionLoadingKey(`expense-${id}`); await apiSend(`/expenses/${id}/pay`, "POST", {}); showToast("Gasto pagado", "success"); await loadData(); } catch { showToast("Error", "error"); } finally { setActionLoadingKey(""); }
  };
  const payEmployee = async (id: number) => {
    const now = new Date();
    const ps = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const pe = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    try { setActionLoadingKey(`employee-${id}`); await apiSend(`/employees/${id}/pay`, "POST", { period_start: ps, period_end: pe }); showToast("Pago registrado", "success"); await loadData(); } catch { showToast("Error", "error"); } finally { setActionLoadingKey(""); }
  };
  const createExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setNewExpenseLoading(true);
    try { await apiSend("/expenses", "POST", { name: newExpenseForm.name, amount: Number(newExpenseForm.amount), frequency: newExpenseForm.frequency, due_day: Number(newExpenseForm.due_day), notes: newExpenseForm.notes || null }); showToast("Gasto creado", "success"); setNewExpenseOpen(false); setNewExpenseForm({ name: "", amount: 0, frequency: "monthly", due_day: 5, notes: "" }); await loadData(); } catch { showToast("Error", "error"); } finally { setNewExpenseLoading(false); }
  };
  const createSettlement = async () => {
    if (!newSettlement.driver_id) { showToast("Selecciona un conductor", "info"); return; }
    try { await apiSend("/cod-settlements", "POST", { driver_id: newSettlement.driver_id, date: codDate, total_settled: Number(newSettlement.total_settled), notes: newSettlement.notes || null }); showToast("Conciliacion creada", "success"); setNewSettlement({ driver_id: 0, total_settled: 0, notes: "" }); await loadCodData(); } catch { showToast("Error", "error"); }
  };
  const closeSettlement = async (id: number) => {
    try { await apiSend(`/cod-settlements/${id}/close`, "POST", {}); showToast("Conciliacion cerrada", "success"); await loadCodData(); } catch { showToast("Error", "error"); }
  };
  const loadExpenseHistory = async (id: number) => { if (expenseHistory[id]) return; const data = await apiGet<HistoryExpense>(`/expenses/${id}/history`); setExpenseHistory((prev) => ({ ...prev, [id]: data })); };
  const loadEmployeeHistory = async (id: number) => { if (employeeHistory[id]) return; const data = await apiGet<HistoryEmployee>(`/employees/${id}/history`); setEmployeeHistory((prev) => ({ ...prev, [id]: data })); };

  // ── Computed ─────────────────────────────────────────
  const filteredAging = useMemo(() => {
    if (!agingReport) return [];
    return agingReport.clients.filter((c: AgingReportClient) => {
      if (agingFilter === "overdue") return c.bucket_1_30 + c.bucket_31_60 + c.bucket_61_90 + c.bucket_90_plus > 0;
      if (agingFilter === "90plus") return c.bucket_90_plus > 0;
      return true;
    });
  }, [agingReport, agingFilter]);

  const codPercent = useMemo(() => {
    if (!dailySummary) return 0;
    const total = dailySummary.cod.collected_today + dailySummary.cod.pending_today;
    return total > 0 ? Math.round((dailySummary.cod.collected_today / total) * 100) : 0;
  }, [dailySummary]);

  // ── Tabs config ─────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "pyl", label: "P&L", icon: "📈" },
    { key: "cartera", label: "Cartera", icon: "💳" },
    { key: "cod", label: "COD", icon: "💵" },
    { key: "conductores", label: "Conductores", icon: "🚗" },
    { key: "gastos", label: "Gastos y Nómina", icon: "🏢" },
    { key: "flujo", label: "Flujo de Caja", icon: "🌊" },
  ];

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  return (
    <div className="animate-fade-in space-y-4">
      {/* ── Header ──────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Finanzas</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Control financiero de Danhei Express</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setNewExpenseOpen(true)} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">+ Gasto</button>
            <button type="button" onClick={() => void loadData()} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-[#2a2a3e]">Actualizar</button>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`min-h-11 border-b-2 px-4 py-3 text-sm whitespace-nowrap ${activeTab === tab.key ? "border-primary text-primary font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <span className="mr-1.5">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading ─────────────────────────────── */}
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 dark:bg-[#23233b]" />)}</div> : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 1: DASHBOARD FINANCIERO               */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "dashboard" ? (
        <section className="space-y-4">
          {/* KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Ingreso mes" value={formatCOP(kpis?.monthly_revenue || 0)} tone="text-emerald-600" />
            <KpiCard label="Costos mes" value={formatCOP(kpis?.monthly_costs || 0)} tone="text-rose-500" />
            <KpiCard label="Utilidad neta" value={formatCOP(kpis?.monthly_profit || 0)} sub={`Margen ${(kpis?.profit_margin_pct || 0).toFixed(1)}%`} tone={(kpis?.monthly_profit || 0) >= 0 ? "text-emerald-600" : "text-rose-500"} />
            <KpiCard label="DSO" value={`${(kpis?.dso || 0).toFixed(0)} días`} sub="Dias promedio cobro" />
            <KpiCard label="Tasa COD" value={`${(kpis?.cod_collection_rate || 0).toFixed(0)}%`} sub="Cobro contraentrega" tone={(kpis?.cod_collection_rate || 0) >= 90 ? "text-emerald-600" : "text-amber-500"} />
            <KpiCard label="Margen/envio" value={formatCOP(kpis?.avg_margin_per_shipment || 0)} sub={`Ratio op. ${(kpis?.operating_ratio || 0).toFixed(2)}`} />
          </div>

          {/* Alerts */}
          {alerts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {alerts.map((a, i) => <AlertBadge key={i} alert={a} />)}
            </div>
          ) : null}

          {/* COD bar + P&L mini */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Barra COD del dia">
              <div className="flex items-center justify-between text-sm"><span>Recaudado</span><span className="font-semibold">{codPercent}%</span></div>
              <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#2a2a3e]"><div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all" style={{ width: `${codPercent}%` }} /></div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {dailySummary && dailySummary.cod.drivers_with_cash > 0 ? <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-400/20 dark:text-rose-300">🔴 {dailySummary.cod.drivers_with_cash} conductores con dinero en calle</span> : null}
                <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700 dark:bg-blue-400/20 dark:text-blue-300">💰 CxC total: {formatCOP(kpis?.total_receivable || 0)}</span>
                <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">📦 COD en calle: {formatCOP(kpis?.total_cod_in_street || 0)}</span>
              </div>
            </SectionCard>

            <SectionCard title="Mini P&L del mes">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>Ingresos</span><span className="font-semibold text-emerald-600">{formatCOP(dailySummary?.revenue.gross_income || 0)}</span></div>
                <div className="flex justify-between"><span>Costo conductores</span><span>-{formatCOP(dailySummary?.revenue.driver_cost || 0)}</span></div>
                <div className="flex justify-between"><span>Gastos fijos</span><span>-{formatCOP(dailySummary?.revenue.fixed_expenses_month || 0)}</span></div>
                <div className="flex justify-between"><span>Nómina</span><span>-{formatCOP(dailySummary?.revenue.payroll_month || 0)}</span></div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold dark:border-[#2a2a3e]">
                  <span>Resultado</span>
                  <span className={(dailySummary ? dailySummary.revenue.gross_income - dailySummary.revenue.driver_cost - dailySummary.revenue.fixed_expenses_month - dailySummary.revenue.payroll_month : 0) >= 0 ? "text-emerald-600" : "text-rose-500"}>
                    {formatCOP(dailySummary ? dailySummary.revenue.gross_income - dailySummary.revenue.driver_cost - dailySummary.revenue.fixed_expenses_month - dailySummary.revenue.payroll_month : 0)}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 2: ESTADO DE RESULTADOS (P&L)         */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "pyl" ? (
        <section className="space-y-4">
          <SectionCard title="Estado de Resultados" actions={
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={plFrom} onChange={(e) => setPlFrom(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <input type="date" value={plTo} onChange={(e) => setPlTo(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <button onClick={loadPL} disabled={plLoading} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{plLoading ? "Cargando..." : "Generar"}</button>
              {plReport ? <button onClick={() => downloadCSV("pyl_danhei.csv", ["Concepto", "Monto"], [
                ["Ingresos directos", String(plReport.income.direct_revenue)],
                ["Ingresos outsourcing", String(plReport.income.outsource_revenue)],
                ["TOTAL INGRESOS", String(plReport.income.gross_income)],
                ["Costo conductores", String(-plReport.costs.driver_fees)],
                ["Gastos fijos", String(-plReport.costs.fixed_expenses)],
                ["Nómina", String(-plReport.costs.payroll)],
                ["TOTAL COSTOS", String(-plReport.costs.total_costs)],
                ["UTILIDAD NETA", String(plReport.net_profit)],
                ["Margen %", String(plReport.margin_percent)],
              ])} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e]">📥 CSV</button> : null}
            </div>
          }>
            {plReport ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr><th className="pb-2 text-left font-semibold text-slate-500">Concepto</th><th className="pb-2 text-right font-semibold text-slate-500">Monto</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">
                    <tr className="bg-emerald-50/50 dark:bg-emerald-400/5"><td className="py-2 font-semibold">INGRESOS OPERACIONALES</td><td></td></tr>
                    <tr><td className="py-1.5 pl-4">Servicios de mensajería</td><td className="py-1.5 text-right">{formatCOP(plReport.income.direct_revenue)}</td></tr>
                    <tr><td className="py-1.5 pl-4">Servicios outsourcing</td><td className="py-1.5 text-right">{formatCOP(plReport.income.outsource_revenue)}</td></tr>
                    <tr className="font-semibold"><td className="py-2">Total ingresos</td><td className="py-2 text-right text-emerald-600">{formatCOP(plReport.income.gross_income)}</td></tr>

                    <tr className="bg-rose-50/50 dark:bg-rose-400/5"><td className="py-2 font-semibold">COSTOS Y GASTOS</td><td></td></tr>
                    <tr><td className="py-1.5 pl-4">Pago a conductores</td><td className="py-1.5 text-right text-rose-500">-{formatCOP(plReport.costs.driver_fees)}</td></tr>
                    <tr><td className="py-1.5 pl-4">Gastos fijos (arriendo, servicios, etc.)</td><td className="py-1.5 text-right text-rose-500">-{formatCOP(plReport.costs.fixed_expenses)}</td></tr>
                    <tr><td className="py-1.5 pl-4">Nómina administrativa</td><td className="py-1.5 text-right text-rose-500">-{formatCOP(plReport.costs.payroll)}</td></tr>
                    <tr className="font-semibold"><td className="py-2">Total costos</td><td className="py-2 text-right text-rose-500">-{formatCOP(plReport.costs.total_costs)}</td></tr>

                    <tr className="border-t-2 border-slate-300 dark:border-[#3a3a4e]"><td className="py-3 text-base font-bold">UTILIDAD NETA</td><td className={`py-3 text-right text-base font-bold ${plReport.net_profit >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{formatCOP(plReport.net_profit)}</td></tr>
                    <tr><td className="py-1 text-slate-500">Margen de utilidad</td><td className="py-1 text-right font-semibold">{plReport.margin_percent.toFixed(1)}%</td></tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">Selecciona un periodo y presiona &quot;Generar&quot; para ver el estado de resultados.</p>}
          </SectionCard>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 3: CARTERA (AGING REPORT)             */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "cartera" ? (
        <section className="space-y-4">
          {agingReport ? (
            <>
              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard label="Total CxC" value={formatCOP(agingReport.summary.total_receivable)} tone="text-slate-900 dark:text-white" />
                <KpiCard label="Corriente" value={formatCOP(agingReport.summary.total_current)} tone="text-emerald-600" />
                <KpiCard label="1-30 días" value={formatCOP(agingReport.summary.total_1_30)} tone="text-amber-500" />
                <KpiCard label="31-60 días" value={formatCOP(agingReport.summary.total_31_60)} tone="text-orange-500" />
                <KpiCard label="61-90 días" value={formatCOP(agingReport.summary.total_61_90)} tone="text-rose-500" />
                <KpiCard label=">90 días" value={formatCOP(agingReport.summary.total_90_plus)} sub={`${agingReport.summary.overdue_pct.toFixed(0)}% vencido`} tone="text-rose-700" />
              </div>

              <SectionCard title="Detalle por cliente" actions={
                <div className="flex gap-2">
                  {(["all", "overdue", "90plus"] as const).map((f) => (
                    <button key={f} onClick={() => setAgingFilter(f)} className={`rounded-full border px-3 py-1 text-xs ${agingFilter === f ? "border-primary bg-primary/10 text-primary font-semibold" : "border-slate-300 dark:border-[#2a2a3e]"}`}>
                      {f === "all" ? "Todos" : f === "overdue" ? "Vencidos" : ">90 días"}
                    </button>
                  ))}
                  <button onClick={() => downloadCSV("cartera_danhei.csv",
                    ["Cliente", "Empresa", "Total", "Corriente", "1-30d", "31-60d", "61-90d", ">90d", "Envios", "Dias"],
                    filteredAging.map((c) => [c.name, c.company || "", String(c.total_owed), String(c.current), String(c.bucket_1_30), String(c.bucket_31_60), String(c.bucket_61_90), String(c.bucket_90_plus), String(c.shipments_count), String(c.oldest_days)])
                  )} className="rounded-full border border-slate-300 px-3 py-1 text-xs dark:border-[#2a2a3e]">📥 CSV</button>
                </div>
              }>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="pb-2">Cliente</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Corriente</th><th className="pb-2 text-right">1-30d</th><th className="pb-2 text-right">31-60d</th><th className="pb-2 text-right">61-90d</th><th className="pb-2 text-right">&gt;90d</th><th className="pb-2 text-right">Envíos</th><th className="pb-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">
                      {filteredAging.sort((a, b) => b.total_owed - a.total_owed).map((c) => (
                        <tr key={c.id} className={c.bucket_90_plus > 0 ? "bg-rose-50/50 dark:bg-rose-400/5" : c.bucket_31_60 + c.bucket_61_90 > 0 ? "bg-amber-50/50 dark:bg-amber-400/5" : ""}>
                          <td className="py-2"><p className="font-semibold">{c.company || c.name}</p><p className="text-xs text-slate-500">{c.phone || "-"}</p></td>
                          <td className="py-2 text-right font-semibold">{formatCOP(c.total_owed)}</td>
                          <td className="py-2 text-right">{c.current > 0 ? formatCOP(c.current) : "-"}</td>
                          <td className="py-2 text-right">{c.bucket_1_30 > 0 ? formatCOP(c.bucket_1_30) : "-"}</td>
                          <td className="py-2 text-right">{c.bucket_31_60 > 0 ? formatCOP(c.bucket_31_60) : "-"}</td>
                          <td className="py-2 text-right">{c.bucket_61_90 > 0 ? formatCOP(c.bucket_61_90) : "-"}</td>
                          <td className="py-2 text-right">{c.bucket_90_plus > 0 ? formatCOP(c.bucket_90_plus) : "-"}</td>
                          <td className="py-2 text-right">{c.shipments_count}</td>
                          <td className="py-2">
                            <a href={`https://wa.me/57${c.phone?.replace(/\D/g, "") || ""}?text=${encodeURIComponent(`Hola ${c.company || c.name}, le recordamos que tiene ${c.shipments_count} envios pendientes de pago por ${formatCOP(c.total_owed)}. Danhei Express`)}`} target="_blank" className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">WhatsApp</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : <p className="text-sm text-slate-500">No hay datos de cartera</p>}
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 4: COD Y CONCILIACIÓN                 */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "cod" ? (
        <section className="space-y-4">
          <SectionCard title="Resumen COD del día" actions={
            <input type="date" value={codDate} onChange={async (e) => { setCodDate(e.target.value); await loadCodData(e.target.value); }} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
          }>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="pb-2">Conductor</th><th className="pb-2 text-right">Paquetes</th><th className="pb-2 text-right">Esperado</th><th className="pb-2 text-right">Cobrado</th><th className="pb-2 text-right">Pendiente</th><th className="pb-2 text-right">Diferencia</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">{codSummaryDrivers.map((d) => <tr key={d.driver_id}><td className="py-2">{d.driver_name}</td><td className="py-2 text-right">{d.packages}</td><td className="py-2 text-right">{formatCOP(d.total_expected)}</td><td className="py-2 text-right">{formatCOP(d.collected)}</td><td className="py-2 text-right">{formatCOP(d.pending)}</td><td className="py-2 text-right"><span className={d.difference === 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{formatCOP(d.difference)}</span></td></tr>)}</tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Crear conciliación">
            <div className="grid gap-2 sm:grid-cols-3">
              <select value={newSettlement.driver_id} onChange={(e) => setNewSettlement((p) => ({ ...p, driver_id: Number(e.target.value) }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"><option value={0}>Conductor</option>{board.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <input type="number" value={newSettlement.total_settled} onChange={(e) => setNewSettlement((p) => ({ ...p, total_settled: Number(e.target.value) }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" placeholder="Total liquidado" />
              <button type="button" onClick={createSettlement} className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-white">Crear</button>
              <textarea value={newSettlement.notes} onChange={(e) => setNewSettlement((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas" className="min-h-16 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
            </div>
          </SectionCard>

          <SectionCard title="Historial de conciliaciones">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="pb-2">Fecha</th><th className="pb-2">Conductor</th><th className="pb-2 text-right">Cobrado</th><th className="pb-2 text-right">Liquidado</th><th className="pb-2">Estado</th><th className="pb-2">Acción</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">{codSettlements.map((s) => <tr key={s.id}><td className="py-2">{s.settlement_date}</td><td className="py-2">{s.driver?.name || `#${s.driver_id}`}</td><td className="py-2 text-right">{formatCOP(s.total_collected)}</td><td className="py-2 text-right">{formatCOP(s.total_settled)}</td><td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === "settled" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"}`}>{s.status}</span></td><td className="py-2">{s.status !== "settled" ? <button onClick={() => closeSettlement(s.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">Cerrar</button> : "-"}</td></tr>)}</tbody>
              </table>
            </div>
          </SectionCard>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 5: CONDUCTORES (LIQUIDACIONES)         */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "conductores" ? (
        <section className="space-y-4">
          {/* Board de recaudo */}
          <SectionCard title="Tablero de recaudo">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {board.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <p className="font-semibold">{item.name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><p className="text-slate-500">COD pend.</p><p className="mt-0.5 font-bold text-amber-500">{formatCOP(Number(item.cod_pending || 0))}</p></div>
                    <div><p className="text-slate-500">COD cobrado</p><p className="mt-0.5 font-bold text-blue-500">{formatCOP(Number(item.cod_collected || 0))}</p></div>
                    <div><p className="text-slate-500">Por pagar</p><p className="mt-0.5 font-bold text-rose-500">{formatCOP(Number(item.unpaid_fees || 0))}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <button disabled={actionLoadingKey === `collect-${item.id}`} onClick={() => collectAll(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">{actionLoadingKey === `collect-${item.id}` ? "..." : "Recaudar"}</button>
                    <button disabled={actionLoadingKey === `settle-${item.id}`} onClick={() => settleAll(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">{actionLoadingKey === `settle-${item.id}` ? "..." : "Liquidar"}</button>
                    <button disabled={actionLoadingKey === `pay-${item.id}`} onClick={() => payAll(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">{actionLoadingKey === `pay-${item.id}` ? "..." : "Pagar"}</button>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          {/* Rentabilidad por conductor */}
          {profitDrivers.length > 0 ? (
            <SectionCard title="Rentabilidad por conductor">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="pb-2">Conductor</th><th className="pb-2 text-right">Envíos</th><th className="pb-2 text-right">Ingreso generado</th><th className="pb-2 text-right">Pagado</th><th className="pb-2 text-right">Contribución</th><th className="pb-2 text-right">Margen</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">{profitDrivers.map((d) => <tr key={d.id}><td className="py-2 font-semibold">{d.name}</td><td className="py-2 text-right">{d.total_shipments}</td><td className="py-2 text-right">{formatCOP(d.total_revenue)}</td><td className="py-2 text-right">{formatCOP(d.total_cost)}</td><td className="py-2 text-right font-semibold">{formatCOP(d.profit)}</td><td className={`py-2 text-right font-semibold ${d.margin_pct >= 30 ? "text-emerald-600" : "text-amber-500"}`}>{d.margin_pct.toFixed(1)}%</td></tr>)}</tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          {/* Liquidación individual */}
          <SectionCard title="Liquidación de conductor" actions={
            <div className="flex flex-wrap items-center gap-2">
              <select value={settlementDriverId} onChange={(e) => setSettlementDriverId(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"><option value={0}>Conductor</option>{board.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <input type="date" value={settlementFrom} onChange={(e) => setSettlementFrom(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <input type="date" value={settlementTo} onChange={(e) => setSettlementTo(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <button onClick={loadSettlement} disabled={settlementLoading} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{settlementLoading ? "..." : "Generar"}</button>
            </div>
          }>
            {settlement ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <p className="font-bold">{settlement.driver.name}</p>
                  <p className="text-xs text-slate-500">{settlement.period.from} → {settlement.period.to}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-slate-500">Paquetes</p><p className="text-lg font-bold">{settlement.totals.total_packages}</p></div>
                    <div><p className="text-xs text-slate-500">Total bruto</p><p className="text-lg font-bold">{formatCOP(settlement.totals.total_driver_fee)}</p></div>
                    <div><p className="text-xs text-slate-500">Deducciones</p><p className="text-lg font-bold text-rose-500">-{formatCOP(settlement.totals.deductions)}</p></div>
                    <div><p className="text-xs text-slate-500">Pago neto</p><p className="text-lg font-bold text-emerald-600">{formatCOP(settlement.totals.net_pay)}</p></div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span>COD manejado: <strong>{formatCOP(settlement.cod_summary.total_cod_handled)}</strong></span>
                    <span>COD depositado: <strong>{formatCOP(settlement.cod_summary.total_cod_deposited)}</strong></span>
                    <span className={settlement.cod_summary.difference === 0 ? "text-emerald-600" : "text-rose-600"}>Diferencia: <strong>{formatCOP(settlement.cod_summary.difference)}</strong></span>
                  </div>
                </div>
                <button onClick={() => downloadCSV(`liquidacion_${settlement.driver.name.replace(/\s/g, "_")}.csv`,
                  ["Código", "Fecha entrega", "Costo envío", "Fee conductor", "Tipo pago", "Estado"],
                  settlement.deliveries.map((d) => [d.display_code, d.delivered_at || "-", String(d.shipping_cost), String(d.driver_fee), d.payment_type, d.financial_status])
                )} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-[#2a2a3e]">📥 Exportar liquidación CSV</button>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="pb-1">Código</th><th className="pb-1">Entrega</th><th className="pb-1 text-right">Costo</th><th className="pb-1 text-right">Fee</th><th className="pb-1">Tipo</th><th className="pb-1">Estado</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">{settlement.deliveries.map((d) => <tr key={d.id}><td className="py-1">{d.display_code}</td><td className="py-1">{d.delivered_at || "-"}</td><td className="py-1 text-right">{formatCOP(d.shipping_cost)}</td><td className="py-1 text-right">{formatCOP(d.driver_fee)}</td><td className="py-1">{d.payment_type}</td><td className="py-1">{d.financial_status}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : <p className="text-sm text-slate-500">Selecciona un conductor y un periodo para generar la liquidación.</p>}
          </SectionCard>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 6: GASTOS Y NÓMINA                    */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "gastos" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`Gastos fijos — ${formatCOP(totalMonthlyExpenses)}/mes`}>
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <div className="flex items-start justify-between"><div><p className="font-semibold">{expense.name}</p><p className="text-sm text-slate-500">{formatCOP(expense.amount)} — {expense.frequency}</p></div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${expense.current_month_status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"}`}>{expense.current_month_status === "paid" ? "Pagado" : "Pendiente"}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {expense.current_month_status !== "paid" ? <button disabled={actionLoadingKey === `expense-${expense.id}`} onClick={() => markExpensePaid(expense.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">Pagar</button> : null}
                    <button onClick={async () => { const next = expandedExpense === expense.id ? null : expense.id; setExpandedExpense(next); if (next) await loadExpenseHistory(expense.id); }} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">Historial</button>
                  </div>
                  {expandedExpense === expense.id && expenseHistory[expense.id] ? (
                    <div className="mt-2 overflow-x-auto text-xs">
                      <table className="min-w-full"><thead><tr><th className="text-left">Periodo</th><th className="text-left">Monto</th><th className="text-left">Estado</th><th className="text-left">Pago</th></tr></thead><tbody>{expenseHistory[expense.id].payments.map((p) => <tr key={p.id}><td>{p.period_date}</td><td>{formatCOP(p.amount)}</td><td>{p.status}</td><td>{p.paid_at || "-"}</td></tr>)}</tbody></table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={`Nómina — ${formatCOP(totalMonthlyPayroll)}/mes`}>
            <div className="space-y-2">
              {employees.map((employee) => (
                <div key={employee.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <p className="font-semibold">{employee.name} <span className="text-xs text-slate-500">— {employee.position}</span></p>
                  <p className="text-sm">{formatCOP(employee.salary)}</p>
                  <div className="mt-2 flex gap-2">
                    <button disabled={actionLoadingKey === `employee-${employee.id}`} onClick={() => payEmployee(employee.id)} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">Registrar pago</button>
                    <button onClick={async () => { const next = expandedEmployee === employee.id ? null : employee.id; setExpandedEmployee(next); if (next) await loadEmployeeHistory(employee.id); }} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e]">Historial</button>
                  </div>
                  {expandedEmployee === employee.id && employeeHistory[employee.id] ? (
                    <div className="mt-2 overflow-x-auto text-xs">
                      <table className="min-w-full"><thead><tr><th className="text-left">Periodo</th><th className="text-left">Monto</th><th className="text-left">Estado</th><th className="text-left">Pago</th></tr></thead><tbody>{employeeHistory[employee.id].payments.map((p) => <tr key={p.id}><td>{p.period_start} - {p.period_end}</td><td>{formatCOP(p.amount)}</td><td>{p.status}</td><td>{p.paid_at || "-"}</td></tr>)}</tbody></table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 7: FLUJO DE CAJA                      */}
      {/* ══════════════════════════════════════════ */}
      {!loading && activeTab === "flujo" ? (
        <section className="space-y-4">
          <SectionCard title="Proyección de flujo de caja — 13 semanas" actions={
            <button onClick={() => {
              if (!cashFlow) return;
              downloadCSV("flujo_caja_danhei.csv",
                ["Semana", "Inicio", "Fin", "Saldo inicial", "Entradas", "Salidas", "Flujo neto", "Saldo final"],
                cashFlow.weeks.map((w) => [String(w.week_number), w.start_date, w.end_date, String(w.opening_balance), String(w.inflows.total), String(w.outflows.total), String(w.net_flow), String(w.closing_balance)])
              );
            }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-[#2a2a3e]">📥 CSV</button>
          }>
            {cashFlow && cashFlow.weeks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="sticky left-0 bg-white pb-2 dark:bg-[#1a1a2e]">Concepto</th>
                      {cashFlow.weeks.map((w) => <th key={w.week_number} className="min-w-[90px] pb-2 text-right">S{w.week_number}<br /><span className="text-[10px]">{w.start_date.slice(5)}</span></th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a3e]">
                    <tr className="font-semibold"><td className="sticky left-0 bg-white py-1.5 dark:bg-[#1a1a2e]">Saldo inicial</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1.5 text-right">{fmtShort(w.opening_balance)}</td>)}</tr>
                    <tr className="bg-emerald-50/50 dark:bg-emerald-400/5"><td className="sticky left-0 bg-emerald-50/50 py-1 font-semibold dark:bg-emerald-400/5">Entradas</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right text-emerald-600">{fmtShort(w.inflows.total)}</td>)}</tr>
                    <tr><td className="sticky left-0 bg-white py-1 pl-3 dark:bg-[#1a1a2e]">Clientes</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right">{fmtShort(w.inflows.client_payments)}</td>)}</tr>
                    <tr><td className="sticky left-0 bg-white py-1 pl-3 dark:bg-[#1a1a2e]">COD</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right">{fmtShort(w.inflows.cod_collections)}</td>)}</tr>
                    <tr className="bg-rose-50/50 dark:bg-rose-400/5"><td className="sticky left-0 bg-rose-50/50 py-1 font-semibold dark:bg-rose-400/5">Salidas</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right text-rose-500">-{fmtShort(w.outflows.total)}</td>)}</tr>
                    <tr><td className="sticky left-0 bg-white py-1 pl-3 dark:bg-[#1a1a2e]">Conductores</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right">{fmtShort(w.outflows.driver_payments)}</td>)}</tr>
                    <tr><td className="sticky left-0 bg-white py-1 pl-3 dark:bg-[#1a1a2e]">Gastos</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right">{fmtShort(w.outflows.expenses)}</td>)}</tr>
                    <tr><td className="sticky left-0 bg-white py-1 pl-3 dark:bg-[#1a1a2e]">Nómina</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className="py-1 text-right">{fmtShort(w.outflows.payroll)}</td>)}</tr>
                    <tr className="border-t-2 border-slate-300 font-bold dark:border-[#3a3a4e]"><td className="sticky left-0 bg-white py-1.5 dark:bg-[#1a1a2e]">Flujo neto</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className={`py-1.5 text-right ${w.net_flow >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtShort(w.net_flow)}</td>)}</tr>
                    <tr className="font-bold"><td className="sticky left-0 bg-white py-1.5 dark:bg-[#1a1a2e]">Saldo final</td>{cashFlow.weeks.map((w) => <td key={w.week_number} className={`py-1.5 text-right ${w.closing_balance >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{fmtShort(w.closing_balance)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No hay datos suficientes para proyectar el flujo de caja. Se necesitan al menos 4 semanas de datos históricos.</p>}
          </SectionCard>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════ */}
      {/* MODAL: NUEVO GASTO                        */}
      {/* ══════════════════════════════════════════ */}
      {newExpenseOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={createExpense} className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <h2 className="text-lg font-bold">Nuevo gasto fijo</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={newExpenseForm.name} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, name: e.target.value })} placeholder="Nombre del gasto" className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <input required type="number" value={newExpenseForm.amount} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, amount: Number(e.target.value) })} placeholder="Monto" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <select value={newExpenseForm.frequency} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, frequency: e.target.value as "monthly" | "biweekly" | "weekly" })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"><option value="monthly">Mensual</option><option value="biweekly">Quincenal</option><option value="weekly">Semanal</option></select>
              <input type="number" min={1} max={31} value={newExpenseForm.due_day} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, due_day: Number(e.target.value) })} placeholder="Dia vencimiento" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <textarea value={newExpenseForm.notes} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, notes: e.target.value })} placeholder="Notas" className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNewExpenseOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e]">Cancelar</button>
              <button disabled={newExpenseLoading} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{newExpenseLoading ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
