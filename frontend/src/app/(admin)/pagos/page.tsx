"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { formatCOP, formatDateInput } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { ReconciliationWorkspace } from "@/components/financial/reconciliation-workspace";
import type {
  AgingReport,
  AgingReportClient,
  CashFlowProjection,
  DailySummary,
  Employee,
  Expense,
  FinancialAlert,
  FinancialKpis,
  ProfitLossReport,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  CurrencyInput,
  KpiCard,
  MobileListCard,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";

type TabKey =
  | "conciliacion"
  | "dashboard"
  | "pyl"
  | "cartera"
  | "gastos"
  | "flujo";
const TAB_KEYS: TabKey[] = ["conciliacion", "dashboard", "pyl", "cartera", "gastos", "flujo"];

/**
 * Lee `?tab=` y `?driver=` de la URL. Las pestañas retiradas ("cod",
 * "conductores") y cualquier valor desconocido caen en Conciliación, que es
 * ahora el único lugar donde se maneja el dinero de los pilotos.
 */
function readInitialParams(): { tab: TabKey; driverId: number } {
  if (typeof window === "undefined") return { tab: "conciliacion", driverId: 0 };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab") as TabKey | null;
  const driverId = Number(params.get("driver") || 0);
  return {
    tab: requested && TAB_KEYS.includes(requested) ? requested : "conciliacion",
    driverId: Number.isInteger(driverId) && driverId > 0 ? driverId : 0,
  };
}

type HistoryExpense = {
  expense: { id: number; name: string; amount: number };
  payments: Array<{
    id: number;
    period_date: string;
    amount: number;
    status: string;
    paid_at: string | null;
  }>;
};
type HistoryEmployee = {
  employee: { id: number; name: string };
  payments: Array<{
    id: number;
    period_start: string;
    period_end: string;
    amount: number;
    status: string;
    paid_at: string | null;
  }>;
};

const fmtShort = (value: number) =>
  Math.abs(value) >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : Math.abs(value) >= 1_000
      ? `${(value / 1_000).toFixed(0)}K`
      : value.toFixed(0);

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SectionCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card title={title} headerAction={actions}>
      {children}
    </Card>
  );
}

function AlertBadge({ alert }: { alert: FinancialAlert }) {
  const tone =
    alert.severity === "danger"
      ? "danger"
      : alert.severity === "warning"
        ? "warning"
        : "info";
  return (
    <Badge tone={tone}>
      {alert.title}: {alert.count}
      {alert.amount ? ` · ${formatCOP(alert.amount)}` : ""}
    </Badge>
  );
}

