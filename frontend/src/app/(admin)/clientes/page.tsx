"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import type {
  Client as BaseClient,
  ClientDetail,
  PaginatedResponse,
  ReceivableResponse,
  Shipment,
} from "@/lib/types";

type ClientRow = Partial<BaseClient> & {
  id: number;
  name: string;
  phone: string;
  billing_type: "cash_on_delivery" | "post_sale" | "prepaid";
  shipments_count?: number;
  shipments?: Shipment[];
};

type ClientForm = {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  nit: string;
  billing_type: "cash_on_delivery" | "post_sale" | "prepaid";
  notes: string;
};

const tabs = [
  { label: "Todos", value: "all" },
  { label: "Contra entrega", value: "cash_on_delivery" },
  { label: "Post-venta", value: "post_sale" },
  { label: "Prepago", value: "prepaid" },
] as const;

const formDefault: ClientForm = {
  id: 0,
  name: "",
  phone: "",
  email: "",
  company: "",
  nit: "",
  billing_type: "cash_on_delivery",
  notes: "",
};

const billingText: Record<ClientForm["billing_type"], string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Post-venta",
  prepaid: "Prepago",
};

const billingTooltip: Record<ClientForm["billing_type"], string> = {
  cash_on_delivery:
    "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente despues de la entrega",
  prepaid: "El cliente ya pago el envio",
};

