"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
import {
  Badge,
  Card,
  EmptyState,
  KpiCard,
  type BadgeTone,
} from "@/components/ui";
import type { DashboardResponse, PaginatedResponse, Shipment } from "@/lib/types";

type HourlyStatsResponse = {
  registrations: Array<{ hour: string; label: string; count: number }>;
  deliveries: Array<{ hour: string; count: number }>;
  peak_hour: { hour: string; label: string; count: number };
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toMinutes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
}

const alertTones: Record<"high" | "medium" | "low", BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "success",
};

export default function MetricasPage() {
  usePageTitle("Métricas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [hourly, setHourly] = useState<HourlyStatsResponse | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [hourlyError, setHourlyError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setHourlyError(false);
      try {
        const [dashboardRes, hourlyRes, shipmentsRes] = await Promise.all([
          apiGet<DashboardResponse>("/dashboard"),
          apiGet<HourlyStatsResponse>("/dashboard/hourly").catch(() => {
            setHourlyError(true);
            return null;
          }),
          apiGet<PaginatedResponse<Shipment>>("/shipments?per_page=100"),
        ]);
        setDashboard(dashboardRes);
        setHourly(hourlyRes);
        setShipments(shipmentsRes.data || []);
      } catch (error) {
        setDashboard(null);
        setHourly(null);
        setShipments([]);
        const message = error instanceof Error ? error.message : "No se pudieron cargar métricas.";
        setLoadError(message);
        showToast(message, "error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showToast]);

  const computed = useMemo(() => {
    const totalToday = Number(dashboard?.today.total || 0);
    const errorsToday =
      Number(dashboard?.today.issue || 0) +
      Number(dashboard?.today.returned || 0) +
      Number(dashboard?.today.cancelled || 0);
    const errorRate = totalToday > 0 ? (errorsToday / totalToday) * 100 : 0;

    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const elapsedHours = Math.max(1, (now.getTime() - startDay.getTime()) / 3600000);
    const throughputPerHour = totalToday / elapsedHours;

    const deliveredLeadTimes = shipments
      .filter((shipment) => shipment.status === "delivered")
      .map((shipment) => toMinutes(shipment.created_at, shipment.delivered_at))
      .filter((value): value is number => typeof value === "number");
    const avgLeadMinutes = average(deliveredLeadTimes);

    const codPending = Number(dashboard?.financial.cod_pending || 0);
    const todayRevenue = Number(dashboard?.financial.today_revenue || 0);
    const cashPressure = todayRevenue > 0 ? (codPending / todayRevenue) * 100 : 0;

    return {
      totalToday,
      errorRate,
      throughputPerHour,
      avgLeadMinutes,
      codPending,
      todayRevenue,
      cashPressure,
    };
  }, [dashboard, shipments]);

  const alerts = useMemo(() => {
    const result: Array<{ level: "high" | "medium" | "low"; message: string }> = [];
    if (computed.errorRate >= 12) {
      result.push({ level: "high", message: "Tasa de error alta: revisa Novedades y devoluciones." });
    } else if (computed.errorRate >= 8) {
      result.push({ level: "medium", message: "Tasa de error en alerta preventiva." });
    }
    if (computed.avgLeadMinutes >= 720) {
      result.push({ level: "high", message: "Tiempo promedio de entrega mayor a 12 horas." });
    } else if (computed.avgLeadMinutes >= 420) {
      result.push({ level: "medium", message: "Tiempo promedio de entrega subiendo sobre 7 horas." });
    }
    if (computed.throughputPerHour < 0.9 && computed.totalToday > 0) {
      result.push({ level: "low", message: "Throughput bajo por hora: evaluar capacidad de ruta." });
    }
    if (computed.cashPressure >= 130) {
      result.push({ level: "medium", message: "Presión de caja: COD pendiente supera 130% del ingreso de hoy." });
    }
    if (!result.length) {
      result.push({ level: "low", message: "Operación estable en los umbrales actuales." });
    }
    return result;
  }, [computed]);

  const maxHourly = useMemo(() => {
    const reg = hourly?.registrations || [];
    const del = hourly?.deliveries || [];
    return Math.max(1, ...reg.map((item) => item.count), ...del.map((item) => item.count));
  }, [hourly]);

  if (loading) {
    return (
      <div className="space-y-4" aria-label="Cargando métricas">
        <div className="h-24 animate-pulse rounded-card bg-app-secondary" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-card bg-app-secondary" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-card bg-app-secondary" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <EmptyState
        title="No fue posible cargar las métricas"
        description={loadError || "Comprueba la conexión con la API e inténtalo de nuevo."}
      />
    );
  }

  return (
    <div className="min-w-0 animate-fade-in space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Operación Danhei</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Métricas de entrega</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-secondary">Throughput, tiempos operativos, tasa de error y alertas básicas.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de entrega">
        <KpiCard label="Throughput / hora" value={computed.throughputPerHour.toFixed(2)} tone="brand" />
        <KpiCard label="Tasa de error" value={`${computed.errorRate.toFixed(1)}%`} tone="danger" />
        <KpiCard label="Tiempo promedio" value={`${Math.round(computed.avgLeadMinutes)} min`} tone="info" />
        <KpiCard label="COD pendiente" value={formatCOP(computed.codPending)} tone="warning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card title="Throughput por hora" className="xl:col-span-2">
          {hourlyError ? (
            <p role="status" className="text-sm text-danger">No fue posible cargar el desglose horario.</p>
          ) : !hourly || !hourly.registrations.length ? (
            <p className="text-sm text-ink-secondary">Sin datos horarios disponibles.</p>
          ) : (
            <div className="space-y-3">
              {hourly.registrations.slice(0, 10).map((item) => {
                const width = Math.max(4, Math.round((item.count / maxHourly) * 100));
                return (
                  <div key={`reg-${item.hour}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-secondary">{item.label}</span>
                      <strong className="font-display text-ink">{item.count}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-app-secondary">
                      <div className="h-2 rounded-full bg-brand transition-all duration-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Alertas básicas">
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={`${alert.level}-${index}`} className="flex items-start gap-2 rounded-input border border-edge bg-app-secondary p-3 text-sm text-ink">
                <Badge tone={alertTones[alert.level]}>{alert.level === "high" ? "Alta" : alert.level === "medium" ? "Atención" : "Estable"}</Badge>
                <span className="leading-5">{alert.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card title="Resumen financiero operativo">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-input border border-edge bg-app-secondary p-3">
            <p className="text-xs text-ink-secondary">Ingresos hoy</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{formatCOP(computed.todayRevenue)}</p>
          </div>
          <div className="rounded-input border border-edge bg-app-secondary p-3">
            <p className="text-xs text-ink-secondary">COD pendiente / ingreso</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{computed.cashPressure.toFixed(1)}%</p>
          </div>
          <div className="rounded-input border border-edge bg-app-secondary p-3">
            <p className="text-xs text-ink-secondary">Total envíos hoy</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{computed.totalToday}</p>
          </div>
          <div className="rounded-input border border-edge bg-app-secondary p-3">
            <p className="text-xs text-ink-secondary">Hora pico</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{hourly?.peak_hour?.label || "No disponible"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
