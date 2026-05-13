"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";

type Shipment = {
  id: number;
  display_code: string;
  client_id?: number;
  client_name?: string;
  client_phone?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_zone?: string;
  status: string;
  driver_id?: number | null;
  driver_name?: string | null;
  payment_type: string;
  shipping_cost?: number;
  cod_amount?: number;
  created_at?: string;
  issue_note?: string;
  notes?: string;
  events?: Array<{ id: number; status: string; description?: string; created_at: string }>;
};

type Client = { id: number; name: string; phone?: string };
type Driver = { id: number; name: string; initials?: string };

const tabs = [
  { label: "Todos", value: "all" },
  { label: "En ruta", value: "in_transit" },
  { label: "Pendiente", value: "registered" },
  { label: "Novedad", value: "issue" },
  { label: "Entregado", value: "delivered" },
];

const statusBadge: Record<string, string> = {
  registered: "bg-amber-50 text-pending",
  confirmed: "bg-blue-50 text-route",
  pickup_scheduled: "bg-blue-50 text-route",
  picked_up: "bg-blue-50 text-route",
  in_warehouse: "bg-purple-50 text-purple-700",
  assigned_to_route: "bg-blue-50 text-route",
  in_transit: "bg-blue-50 text-route",
  delivered: "bg-emerald-50 text-delivered",
  issue: "bg-rose-50 text-issue",
  returned: "bg-slate-100 text-slate-700",
  cancelled: "bg-slate-100 text-slate-700",
};

const defaultForm = {
  client_id: 0,
  recipient_name: "",
  recipient_phone: "",
  recipient_address: "",
  recipient_zone: "",
  payment_type: "cash_on_delivery",
  shipping_cost: 11500,
  cod_amount: 0,
  driver_fee: 3000,
  driver_id: "",
  notes: "",
};

