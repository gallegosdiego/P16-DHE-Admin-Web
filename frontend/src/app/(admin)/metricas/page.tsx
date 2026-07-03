"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { useToast } from "@/components/toast";
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

export default function MetricasPage() {
  usePageTitle("Métricas | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [hourly, setHourly] = useState<HourlyStatsResponse | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dashboardRes, hourlyRes, shipmentsRes] = await Promise.all([
          apiGet<DashboardResponse>("/dashboard"),
          apiGet<HourlyStatsResponse>("/dashboard/hourly").catch(() => null),
          apiGet<PaginatedResponse<Shipment>>("/shipments?per_page=100"),
        ]);
        setDashboard(dashboardRes);
        setHourly(hourlyRes);
        setShipments(shipmentsRes.data || []);
        setLoadError("");
      } catch {
        setDashboard(null);
        setHourly(null);
        setShipments([]);
        setLoadError("No se pudieron cargar métricas.");
        showToast("No se pudieron cargar métricas", "error");
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
      result.push({ level: "medium", message: "Presion de caja: COD pendiente supera 130% del ingreso de hoy." });
    }
    if (!result.length) {
      result.push({ level: "low", message: "Operacion estable en los umbrales actuales." });
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
      <div className="space-y-4">
        <Skeleton className="h-20 dark:bg-[#23233b]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 dark:bg-[#23233b]" />
          ))}
        </div>
        <Skeleton className="h-60 dark:bg-[#23233b]" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="animate-fade-in rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-sm text-slate-500 dark:text-slate-400">{loadError || "Sin datos de métricas."}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Métricas de entrega</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Throughput, tiempos operativos, tasa de error y alertas básicas.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Throughput/hora</p>
          <p className="mt-1 text-xl font-bold text-primary">{computed.throughputPerHour.toFixed(2)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tasa de error</p>
          <p className="mt-1 text-xl font-bold text-issue">{computed.errorRate.toFixed(1)}%</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tiempo promedio entrega</p>
          <p className="mt-1 text-xl font-bold text-route">{Math.round(computed.avgLeadMinutes)} min</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">COD pendiente</p>
          <p className="mt-1 text-xl font-bold text-pending">{formatCOP(computed.codPending)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Throughput por hora</h2>
          {!hourly || !hourly.registrations.length ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin datos horarios disponibles.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {hourly.registrations.slice(0, 10).map((item) => {
                const width = Math.max(4, Math.round((item.count / maxHourly) * 100));
                return (
                  <div key={`reg-${item.hour}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
                      <strong className="text-slate-900 dark:text-[#e0e0e0]">{item.count}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-[#16162a]">
                      <div className="h-2 rounded-full bg-primary transition-all duration-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Alertas básicas</h2>
          <div className="mt-3 space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.level}-${index}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  alert.level === "high"
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
                    : alert.level === "medium"
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Resumen financiero operativo</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Ingresos hoy</p>
            <p className="mt-1 font-semibold">{formatCOP(computed.todayRevenue)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
            <p className="text-xs text-slate-500 dark:text-slate-400">COD pendiente / ingreso</p>
            <p className="mt-1 font-semibold">{computed.cashPressure.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total envíos hoy</p>
            <p className="mt-1 font-semibold">{computed.totalToday}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
            <p className="text-xs text-slate-500 dark:text-slate-400">Hora pico</p>
            <p className="mt-1 font-semibold">{hourly?.peak_hour?.label || "-"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