export default function PagosPage() {
  usePageTitle("Finanzas | Danhei Express");
  const { showToast } = useToast();
  const [initialParams] = useState(readInitialParams);
  const [activeTab, setActiveTab] = useState<TabKey>(initialParams.tab);
  const [loading, setLoading] = useState(false);
  const [legacyLoaded, setLegacyLoaded] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [kpis, setKpis] = useState<FinancialKpis | null>(null);
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [plFrom, setPlFrom] = useState(
    () => `${formatDateInput().slice(0, 7)}-01`,
  );
  const [plTo, setPlTo] = useState(() => formatDateInput());
  const [plReport, setPlReport] = useState<ProfitLossReport | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [agingReport, setAgingReport] = useState<AgingReport | null>(null);
  const [agingFilter, setAgingFilter] = useState<"all" | "overdue" | "90plus">(
    "all",
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalMonthlyExpenses, setTotalMonthlyExpenses] = useState(0);
  const [totalMonthlyPayroll, setTotalMonthlyPayroll] = useState(0);
  const [newExpenseOpen, setNewExpenseOpen] = useState(false);
  const [newExpenseLoading, setNewExpenseLoading] = useState(false);
  const [newExpenseForm, setNewExpenseForm] = useState({
    name: "",
    amount: 0,
    frequency: "monthly" as "monthly" | "biweekly" | "weekly",
    due_day: 5,
    notes: "",
  });
  const [expenseHistory, setExpenseHistory] = useState<
    Record<number, HistoryExpense>
  >({});
  const [employeeHistory, setEmployeeHistory] = useState<
    Record<number, HistoryEmployee>
  >({});
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowProjection | null>(null);

  const loadData = async () => {
    setLoading(true);
    setDataWarning(null);
    try {
      const results = await Promise.allSettled([
        apiGet<FinancialKpis>("/financial/kpis"),
        apiGet<FinancialAlert[]>("/financial/alerts"),
        apiGet<DailySummary>("/financial/daily-summary"),
        apiGet<AgingReport>("/financial/aging-report"),
        apiGet<{ expenses: Expense[]; total_monthly: number }>("/expenses"),
        apiGet<{ employees: Employee[]; total_monthly_payroll: number }>(
          "/employees",
        ),
        apiGet<CashFlowProjection>("/financial/cash-flow"),
      ]);
      const [
        kpiRes,
        alertRes,
        summaryRes,
        agingRes,
        expensesRes,
        employeesRes,
        cfRes,
      ] = results;
      if (kpiRes.status === "fulfilled") setKpis(kpiRes.value);
      if (alertRes.status === "fulfilled")
        setAlerts(Array.isArray(alertRes.value) ? alertRes.value : []);
      if (summaryRes.status === "fulfilled") setDailySummary(summaryRes.value);
      if (agingRes.status === "fulfilled") setAgingReport(agingRes.value);
      if (expensesRes.status === "fulfilled") {
        setExpenses(expensesRes.value.expenses || []);
        setTotalMonthlyExpenses(Number(expensesRes.value.total_monthly || 0));
      }
      if (employeesRes.status === "fulfilled") {
        setEmployees(employeesRes.value.employees || []);
        setTotalMonthlyPayroll(
          Number(employeesRes.value.total_monthly_payroll || 0),
        );
      }
      if (cfRes.status === "fulfilled") setCashFlow(cfRes.value);
      const rejected = results.filter(
        (result) => result.status === "rejected",
      ).length;
      if (rejected > 0)
        setDataWarning(
          `${rejected} fuente(s) financiera(s) no respondieron. Los paneles afectados se muestran sin datos para no ocultar el error.`,
        );
    } catch (error) {
      setDataWarning(
        describeApiError(
          error,
          "No fue posible cargar la información financiera.",
        ).message,
      );
      showToast("No fue posible cargar información financiera", "error");
    } finally {
      setLoading(false);
      setLegacyLoaded(true);
    }
  };

  // Un enlace directo a otra pestaña (?tab=cartera, por ejemplo) debe cargar
  // sus datos igual que si se hubiera abierto con clic.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialParams.tab !== "conciliacion") void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPL = async () => {
    setPlLoading(true);
    try {
      setPlReport(
        await apiGet<ProfitLossReport>(
          `/financial/profit-loss?from=${plFrom}&to=${plTo}`,
        ),
      );
    } catch (error) {
      showToast(
        describeApiError(error, "Error al cargar P&L").message,
        "error",
      );
    } finally {
      setPlLoading(false);
    }
  };
  const markExpensePaid = async (id: number) => {
    try {
      setActionLoadingKey(`expense-${id}`);
      await apiSend(`/expenses/${id}/pay`, "POST", {});
      showToast("Gasto pagado", "success");
      await loadData();
    } catch {
      showToast("No se pudo registrar el pago", "error");
    } finally {
      setActionLoadingKey("");
    }
  };
  const payEmployee = async (id: number) => {
    const today = formatDateInput();
    const [year, month] = today.split("-");
    const ps = `${year}-${month}-01`;
    const pe = formatDateInput(
      new Date(Date.UTC(Number(year), Number(month), 0, 12)),
    );
    try {
      setActionLoadingKey(`employee-${id}`);
      await apiSend(`/employees/${id}/pay`, "POST", {
        period_start: ps,
        period_end: pe,
      });
      showToast("Pago registrado", "success");
      await loadData();
    } catch {
      showToast("No se pudo registrar el pago", "error");
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
      showToast("No se pudo crear el gasto", "error");
    } finally {
      setNewExpenseLoading(false);
    }
  };
  const loadExpenseHistory = async (id: number) => {
    if (expenseHistory[id]) return;
    try {
      const data = await apiGet<HistoryExpense>(`/expenses/${id}/history`);
      setExpenseHistory((previous) => ({ ...previous, [id]: data }));
    } catch {
      showToast("No se pudo cargar el historial", "error");
    }
  };
  const loadEmployeeHistory = async (id: number) => {
    if (employeeHistory[id]) return;
    try {
      const data = await apiGet<HistoryEmployee>(`/employees/${id}/history`);
      setEmployeeHistory((previous) => ({ ...previous, [id]: data }));
    } catch {
      showToast("No se pudo cargar el historial", "error");
    }
  };

  const filteredAging = useMemo(() => {
    if (!agingReport) return [];
    return (agingReport.clients || []).filter((client: AgingReportClient) =>
      agingFilter === "overdue"
        ? client.bucket_1_30 +
            client.bucket_31_60 +
            client.bucket_61_90 +
            client.bucket_90_plus >
          0
        : agingFilter === "90plus"
          ? client.bucket_90_plus > 0
          : true,
    );
  }, [agingReport, agingFilter]);
  const tabs: { key: TabKey; label: string }[] = [
    { key: "conciliacion", label: "Conciliación" },
    { key: "dashboard", label: "Dashboard" },
    { key: "pyl", label: "P&L" },
    { key: "cartera", label: "Cartera" },
    { key: "gastos", label: "Gastos y Nómina" },
    { key: "flujo", label: "Flujo de Caja" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col gap-4 rounded-card border border-edge bg-surface p-5 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Relación financiera
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">
            Finanzas
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Control financiero de Danhei Express.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => setNewExpenseOpen(true)}>+ Gasto</Button>
          <Button variant="secondary" onClick={() => void loadData()}>
            Actualizar
          </Button>
        </div>
      </header>
      <nav
        aria-label="Secciones financieras"
        className="overflow-x-auto rounded-card border border-edge bg-surface shadow-soft"
      >
        <div className="flex min-w-max gap-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key !== "conciliacion" && !legacyLoaded && !loading)
                  void loadData();
              }}
              className={`min-h-11 rounded-button border-b-2 px-4 py-2 text-sm whitespace-nowrap ${activeTab === tab.key ? "border-brand bg-brand-soft font-semibold text-brand" : "border-transparent text-ink-secondary hover:bg-app-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      {dataWarning ? (
        <Card
          className="border-warning/40 bg-app-secondary"
          title="Hay fuentes financieras pendientes"
        >
          <p className="text-sm text-ink-secondary" role="status">
            {dataWarning}
          </p>
        </Card>
      ) : null}
      {loading && activeTab !== "conciliacion" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : null}
      {activeTab === "conciliacion" ? (
        <Card
          title="Conciliación de libros"
          headerAction={<Badge tone="info">Fuente financiera</Badge>}
        >
          <p className="mb-4 text-sm text-ink-secondary">
            Aquí se maneja todo el dinero de los pilotos: el efectivo que
            entregan, los pagos digitales por verificar y lo que Danhei les
            paga. También las transferencias del dinero cobrado a los clientes.
          </p>
          <ReconciliationWorkspace initialDriverId={initialParams.driverId} />
        </Card>
      ) : null}

      {!loading && activeTab === "dashboard" ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Ingreso mes"
              value={formatCOP(kpis?.monthly_revenue || 0)}
              support="Ingresos registrados"
              tone="success"
            />
            <KpiCard
              label="Costos mes"
              value={formatCOP(kpis?.monthly_costs || 0)}
              support="Costos operativos"
              tone="danger"
            />
            <KpiCard
              label="Utilidad neta"
              value={formatCOP(kpis?.monthly_profit || 0)}
              support={`Margen ${(kpis?.profit_margin_pct || 0).toFixed(1)}%`}
              tone={(kpis?.monthly_profit || 0) >= 0 ? "success" : "danger"}
            />
            <KpiCard
              label="DSO"
              value={`${(kpis?.dso || 0).toFixed(0)} días`}
              support="Promedio de cobro"
            />
            <KpiCard
              label="Tasa contraentrega"
              value={`${(kpis?.cod_collection_rate || 0).toFixed(0)}%`}
              support="Cobro contra entrega"
              tone={
                (kpis?.cod_collection_rate || 0) >= 90 ? "success" : "warning"
              }
            />
            <KpiCard
              label="Margen / envío"
              value={formatCOP(kpis?.avg_margin_per_shipment || 0)}
              support={`Ratio operativo ${(kpis?.operating_ratio || 0).toFixed(2)}`}
            />
          </div>
          {alerts.length ? (
            <div className="flex flex-wrap gap-2">
              {alerts.map((alert, index) => (
                <AlertBadge key={`${alert.title}-${index}`} alert={alert} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin alertas financieras"
              description="No hay alertas devueltas por la API."
            />
          )}
          {dailySummary ? (
            <Card title={`Resumen operativo · ${dailySummary.date}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-secondary">
                    Paquetes hoy
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-ink">
                    {dailySummary.packages.total_today}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {dailySummary.packages.delivered_today} entregados
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-secondary">
                    Contraentrega cobrada
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-teal">
                    {formatCOP(dailySummary.cod.collected_today)}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {dailySummary.cod.drivers_with_cash} pilotos con efectivo
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-secondary">
                    Por cobrar
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-warning">
                    {formatCOP(dailySummary.cod.pending_today)}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    {dailySummary.receivables.overdue_count} cuentas vencidas
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-secondary">
                    Ingreso bruto
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-success">
                    {formatCOP(dailySummary.revenue.gross_income)}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    Utilidad bruta{" "}
                    {formatCOP(dailySummary.revenue.gross_profit)}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}

      {!loading && activeTab === "pyl" ? (
        <SectionCard
          title="Estado de resultados"
          actions={
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Desde"
                type="date"
                value={plFrom}
                onChange={(event) => setPlFrom(event.target.value)}
              />
              <Input
                aria-label="Hasta"
                type="date"
                value={plTo}
                onChange={(event) => setPlTo(event.target.value)}
              />
              <Button onClick={() => void loadPL()} disabled={plLoading}>
                {plLoading ? "Cargando…" : "Generar"}
              </Button>
              {plReport ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadCSV(
                      "pyl_danhei.csv",
                      ["Concepto", "Monto"],
                      [
                        [
                          "Ingresos directos",
                          String(plReport.income.direct_revenue),
                        ],
                        [
                          "Ingresos outsourcing",
                          String(plReport.income.outsource_revenue),
                        ],
                        [
                          "TOTAL INGRESOS",
                          String(plReport.income.gross_income),
                        ],
                        ["Costo pilotos", String(-plReport.costs.driver_fees)],
                        [
                          "Gastos fijos",
                          String(-plReport.costs.fixed_expenses),
                        ],
                        ["Nómina", String(-plReport.costs.payroll)],
                        ["TOTAL COSTOS", String(-plReport.costs.total_costs)],
                        ["UTILIDAD NETA", String(plReport.net_profit)],
                        ["Margen %", String(plReport.margin_percent)],
                      ],
                    )
                  }
                >
                  CSV
                </Button>
              ) : null}
            </div>
          }
        >
          {plReport ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-ink-secondary">
                  <tr>
                    <th className="pb-2">Concepto</th>
                    <th className="pb-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  <tr className="bg-success/10">
                    <td className="py-2 font-semibold">
                      INGRESOS OPERACIONALES
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td className="py-2 pl-4">Servicios de mensajería</td>
                    <td className="py-2 text-right">
                      {formatCOP(plReport.income.direct_revenue)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pl-4">Servicios outsourcing</td>
                    <td className="py-2 text-right">
                      {formatCOP(plReport.income.outsource_revenue)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2">Total ingresos</td>
                    <td className="py-2 text-right text-success">
                      {formatCOP(plReport.income.gross_income)}
                    </td>
                  </tr>
                  <tr className="bg-danger/10">
                    <td className="py-2 font-semibold">COSTOS Y GASTOS</td>
                    <td />
                  </tr>
                  <tr>
                    <td className="py-2 pl-4">Pago a pilotos</td>
                    <td className="py-2 text-right text-danger">
                      -{formatCOP(plReport.costs.driver_fees)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pl-4">Gastos fijos</td>
                    <td className="py-2 text-right text-danger">
                      -{formatCOP(plReport.costs.fixed_expenses)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pl-4">Nómina administrativa</td>
                    <td className="py-2 text-right text-danger">
                      -{formatCOP(plReport.costs.payroll)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2">Total costos</td>
                    <td className="py-2 text-right text-danger">
                      -{formatCOP(plReport.costs.total_costs)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-edge font-bold">
                    <td className="py-3">UTILIDAD NETA</td>
                    <td
                      className={`py-3 text-right ${plReport.net_profit >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {formatCOP(plReport.net_profit)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-ink-secondary">
                      Margen de utilidad
                    </td>
                    <td className="py-1 text-right font-semibold">
                      {plReport.margin_percent.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Sin estado de resultados"
              description="Selecciona un periodo y genera el informe."
            />
          )}
        </SectionCard>
      ) : null}

      {!loading && activeTab === "cartera" ? (
        agingReport ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Total CxC"
                value={formatCOP(agingReport.summary.total_receivable)}
              />
              <KpiCard
                label="Corriente"
                value={formatCOP(agingReport.summary.total_current)}
                tone="success"
              />
              <KpiCard
                label="1–30 días"
                value={formatCOP(agingReport.summary.total_1_30)}
                tone="warning"
              />
              <KpiCard
                label="31–60 días"
                value={formatCOP(agingReport.summary.total_31_60)}
                tone="warning"
              />
              <KpiCard
                label="61–90 días"
                value={formatCOP(agingReport.summary.total_61_90)}
                tone="danger"
              />
              <KpiCard
                label=">90 días"
                value={formatCOP(agingReport.summary.total_90_plus)}
                support={`${agingReport.summary.overdue_pct.toFixed(0)}% vencido`}
                tone="danger"
              />
            </div>
            <SectionCard
              title="Detalle por cliente"
              actions={
                <div className="flex flex-wrap gap-2">
                  {(["all", "overdue", "90plus"] as const).map((filter) => (
                    <Button
                      key={filter}
                      size="sm"
                      variant={agingFilter === filter ? "secondary" : "ghost"}
                      onClick={() => setAgingFilter(filter)}
                    >
                      {filter === "all"
                        ? "Todos"
                        : filter === "overdue"
                          ? "Vencidos"
                          : ">90 días"}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      downloadCSV(
                        "cartera_danhei.csv",
                        ["Contacto", "Empresa", "Total", "Envíos"],
                        filteredAging.map((client) => [
                          client.name,
                          client.company || "",
                          String(client.total_owed),
                          String(client.shipments_count),
                        ]),
                      )
                    }
                  >
                    CSV
                  </Button>
                </div>
              }
            >
              {filteredAging.length === 0 ? (
                <EmptyState
                  title="Sin clientes en este filtro"
                  description="No hay saldos para mostrar."
                />
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-ink-secondary">
                        <tr>
                          <th className="py-2">Cliente</th>
                          <th className="py-2 text-right">Total</th>
                          <th className="py-2 text-right">Corriente</th>
                          <th className="py-2 text-right">Vencido</th>
                          <th className="py-2 text-right">Envíos</th>
                          <th className="py-2">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...filteredAging]
                          .sort((a, b) => b.total_owed - a.total_owed)
                          .map((client) => (
                            <tr
                              key={client.id}
                              className="border-t border-edge"
                            >
                              <td className="py-3">
                                <a
                                  href={`/clientes/${client.id}`}
                                  className="font-display font-semibold text-brand hover:underline"
                                >
                                  {client.name}
                                </a>
                                <p className="text-xs text-ink-secondary">
                                  {client.phone || "Sin teléfono"}
                                  {client.company ? ` · ${client.company}` : ""}
                                </p>
                              </td>
                              <td className="py-3 text-right font-semibold text-ink">
                                {formatCOP(client.total_owed)}
                              </td>
                              <td className="py-3 text-right text-ink">
                                {formatCOP(client.current)}
                              </td>
                              <td className="py-3 text-right text-danger">
                                {formatCOP(
                                  client.bucket_1_30 +
                                    client.bucket_31_60 +
                                    client.bucket_61_90 +
                                    client.bucket_90_plus,
                                )}
                              </td>
                              <td className="py-3 text-right text-ink">
                                {client.shipments_count}
                              </td>
                              <td className="py-3">
                                <a
                                  href={`https://wa.me/57${client.phone?.replace(/\D/g, "") || ""}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-semibold text-brand hover:underline"
                                >
                                  WhatsApp
                                </a>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-3 lg:hidden">
                    {[...filteredAging]
                      .sort((a, b) => b.total_owed - a.total_owed)
                      .map((client) => (
                        <MobileListCard
                          key={client.id}
                          title={client.name}
                          subtitle={
                            client.company || client.phone || "Sin contacto"
                          }
                          meta={`${client.shipments_count} envíos · ${formatCOP(client.total_owed)} por cobrar`}
                          status={
                            <StatusBadge
                              status={
                                client.bucket_90_plus > 0
                                  ? "overdue"
                                  : client.total_owed > 0
                                    ? "pending"
                                    : "settled"
                              }
                              label={
                                client.total_owed > 0 ? "Pendiente" : "Al día"
                              }
                              tone={
                                client.total_owed > 0 ? "warning" : "success"
                              }
                            />
                          }
                          action={
                            <a
                              href={`/clientes/${client.id}`}
                              className="text-sm font-semibold text-brand"
                            >
                              Ver cliente
                            </a>
                          }
                        />
                      ))}
                  </div>
                </>
              )}
            </SectionCard>
          </section>
        ) : (
          <EmptyState
            title="Sin datos de cartera"
            description="La API no devolvió un informe de antigüedad."
          />
        )
      ) : null}

      {!loading && activeTab === "gastos" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title={`Gastos fijos · ${formatCOP(totalMonthlyExpenses)}/mes`}
          >
            {expenses.length === 0 ? (
              <EmptyState
                title="Sin gastos fijos"
                description="Puedes registrar el primero desde Nuevo gasto."
              />
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => {
                  const history =
                    expandedExpense === expense.id
                      ? expenseHistory[expense.id]
                      : null;
                  return (
                <div key={expense.id}>
                  <MobileListCard
                    title={expense.name}
                    subtitle={`${formatCOP(expense.amount)} · ${expense.frequency}`}
                    meta={`Vencimiento: día ${expense.due_day || "-"}`}
                    status={
                      <StatusBadge
                        status={
                          expense.current_month_status === "paid"
                            ? "settled"
                            : "pending"
                        }
                        label={
                          expense.current_month_status === "paid"
                            ? "Pagado"
                            : "Pendiente"
                        }
                      />
                    }
                    action={
                      <div className="flex flex-wrap gap-2">
                        {expense.current_month_status !== "paid" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={
                              actionLoadingKey === `expense-${expense.id}`
                            }
                            onClick={() => void markExpensePaid(expense.id)}
                          >
                            Pagar
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const next =
                              expandedExpense === expense.id
                                ? null
                                : expense.id;
                            setExpandedExpense(next);
                            if (next) await loadExpenseHistory(expense.id);
                          }}
                        >
                          Historial
                        </Button>
                      </div>
                    }
                  />
                  {history ? (
                    <div className="mt-2 rounded-card border border-edge bg-bg-secondary/40 p-3 text-xs">
                      <p className="font-semibold text-ink">Historial de pagos</p>
                      <div className="mt-2 space-y-1.5">
                        {history.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-ink-secondary"
                          >
                            <span>Periodo {payment.period_date}</span>
                            <span className="font-semibold text-ink">{formatCOP(payment.amount)}</span>
                            <Badge tone={payment.status === "paid" ? "success" : "warning"}>
                              {payment.status === "paid" ? "Pagado" : "Pendiente"}
                            </Badge>
                          </div>
                        ))}
                        {history.payments.length === 0 ? (
                          <p>Sin pagos registrados.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
          <SectionCard title={`Nómina · ${formatCOP(totalMonthlyPayroll)}/mes`}>
            {employees.length === 0 ? (
              <EmptyState
                title="Sin nómina registrada"
                description="La API no devolvió empleados."
              />
            ) : (
              <div className="space-y-3">
                {employees.map((employee) => {
                  const history =
                    expandedEmployee === employee.id
                      ? employeeHistory[employee.id]
                      : null;
                  return (
                <div key={employee.id}>
                  <MobileListCard
                    title={employee.name}
                    subtitle={`${employee.position} · ${formatCOP(employee.salary)}`}
                    status={<Badge tone="neutral">Periodo actual</Badge>}
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            actionLoadingKey === `employee-${employee.id}`
                          }
                          onClick={() => void payEmployee(employee.id)}
                        >
                          Registrar pago
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const next =
                              expandedEmployee === employee.id
                                ? null
                                : employee.id;
                            setExpandedEmployee(next);
                            if (next) await loadEmployeeHistory(employee.id);
                          }}
                        >
                          Historial
                        </Button>
                      </div>
                    }
                  />
                  {history ? (
                    <div className="mt-2 rounded-card border border-edge bg-bg-secondary/40 p-3 text-xs">
                      <p className="font-semibold text-ink">Historial de pagos</p>
                      <div className="mt-2 space-y-1.5">
                        {history.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-ink-secondary"
                          >
                            <span>
                              Periodo {payment.period_start} – {payment.period_end}
                            </span>
                            <span className="font-semibold text-ink">{formatCOP(payment.amount)}</span>
                            <Badge tone={payment.status === "paid" ? "success" : "warning"}>
                              {payment.status === "paid" ? "Pagado" : "Pendiente"}
                            </Badge>
                          </div>
                        ))}
                        {history.payments.length === 0 ? (
                          <p>Sin pagos registrados.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </section>
      ) : null}

      {!loading && activeTab === "flujo" ? (
        <SectionCard
          title="Proyección de flujo de caja · 13 semanas"
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={!cashFlow}
              onClick={() =>
                cashFlow &&
                downloadCSV(
                  "flujo_caja_danhei.csv",
                  [
                    "Semana",
                    "Inicio",
                    "Fin",
                    "Saldo inicial",
                    "Entradas",
                    "Salidas",
                    "Flujo neto",
                    "Saldo final",
                  ],
                  cashFlow.weeks.map((week) => [
                    String(week.week_number),
                    week.start_date,
                    week.end_date,
                    String(week.opening_balance),
                    String(week.inflows.total),
                    String(week.outflows.total),
                    String(week.net_flow),
                    String(week.closing_balance),
                  ]),
                )
              }
            >
              CSV
            </Button>
          }
        >
          {cashFlow && cashFlow.weeks.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-ink-secondary">
                    <tr>
                      <th className="py-2">Concepto</th>
                      {cashFlow.weeks.map((week) => (
                        <th
                          key={week.week_number}
                          className="min-w-[90px] py-2 text-right"
                        >
                          S{week.week_number}
                          <br />
                          {week.start_date.slice(5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [
                          "Saldo inicial",
                          (week: (typeof cashFlow.weeks)[number]) =>
                            week.opening_balance,
                        ],
                        [
                          "Entradas",
                          (week: (typeof cashFlow.weeks)[number]) =>
                            week.inflows.total,
                        ],
                        [
                          "Salidas",
                          (week: (typeof cashFlow.weeks)[number]) =>
                            -week.outflows.total,
                        ],
                        [
                          "Flujo neto",
                          (week: (typeof cashFlow.weeks)[number]) =>
                            week.net_flow,
                        ],
                        [
                          "Saldo final",
                          (week: (typeof cashFlow.weeks)[number]) =>
                            week.closing_balance,
                        ],
                      ] as const
                    ).map(([label, getter]) => (
                      <tr key={label} className="border-t border-edge">
                        <td className="py-2 font-semibold text-ink">{label}</td>
                        {cashFlow.weeks.map((week) => (
                          <td
                            key={week.week_number}
                            className={`py-2 text-right ${getter(week) < 0 ? "text-danger" : "text-success"}`}
                          >
                            {fmtShort(getter(week))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 lg:hidden">
                {cashFlow.weeks.map((week) => (
                  <MobileListCard
                    key={week.week_number}
                    title={`Semana ${week.week_number}`}
                    subtitle={`${week.start_date} → ${week.end_date}`}
                    meta={`Inicial ${fmtShort(week.opening_balance)} · Entradas ${fmtShort(week.inflows.total)} · Salidas ${fmtShort(week.outflows.total)}`}
                    status={
                      <StatusBadge
                        status={week.net_flow >= 0 ? "settled" : "overdue"}
                        label={`Flujo ${fmtShort(week.net_flow)}`}
                        tone={week.net_flow >= 0 ? "success" : "danger"}
                      />
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Sin proyección disponible"
              description="Se necesitan al menos cuatro semanas de datos históricos."
            />
          )}
        </SectionCard>
      ) : null}

      {newExpenseOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={createExpense}
            className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-soft sm:max-h-[90vh] sm:max-w-xl sm:rounded-card"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Registro financiero
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">
              Nuevo gasto fijo
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre del gasto"
                required
                value={newExpenseForm.name}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    name: event.target.value,
                  })
                }
                placeholder="Arriendo, internet, oficina…"
                wrapperClassName="sm:col-span-2"
              />
              <CurrencyInput
                label="Monto"
                required
                value={newExpenseForm.amount}
                onValueChange={(val) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    amount: val,
                  })
                }
              />
              <Select
                label="Frecuencia"
                value={newExpenseForm.frequency}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    frequency: event.target.value as
                      "monthly" | "biweekly" | "weekly",
                  })
                }
              >
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </Select>
              <Input
                label="Día de vencimiento"
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
              />
              <Textarea
                label="Notas"
                value={newExpenseForm.notes}
                onChange={(event) =>
                  setNewExpenseForm({
                    ...newExpenseForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Observaciones contables"
                wrapperClassName="sm:col-span-2"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNewExpenseOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={newExpenseLoading}>
                {newExpenseLoading ? "Guardando…" : "Guardar gasto"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
