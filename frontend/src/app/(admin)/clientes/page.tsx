"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
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
  { label: "Cobro post entrega", value: "post_sale" },
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
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
};

const billingTooltip: Record<ClientForm["billing_type"], string> = {
  cash_on_delivery:
    "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente despues de la entrega",
  prepaid: "El cliente ya pagó el envío",
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
  const [detailTab, setDetailTab] = useState<"resumen" | "envios" | "direcciones">("resumen");
  const [detailShipments, setDetailShipments] = useState<Shipment[]>([]);
  const [detailShipMeta, setDetailShipMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [detailShipLoading, setDetailShipLoading] = useState(false);
  const [detailShipError, setDetailShipError] = useState("");

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
    void loadClients();
  };

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
    setDetail(null);
    setDetailShipments([]);
    setDetailShipMeta({ current_page: 1, last_page: 1, total: 0 });
    setDetailShipError("");
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
      setDetailTab("resumen");
      void loadClientShipments(id, 1);
      setModal("detail");
    } catch {
      showToast("No se pudo cargar detalle", "error");
    }
  };

  const loadClientShipments = async (clientId: number, targetPage: number) => {
    setDetailShipLoading(true);
    setDetailShipError("");
    try {
      const response = await apiGet<PaginatedResponse<Shipment>>(
        `/shipments?client_id=${clientId}&page=${targetPage}&per_page=10`
      );
      setDetailShipments(response.data || []);
      setDetailShipMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setDetailShipments([]);
      setDetailShipMeta({ current_page: 1, last_page: 1, total: 0 });
      setDetailShipError("No se pudieron cargar envíos del cliente.");
    } finally {
      setDetailShipLoading(false);
    }
  };

  const summary = useMemo(() => {
    const withDebt = rows.filter((item) => Number(receivableMap[item.id] || 0) > 0).length;
    return { active: rows.length, withDebt };
  }, [rows, receivableMap]);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Clientes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestion comercial y financiera</p>
          </div>
          <form
            onSubmit={submitSearch}
            className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente o empresa"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
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
                : "border border-slate-200 bg-white text-slate-600 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total clientes</p>
          <p className="mt-1 text-xl font-bold dark:text-[#e0e0e0]">{meta.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Activos</p>
          <p className="mt-1 text-xl font-bold text-delivered">{summary.active}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Con deuda</p>
          <p className="mt-1 text-xl font-bold text-pending">{summary.withDebt}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total por cobrar</p>
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay clientes registrados para este filtro.</p>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mostrando {rows.length} de {meta.total} resultados
          </p>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#2a2a3e] dark:bg-[#1a1a2e] lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
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
                    <tr key={item.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                      <td className="px-3 py-3 font-semibold dark:text-[#e0e0e0]">{item.name}</td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.phone}</td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.company || "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          title={billingTooltip[item.billing_type]}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20 dark:text-slate-300"
                        >
                          {billingText[item.billing_type]}
                        </span>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.shipments_count || 0}</td>
                      <td className="px-3 py-3 dark:text-slate-300">{formatCOP(receivableMap[item.id] || 0)}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openDetail(item.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
                className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.phone}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.company || "-"}</p>
                  </div>
                  <span
                    title={billingTooltip[item.billing_type]}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20 dark:text-slate-300"
                  >
                    {billingText[item.billing_type]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Envios: {item.shipments_count || 0} - Deuda: {formatCOP(receivableMap[item.id] || 0)}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openDetail(item.id)}
                    className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
                    className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl"
          >
            <h2 className="text-lg font-bold dark:text-[#e0e0e0]">
              {modal === "create" ? "Nuevo cliente" : "Editar cliente"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nombre"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="Telefono"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Email"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                value={form.company}
                onChange={(event) => setForm({ ...form, company: event.target.value })}
                placeholder="Empresa"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <input
                value={form.nit}
                onChange={(event) => setForm({ ...form, nit: event.target.value })}
                placeholder="NIT"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              />
              <select
                value={form.billing_type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    billing_type: event.target.value as ClientForm["billing_type"],
                  })
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
              >
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Cobro post entrega</option>
                <option value="prepaid">Prepago</option>
              </select>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Notas"
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0] sm:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{detail.name}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setDetailTab("resumen")} className={`rounded-full px-3 py-1.5 text-sm ${detailTab === "resumen" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Resumen</button>
              <button onClick={() => setDetailTab("envios")} className={`rounded-full px-3 py-1.5 text-sm ${detailTab === "envios" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Envíos ({detailShipMeta.total})</button>
              <button onClick={() => setDetailTab("direcciones")} className={`rounded-full px-3 py-1.5 text-sm ${detailTab === "direcciones" ? "bg-primary/10 text-primary" : "border border-slate-200 dark:border-[#2a2a3e] dark:text-slate-300"}`}>Direcciones ({detail.addresses?.length || 0})</button>
            </div>

            {detailTab === "resumen" ? (
              <>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p><strong>Telefono:</strong> {detail.phone || "-"}</p>
                  <p><strong>Empresa:</strong> {detail.company || "-"}</p>
                  <p><strong>NIT:</strong> {detail.nit || "-"}</p>
                  <p><strong>Tipo:</strong> {billingText[detail.billing_type]}</p>
                </div>
                {detail.financial_summary ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg border border-slate-200 p-2 dark:border-[#2a2a3e]"><p className="text-xs text-slate-500 dark:text-slate-400">Envios</p><p className="font-semibold dark:text-[#e0e0e0]">{detail.financial_summary.total_shipments}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2 dark:border-[#2a2a3e]"><p className="text-xs text-slate-500 dark:text-slate-400">Deuda</p><p className="font-semibold dark:text-[#e0e0e0]">{formatCOP(detail.financial_summary.total_owed)}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2 dark:border-[#2a2a3e]"><p className="text-xs text-slate-500 dark:text-slate-400">Ingresos</p><p className="font-semibold dark:text-[#e0e0e0]">{formatCOP(detail.financial_summary.total_revenue)}</p></div>
                  </div>
                ) : null}
              </>
            ) : null}

            {detailTab === "envios" ? (
              <div className="mt-4">
                {detailShipLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <Skeleton key={idx} className="h-10 dark:bg-[#23233b]" />
                    ))}
                  </div>
                ) : detailShipError ? (
                  <div>
                    <p className="text-sm text-issue">{detailShipError}</p>
                    <button
                      type="button"
                      onClick={() => void loadClientShipments(detail.id, detailShipMeta.current_page)}
                      className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : detailShipments.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sin envíos para este cliente.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-[680px] w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <tr><th className="py-2">Guia</th><th className="py-2">Destinatario</th><th className="py-2">Estado</th><th className="py-2">Fecha</th><th className="py-2">Monto</th></tr>
                        </thead>
                        <tbody>
                          {detailShipments.map((shipment) => (
                            <tr key={shipment.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                              <td className="py-2 font-semibold dark:text-[#e0e0e0]">{shipment.display_code}</td>
                              <td className="py-2 dark:text-slate-300">{shipment.recipient_name}</td>
                              <td className="py-2 dark:text-slate-300">{shipmentStatusLabel(shipment.status)}</td>
                              <td className="py-2 dark:text-slate-300">{formatDate(shipment.created_at)}</td>
                              <td className="py-2 dark:text-slate-300">{formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination currentPage={detailShipMeta.current_page} lastPage={detailShipMeta.last_page} onPageChange={(target) => void loadClientShipments(detail.id, target)} />
                  </>
                )}
              </div>
            ) : null}

            {detailTab === "direcciones" ? (
              <div className="mt-4">
                {(detail.addresses || []).length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Sin direcciones registradas.</p>
                ) : (
                  <ul className="space-y-1 text-sm dark:text-slate-300">
                    {(detail.addresses || []).map((address) => (
                      <li key={address.id}>
                        {address.label || "Dirección"}: {address.address}
                        {address.zone ? ` (${address.zone})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setModal(null)}
                className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
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
