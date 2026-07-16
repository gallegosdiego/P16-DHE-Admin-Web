"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { DashboardResponse, ReceivableResponse } from "@/lib/types";

type DashboardData = DashboardResponse & {
  today: DashboardResponse["today"] & {
    pickup_scheduled?: number;
    picked_up?: number;
    in_warehouse?: number;
    assigned_to_route?: number;
  };
};

function ActionIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
      <path d={path} />
    </svg>
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard | Danhei Express");
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [receivables, setReceivables] = useState<ReceivableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);
  const controllers = useRef<Set<AbortController>>(new Set());

  const loadDashboard = async (mode: "initial" | "manual" | "auto", signal?: AbortSignal) => {
    if (mode === "initial") setLoading(true);
    if (mode !== "initial") setRefreshing(true);
    try {
      const [dashboard, pending] = await Promise.all([
        apiGet<DashboardData>("/dashboard", { signal }),
        apiGet<ReceivableResponse>("/clients-receivable", { signal }).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setData(dashboard);
      setReceivables(pending);
      setOffline(false);
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
    controllers.current.add(controller);
    void loadDashboard(mode, controller.signal).finally(() => controllers.current.delete(controller));
  };

  useEffect(() => {
    const activeControllers = controllers.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerLoad("initial");
    const refreshId = window.setInterval(() => triggerLoad("auto"), 30_000);
    return () => {
      window.clearInterval(refreshId);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSecondsSinceUpdate((previous) => typeof previous === "number" ? previous + 1 : previous);
    }, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const receivableTotal =
    receivables?.total_owed ??
    (data?.financial.cod_pending || 0) + (data?.financial.post_sale_owed || 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 dark:bg-[#23233b]" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 dark:bg-[#23233b]" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <p className="text-sm text-slate-500 dark:text-slate-400">No fue posible cargar el dashboard.</p>
        <button type="button" onClick={() => triggerLoad("manual")} className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
          Reintentar
        </button>
      </div>
    );
  }

  const metrics = [
    { label: "Paquetes hoy", value: data.today.total, tone: "text-primary" },
    { label: "En ruta", value: data.today.in_transit, tone: "text-route" },
    { label: "Entregados", value: data.today.delivered, tone: "text-delivered" },
    { label: "Con novedad", value: data.today.issue, tone: "text-pending" },
    { label: "Por cobrar", value: formatCOP(receivableTotal), tone: "text-purple-600" },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <header className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Resumen operativo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Indicadores de la operación de hoy.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${offline ? "bg-rose-500" : "bg-emerald-500"}`} />
            {offline ? "Sin conexión" : `Actualizado hace ${secondsSinceUpdate ?? 0}s`}
          </span>
          <button type="button" onClick={() => triggerLoad("manual")} disabled={refreshing} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-60 dark:border-[#2a2a3e]">
            {refreshing ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Indicadores de hoy">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <p className="text-sm text-slate-500 dark:text-slate-400">{metric.label}</p>
            <p className={`mt-2 text-2xl font-bold ${metric.tone}`}>{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">Acciones rápidas</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => router.push("/recogidas/nueva")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white">
            <ActionIcon path="M12 5v14M5 12h14" /> Nuevo ingreso
          </button>
          <button type="button" onClick={() => router.push("/novedades")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-[#2a2a3e]">
            <ActionIcon path="M12 3 22 20H2L12 3ZM12 9v5M12 17h.01" /> Novedades
          </button>
          <button type="button" onClick={() => router.push("/pagos")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-[#2a2a3e]">
            <ActionIcon path="M3 7h18v10H3V7Zm4 5h.01M17 12h.01M12 9.5v5" /> Conciliar pagos
          </button>
        </div>
      </section>
    </div>
  );
}
