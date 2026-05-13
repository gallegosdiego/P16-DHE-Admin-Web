"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, toTitle } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { ShipmentTimeline } from "@/components/shipment-timeline";
import { PrintReceiptButton } from "@/components/print-receipt";
import { usePageTitle } from "@/lib/page-title";
import type {
  Client,
  Driver,
  PaginatedResponse,
  PaymentType,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
} from "@/lib/types";

type ShipmentListItem = Partial<Shipment> & {
  id: number;
  display_code: string;
  status: ShipmentStatus;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  driver_name?: string | null;
};

type ShipmentDetail = ShipmentListItem & {
  events?: Array<Partial<ShipmentEvent> & { id: number; occurred_at?: string }>;
};

const tabs: Array<{ label: string; value: "all" | ShipmentStatus }> = [
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
  in_transit: "animate-pulse bg-blue-50 text-route",
  delivered: "bg-emerald-50 text-delivered",
  issue: "bg-rose-50 text-issue",
  returned: "bg-slate-100 text-slate-700",
  cancelled: "bg-slate-100 text-slate-700",
};

const paymentLabel: Record<PaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Post-venta",
  prepaid: "Prepago",
};

const paymentTooltip: Record<PaymentType, string> = {
  cash_on_delivery:
    "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente despues de la entrega",
  prepaid: "El cliente ya pago el envio",
};

const defaultForm = {
  client_id: 0,
  recipient_name: "",
  recipient_phone: "",
  recipient_address: "",
  recipient_zone: "",
  payment_type: "cash_on_delivery" as PaymentType,
  shipping_cost: 11500,
  cod_amount: 0,
  driver_fee: 3000,
  driver_id: "",
  notes: "",
};

const getStatusAction = (status: ShipmentStatus) => {
  if (status === "in_transit") {
    return {
      next: "delivered" as ShipmentStatus,
      description: "Entregado",
      label: "Entregar",
    };
  }
  if (status === "issue") {
    return {
      next: "in_transit" as ShipmentStatus,
      description: "Reintento de entrega",
      label: "Reintentar",
    };
  }
  return null;
};

