"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";
import { formatCOP, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { ReportStatsResponse } from "@/lib/types";

function defaultFromDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export default function ReportesPage() {
  usePageTitle("Reportes | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<null | "shipments" | "financial">(null);
  const [stats, setStats] = useState<ReportStatsResponse | null>(null);
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(todayDate);
  const rangeInvalid = Boolean(from && to && from > to);

  const loadStats = async (currentFrom: string, currentTo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("from", currentFrom);
      params.set("to", currentTo);
      const response = await apiGet<ReportStatsResponse>(`/reports/stats?${params.toString()}`);
      setStats(response);
    } catch {
      setStats(null);
      showToast("No se pudieron cargar reportes", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (rangeInvalid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, rangeInvalid]);

  const exportCsv = async (kind: "shipments" | "financial") => {
    if (rangeInvalid) {
      showToast("El rango de fechas no es válido", "error");
      return;
    }
    setExporting(kind);
    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      const path = kind === "shipments" ? "/reports/export/shipments" : "/reports/export/financial";
      const response = await fetchWithAuth(`${API_BASE_URL}${path}?${params.toString()}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = parseFilename(
        response.headers.get("content-disposition"),
        kind === "shipments" ? "envios.csv" : "financiero.csv"
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Exportación generada", "success");
    } catch {
      showToast("No se pudo exportar el archivo", "error");
    } finally {
      setExporting(null);
    }
  };

  const statusRows = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_status || {}).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 dark:bg-[#23233b]" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No fue posible cargar las estadísticas.
        </p>
        <button
          type="button"
          onClick={() => void loadStats(from, to)}
          className="mt-3 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Reportes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Fuente real: <code>GET /api/reports/stats</code> y exportaciones backend.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-none xl:auto-cols-max xl:grid-flow-col">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              max={to || undefined}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              min={from || undefined}
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button
              type="button"
              onClick={() => void loadStats(from, to)}
              disabled={loading || rangeInvalid}
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
            >
              {loading ? "Cargando..." : "Refrescar"}
            </button>
            <button
              type="button"
              onClick={() => void exportCsv("shipments")}
              disabled={exporting !== null || rangeInvalid}
              className="min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
            >
              {exporting === "shipments" ? "Exportando..." : "Exportar envíos"}
            </button>
            <button
              type="button"
              onClick={() => void exportCsv("financial")}
              disabled={exporting !== null || rangeInvalid}
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
            >
              {exporting === "financial" ? "Exportando..." : "Exportar financiero"}
            </button>
          </div>
        </div>
        {rangeInvalid ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
            La fecha inicial no puede ser mayor que la fecha final.
          </p>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Periodo</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">
            {stats.period.from} → {stats.period.to}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total envíos</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{stats.summary.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tasa de entrega</p>
          <p className="mt-1 text-xl font-bold text-delivered">{stats.summary.delivery_rate}%</p>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ingresos</p>
          <p className="mt-1 text-lg font-bold">{formatCOP(stats.summary.revenue)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Costo pilotos</p>
          <p className="mt-1 text-lg font-bold">{formatCOP(stats.summary.driver_cost)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Ganancia</p>
          <p className="mt-1 text-lg font-bold text-delivered">{formatCOP(stats.summary.profit)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">COD recaudado</p>
          <p className="mt-1 text-lg font-bold">{formatCOP(stats.summary.cod_collected)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Estados</h2>
          <div className="mt-3 space-y-2">
            {statusRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos en este periodo.</p>
            ) : (
              statusRows.map(([status, total]) => (
                <div key={status} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]">
                  <span className="text-slate-700 dark:text-slate-300">{shipmentStatusLabel(status)}</span>
                  <strong className="text-slate-900 dark:text-[#e0e0e0]">{total}</strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Top clientes</h2>
          <div className="mt-3 space-y-2">
            {stats.by_client.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos en este periodo.</p>
            ) : (
              stats.by_client.map((client) => (
                <div key={client.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2a2a3e]">
                  <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                    {client.name} {client.company ? `(${client.company})` : ""}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {client.total} envíos - {formatCOP(client.revenue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Resumen por piloto</h2>
        <div className="mt-3 space-y-2 md:hidden">
          {stats.by_driver.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">
              Sin datos de pilotos en el rango seleccionado.
            </div>
          ) : (
            stats.by_driver.map((driver) => (
              <article
                key={driver.id}
                className="rounded-xl border border-slate-200 p-3 dark:border-[#2a2a3e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{driver.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {driver.total} envíos • {driver.delivered} entregados
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                    {driver.delivery_rate}%
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-[#16162a]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ingresos</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-[#e0e0e0]">{formatCOP(driver.revenue)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-[#16162a]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ganancia piloto</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-[#e0e0e0]">{formatCOP(driver.earnings)}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2">Piloto</th>
                <th className="py-2">Envíos</th>
                <th className="py-2">Entregados</th>
                <th className="py-2">Efectividad</th>
                <th className="py-2">Ingresos</th>
                <th className="py-2">Ganancia piloto</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_driver.length === 0 ? (
                <tr className="border-t border-slate-100 dark:border-[#2a2a3e]">
                  <td colSpan={6} className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    Sin datos de pilotos en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                stats.by_driver.map((driver) => (
                  <tr key={driver.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                    <td className="py-2 font-semibold text-slate-900 dark:text-[#e0e0e0]">{driver.name}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">{driver.total}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">{driver.delivered}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">{driver.delivery_rate}%</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">{formatCOP(driver.revenue)}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">{formatCOP(driver.earnings)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
