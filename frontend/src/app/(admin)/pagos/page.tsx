"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  DriverBoardItem,
  Employee,
  Expense,
  FinancialOverview,
  ReceivableClient,
} from "@/lib/types";

const emptyOverview: FinancialOverview = {
  cod: { pending: 0, collected: 0, settled: 0 },
  post_sale: { pending: 0, invoiced: 0, overdue: 0, total_receivable: 0 },
  drivers: { pending_payment: 0 },
  totals: { total_receivable: 0, total_payable: 0 },
};

export default function PagosPage() {
  usePageTitle("Pagos | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [newExpenseLoading, setNewExpenseLoading] = useState(false);
  const [newExpenseForm, setNewExpenseForm] = useState({
    name: "",
    amount: 0,
    frequency: "monthly" as "monthly" | "biweekly" | "weekly",
    due_day: 5,
    notes: "",
  });

  const [overview, setOverview] = useState<FinancialOverview>(emptyOverview);
  const [receivable, setReceivable] = useState<ReceivableClient[]>([]);
  const [board, setBoard] = useState<DriverBoardItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalMonthlyExpenses, setTotalMonthlyExpenses] = useState(0);
  const [totalMonthlyPayroll, setTotalMonthlyPayroll] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, boardRes, receivableRes, expensesRes, employeesRes] =
        await Promise.all([
          apiGet<FinancialOverview>("/financial/overview"),
          apiGet<{ data?: DriverBoardItem[] } | DriverBoardItem[]>(
            "/financial/driver-board"
          ),
          apiGet<{ clients: ReceivableClient[] }>("/clients-receivable"),
          apiGet<{ expenses: Expense[]; total_monthly: number }>("/expenses"),
          apiGet<{ employees: Employee[]; total_monthly_payroll: number }>(
            "/employees"
          ),
        ]);
      setOverview(overviewRes);
      setBoard(Array.isArray(boardRes) ? boardRes : boardRes.data || []);
      setReceivable(receivableRes.clients || []);
      setExpenses(expensesRes.expenses || []);
      setTotalMonthlyExpenses(Number(expensesRes.total_monthly || 0));
      setEmployees(employeesRes.employees || []);
      setTotalMonthlyPayroll(Number(employeesRes.total_monthly_payroll || 0));
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
    if (days > 15) return "bg-rose-50 text-issue";
    if (days > 7) return "bg-amber-50 text-pending";
    return "bg-emerald-50 text-delivered";
  };

  const runAction = async (
    shipmentId: number | undefined,
    action: "collect" | "settle" | "driver-paid"
  ) => {
    if (!shipmentId) {
      showToast("Este registro no tiene shipment_id disponible", "info");
      return;
    }
    const key = `shipment-${shipmentId}-${action}`;
    try {
      setActionLoadingKey(key);
      await apiSend(`/financial/shipments/${shipmentId}/${action}`, "POST", {});
      showToast("Accion financiera aplicada", "success");
      await loadData();
    } catch {
      showToast("No se pudo aplicar accion financiera", "error");
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
      await loadData();
    } catch {
      showToast("No se pudo marcar gasto", "error");
    } finally {
      setActionLoadingKey("");
    }
  };

  const payEmployee = async (id: number) => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
    const key = `employee-${id}`;
    try {
      setActionLoadingKey(key);
      await apiSend(`/employees/${id}/pay`, "POST", {
        period_start: periodStart,
        period_end: periodEnd,
      });
      showToast("Pago de nomina registrado", "success");
      await loadData();
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
      setNewExpenseForm({
        name: "",
        amount: 0,
        frequency: "monthly",
        due_day: 5,
        notes: "",
      });
      await loadData();
    } catch {
      showToast("No se pudo crear gasto", "error");
    } finally {
      setNewExpenseLoading(false);
    }
  };

  const kpis = useMemo(
    () => [
      {
        label: "Total por cobrar",
        value: formatCOP(overview.totals.total_receivable),
        color: "text-purple-600",
      },
      {
        label: "Por liquidar",
        value: formatCOP(overview.cod.pending),
        color: "text-pending",
      },
      {
        label: "Liquidado oficina",
        value: formatCOP(overview.cod.settled),
        color: "text-delivered",
      },
    ],
    [overview]
  );

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Pagos y Finanzas</h1>
            <p className="text-sm text-slate-500">Control de recaudo y obligaciones</p>
          </div>
          <button
            type="button"
            onClick={() => setNewExpenseOpen(true)}
            className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Nuevo gasto
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {kpis.map((item) => (
              <article
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`mt-1 text-xl font-bold ${item.color}`}>{item.value}</p>
              </article>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Quien me debe?</h2>
            {receivable.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sin clientes con deuda.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {[...receivable]
                  .sort((a, b) => b.days_oldest_debt - a.days_oldest_debt)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.company || item.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.phone || "-"} - {item.owed_shipments_count} envios
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${debtTone(
                            item.days_oldest_debt
                          )}`}
                        >
                          {item.days_oldest_debt} dias
                        </span>
                      </div>
                      <strong>{formatCOP(item.total_owed)}</strong>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Board por conductor</h2>
            {board.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sin datos de conductores.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {board.map((item) => {
                  const shipmentId = (
                    item as DriverBoardItem & { shipment_id?: number }
                  ).shipment_id;
                  const collectKey = `shipment-${shipmentId}-collect`;
                  const settleKey = `shipment-${shipmentId}-settle`;
                  const paidKey = `shipment-${shipmentId}-driver-paid`;
                  return (
                    <article
                      key={item.id}
                      className="rounded-lg border border-slate-200 p-3 transition-shadow duration-200 hover:shadow-md"
                    >
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-2 text-sm">
                        COD pendiente:{" "}
                        <strong>{formatCOP(Number(item.cod_pending || 0))}</strong>
                      </p>
                      <p className="text-sm">
                        COD recaudado:{" "}
                        <strong>{formatCOP(Number(item.cod_collected || 0))}</strong>
                      </p>
                      <p className="text-sm">
                        Pendiente pago:{" "}
                        <strong>{formatCOP(Number(item.unpaid_fees || 0))}</strong>
                      </p>
                      <p className="text-sm">
                        Entregas hoy: <strong>{item.today_deliveries}</strong>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          disabled={actionLoadingKey === collectKey}
                          onClick={() => runAction(shipmentId, "collect")}
                          className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                        >
                          {actionLoadingKey === collectKey ? "Guardando..." : "Marcar recaudo"}
                        </button>
                        <button
                          disabled={actionLoadingKey === settleKey}
                          onClick={() => runAction(shipmentId, "settle")}
                          className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                        >
                          {actionLoadingKey === settleKey ? "Guardando..." : "Liquidar"}
                        </button>
                        <button
                          disabled={actionLoadingKey === paidKey}
                          onClick={() => runAction(shipmentId, "driver-paid")}
                          className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                        >
                          {actionLoadingKey === paidKey ? "Guardando..." : "Pago conductor"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">Gastos fijos</h2>
              <div className="mt-3 space-y-2">
                {expenses.map((expense) => {
                  const isLoadingButton = actionLoadingKey === `expense-${expense.id}`;
                  return (
                    <div key={expense.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{expense.name}</p>
                      <p className="text-sm text-slate-600">
                        {formatCOP(expense.amount)} -{" "}
                        {expense.days_until_due === null
                          ? "sin vencimiento"
                          : `vence en ${expense.days_until_due} dias`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            expense.current_month_status === "paid"
                              ? "bg-emerald-50 text-delivered"
                              : "bg-rose-50 text-issue"
                          }`}
                        >
                          {expense.current_month_status === "paid" ? "Pagado" : "Pendiente"}
                        </span>
                        {expense.is_due_soon ? (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-pending">
                            Vence pronto
                          </span>
                        ) : null}
                        {expense.is_overdue ? (
                          <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-issue">
                            Vencido
                          </span>
                        ) : null}
                        {expense.current_month_status !== "paid" ? (
                          <button
                            disabled={isLoadingButton}
                            onClick={() => markExpensePaid(expense.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                          >
                            {isLoadingButton ? "Guardando..." : "Marcar pagado"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Total mensual: {formatCOP(totalMonthlyExpenses)}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">Nomina</h2>
              <div className="mt-3 space-y-2">
                {employees.map((employee) => {
                  const isLoadingButton = actionLoadingKey === `employee-${employee.id}`;
                  return (
                    <div key={employee.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">
                        {employee.name} - {employee.position}
                      </p>
                      <p className="text-sm text-slate-600">
                        {formatCOP(employee.salary)} - {employee.pay_frequency}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            employee.last_payment_status === "paid"
                              ? "bg-emerald-50 text-delivered"
                              : "bg-rose-50 text-issue"
                          }`}
                        >
                          {employee.last_payment_status === "paid" ? "Pagado" : "Pendiente"}
                        </span>
                        <button
                          disabled={isLoadingButton}
                          onClick={() => payEmployee(employee.id)}
                          className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                        >
                          {isLoadingButton ? "Guardando..." : "Registrar pago"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Total nomina mensual: {formatCOP(totalMonthlyPayroll)}
              </p>
            </article>
          </section>
        </>
      )}

      {newExpenseOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={createExpense}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold">Nuevo gasto fijo</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                required
                value={newExpenseForm.name}
                onChange={(event) =>
                  setNewExpenseForm({ ...newExpenseForm, name: event.target.value })
                }
                placeholder="Nombre del gasto"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2"
              />
              <input
                required
                type="number"
                value={newExpenseForm.amount}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    amount: Number(event.target.value),
                  })
                }
                placeholder="Monto"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <select
                value={newExpenseForm.frequency}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    frequency: event.target.value as "monthly" | "biweekly" | "weekly",
                  })
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </select>
              <input
                type="number"
                min={1}
                max={31}
                value={newExpenseForm.due_day}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    due_day: Number(event.target.value),
                  })
                }
                placeholder="Dia de vencimiento"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <textarea
                value={newExpenseForm.notes}
                onChange={(event) =>
                  setNewExpenseForm({ ...newExpenseForm, notes: event.target.value })
                }
                placeholder="Notas"
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewExpenseOpen(false)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                disabled={newExpenseLoading}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {newExpenseLoading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