export default function PedidosPage() {
  usePageTitle("Pedidos | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [assignLoadingId, setAssignLoadingId] = useState<number | null>(null);
  const [shipments, setShipments] = useState<ShipmentListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tab, setTab] = useState<"all" | ShipmentStatus>("all");
  const [search, setSearch] = useState("");
  const [driverId, setDriverId] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [modal, setModal] = useState<"create" | "detail" | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [selected, setSelected] = useState<ShipmentDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchDriverId, setBatchDriverId] = useState("");
  const [batchStatus, setBatchStatus] = useState<ShipmentStatus>("in_transit");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const loadLookups = async () => {
    try {
      const [clientsRes, driversRes] = await Promise.all([
        apiGet<PaginatedResponse<Client> | Client[]>("/clients"),
        apiGet<PaginatedResponse<Driver> | Driver[]>("/drivers"),
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
      const response = await apiGet<PaginatedResponse<ShipmentListItem>>(
        `/shipments?${params.toString()}`
      );
      setShipments(response.data || []);
      setSelectedIds([]);
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
    void loadLookups();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, driverId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quickAction") === "new") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal("create");
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    void loadShipments();
  };

  const createShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
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
      showToast("Envio creado", "success");
      setModal(null);
      setForm(defaultForm);
      await loadShipments();
    } catch {
      showToast("No se pudo crear el envio", "error");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiGet<ShipmentDetail>(`/shipments/${id}`);
      setSelected(detail);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const changeStatus = async (id: number, status: ShipmentStatus, description: string) => {
    if (status === "returned" || status === "cancelled") {
      const shipment = shipments.find((item) => item.id === id);
      const ok = window.confirm(
        `Estas seguro de marcar ${shipment?.display_code || "este envio"} como ${toTitle(status)}? Esta accion no se puede deshacer.`
      );
      if (!ok) return;
    }
    try {
      setStatusLoadingId(id);
      await apiSend(`/shipments/${id}/status`, "POST", { status, description });
      showToast("Estado cambiado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo cambiar estado", "error");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const assignDriver = async (id: number, nextDriverId: number) => {
    try {
      setAssignLoadingId(id);
      await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: nextDriverId });
      showToast("Conductor asignado", "success");
      await loadShipments();
    } catch {
      showToast("No se pudo asignar conductor", "error");
    } finally {
      setAssignLoadingId(null);
    }
  };

  const summary = useMemo(() => {
    const zones = new Set(shipments.map((item) => item.recipient_zone || "Sin zona")).size;
    const assigned = shipments.filter((item) => item.driver_id).length;
    const receivable = shipments.reduce((sum, item) => sum + Number(item.cod_amount || 0), 0);
    return { zones, assigned, receivable };
  }, [shipments]);

  const allSelectedOnPage =
    shipments.length > 0 && shipments.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => prev.filter((id) => !shipments.some((item) => item.id === id)));
      return;
    }
    const ids = shipments.map((item) => item.id);
    setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const clearBatch = () => {
    setSelectedIds([]);
    setBatchProgress({ done: 0, total: 0 });
  };

  const runBatchAssign = async () => {
    if (!batchDriverId || selectedIds.length === 0) return;
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: selectedIds.length });
    let done = 0;
    for (const id of selectedIds) {
      try {
        await apiSend(`/shipments/${id}/assign`, "POST", { driver_id: Number(batchDriverId) });
      } catch {
        // continue batch
      } finally {
        done += 1;
        setBatchProgress({ done, total: selectedIds.length });
      }
    }
    showToast(`${selectedIds.length} envio(s) actualizados`, "success");
    clearBatch();
    setBatchLoading(false);
    await loadShipments();
  };

  const runBatchStatus = async () => {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: selectedIds.length });
    let done = 0;
    for (const id of selectedIds) {
      try {
        await apiSend(`/shipments/${id}/status`, "POST", {
          status: batchStatus,
          description: `Cambio masivo a ${toTitle(batchStatus)}`,
        });
      } catch {
        // continue batch
      } finally {
        done += 1;
        setBatchProgress({ done, total: selectedIds.length });
      }
    }
    showToast(`${selectedIds.length} envio(s) actualizados`, "success");
    clearBatch();
    setBatchLoading(false);
    await loadShipments();
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Pedidos</h1>
            <p className="text-sm text-slate-500">Gestion operativa de envios</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar guia, cliente o direccion"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition-all duration-150 active:scale-95">
              Buscar
            </button>
            <button
              type="button"
              onClick={() => setModal("create")}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo pedido
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setTab(item.value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${
              tab === item.value
                ? "bg-primary/10 text-primary"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
        <select
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
          className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="all">Todos los conductores</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Pedidos filtrados</p>
          <p className="mt-1 text-xl font-bold">{meta.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Zonas activas</p>
          <p className="mt-1 text-xl font-bold text-route">{summary.zones}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Asignados</p>
          <p className="mt-1 text-xl font-bold text-delivered">{summary.assigned}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Por cobrar</p>
          <p className="mt-1 text-xl font-bold text-purple-600">{formatCOP(summary.receivable)}</p>
        </article>
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No hay pedidos para este filtro.
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Mostrando {shipments.length} de {meta.total} resultados
          </p>
          {selectedIds.length > 0 ? (
            <p className="text-sm font-semibold text-primary">{selectedIds.length} seleccionados</p>
          ) : null}

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1150px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-3">Guia</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Direccion</th>
                    <th className="px-3 py-3">Zona</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Conductor</th>
                    <th className="px-3 py-3">Pago</th>
                    <th className="px-3 py-3">Hora</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((item) => {
                    const action = getStatusAction(item.status);
                    return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelectOne(item.id)}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold">{item.display_code}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">
                          {item.client_name || item.client?.name || item.recipient_name || "Cliente"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.client_phone || item.client?.phone || item.recipient_phone || "--"}
                        </p>
                      </td>
                      <td className="px-3 py-3">{item.recipient_address}</td>
                      <td className="px-3 py-3">{item.recipient_zone}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            statusBadge[item.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {toTitle(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {item.driver_name || item.driver?.name || "Sin asignar"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                            className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            {paymentLabel[item.payment_type || "cash_on_delivery"]}
                          </span>
                          <span>{formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                          >
                            Detalle
                          </button>
                          {action ? (
                            <button
                              disabled={statusLoadingId === item.id}
                              onClick={() =>
                                changeStatus(item.id, action.next, action.description)
                              }
                              className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                            >
                              {statusLoadingId === item.id ? "Guardando..." : action.label}
                            </button>
                          ) : (
                            <span className="inline-flex min-h-11 items-center rounded border border-slate-200 px-2 py-1 text-xs text-slate-400">
                              Sin accion
                            </span>
                          )}
                          {drivers[0] ? (
                            <button
                              disabled={assignLoadingId === item.id}
                              onClick={() => assignDriver(item.id, drivers[0].id)}
                              className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                            >
                              {assignLoadingId === item.id ? "Guardando..." : "Asignar"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {shipments.map((item) => {
              const action = getStatusAction(item.status);
              return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md"
              >
                <label className="mb-2 inline-flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelectOne(item.id)}
                  />
                  Seleccionar
                </label>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.display_code}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      statusBadge[item.status] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {toTitle(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {item.client_name || item.recipient_name}
                </p>
                <p className="text-xs text-slate-500">{item.recipient_address}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    {paymentLabel[item.payment_type || "cash_on_delivery"]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.driver_name || item.driver?.name || "Sin asignar"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openDetail(item.id)}
                    className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                  >
                    Detalle
                  </button>
                  {action ? (
                    <button
                      disabled={statusLoadingId === item.id}
                      onClick={() => changeStatus(item.id, action.next, action.description)}
                      className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 disabled:opacity-60"
                    >
                      {statusLoadingId === item.id ? "Guardando..." : action.label}
                    </button>
                  ) : (
                    <span className="inline-flex min-h-11 items-center rounded border border-slate-200 px-2 py-1 text-xs text-slate-400">
                      Sin accion
                    </span>
                  )}
                </div>
              </article>
              );
            })}
          </div>

          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {modal === "create" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={createShipment}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold">Nuevo pedido</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                required
                value={form.client_id}
                onChange={(event) => setForm({ ...form, client_id: Number(event.target.value) })}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value={0}>Selecciona cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <input
                required
                value={form.recipient_name}
                onChange={(event) => setForm({ ...form, recipient_name: event.target.value })}
                placeholder="Destinatario"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                required
                value={form.recipient_phone}
                onChange={(event) => setForm({ ...form, recipient_phone: event.target.value })}
                placeholder="Telefono destinatario"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                required
                value={form.recipient_zone}
                onChange={(event) => setForm({ ...form, recipient_zone: event.target.value })}
                placeholder="Zona"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                required
                value={form.recipient_address}
                onChange={(event) => setForm({ ...form, recipient_address: event.target.value })}
                placeholder="Direccion"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2"
              />
              <select
                value={form.payment_type}
                onChange={(event) =>
                  setForm({ ...form, payment_type: event.target.value as PaymentType })
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Post-venta</option>
                <option value="prepaid">Prepago</option>
              </select>
              <input
                type="number"
                value={form.shipping_cost}
                onChange={(event) => setForm({ ...form, shipping_cost: Number(event.target.value) })}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="Costo envio"
              />
              <input
                type="number"
                value={form.cod_amount}
                onChange={(event) => setForm({ ...form, cod_amount: Number(event.target.value) })}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="Monto COD"
              />
              <input
                type="number"
                value={form.driver_fee}
                onChange={(event) => setForm({ ...form, driver_fee: Number(event.target.value) })}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                placeholder="Pago conductor"
              />
              <select
                value={form.driver_id}
                onChange={(event) => setForm({ ...form, driver_id: event.target.value })}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2"
              >
                <option value="">Sin asignar</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Observaciones"
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Crear envio"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl">
            <h2 className="text-lg font-bold">{selected.display_code}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <strong>Cliente:</strong>{" "}
                {selected.client_name || selected.client?.name || selected.recipient_name}
              </p>
              <p>
                <strong>Conductor:</strong>{" "}
                {selected.driver_name || selected.driver?.name || "Sin asignar"}
              </p>
              <p className="sm:col-span-2">
                <strong>Direccion:</strong> {selected.recipient_address}
              </p>
              <p>
                <strong>Estado:</strong> {toTitle(selected.status)}
              </p>
              <p>
                <strong>Monto:</strong> {formatCOP(Number(selected.cod_amount || selected.shipping_cost || 0))}
              </p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Timeline</p>
              <ShipmentTimeline
                events={(selected.events || []).map((event) => ({
                  id: event.id,
                  shipment_id: selected.id,
                  user_id: 0,
                  from_status: event.from_status || null,
                  to_status: event.to_status || selected.status,
                  description: event.description || "Cambio de estado",
                  metadata: null,
                  occurred_at:
                    event.occurred_at || selected.created_at || new Date().toISOString(),
                }))}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <PrintReceiptButton shipment={selected} />
              <button
                onClick={() => setModal(null)}
                className="ml-2 min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {selectedIds.length} seleccionados
              {batchLoading ? ` - Procesando ${batchProgress.done}/${batchProgress.total}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={batchDriverId}
                onChange={(event) => setBatchDriverId(event.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">Asignar conductor...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={batchLoading || !batchDriverId}
                onClick={() => void runBatchAssign()}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                Asignar conductor
              </button>
              <select
                value={batchStatus}
                onChange={(event) => setBatchStatus(event.target.value as ShipmentStatus)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="in_transit">En ruta</option>
                <option value="delivered">Entregado</option>
                <option value="issue">Novedad</option>
                <option value="returned">Devuelto</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <button
                type="button"
                disabled={batchLoading}
                onClick={() => void runBatchStatus()}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                Cambiar estado
              </button>
              <button
                type="button"
                disabled={batchLoading}
                onClick={clearBatch}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
