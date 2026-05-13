"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  DashboardResponse,
  DriverBoardItem,
  FinancialOverview,
} from "@/lib/types";

export default function ReportesPage() {
  usePageTitle("Reportes | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [board, setBoard] = useState<DriverBoardItem[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dashboardRes, overviewRes, boardRes] = await Promise.all([
          apiGet<DashboardResponse>("/dashboard"),
          apiGet<FinancialOverview>("/financial/overview"),
          apiGet<{ data?: DriverBoardItem[] } | DriverBoardItem[]>(
            "/financial/driver-board"
          ),
        ]);
        setDashboard(dashboardRes);
        setOverview(overviewRes);
        setBoard(Array.isArray(boardRes) ? boardRes : boardRes.data || []);
      } catch {
        showToast("No se pudieron cargar reportes", "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    const header = ["Conductor", "Entregas", "Recaudado", "Pendiente", "Pagado"];
    const rows = board.map((item) => [
      item.name,
      String(item.today_deliveries),
      String(item.cod_collected || 0),
      String(item.cod_pending || 0),
      String(item.unpaid_fees || 0),
    ]);
    const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reporte-conductores.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !dashboard || !overview) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Reportes</h1>
            <p className="text-sm text-slate-500">
              Resumen operativo y financiero del dia
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Paquetes totales</p>
          <p className="mt-1 text-xl font-bold">{dashboard.today.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Entregados</p>
          <p className="mt-1 text-xl font-bold text-delivered">{dashboard.today.delivered}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Con novedad</p>
          <p className="mt-1 text-xl font-bold text-issue">{dashboard.today.issue}</p>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Ingreso bruto</p>
          <p className="mt-1 text-xl font-bold">{formatCOP(dashboard.financial.today_revenue)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Costo conductores</p>
          <p className="mt-1 text-xl font-bold text-pending">
            {formatCOP(dashboard.financial.today_driver_cost)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Ganancia</p>
          <p className="mt-1 text-xl font-bold text-delivered">
            {formatCOP(dashboard.financial.today_profit)}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Desglose financiero</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-900">Contra entrega</p>
            <p>Pendiente: {formatCOP(overview.cod.pending)}</p>
            <p>Recaudado: {formatCOP(overview.cod.collected)}</p>
            <p>Liquidado: {formatCOP(overview.cod.settled)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-900">Post-venta</p>
            <p>Pendiente: {formatCOP(overview.post_sale.pending)}</p>
            <p>Facturado: {formatCOP(overview.post_sale.invoiced)}</p>
            <p>Vencido: {formatCOP(overview.post_sale.overdue)}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-2">
            <strong>Total por cobrar:</strong> {formatCOP(overview.totals.total_receivable)}
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <strong>Total a pagar conductores:</strong> {formatCOP(overview.totals.total_payable)}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Resumen por conductor</h2>
        <p className="mt-2 text-sm text-slate-500">
          Mostrando {board.length} de {board.length} resultados
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Conductor</th>
                <th className="py-2">Entregas hoy</th>
                <th className="py-2">COD pendiente</th>
                <th className="py-2">COD recaudado</th>
                <th className="py-2">Pendiente pago</th>
              </tr>
            </thead>
            <tbody>
              {board.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-2 font-semibold">{item.name}</td>
                  <td className="py-2">{item.today_deliveries}</td>
                  <td className="py-2">{formatCOP(Number(item.cod_pending || 0))}</td>
                  <td className="py-2">{formatCOP(Number(item.cod_collected || 0))}</td>
                  <td className="py-2">{formatCOP(Number(item.unpaid_fees || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
