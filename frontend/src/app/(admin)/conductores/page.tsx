"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

type Driver = {
  id: number;
  name: string;
  initials: string;
  phone: string;
  vehicle: string;
  plate: string;
  zone: string;
  status: "active" | "inactive" | "route";
  active_shipments_count: number;
  delivered_today_count: number;
};

type DriverDetail = Driver & {
  today_summary?: {
    assigned: number;
    delivered: number;
    cash_collected: number;
    pending_cash: number;
    earnings: number;
  };
};

const formDefault = {
  id: 0,
  name: "",
  phone: "",
  vehicle: "",
  plate: "",
  zone: "",
  per_package_rate: 3000,
};

export default function ConductoresPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState(formDefault);
  const [selected, setSelected] = useState<DriverDetail | null>(null);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await apiGet<{ data?: Driver[] } | Driver[]>(`/drivers${params.toString() ? `?${params.toString()}` : ""}`);
      setDrivers(Array.isArray(response) ? response : response.data || []);
    } catch {
      setDrivers([]);
      showToast("No se pudieron cargar conductores", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const summary = useMemo(() => {
    return {
      active: drivers.filter((driver) => driver.status !== "inactive").length,
      assigned: drivers.reduce((sum, driver) => sum + Number(driver.active_shipments_count || 0), 0),
      delivered: drivers.reduce((sum, driver) => sum + Number(driver.delivered_today_count || 0), 0),
    };
  }, [drivers]);

  const submitDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (form.id) {
        await apiSend(`/drivers/${form.id}`, "PUT", form);
        showToast("Conductor actualizado", "success");
      } else {
        await apiSend("/drivers", "POST", form);
        showToast("Conductor creado", "success");
      }
      setModal(null);
      setForm(formDefault);
      loadDrivers();
    } catch {
      showToast("No se pudo guardar conductor", "error");
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      await apiSend(`/drivers/${id}/toggle-status`, "POST", {});
      showToast("Estado del conductor actualizado", "success");
      loadDrivers();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<DriverDetail>(`/drivers/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-lg font-bold text-slate-900">Conductores</h1><p className="text-sm text-slate-500">Equipo operativo con datos en tiempo real.</p></div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option>
          </select>
          <button onClick={() => { setForm(formDefault); setModal("create"); }} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Nuevo conductor</button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Activos</p><p className="mt-1 text-xl font-bold text-delivered">{summary.active}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Pedidos asignados</p><p className="mt-1 text-xl font-bold text-route">{summary.assigned}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Entregas hoy</p><p className="mt-1 text-xl font-bold text-primary">{summary.delivered}</p></article>
      </section>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : drivers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay conductores para este filtro.</div>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drivers.map((driver) => (
            <article key={driver.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{driver.initials}</div>
                  <div>
                    <p className="font-semibold text-slate-900">{driver.name}</p>
                    <p className="text-xs text-slate-500">{driver.phone}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${driver.status === "inactive" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-delivered"}`}>
                  {driver.status === "inactive" ? "Inactivo" : "Activo"}
                </span>
              </div>
              <div className="mt-3 text-sm text-slate-700">
                <p><strong>Vehículo:</strong> {driver.vehicle}</p>
                <p><strong>Placa:</strong> {driver.plate}</p>
                <p><strong>Zona:</strong> {driver.zone}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1">Asignados: {driver.active_shipments_count}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Entregados: {driver.delivered_today_count}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => openDetail(driver.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button>
                <button onClick={() => { setForm({ id: driver.id, name: driver.name, phone: driver.phone, vehicle: driver.vehicle, plate: driver.plate, zone: driver.zone, per_package_rate: 3000 }); setModal("edit"); }} className="rounded border border-slate-300 px-2 py-1 text-xs">Editar</button>
                <button onClick={() => toggleStatus(driver.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">{driver.status === "inactive" ? "Activar" : "Inactivar"}</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {(modal === "create" || modal === "edit") ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={submitDriver} className="w-full max-w-xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">{modal === "create" ? "Nuevo conductor" : "Editar conductor"}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="Vehículo" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="Placa" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Zona base" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input type="number" value={form.per_package_rate} onChange={(e) => setForm({ ...form, per_package_rate: Number(e.target.value) })} placeholder="Tarifa por paquete" className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Guardar</button></div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p><strong>Teléfono:</strong> {selected.phone}</p><p><strong>Vehículo:</strong> {selected.vehicle}</p>
              <p><strong>Placa:</strong> {selected.plate}</p><p><strong>Zona:</strong> {selected.zone}</p>
            </div>
            {selected.today_summary ? (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-900">Resumen del día</p>
                <p>Asignados: {selected.today_summary.assigned}</p>
                <p>Entregados: {selected.today_summary.delivered}</p>
                <p>Recaudado: {formatCOP(selected.today_summary.cash_collected)}</p>
                <p>Pendiente recaudo: {formatCOP(selected.today_summary.pending_cash)}</p>
                <p>Ganancia: {formatCOP(selected.today_summary.earnings)}</p>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end"><button onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cerrar</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
