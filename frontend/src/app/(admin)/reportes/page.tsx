"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { API_BASE_URL, fetchWithAuth } from "@/lib/auth";
import { formatCOP, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { ReportStatsResponse } from "@/lib/types";
import { Card, KpiCard, Button, Input } from "@/components/ui";

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
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-muted">
          No fue posible cargar las estadísticas.
        </p>
        <Button className="mt-3" onClick={() => void loadStats(from, to)}>
          Reintentar
        </Button>
      </Card>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <Card>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="font-display text-lg font-bold text-ink">Reportes</h1>
            <p className="text-sm text-muted">
              Fuente real: <code>GET /api/reports/stats</code> y exportaciones backend.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:auto-cols-max xl:grid-flow-col xl:grid-cols-none">
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              max={to || undefined}
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              min={from || undefined}
            />
            <Button
              variant="secondary"
              onClick={() => void loadStats(from, to)}
              disabled={loading || rangeInvalid}
            >
              {loading ? "Cargando..." : "Refrescar"}
            </Button>
            <Button
              onClick={() => void exportCsv("shipments")}
              disabled={exporting !== null || rangeInvalid}
            >
              {exporting === "shipments" ? "Exportando..." : "Exportar envíos"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void exportCsv("financial")}
              disabled={exporting !== null || rangeInvalid}
            >
              {exporting === "financial" ? "Exportando..." : "Exportar financiero"}
            </Button>
          </div>
        </div>
        {rangeInvalid ? (
          <p className="mt-2 text-sm text-danger">
            La fecha inicial no puede ser mayor que la fecha final.
          </p>
        ) : null}
      </Card>

      {/* Period KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Periodo" value={`${stats.period.from} → ${stats.period.to}`} tone="info" />
        <KpiCard label="Total envíos" value={stats.summary.total} tone="brand" />
        <KpiCard label="Tasa de entrega" value={`${stats.summary.delivery_rate}%`} tone="success" />
      </section>

      {/* Financial KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ingresos" value={formatCOP(stats.summary.revenue)} tone="brand" />
        <KpiCard label="Costo pilotos" value={formatCOP(stats.summary.driver_cost)} tone="warning" />
        <KpiCard label="Ganancia" value={formatCOP(stats.summary.profit)} tone="success" />
        <KpiCard label="COD recaudado" value={formatCOP(stats.summary.cod_collected)} tone="info" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card title="Estados">
          <div className="space-y-2">
            {statusRows.length === 0 ? (
              <p className="text-sm text-muted">Sin datos en este periodo.</p>
            ) : (
              statusRows.map(([status, total]) => (
                <div key={status} className="flex items-center justify-between rounded-button border border-edge px-3 py-2 text-sm">
                  <span className="text-ink/80">{shipmentStatusLabel(status)}</span>
                  <strong className="text-ink">{total}</strong>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Top clientes">
          <div className="space-y-2">
            {stats.by_client.length === 0 ? (
              <p className="text-sm text-muted">Sin datos en este periodo.</p>
            ) : (
              stats.by_client.map((client) => (
                <div key={client.id} className="rounded-button border border-edge px-3 py-2 text-sm">
                  <p className="font-semibold text-ink">
                    {client.name} {client.company ? `(${client.company})` : ""}
                  </p>
                  <p className="text-muted">
                    {client.total} envíos - {formatCOP(client.revenue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <Card title="Resumen por piloto">
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {stats.by_driver.length === 0 ? (
            <div className="rounded-card border border-dashed border-edge p-4 text-sm text-muted">
              Sin datos de pilotos en el rango seleccionado.
            </div>
          ) : (
            stats.by_driver.map((driver) => (
              <article
                key={driver.id}
                className="rounded-card border border-edge p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{driver.name}</p>
                    <p className="text-xs text-muted">
                      {driver.total} envíos • {driver.delivered} entregados
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
                    {driver.delivery_rate}%
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-button bg-app-secondary p-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Ingresos</p>
                    <p className="mt-1 font-semibold text-ink">{formatCOP(driver.revenue)}</p>
                  </div>
                  <div className="rounded-button bg-app-secondary p-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Ganancia piloto</p>
                    <p className="mt-1 font-semibold text-ink">{formatCOP(driver.earnings)}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
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
                <tr className="border-t border-edge">
                  <td colSpan={6} className="py-4 text-center text-sm text-muted">
                    Sin datos de pilotos en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                stats.by_driver.map((driver) => (
                  <tr key={driver.id} className="border-t border-edge">
                    <td className="py-2 font-semibold text-ink">{driver.name}</td>
                    <td className="py-2 text-ink/80">{driver.total}</td>
                    <td className="py-2 text-ink/80">{driver.delivered}</td>
                    <td className="py-2 text-ink/80">{driver.delivery_rate}%</td>
                    <td className="py-2 text-ink/80">{formatCOP(driver.revenue)}</td>
                    <td className="py-2 text-ink/80">{formatCOP(driver.earnings)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
