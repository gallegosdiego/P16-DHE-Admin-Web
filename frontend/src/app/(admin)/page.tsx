"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { lineChartPoints, timelineSeed } from "@/lib/mock-data";
import { Skeleton } from "@/components/skeleton";

type DashboardResponse = {
  today: {
    total: number;
    in_transit: number;
    delivered: number;
    issue: number;
    registered: number;
    confirmed: number;
    returned: number;
    cancelled: number;
    pickup_scheduled?: number;
    picked_up?: number;
    in_warehouse?: number;
    assigned_to_route?: number;
  };
  financial: {
    cod_pending: number;
    cod_collected: number;
    post_sale_owed: number;
    today_revenue: number;
    today_driver_cost: number;
    today_profit: number;
  };
  week?: { total: number };
};

function ChartLine() {
  const width = 760;
  const height = 230;
  const padding = { top: 18, right: 18, bottom: 34, left: 38 };
  const maxValue = 100;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coords = lineChartPoints.map((point, index) => {
    const x = padding.left + (index / (lineChartPoints.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (point.value / maxValue) * plotHeight;
    return { ...point, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${padding.left + plotWidth},${padding.top + plotHeight}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Entregas por hora">
      {[0, 20, 40, 60, 80, 100].map((value) => {
        const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
        return <g key={value}><line x1={padding.left} y1={y} x2={padding.left + plotWidth} y2={y} className="stroke-slate-200" /><text x={4} y={y + 4} className="fill-slate-400 text-[10px]">{value}</text></g>;
      })}
      <polygon points={area} className="fill-primary/10" />
      <polyline points={line} className="fill-none stroke-primary stroke-2" />
      {coords.map((point) => <circle key={point.hour} cx={point.x} cy={point.y} r="3" className="fill-primary" />)}
      {coords.filter((_, index) => index % 2 === 0).map((point) => <text key={point.hour} x={point.x - 14} y={height - 8} className="fill-slate-400 text-[10px]">{point.hour}</text>)}
    </svg>
  );
}

const fallback: DashboardResponse = {
  today: {
    total: 7,
    in_transit: 2,
    delivered: 3,
    issue: 1,
    registered: 1,
    confirmed: 0,
    returned: 0,
    cancelled: 0,
  },
  financial: {
    cod_pending: 97000,
    cod_collected: 45000,
    post_sale_owed: 44100,
    today_revenue: 82100,
    today_driver_cost: 21000,
    today_profit: 61100,
  },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await apiGet<DashboardResponse>("/dashboard");
        setData(response);
      } catch {
        setData(fallback);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const receivable = data.financial.cod_pending + data.financial.post_sale_owed;

  const distribution = useMemo(() => {
    const today = data.today;
    return [
      { label: "Registrados", value: today.registered || 0, color: "#9333ea" },
      { label: "En ruta", value: today.in_transit || 0, color: "#1f86ff" },
      { label: "Entregados", value: today.delivered || 0, color: "#12a85f" },
      { label: "Novedad", value: today.issue || 0, color: "#e72256" },
      { label: "Devueltos", value: today.returned || 0, color: "#94a3b8" },
      { label: "Cancelados", value: today.cancelled || 0, color: "#64748b" },
    ];
  }, [data]);

  const total = distribution.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const slices = distribution
    .map((item) => {
      const start = total ? (cursor / total) * 100 : 0;
      cursor += item.value;
      const end = total ? (cursor / total) * 100 : 0;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  const kpis = [
    { title: "Paquetes hoy", value: data.today.total, color: "text-primary" },
    { title: "En ruta", value: data.today.in_transit, color: "text-route" },
    { title: "Entregados", value: data.today.delivered, color: "text-delivered" },
    { title: "Con novedad", value: data.today.issue, color: "text-pending" },
    { title: "Por cobrar", value: formatCOP(receivable), color: "text-purple-600" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <article key={kpi.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{kpi.title}</p>
            <p className={`mt-3 text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Entregas por hora</h2>
          <p className="text-sm text-slate-500">Gráfica temporal (demo mientras llega endpoint dedicado)</p>
          <div className="mt-3 overflow-x-auto"><div className="min-w-[640px]"><ChartLine /></div></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Distribución por estado</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-28 w-28 items-center justify-center rounded-full text-lg font-bold text-slate-900" style={{ background: total ? `conic-gradient(${slices})` : "#eef1f5" }}>{data.today.delivered}</div>
            <div className="space-y-2">
              {distribution.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Eventos recientes</h2>
          <div className="mt-3 space-y-3">
            {timelineSeed.slice(0, 6).map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-200" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-600">{item.detail}</p>
                </div>
                <span className="text-xs text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Acciones rápidas</h2>
          <div className="mt-3 space-y-2">
            <button className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Nuevo pedido</button>
            <button className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Ver novedades</button>
            <button className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Conciliar pagos</button>
          </div>
        </article>
      </section>
    </div>
  );
}
