"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { formatCOP, toTitle } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type {
  DashboardResponse,
  HourlyStatsResponse,
  PaginatedResponse,
  ReceivableResponse,
  Shipment,
} from "@/lib/types";

type DashboardResponseExt = DashboardResponse & {
  today: DashboardResponse["today"] & {
    pickup_scheduled?: number;
    picked_up?: number;
    in_warehouse?: number;
    assigned_to_route?: number;
  };
};

const statusColor: Record<string, string> = {
  delivered: "#12a85f",
  in_transit: "#1f86ff",
  issue: "#e72256",
  registered: "#9333ea",
  returned: "#94a3b8",
  cancelled: "#64748b",
};

const statusTone: Record<string, string> = {
  delivered: "bg-emerald-50 text-delivered dark:bg-emerald-400/20 dark:text-emerald-300",
  in_transit: "bg-blue-50 text-route dark:bg-blue-400/20 dark:text-blue-300",
  issue: "bg-rose-50 text-issue dark:bg-rose-400/20 dark:text-rose-300",
  registered: "bg-violet-50 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
  returned: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

function relativeFromNow(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export default function DashboardPage() {
  usePageTitle("Dashboard | Danhei Express");

  const router = useRouter();
  const [data, setData] = useState<DashboardResponseExt | null>(null);
  const [hourly, setHourly] = useState<HourlyStatsResponse | null>(null);
  const [receivableData, setReceivableData] = useState<ReceivableResponse | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);
  const [financialExpanded, setFinancialExpanded] = useState(false);
  const requestControllers = useRef<Set<AbortController>>(new Set());

  const loadDashboard = async (
    mode: "initial" | "manual" | "auto",
    signal?: AbortSignal
  ) => {
    if (mode === "initial") setLoading(true);
    if (mode !== "initial") setRefreshing(true);

    try {
      const [dashboardRes, shipmentsRes, hourlyRes, receivableRes] = await Promise.all([
        apiGet<DashboardResponseExt>("/dashboard", { signal }),
        apiGet<PaginatedResponse<Shipment>>("/shipments?per_page=5", { signal }),
        apiGet<HourlyStatsResponse>("/dashboard/hourly", { signal }).catch(() => null),
        apiGet<ReceivableResponse>("/clients-receivable", { signal }).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setData(dashboardRes);
      setRecentShipments(shipmentsRes.data || []);
      setHourly(hourlyRes);
      setReceivableData(receivableRes);
      setOffline(false);
      setLastUpdated(Date.now());
      setSecondsSinceUpdate(0);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setOffline(true);
      if (!data) setData(null);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const triggerLoad = (mode: "initial" | "manual" | "auto") => {
    const controller = new AbortController();
    requestControllers.current.add(controller);
    void loadDashboard(mode, controller.signal).finally(() => {
      requestControllers.current.delete(controller);
    });
  };

  useEffect(() => {
    const controllers = requestControllers.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerLoad("initial");
    const id = window.setInterval(() => {
      triggerLoad("auto");
    }, 30_000);
    return () => {
      window.clearInterval(id);
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsSinceUpdate((prev) => (typeof prev === "number" ? prev + 1 : prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const receivableTotal =
    receivableData?.total_owed ??
    (data?.financial.cod_pending || 0) + (data?.financial.post_sale_owed || 0);
  const topDebtors = (receivableData?.clients || []).slice(0, 3);
  const distribution = useMemo(() => {
    const today = data?.today;
    return [
      { key: "registered", label: "Registrados", value: today?.registered || 0 },
      { key: "in_transit", label: "En ruta", value: today?.in_transit || 0 },
      { key: "delivered", label: "Entregados", value: today?.delivered || 0 },
      { key: "issue", label: "Novedad", value: today?.issue || 0 },
      { key: "returned", label: "Devueltos", value: today?.returned || 0 },
      { key: "cancelled", label: "Cancelados", value: today?.cancelled || 0 },
    ];
  }, [data?.today]);

  const totalDist = distribution.reduce((sum, item) => sum + item.value, 0);
  const maxHourly = Math.max(
    1,
    ...(hourly?.registrations || []).map((item) => item.count),
    ...(hourly?.deliveries || []).map((item) => item.count)
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 dark:bg-[#23233b]" />
          ))}
        </div>
        <Skeleton className="h-64 dark:bg-[#23233b]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No fue posible cargar el dashboard en este momento.
        </p>
        <button
          type="button"
          onClick={() => triggerLoad("manual")}
          className="mt-3 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Dashboard en vivo</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Actualizacion automatica cada 30 segundos con datos reales.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-[#2a2a3e] dark:text-slate-300">
              <span
                className={`h-2.5 w-2.5 rounded-full ${offline ? "bg-rose-500" : "bg-emerald-500"} ${offline ? "" : "animate-pulse"}`}
              />
              {offline ? "Sin conexion" : "Conectado"}
              {lastUpdated && typeof secondsSinceUpdate === "number" ? ` • hace ${secondsSinceUpdate}s` : ""}
            </span>
            <button
              type="button"
              onClick={() => triggerLoad("manual")}
              disabled={refreshing}
              className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95 disabled:opacity-60 dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:bg-[#1f1f35]"
            >
              {refreshing ? "Actualizando..." : "Actualizar ahora"}
            </button>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Paquetes hoy</p>
          <p className="mt-3 text-2xl font-bold text-primary">{data.today.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">En ruta</p>
          <p className="mt-3 text-2xl font-bold text-route">{data.today.in_transit}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Entregados</p>
          <p className="mt-3 text-2xl font-bold text-delivered">{data.today.delivered}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Con novedad</p>
          <p className="mt-3 text-2xl font-bold text-pending">{data.today.issue}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">Por cobrar</p>
          <p className="mt-3 text-2xl font-bold text-purple-600">{formatCOP(receivableTotal)}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Distribucion por estado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Basado en pedidos del dia actual.
          </p>
          <div className="mt-4 space-y-3">
            {distribution.map((item) => {
              const width = totalDist ? Math.max(4, Math.round((item.value / totalDist) * 100)) : 0;
              return (
                <div key={item.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                    <strong className="text-slate-900 dark:text-[#e0e0e0]">{item.value}</strong>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-[#16162a]">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${width}%`, backgroundColor: statusColor[item.key] || "#94a3b8" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Financiero</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Resumen de caja del dia.</p>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Ingreso hoy</span>
              <strong>{formatCOP(data.financial.today_revenue)}</strong>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Costo conductores</span>
              <strong>{formatCOP(data.financial.today_driver_cost)}</strong>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Ganancia estimada</span>
              <strong className="text-delivered">{formatCOP(data.financial.today_profit)}</strong>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Cuentas por cobrar</span>
              <strong>{formatCOP(receivableTotal)}</strong>
            </p>
            <div className={`grid transition-all duration-300 ${financialExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="mt-2 overflow-hidden">
            {financialExpanded ? (
              <>
                <p className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">COD pendiente</span>
                  <strong>{formatCOP(data.financial.cod_pending)}</strong>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">COD recaudado</span>
                  <strong>{formatCOP(data.financial.cod_collected)}</strong>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Post-venta por cobrar</span>
                  <strong>{formatCOP(data.financial.post_sale_owed)}</strong>
                </p>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Top 3 deudores
                  </p>
                  {topDebtors.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin clientes con deuda.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {topDebtors.map((client) => (
                        <li key={client.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                              {client.company || client.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {client.owed_shipments_count} envios • {client.days_oldest_debt} dias
                            </p>
                          </div>
                          <strong className="text-slate-900 dark:text-[#e0e0e0]">
                            {formatCOP(client.total_owed)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFinancialExpanded((prev) => !prev)}
            className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
          >
            {financialExpanded ? "Ver menos" : "Ver detalle financiero"}
          </button>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Ultimos 5 envios</h2>
          {recentShipments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin actividad registrada hoy.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentShipments.map((shipment) => (
                <button
                  key={shipment.id}
                  type="button"
                  onClick={() => router.push("/pedidos")}
                  className="w-full rounded-lg border border-slate-200 p-3 text-left transition-colors duration-150 hover:bg-slate-50 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">
                      {shipment.display_code} - {shipment.recipient_name}
                    </p>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone[shipment.status] || "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"}`}>
                      {toTitle(shipment.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {shipment.driver?.name || "Sin conductor"} • {relativeFromNow(shipment.created_at)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Acciones rapidas</h2>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => router.push("/pedidos?quickAction=new")}
              className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo pedido
            </button>
            <button
              type="button"
              onClick={() => router.push("/novedades")}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:bg-[#1f1f35]"
            >
              Ver novedades
            </button>
            <button
              type="button"
              onClick={() => router.push("/pagos")}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:bg-[#1f1f35]"
            >
              Conciliar pagos
            </button>
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">Actividad por hora</h2>
        {!hourly || (hourly.registrations.length === 0 && hourly.deliveries.length === 0) ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin actividad registrada hoy.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Registros
                </p>
                <div className="mt-2 space-y-2">
                  {hourly.registrations.slice(0, 8).map((item) => (
                    <div key={`reg-${item.hour}`}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{item.label}</span>
                        <strong className="text-slate-900 dark:text-[#e0e0e0]">{item.count}</strong>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-[#1a1a2e]">
                        <div
                          className="h-2 rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.max(4, Math.round((item.count / maxHourly) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Entregas
                </p>
                <div className="mt-2 space-y-2">
                  {hourly.deliveries.slice(0, 8).map((item) => (
                    <div key={`del-${item.hour}`}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{item.hour}</span>
                        <strong className="text-slate-900 dark:text-[#e0e0e0]">{item.count}</strong>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-[#1a1a2e]">
                        <div
                          className="h-2 rounded-full bg-delivered transition-all duration-500"
                          style={{ width: `${Math.max(4, Math.round((item.count / maxHourly) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Hora pico: <strong className="text-slate-700 dark:text-slate-300">{hourly.peak_hour?.label || "-"}</strong>{" "}
              con {hourly.peak_hour?.count || 0} registros.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
