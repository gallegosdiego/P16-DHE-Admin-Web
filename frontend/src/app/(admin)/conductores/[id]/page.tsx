"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCOP, toTitle } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import type { DriverDetail, Shipment } from "@/lib/types";

type DriverDetailExt = DriverDetail & {
  shipments?: Array<Partial<Shipment> & { id: number; display_code: string }>;
};

export default function ConductorDetallePage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<DriverDetailExt | null>(null);

  usePageTitle(
    driver ? `${driver.name} | Conductores | Danhei Express` : "Conductor | Danhei Express"
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await apiGet<DriverDetailExt>(`/drivers/${params.id}`);
        setDriver(response);
      } finally {
        setLoading(false);
      }
    };
    if (params.id) void load();
  }, [params.id]);

  if (loading) return <Skeleton className="h-64" />;
  if (!driver) return <p className="text-sm text-slate-500">No se encontro el conductor.</p>;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="text-sm text-slate-500">
        <Link href="/conductores" className="hover:text-slate-700">
          Conductores
        </Link>{" "}
        &gt; <span className="text-slate-700">{driver.name}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {driver.initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{driver.name}</h1>
            <p className="text-sm text-slate-500">{driver.zone || "Sin zona"}</p>
          </div>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {toTitle(driver.status)}
          </span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Asignados</p>
          <p className="mt-1 text-xl font-bold">{driver.today_summary.assigned}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Entregados</p>
          <p className="mt-1 text-xl font-bold text-delivered">{driver.today_summary.delivered}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Recaudo pendiente</p>
          <p className="mt-1 text-xl font-bold text-pending">
            {formatCOP(driver.today_summary.pending_cash)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Dinero cobrado</p>
          <p className="mt-1 text-xl font-bold text-route">
            {formatCOP(driver.today_summary.cash_collected)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Ganancia del dia</p>
          <p className="mt-1 text-xl font-bold text-primary">
            {formatCOP(driver.today_summary.earnings)}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Envios asignados hoy</h2>
          <Link href="/conductores" className="text-sm font-medium text-primary">
            Volver a conductores
          </Link>
        </div>
        {!driver.shipments || !driver.shipments.length ? (
          <p className="text-sm text-slate-500">Sin envios asignados hoy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Guia</th>
                  <th className="py-2">Destinatario</th>
                  <th className="py-2">Direccion</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {driver.shipments.map((shipment) => (
                  <tr key={shipment.id} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">{shipment.display_code}</td>
                    <td className="py-2">{shipment.recipient_name}</td>
                    <td className="py-2">{shipment.recipient_address}</td>
                    <td className="py-2">{toTitle(shipment.status || "registered")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