export default function PedidosPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [driverId, setDriverId] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [modal, setModal] = useState<"create" | "detail" | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [selected, setSelected] = useState<Shipment | null>(null);

  const loadLookups = async () => {
    try {
      const [clientsRes, driversRes] = await Promise.all([
        apiGet<{ data?: Client[] } | Client[]>("/clients"),
        apiGet<{ data?: Driver[] } | Driver[]>("/drivers"),
      ]);
      setClients(Array.isArray(clientsRes) ? clientsRes : clientsRes.data || []);
      setDrivers(Array.isArray(driversRes) ? driversRes : driversRes.data || []);
    } catch {
      setClients([]);
      setDrivers([]);
    }
  };

  const loadShipments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (tab !== "all") params.set("status", tab);
      if (search.trim()) params.set("search", search.trim());
      if (driverId !== "all") params.set("driver_id", driverId);
      const response = await apiGet<{
        data?: Shipment[];
        current_page?: number;
        last_page?: number;
        total?: number;
      }>(`/shipments?${params.toString()}`);
      setShipments(response.data || []);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setShipments([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudo cargar pedidos", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLookups();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, driverId]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    loadShipments();
  };

  const createShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await apiSend("/shipments", "POST", {
        client_id: Number(form.client_id),
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        recipient_address: form.recipient_address,
        recipient_zone: form.recipient_zone,
        payment_type: form.payment_type,
        shipping_cost: Number(form.shipping_cost),
        cod_amount: Number(form.cod_amount),
        driver_fee: Number(form.driver_fee),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        notes: form.notes,
      });
      showToast("Envío creado", "success");
      setModal(null);
      setForm(defaultForm);
      loadShipments();
    } catch {
      showToast("No se pudo crear el envío", "error");
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<Shipment>(`/shipments/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const changeStatus = async (id: number, status: string, description: string) => {
    try {
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Estado cambiado", "success");
      loadShipments();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    }
  };

  const assignDriver = async (id: number, nextDriverId: number) => {
    try {
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast("Conductor asignado", "success");
      loadShipments();
    } catch {
      showToast("No se pudo asignar conductor", "error");
    }
  };

  const summary = useMemo(() => {
    const zones = new Set(shipments.map((item) => item.recipient_zone || "Sin zona")).size;
    const assigned = shipments.filter((item) => item.driver_id).length;
    const receivable = shipments.reduce((sum, item) => sum + Number(item.cod_amount || 0), 0);
    return { zones, assigned, receivable };
  }, [shipments]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Pedidos</h1>
            <p className="text-sm text-slate-500">Gestión operativa de envíos</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar guía, cliente o dirección" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm">Buscar</button>
            <button type="button" onClick={() => setModal("create")} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Nuevo pedido</button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item.value} type="button" onClick={() => { setTab(item.value); setPage(1); }} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === item.value ? "bg-primary/10 text-primary" : "border border-slate-200 bg-white text-slate-600"}`}>
            {item.label}
          </button>
        ))}
        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="all">Todos los conductores</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </select>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Pedidos filtrados</p><p className="mt-1 text-xl font-bold">{meta.total}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Zonas activas</p><p className="mt-1 text-xl font-bold text-route">{summary.zones}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Asignados</p><p className="mt-1 text-xl font-bold text-delivered">{summary.assigned}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Por cobrar</p><p className="mt-1 text-xl font-bold text-purple-600">{formatCOP(summary.receivable)}</p></article>
      </section>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : shipments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay pedidos para este filtro.</div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Guía</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Dirección</th><th className="px-3 py-3">Zona</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Conductor</th><th className="px-3 py-3">Pago</th><th className="px-3 py-3">Hora</th><th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-semibold">{item.display_code}</td>
                      <td className="px-3 py-3"><p className="font-semibold">{item.client_name || item.recipient_name || "Cliente"}</p><p className="text-xs text-slate-500">{item.client_phone || item.recipient_phone || "--"}</p></td>
                      <td className="px-3 py-3">{item.recipient_address}</td>
                      <td className="px-3 py-3">{item.recipient_zone}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge[item.status] || "bg-slate-100 text-slate-700"}`}>{toTitle(item.status)}</span></td>
                      <td className="px-3 py-3">{item.driver_name || "Sin asignar"}</td>
                      <td className="px-3 py-3">{formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}</td>
                      <td className="px-3 py-3">{item.created_at ? formatDate(item.created_at) : "--"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => openDetail(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button>
                          <button onClick={() => changeStatus(item.id, "delivered", "Entregado")} className="rounded border border-slate-300 px-2 py-1 text-xs">Estado</button>
                          {drivers[0] ? <button onClick={() => assignDriver(item.id, drivers[0].id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Asignar</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-2 lg:hidden">
            {shipments.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{item.display_code}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge[item.status] || "bg-slate-100 text-slate-700"}`}>{toTitle(item.status)}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">{item.client_name || item.recipient_name}</p>
                <p className="text-xs text-slate-500">{item.recipient_address}</p>
                <p className="mt-1 text-xs text-slate-500">{item.driver_name || "Sin asignar"} · {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => openDetail(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button>
                  <button onClick={() => changeStatus(item.id, "delivered", "Entregado")} className="rounded border border-slate-300 px-2 py-1 text-xs">Entregar</button>
                </div>
              </article>
            ))}
          </div>
          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {modal === "create" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={createShipment} className="w-full max-w-2xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">Nuevo pedido</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: Number(e.target.value) })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
                <option value={0}>Selecciona cliente</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <input required value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Destinatario" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} placeholder="Teléfono destinatario" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.recipient_zone} onChange={(e) => setForm({ ...form, recipient_zone: e.target.value })} placeholder="Zona" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.recipient_address} onChange={(e) => setForm({ ...form, recipient_address: e.target.value })} placeholder="Dirección" className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
              <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Post-venta</option>
                <option value="prepaid">Prepago</option>
              </select>
              <input type="number" value={form.shipping_cost} onChange={(e) => setForm({ ...form, shipping_cost: Number(e.target.value) })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Costo envío" />
              <input type="number" value={form.cod_amount} onChange={(e) => setForm({ ...form, cod_amount: Number(e.target.value) })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Monto COD" />
              <input type="number" value={form.driver_fee} onChange={(e) => setForm({ ...form, driver_fee: Number(e.target.value) })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Pago conductor" />
              <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2">
                <option value="">Sin asignar</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones" className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
              <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Crear envío</button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">{selected.display_code}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p><strong>Cliente:</strong> {selected.client_name || selected.recipient_name}</p>
              <p><strong>Conductor:</strong> {selected.driver_name || "Sin asignar"}</p>
              <p className="sm:col-span-2"><strong>Dirección:</strong> {selected.recipient_address}</p>
              <p><strong>Estado:</strong> {toTitle(selected.status)}</p>
              <p><strong>Monto:</strong> {formatCOP(Number(selected.cod_amount || selected.shipping_cost || 0))}</p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Timeline</p>
              <ul className="mt-2 space-y-2 text-sm">
                {(selected.events || []).map((event) => (
                  <li key={event.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="font-medium">{toTitle(event.status)}</p>
                    <p className="text-xs text-slate-500">{event.description || "Sin descripción"} · {formatDate(event.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-end"><button onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cerrar</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