export default function ClientesPage() {
  usePageTitle("Clientes | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalOwed, setTotalOwed] = useState(0);
  const [receivableMap, setReceivableMap] = useState<Record<number, number>>({});
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState<ClientForm>(formDefault);
  const [detail, setDetail] = useState<ClientDetail | null>(null);

  const loadReceivable = async () => {
    try {
      const response = await apiGet<ReceivableResponse>("/clients-receivable");
      setTotalOwed(response.total_owed || 0);
      const nextMap: Record<number, number> = {};
      for (const client of response.clients || []) nextMap[client.id] = client.total_owed;
      setReceivableMap(nextMap);
    } catch {
      setTotalOwed(0);
      setReceivableMap({});
    }
  };

  const loadClients = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (search.trim()) params.set("search", search.trim());
      if (tab !== "all") params.set("billing_type", tab);

      const response = await apiGet<PaginatedResponse<ClientRow>>(
        `/clients?${params.toString()}`
      );
      const data = (response.data || []).sort((a, b) => a.name.localeCompare(b.name));
      setRows(data);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudieron cargar clientes", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReceivable();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    void loadClients();
  };

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await apiSend(`/clients/${form.id}`, "PUT", form);
        showToast("Cliente actualizado", "success");
      } else {
        await apiSend("/clients", "POST", form);
        showToast("Cliente creado", "success");
      }
      closeModal();
      await Promise.all([loadClients(), loadReceivable()]);
    } catch {
      showToast("No se pudo guardar cliente", "error");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const response = await apiGet<ClientDetail>(`/clients/${id}`);
      setDetail(response);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const summary = useMemo(() => {
    const withDebt = rows.filter((item) => Number(receivableMap[item.id] || 0) > 0).length;
    return { active: rows.length, withDebt };
  }, [rows, receivableMap]);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Clientes</h1>
            <p className="text-sm text-slate-500">Gestion comercial y financiera</p>
          </div>
          <form
            onSubmit={submitSearch}
            className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente o empresa"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition-all duration-150 active:scale-95">
              Buscar
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(formDefault);
                setModal("create");
              }}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            >
              Nuevo cliente
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.value}
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
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Total clientes</p>
          <p className="mt-1 text-xl font-bold">{meta.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Activos</p>
          <p className="mt-1 text-xl font-bold text-delivered">{summary.active}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Con deuda</p>
          <p className="mt-1 text-xl font-bold text-pending">{summary.withDebt}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Total por cobrar</p>
          <p className="mt-1 text-xl font-bold text-purple-600">{formatCOP(totalOwed)}</p>
        </article>
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No hay clientes registrados para este filtro.</p>
          <button
            type="button"
            onClick={() => {
              setForm(formDefault);
              setModal("create");
            }}
            className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Crear primer cliente
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Mostrando {rows.length} de {meta.total} resultados
          </p>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Telefono</th>
                    <th className="px-3 py-3">Empresa</th>
                    <th className="px-3 py-3">Tipo pago</th>
                    <th className="px-3 py-3">Envios</th>
                    <th className="px-3 py-3">Deuda</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-semibold">{item.name}</td>
                      <td className="px-3 py-3">{item.phone}</td>
                      <td className="px-3 py-3">{item.company || "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          title={billingTooltip[item.billing_type]}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold"
                        >
                          {billingText[item.billing_type]}
                        </span>
                      </td>
                      <td className="px-3 py-3">{item.shipments_count || 0}</td>
                      <td className="px-3 py-3">{formatCOP(receivableMap[item.id] || 0)}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                          >
                            Detalle
                          </button>
                          <button
                            onClick={() => {
                              setForm({
                                id: item.id,
                                name: item.name,
                                phone: item.phone,
                                email: item.email || "",
                                company: item.company || "",
                                nit: item.nit || "",
                                billing_type: item.billing_type,
                                notes: item.notes || "",
                              });
                              setModal("edit");
                            }}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {rows.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.phone}</p>
                    <p className="text-xs text-slate-500">{item.company || "-"}</p>
                  </div>
                  <span
                    title={billingTooltip[item.billing_type]}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold"
                  >
                    {billingText[item.billing_type]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Envios: {item.shipments_count || 0} - Deuda: {formatCOP(receivableMap[item.id] || 0)}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openDetail(item.id)}
                    className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                  >
                    Detalle
                  </button>
                  <button
                    onClick={() => {
                      setForm({
                        id: item.id,
                        name: item.name,
                        phone: item.phone,
                        email: item.email || "",
                        company: item.company || "",
                        nit: item.nit || "",
                        billing_type: item.billing_type,
                        notes: item.notes || "",
                      });
                      setModal("edit");
                    }}
                    className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95"
                  >
                    Editar
                  </button>
                </div>
              </article>
            ))}
          </div>

          <Pagination
            currentPage={meta.current_page}
            lastPage={meta.last_page}
            onPageChange={setPage}
          />
        </>
      )}

      {modal === "create" || modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <form
            onSubmit={saveClient}
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold">
              {modal === "create" ? "Nuevo cliente" : "Editar cliente"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nombre"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="Telefono"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Email"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                value={form.company}
                onChange={(event) => setForm({ ...form, company: event.target.value })}
                placeholder="Empresa"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                value={form.nit}
                onChange={(event) => setForm({ ...form, nit: event.target.value })}
                placeholder="NIT"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <select
                value={form.billing_type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    billing_type: event.target.value as ClientForm["billing_type"],
                  })
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Post-venta</option>
                <option value="prepaid">Prepago</option>
              </select>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Notas"
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 transition-opacity duration-200 sm:items-center sm:p-4">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-xl">
            <h2 className="text-lg font-bold text-slate-900">{detail.name}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <strong>Telefono:</strong> {detail.phone || "-"}
              </p>
              <p>
                <strong>Empresa:</strong> {detail.company || "-"}
              </p>
              <p>
                <strong>NIT:</strong> {detail.nit || "-"}
              </p>
              <p>
                <strong>Tipo:</strong> {billingText[detail.billing_type]}
              </p>
            </div>
            {detail.financial_summary ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs text-slate-500">Envios</p>
                  <p className="font-semibold">{detail.financial_summary.total_shipments}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs text-slate-500">Deuda</p>
                  <p className="font-semibold">{formatCOP(detail.financial_summary.total_owed)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-2">
                  <p className="text-xs text-slate-500">Ingresos</p>
                  <p className="font-semibold">{formatCOP(detail.financial_summary.total_revenue)}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Ultimos envios</p>
              <ul className="mt-2 space-y-1 text-sm">
                {(detail.shipments || []).map((shipment) => (
                  <li key={shipment.id}>
                    {shipment.display_code} - {shipment.status} - {formatCOP(shipment.shipping_cost)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Direcciones</p>
              <ul className="mt-2 space-y-1 text-sm">
                {(detail.addresses || []).map((address, index) => (
                  <li key={`${address.label || "direccion"}-${index}`}>
                    {address.label || "Direccion"}: {address.address}
                    {address.zone ? ` (${address.zone})` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
