"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
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
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
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
      showToast("No se pudo cargar información financiera", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
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
    try {
      await apiSend(`/financial/shipments/${shipmentId}/${action}`, "POST", {});
      showToast("Acción financiera aplicada", "success");
      loadData();
    } catch {
      showToast("No se pudo aplicar acción financiera", "error");
    }
  };

  const markExpensePaid = async (id: number) => {
    try {
      await apiSend(`/expenses/${id}/pay`, "POST", {});
      showToast("Gasto marcado como pagado", "success");
      loadData();
    } catch {
      showToast("No se pudo marcar gasto", "error");
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
    try {
      await apiSend(`/employees/${id}/pay`, "POST", {
        period_start: periodStart,
        period_end: periodEnd,
      });
      showToast("Pago de nómina registrado", "success");
      loadData();
    } catch {
      showToast("No se pudo registrar pago", "error");
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
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-bold text-slate-900">Pagos y Finanzas</h1>
        <p className="text-sm text-slate-500">Control de recaudo y obligaciones</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {kpis.map((item) => (
              <article
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`mt-1 text-xl font-bold ${item.color}`}>
                  {item.value}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              ¿Quién me debe?
            </h2>
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
                          {item.phone || "-"} · {item.owed_shipments_count} envíos
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${debtTone(
                            item.days_oldest_debt
                          )}`}
                        >
                          {item.days_oldest_debt} días
                        </span>
                      </div>
                      <strong>{formatCOP(item.total_owed)}</strong>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              Board por conductor
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {board.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-slate-200 p-3"
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
                      onClick={() =>
                        runAction(
                          (item as DriverBoardItem & { shipment_id?: number })
                            .shipment_id,
                          "collect"
                        )
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      Marcar recaudo
                    </button>
                    <button
                      onClick={() =>
                        runAction(
                          (item as DriverBoardItem & { shipment_id?: number })
                            .shipment_id,
                          "settle"
                        )
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      Liquidar
                    </button>
                    <button
                      onClick={() =>
                        runAction(
                          (item as DriverBoardItem & { shipment_id?: number })
                            .shipment_id,
                          "driver-paid"
                        )
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      Pago conductor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">
                Gastos fijos
              </h2>
              <div className="mt-3 space-y-2">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="font-semibold text-slate-900">{expense.name}</p>
                    <p className="text-sm text-slate-600">
                      {formatCOP(expense.amount)} ·{" "}
                      {expense.days_until_due === null
                        ? "Sin vencimiento"
                        : `vence en ${expense.days_until_due} días`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          expense.current_month_status === "paid"
                            ? "bg-emerald-50 text-delivered"
                            : "bg-rose-50 text-issue"
                        }`}
                      >
                        {expense.current_month_status === "paid"
                          ? "Pagado"
                          : "Pendiente"}
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
                          onClick={() => markExpensePaid(expense.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          Marcar pagado
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Total mensual: {formatCOP(totalMonthlyExpenses)}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">Nómina</h2>
              <div className="mt-3 space-y-2">
                {employees.map((employee) => (
                  <div
                    key={employee.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="font-semibold text-slate-900">
                      {employee.name} · {employee.position}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatCOP(employee.salary)} · {employee.pay_frequency}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          employee.last_payment_status === "paid"
                            ? "bg-emerald-50 text-delivered"
                            : "bg-rose-50 text-issue"
                        }`}
                      >
                        {employee.last_payment_status === "paid"
                          ? "Pagado"
                          : "Pendiente"}
                      </span>
                      <button
                        onClick={() => payEmployee(employee.id)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        Registrar pago
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Total nómina mensual: {formatCOP(totalMonthlyPayroll)}
              </p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
