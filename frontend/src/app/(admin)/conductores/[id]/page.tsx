"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, toTitle } from "@/lib/utils";
import { Skeleton } from "@/components/skeleton";
import { usePageTitle } from "@/lib/page-title";
import { PrintReceiptButton } from "@/components/print-receipt";
import type { DriverDetail, PaginatedResponse, Shipment, ShipmentStatus } from "@/lib/types";

type DriverDetailExt = DriverDetail & {
  shipments?: Array<Partial<Shipment> & { id: number; display_code: string }>;
};

type ShipmentLite = Partial<Shipment> & { id: number; display_code: string; status: ShipmentStatus };

const statusBadge: Record<string, string> = {
  delivered: "bg-emerald-50 text-delivered",
  in_transit: "bg-blue-50 text-route",
  issue: "bg-rose-50 text-issue",
  registered: "bg-amber-50 text-pending",
};

export default function ConductorDetallePage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<DriverDetailExt | null>(null);
  const [tab, setTab] = useState<"all" | "delivered" | "pending" | "issue">("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigned, setUnassigned] = useState<ShipmentLite[]>([]);
  const [selectedShipment, setSelectedShipment] = useState("");

  usePageTitle(
    driver ? `${driver.name} | Conductores | Danhei Express` : "Conductor | Danhei Express"
  );

  const loadDriver = async () => {
    setLoading(true);
    try {
      const response = await apiGet<DriverDetailExt>(`/drivers/${params.id}`);
      setDriver(response);
    } finally {
      setLoading(false);
    }
  };

  const loadUnassigned = async () => {
    try {
      const response = await apiGet<PaginatedResponse<ShipmentLite>>(
        "/shipments?status=registered&per_page=50"
      );
      setUnassigned((response.data || []).filter((item) => !item.driver_id));
    } catch {
      setUnassigned([]);
    }
  };

  useEffect(() => {
    if (params.id) void loadDriver();
  }, [params.id]);

  const filteredShipments = useMemo(() => {
    const list = (driver?.shipments || []) as ShipmentLite[];
    if (tab === "all") return list;
    if (tab === "delivered") return list.filter((item) => item.status === "delivered");
    if (tab === "issue") return list.filter((item) => item.status === "issue");
    return list.filter((item) => item.status !== "delivered");
  }, [driver?.shipments, tab]);

  const metrics = useMemo(() => {
    const assigned = Number(driver?.today_summary.assigned || 0);
    const delivered = Number(driver?.today_summary.delivered || 0);
    const rate = assigned > 0 ? Math.round((delivered / assigned) * 100) : 0;
    const cash = Number(driver?.today_summary.cash_collected || 0);
    const pending = Number(driver?.today_summary.pending_cash || 0);
    const total = cash + pending;
    const cashPercent = total > 0 ? Math.round((cash / total) * 100) : 0;
    const issues = ((driver?.shipments || []) as ShipmentLite[]).filter((item) => item.status === "issue").length;
    return { rate, cashPercent, issues };
  }, [driver]);

  const assignShipment = async () => {
    if (!driver || !selectedShipment) return;
    setAssigning(true);
    try {
      await apiSend(`/shipments/${selectedShipment}/assign`, "POST", { driver_id: driver.id });
      setAssignOpen(false);
      setSelectedShipment("");
      await loadDriver();
    } finally {
      setAssigning(false);
    }
  };

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
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Asignados</p><p className="mt-1 text-xl font-bold">{driver.today_summary.assigned}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Entregados</p><p className="mt-1 text-xl font-bold text-delivered">{driver.today_summary.delivered}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Recaudo pendiente</p><p className="mt-1 text-xl font-bold text-pending">{formatCOP(driver.today_summary.pending_cash)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Dinero cobrado</p><p className="mt-1 text-xl font-bold text-route">{formatCOP(driver.today_summary.cash_collected)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Ganancia del dia</p><p className="mt-1 text-xl font-bold text-primary">{formatCOP(driver.today_summary.earnings)}</p></article>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Tasa de entrega</p>
          <p className="mt-1 text-xl font-bold">{metrics.rate}%</p>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${metrics.rate}%` }} />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Recaudo</p>
          <p className="mt-1 text-xl font-bold">{metrics.cashPercent}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-2 bg-delivered" style={{ width: `${metrics.cashPercent}%` }} />
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Novedades</p>
          <p className={`mt-1 text-xl font-bold ${metrics.issues > 0 ? "text-issue" : ""}`}>{metrics.issues}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Envios asignados hoy</h2>
          <div className="flex gap-2">
            <button onClick={() => { setAssignOpen(true); void loadUnassigned(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm">Asignar envio</button>
            <Link href="/conductores" className="text-sm font-medium text-primary self-center">Volver a conductores</Link>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setTab("all")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "all" ? "bg-primary/10 text-primary" : "border border-slate-200"}`}>Todos</button>
          <button onClick={() => setTab("delivered")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "delivered" ? "bg-primary/10 text-primary" : "border border-slate-200"}`}>Entregados</button>
          <button onClick={() => setTab("pending")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "pending" ? "bg-primary/10 text-primary" : "border border-slate-200"}`}>Pendientes</button>
          <button onClick={() => setTab("issue")} className={`rounded-full px-3 py-1.5 text-sm ${tab === "issue" ? "bg-primary/10 text-primary" : "border border-slate-200"}`}>Novedad</button>
        </div>
        {filteredShipments.length === 0 ? (
          <p className="text-sm text-slate-500">Sin envios asignados hoy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Guia</th><th className="py-2">Destinatario</th><th className="py-2">Direccion</th><th className="py-2">Estado</th><th className="py-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map((shipment) => (
                  <tr key={shipment.id} className="border-t border-slate-100">
                    <td className="py-2 font-semibold">{shipment.display_code}</td>
                    <td className="py-2">{shipment.recipient_name}</td>
                    <td className="py-2">{shipment.recipient_address}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${statusBadge[shipment.status] || "bg-slate-100 text-slate-700"}`}>
                        {toTitle(shipment.status || "registered")}
                      </span>
                    </td>
                    <td className="py-2"><PrintReceiptButton shipment={shipment} label="Imprimir guia" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assignOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <h3 className="text-lg font-bold">Asignar envio</h3>
            <p className="mt-1 text-sm text-slate-500">Selecciona un envio sin conductor asignado.</p>
            <select value={selectedShipment} onChange={(e) => setSelectedShipment(e.target.value)} className="mt-3 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="">Seleccionar envio</option>
              {unassigned.map((item) => (
                <option key={item.id} value={item.id}>{item.display_code} - {item.recipient_name}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAssignOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
              <button disabled={!selectedShipment || assigning} onClick={() => void assignShipment()} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{assigning ? "Asignando..." : "Asignar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

