"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  CodDailySummaryDriver,
  CodSettlement,
  DailySummary,
  DriverBoardItem,
  Employee,
  Expense,
  FinancialOverview,
  ReceivableClient,
  Shipment,
} from "@/lib/types";

type TabKey = "resumen" | "deudas" | "conductores" | "gastos" | "conciliacion";

type HistoryExpense = {
  expense: { id: number; name: string; amount: number };
  payments: Array<{ id: number; period_date: string; amount: number; status: string; paid_at: string | null }>;
};

type HistoryEmployee = {
  employee: { id: number; name: string };
  payments: Array<{ id: number; period_start: string; period_end: string; amount: number; status: string; paid_at: string | null }>;
};

const emptyDailySummary: DailySummary = {
  date: "",
  packages: { total_today: 0, delivered_today: 0, total_week: 0, total_month: 0 },
  revenue: { gross_income: 0, driver_cost: 0, gross_profit: 0, fixed_expenses_month: 0, payroll_month: 0 },
  cod: { collected_today: 0, pending_today: 0, drivers_with_cash: 0 },
  receivables: { total_owed: 0, overdue_count: 0, oldest_days: 0 },
  outsourcing: { service_income: 0, driver_cost: 0, profit: 0, packages: 0 },
};

export default function PagosPage() {
  usePageTitle("Pagos | Danhei Express");

  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("resumen");
  const [loading, setLoading] = useState(true);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [newExpenseLoading, setNewExpenseLoading] = useState(false);
  const [receivableFilter, setReceivableFilter] = useState<"all" | "overdue" | "recent">("all");
  const [codDate, setCodDate] = useState(new Date().toISOString().split("T")[0]);

  const [dailySummary, setDailySummary] = useState<DailySummary>(emptyDailySummary);
  const [receivable, setReceivable] = useState<ReceivableClient[]>([]);
  const [board, setBoard] = useState<DriverBoardItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalMonthlyExpenses, setTotalMonthlyExpenses] = useState(0);
  const [totalMonthlyPayroll, setTotalMonthlyPayroll] = useState(0);
  const [expenseHistory, setExpenseHistory] = useState<Record<number, HistoryExpense>>({});
  const [employeeHistory, setEmployeeHistory] = useState<Record<number, HistoryEmployee>>({});
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const [codSummaryDrivers, setCodSummaryDrivers] = useState<CodDailySummaryDriver[]>([]);
  const [codSettlements, setCodSettlements] = useState<CodSettlement[]>([]);
  const [newExpenseForm, setNewExpenseForm] = useState({
    name: "",
    amount: 0,
    frequency: "monthly" as "monthly" | "biweekly" | "weekly",
    due_day: 5,
    notes: "",
  });
  const [newSettlement, setNewSettlement] = useState({ driver_id: 0, total_settled: 0, notes: "" });

  const loadMainData = async () => {
    const [, summaryRes, boardRes, receivableRes, expensesRes, employeesRes] = await Promise.all([
      apiGet<FinancialOverview>("/financial/overview"),
      apiGet<DailySummary>("/financial/daily-summary"),
      apiGet<{ data?: DriverBoardItem[] } | DriverBoardItem[]>("/financial/driver-board"),
      apiGet<{ clients: ReceivableClient[] }>("/clients-receivable"),
      apiGet<{ expenses: Expense[]; total_monthly: number }>("/expenses"),
      apiGet<{ employees: Employee[]; total_monthly_payroll: number }>("/employees"),
    ]);

    setDailySummary(summaryRes);
    setBoard(Array.isArray(boardRes) ? boardRes : boardRes.data || []);
    setReceivable(receivableRes.clients || []);
    setExpenses(expensesRes.expenses || []);
    setTotalMonthlyExpenses(Number(expensesRes.total_monthly || 0));
    setEmployees(employeesRes.employees || []);
    setTotalMonthlyPayroll(Number(employeesRes.total_monthly_payroll || 0));
  };

  const loadCodData = async (date = codDate) => {
    const [summary, list] = await Promise.all([
      apiGet<{ date: string; drivers: CodDailySummaryDriver[] }>(`/cod-settlements/daily-summary?date=${date}`),
      apiGet<{ data: CodSettlement[] }>("/cod-settlements"),
    ]);
    setCodSummaryDrivers(summary.drivers || []);
    setCodSettlements(list.data || []);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadMainData(), loadCodData()]);
    } catch {
      showToast("No se pudo cargar informacion financiera", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debtTone = (days: number) => {
    if (days > 15) return "bg-rose-50 text-issue dark:bg-rose-400/20 dark:text-rose-300";
    if (days > 7) return "bg-amber-50 text-pending dark:bg-amber-400/20 dark:text-amber-300";
    return "bg-emerald-50 text-delivered dark:bg-emerald-400/20 dark:text-emerald-300";
  };

  const loadExpenseHistory = async (id: number) => {
    if (expenseHistory[id]) return;
    const data = await apiGet<HistoryExpense>(`/expenses/${id}/history`);
    setExpenseHistory((prev) => ({ ...prev, [id]: data }));
  };

  const loadEmployeeHistory = async (id: number) => {
    if (employeeHistory[id]) return;
    const data = await apiGet<HistoryEmployee>(`/employees/${id}/history`);
    setEmployeeHistory((prev) => ({ ...prev, [id]: data }));
  };

  const collectAll = async (driverId: number) => {
    const key = `collect-${driverId}`;
    try {
      setActionLoadingKey(key);
      await apiSend("/financial/collect-batch", "POST", { driver_id: driverId });
      showToast("COD recaudado", "success");
      await loadMainData();
      await loadCodData();
    } catch {
      showToast("No se pudo recaudar", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const settleAll = async (driverId: number) => {
    const key = `settle-${driverId}`;
    try {
      setActionLoadingKey(key);
      const shipmentsRes = await apiGet<{ data?: Shipment[] } | Shipment[]>(`/shipments?driver_id=${driverId}&per_page=100`);
      const shipments = Array.isArray(shipmentsRes) ? shipmentsRes : shipmentsRes.data || [];
      const ids = shipments
        .filter((s) => s.payment_type === "cash_on_delivery" && s.financial_status === "collected")
        .map((s) => s.id);
      if (ids.length === 0) {
        showToast("No hay COD recaudado para liquidar", "info");
        return;
      }
      await apiSend("/financial/settle-batch", "POST", { shipment_ids: ids });
      showToast("COD liquidado", "success");
      await loadMainData();
      await loadCodData();
    } catch {
      showToast("No se pudo liquidar", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const payAll = async (driverId: number) => {
    const key = `pay-${driverId}`;
    try {
      setActionLoadingKey(key);
      await apiSend("/financial/driver-paid-batch", "POST", { driver_id: driverId });
      showToast("Pago a conductor aplicado", "success");
      await loadMainData();
    } catch {
      showToast("No se pudo pagar", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const markExpensePaid = async (id: number) => {
    const key = `expense-${id}`;
    try {
      setActionLoadingKey(key);
      await apiSend(`/expenses/${id}/pay`, "POST", {});
      showToast("Gasto marcado como pagado", "success");
      await loadMainData();
    } catch {
      showToast("No se pudo marcar gasto", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const payEmployee = async (id: number) => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const key = `employee-${id}`;
    try {
      setActionLoadingKey(key);
      await apiSend(`/employees/${id}/pay`, "POST", {
        period_start: periodStart,
        period_end: periodEnd,
      });
      showToast("Pago de nomina registrado", "success");
      await loadMainData();
    } catch {
      showToast("No se pudo registrar pago", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const createExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewExpenseLoading(true);
    try {
      await apiSend("/expenses", "POST", {
        name: newExpenseForm.name,
        amount: Number(newExpenseForm.amount),
        frequency: newExpenseForm.frequency,
        due_day: Number(newExpenseForm.due_day),
        notes: newExpenseForm.notes || null,
      });
      showToast("Gasto creado", "success");
      setNewExpenseOpen(false);
      setNewExpenseForm({ name: "", amount: 0, frequency: "monthly", due_day: 5, notes: "" });
      await loadMainData();
    } catch {
      showToast("No se pudo crear gasto", "error");
    } finally {
      setNewExpenseLoading(false);
    }
  };

  const createSettlement = async () => {
    if (!newSettlement.driver_id) {
      showToast("Selecciona un conductor", "info");
      return;
    }
    try {
      await apiSend("/cod-settlements", "POST", {
        driver_id: newSettlement.driver_id,
        date: codDate,
        total_settled: Number(newSettlement.total_settled),
        notes: newSettlement.notes || null,
      });
      showToast("Conciliacion creada", "success");
      setNewSettlement({ driver_id: 0, total_settled: 0, notes: "" });
      await loadCodData();
    } catch {
      showToast("No se pudo crear conciliacion", "error");
    }
  };

  const closeSettlement = async (id: number) => {
    try {
      await apiSend(`/cod-settlements/${id}/close`, "POST", {});
      showToast("Conciliacion cerrada", "success");
      await loadCodData();
    } catch {
      showToast("No se pudo cerrar conciliacion", "error");
    }
  };

  const filteredReceivable = useMemo(() => receivable.filter((item) => {
    if (receivableFilter === "overdue") return item.days_oldest_debt > 15;
    if (receivableFilter === "recent") return item.days_oldest_debt <= 7;
    return true;
  }), [receivable, receivableFilter]);

  const codPercent = useMemo(() => {
    const total = dailySummary.cod.collected_today + dailySummary.cod.pending_today;
    return total > 0 ? Math.round((dailySummary.cod.collected_today / total) * 100) : 0;
  }, [dailySummary]);

  const monthlyResult = dailySummary.revenue.gross_income - dailySummary.revenue.driver_cost - dailySummary.revenue.fixed_expenses_month - dailySummary.revenue.payroll_month;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Pagos y Finanzas</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Control de recaudo y obligaciones</p>
          </div>
          <button type="button" onClick={() => setNewExpenseOpen(true)} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Nuevo gasto</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex min-w-max gap-1">
          {[
            { key: "resumen", label: "Resumen" },
            { key: "deudas", label: "Quien me debe" },
            { key: "conductores", label: "Conductores" },
            { key: "gastos", label: "Gastos y Nomina" },
            { key: "conciliacion", label: "Conciliacion" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`min-h-11 border-b-2 px-4 py-3 text-sm ${activeTab === tab.key ? "border-primary text-primary font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 dark:bg-[#23233b]" />)}</div> : null}

      {!loading && activeTab === "resumen" ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500">Paquetes hoy</p><p className="mt-1 text-xl font-bold">{dailySummary.packages.total_today} / {dailySummary.packages.delivered_today}</p></article>
            <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500">Ingreso bruto mes</p><p className="mt-1 text-xl font-bold">{formatCOP(dailySummary.revenue.gross_income)}</p></article>
            <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500">Costo conductores</p><p className="mt-1 text-xl font-bold">{formatCOP(dailySummary.revenue.driver_cost)}</p></article>
            <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"><p className="text-xs text-slate-500">Ganancia bruta</p><p className="mt-1 text-xl font-bold text-emerald-600">{formatCOP(dailySummary.revenue.gross_profit)}</p></article>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex items-center justify-between text-sm"><span>Barra COD</span><span>{codPercent}%</span></div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#2a2a3e]"><div className="h-full bg-primary" style={{ width: `${codPercent}%` }} /></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {dailySummary.cod.drivers_with_cash > 0 ? <span className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-400/20 dark:text-rose-300">{dailySummary.cod.drivers_with_cash} conductores con dinero en calle</span> : null}
              {dailySummary.receivables.overdue_count > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">{dailySummary.receivables.overdue_count} clientes vencidos</span> : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h3 className="font-semibold">Mini P&amp;L</h3>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Ingresos</span><span>{formatCOP(dailySummary.revenue.gross_income)}</span></div>
              <div className="flex justify-between"><span>Conductores</span><span>-{formatCOP(dailySummary.revenue.driver_cost)}</span></div>
              <div className="flex justify-between"><span>Gastos fijos</span><span>-{formatCOP(dailySummary.revenue.fixed_expenses_month)}</span></div>
              <div className="flex justify-between"><span>Nomina</span><span>-{formatCOP(dailySummary.revenue.payroll_month)}</span></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold dark:border-[#2a2a3e]"><span>Resultado</span><span>{formatCOP(monthlyResult)}</span></div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "deudas" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <div className="mb-3 flex flex-wrap gap-2">
            <button onClick={() => setReceivableFilter("all")} className="rounded-full border px-3 py-1 text-xs">Todos</button>
            <button onClick={() => setReceivableFilter("overdue")} className="rounded-full border px-3 py-1 text-xs">Vencidos (&gt;15d)</button>
            <button onClick={() => setReceivableFilter("recent")} className="rounded-full border px-3 py-1 text-xs">Recientes</button>
          </div>
          <div className="space-y-2">
            {[...filteredReceivable].sort((a, b) => b.days_oldest_debt - a.days_oldest_debt).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.company || item.name}</p>
                    <p className="text-xs text-slate-500">{item.phone || "-"} - {item.owed_shipments_count} envios</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${debtTone(item.days_oldest_debt)}`}>{item.days_oldest_debt} dias</span>
                  </div>
                  <strong>{formatCOP(item.total_owed)}</strong>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={`https://wa.me/57${item.phone?.replace(/\D/g, "") || ""}?text=${encodeURIComponent(`Hola ${item.company || item.name}, le recordamos que tiene ${item.owed_shipments_count} envios pendientes de pago por ${formatCOP(item.total_owed)}. Danhei Express`)}`} target="_blank" className="rounded border border-slate-300 px-2 py-1 text-xs">WhatsApp</a>
                  <button type="button" onClick={() => showToast("Use la conciliacion por envio desde cartera/operacion", "info")} className="rounded border border-slate-300 px-2 py-1 text-xs">Marcar pagado</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "conductores" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {board.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm">COD pendiente: <strong>{formatCOP(Number(item.cod_pending || 0))}</strong></p>
                <p className="text-sm">COD recaudado: <strong>{formatCOP(Number(item.cod_collected || 0))}</strong></p>
                <p className="text-sm">Pendiente pago: <strong>{formatCOP(Number(item.unpaid_fees || 0))}</strong></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={actionLoadingKey === `collect-${item.id}`} onClick={() => collectAll(item.id)} className="rounded border px-2 py-1 text-xs">{actionLoadingKey === `collect-${item.id}` ? "Guardando..." : "Recaudar todo"}</button>
                  <button disabled={actionLoadingKey === `settle-${item.id}`} onClick={() => settleAll(item.id)} className="rounded border px-2 py-1 text-xs">{actionLoadingKey === `settle-${item.id}` ? "Guardando..." : "Liquidar todo"}</button>
                  <button disabled={actionLoadingKey === `pay-${item.id}`} onClick={() => payAll(item.id)} className="rounded border px-2 py-1 text-xs">{actionLoadingKey === `pay-${item.id}` ? "Guardando..." : "Pagar todo"}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "gastos" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h2 className="text-base font-semibold">Gastos fijos</h2>
            <div className="mt-3 space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <p className="font-semibold">{expense.name}</p>
                  <p className="text-sm">{formatCOP(expense.amount)}</p>
                  <div className="mt-2 flex gap-2">
                    {expense.current_month_status !== "paid" ? <button disabled={actionLoadingKey === `expense-${expense.id}`} onClick={() => markExpensePaid(expense.id)} className="rounded border px-2 py-1 text-xs">Marcar pagado</button> : null}
                    <button onClick={async () => { const next = expandedExpense === expense.id ? null : expense.id; setExpandedExpense(next); if (next) await loadExpenseHistory(expense.id); }} className="rounded border px-2 py-1 text-xs">Historial</button>
                  </div>
                  {expandedExpense === expense.id && expenseHistory[expense.id] ? (
                    <div className="mt-2 overflow-x-auto text-xs">
                      <table className="min-w-full"><thead><tr><th className="text-left">Periodo</th><th className="text-left">Monto</th><th className="text-left">Estado</th><th className="text-left">Pago</th></tr></thead><tbody>{expenseHistory[expense.id].payments.map((p) => <tr key={p.id}><td>{p.period_date}</td><td>{formatCOP(p.amount)}</td><td>{p.status}</td><td>{p.paid_at || "-"}</td></tr>)}</tbody></table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm font-semibold">Total mensual: {formatCOP(totalMonthlyExpenses)}</p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h2 className="text-base font-semibold">Nomina</h2>
            <div className="mt-3 space-y-2">
              {employees.map((employee) => (
                <div key={employee.id} className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <p className="font-semibold">{employee.name} - {employee.position}</p>
                  <p className="text-sm">{formatCOP(employee.salary)}</p>
                  <div className="mt-2 flex gap-2">
                    <button disabled={actionLoadingKey === `employee-${employee.id}`} onClick={() => payEmployee(employee.id)} className="rounded border px-2 py-1 text-xs">Registrar pago</button>
                    <button onClick={async () => { const next = expandedEmployee === employee.id ? null : employee.id; setExpandedEmployee(next); if (next) await loadEmployeeHistory(employee.id); }} className="rounded border px-2 py-1 text-xs">Historial</button>
                  </div>
                  {expandedEmployee === employee.id && employeeHistory[employee.id] ? (
                    <div className="mt-2 overflow-x-auto text-xs">
                      <table className="min-w-full"><thead><tr><th className="text-left">Periodo</th><th className="text-left">Monto</th><th className="text-left">Estado</th><th className="text-left">Pago</th></tr></thead><tbody>{employeeHistory[employee.id].payments.map((p) => <tr key={p.id}><td>{p.period_start} - {p.period_end}</td><td>{formatCOP(p.amount)}</td><td>{p.status}</td><td>{p.paid_at || "-"}</td></tr>)}</tbody></table>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm font-semibold">Total nomina mensual: {formatCOP(totalMonthlyPayroll)}</p>
          </article>
        </section>
      ) : null}

      {!loading && activeTab === "conciliacion" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">Fecha:</label>
              <input type="date" value={codDate} onChange={async (e) => { setCodDate(e.target.value); await loadCodData(e.target.value); }} className="h-10 rounded border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm"><thead><tr><th className="text-left">Conductor</th><th className="text-left">Paquetes</th><th className="text-left">Esperado</th><th className="text-left">Cobrado</th><th className="text-left">Pendiente</th><th className="text-left">Diferencia</th></tr></thead><tbody>{codSummaryDrivers.map((d) => <tr key={d.driver_id}><td>{d.driver_name}</td><td>{d.packages}</td><td>{formatCOP(d.total_expected)}</td><td>{formatCOP(d.collected)}</td><td>{formatCOP(d.pending)}</td><td><span className={d.difference === 0 ? "text-emerald-600" : "text-rose-600"}>{formatCOP(d.difference)}</span></td></tr>)}</tbody></table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h3 className="font-semibold">Crear conciliacion</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <select value={newSettlement.driver_id} onChange={(e) => setNewSettlement((prev) => ({ ...prev, driver_id: Number(e.target.value) }))} className="h-10 rounded border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"><option value={0}>Conductor</option>{board.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <input type="number" value={newSettlement.total_settled} onChange={(e) => setNewSettlement((prev) => ({ ...prev, total_settled: Number(e.target.value) }))} className="h-10 rounded border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" placeholder="Total liquidado" />
              <button type="button" onClick={createSettlement} className="h-10 rounded bg-primary px-3 text-sm font-semibold text-white">Crear conciliacion</button>
              <textarea value={newSettlement.notes} onChange={(e) => setNewSettlement((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notas" className="min-h-20 rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-3 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <h3 className="font-semibold">Historial de conciliaciones</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm"><thead><tr><th className="text-left">Fecha</th><th className="text-left">Conductor</th><th className="text-left">Cobrado</th><th className="text-left">Liquidado</th><th className="text-left">Estado</th><th className="text-left">Accion</th></tr></thead><tbody>{codSettlements.map((s) => <tr key={s.id}><td>{s.settlement_date}</td><td>{s.driver?.name || `#${s.driver_id}`}</td><td>{formatCOP(s.total_collected)}</td><td>{formatCOP(s.total_settled)}</td><td>{s.status}</td><td>{s.status !== "settled" ? <button onClick={() => closeSettlement(s.id)} className="rounded border px-2 py-1 text-xs">Cerrar</button> : "-"}</td></tr>)}</tbody></table>
            </div>
          </div>
        </section>
      ) : null}

      {newExpenseOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={createExpense} className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <h2 className="text-lg font-bold">Nuevo gasto fijo</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={newExpenseForm.name} onChange={(event) => setNewExpenseForm({ ...newExpenseForm, name: event.target.value })} placeholder="Nombre del gasto" className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <input required type="number" value={newExpenseForm.amount} onChange={(event) => setNewExpenseForm({ ...newExpenseForm, amount: Number(event.target.value) })} placeholder="Monto" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <select value={newExpenseForm.frequency} onChange={(event) => setNewExpenseForm({ ...newExpenseForm, frequency: event.target.value as "monthly" | "biweekly" | "weekly" })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]"><option value="monthly">Mensual</option><option value="biweekly">Quincenal</option><option value="weekly">Semanal</option></select>
              <input type="number" min={1} max={31} value={newExpenseForm.due_day} onChange={(event) => setNewExpenseForm({ ...newExpenseForm, due_day: Number(event.target.value) })} placeholder="Dia de vencimiento" className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a]" />
              <textarea value={newExpenseForm.notes} onChange={(event) => setNewExpenseForm({ ...newExpenseForm, notes: event.target.value })} placeholder="Notas" className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 dark:border-[#2a2a3e] dark:bg-[#16162a]" />
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
