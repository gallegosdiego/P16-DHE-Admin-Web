"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
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
  total_owed?: number;
  shipments?: Shipment[];
};

const tabs = [
  { label: "Todos", value: "all" },
  { label: "Contra entrega", value: "cash_on_delivery" },
  { label: "Post-venta", value: "post_sale" },
  { label: "Prepago", value: "prepaid" },
];

const formDefault = {
  id: 0,
  name: "",
  phone: "",
  email: "",
  company: "",
  nit: "",
  billing_type: "cash_on_delivery",
  notes: "",
};

export default function ClientesPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalOwed, setTotalOwed] = useState(0);
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState(formDefault);
  const [detail, setDetail] = useState<ClientDetail | null>(null);

  const loadReceivable = async () => {
    try {
      const response = await apiGet<ReceivableResponse>("/clients-receivable");
      setTotalOwed(response.total_owed || 0);
    } catch {
      setTotalOwed(0);
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
    loadReceivable();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    loadClients();
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (form.id) {
        await apiSend(`/clients/${form.id}`, "PUT", form);
        showToast("Cliente actualizado", "success");
      } else {
        await apiSend("/clients", "POST", form);
        showToast("Cliente creado", "success");
      }
      setModal(null);
      setForm(formDefault);
      loadClients();
      loadReceivable();
    } catch {
      showToast("No se pudo guardar cliente", "error");
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
    const active = rows.length;
    const withDebt = rows.filter((item) => Number(item.total_owed || 0) > 0).length;
    return { active, withDebt };
  }, [rows]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Clientes</h1>
            <p className="text-sm text-slate-500">Gestión comercial y financiera</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o empresa" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
            <button className="h-10 rounded-lg border border-slate-300 px-3 text-sm">Buscar</button>
            <button type="button" onClick={() => { setForm(formDefault); setModal("create"); }} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white">Nuevo cliente</button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item.value} onClick={() => { setTab(item.value); setPage(1); }} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === item.value ? "bg-primary/10 text-primary" : "border border-slate-200 bg-white text-slate-600"}`}>
            {item.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Total clientes</p><p className="mt-1 text-xl font-bold">{meta.total}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Activos</p><p className="mt-1 text-xl font-bold text-delivered">{summary.active}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Con deuda</p><p className="mt-1 text-xl font-bold text-pending">{summary.withDebt}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Total por cobrar</p><p className="mt-1 text-xl font-bold text-purple-600">{formatCOP(totalOwed)}</p></article>
      </section>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay clientes para este filtro.</div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Nombre</th><th className="px-3 py-3">Teléfono</th><th className="px-3 py-3">Empresa</th><th className="px-3 py-3">Tipo pago</th><th className="px-3 py-3">Envíos</th><th className="px-3 py-3">Deuda</th><th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-semibold">{item.name}</td>
                      <td className="px-3 py-3">{item.phone}</td>
                      <td className="px-3 py-3">{item.company || "-"}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{item.billing_type}</span></td>
                      <td className="px-3 py-3">{item.shipments_count || 0}</td>
                      <td className="px-3 py-3">{formatCOP(Number(item.total_owed || 0))}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openDetail(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button>
                          <button onClick={() => { setForm({ id: item.id, name: item.name, phone: item.phone, email: item.email || "", company: item.company || "", nit: item.nit || "", billing_type: item.billing_type, notes: item.notes || "" }); setModal("edit"); }} className="rounded border border-slate-300 px-2 py-1 text-xs">Editar</button>
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
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">{item.phone} · {item.company || "-"}</p>
                <p className="mt-1 text-xs text-slate-500">{item.billing_type} · Deuda {formatCOP(Number(item.total_owed || 0))}</p>
                <div className="mt-2 flex gap-2"><button onClick={() => openDetail(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button></div>
              </article>
            ))}
          </div>
          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
        </>
      )}

      {(modal === "create" || modal === "edit") ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={saveClient} className="w-full max-w-2xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">{modal === "create" ? "Nuevo cliente" : "Editar cliente"}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Empresa" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="NIT" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" />
              <select value={form.billing_type} onChange={(e) => setForm({ ...form, billing_type: e.target.value })} className="h-10 rounded-lg border border-slate-300 px-3 text-sm">
                <option value="cash_on_delivery">Contra entrega</option>
                <option value="post_sale">Post-venta</option>
                <option value="prepaid">Prepago</option>
              </select>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas" className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button><button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Guardar</button></div>
          </form>
        </div>
      ) : null}

      {modal === "detail" && detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold text-slate-900">{detail.name}</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p><strong>Teléfono:</strong> {detail.phone}</p><p><strong>Empresa:</strong> {detail.company || "-"}</p>
              <p><strong>NIT:</strong> {detail.nit || "-"}</p><p><strong>Tipo:</strong> {detail.billing_type}</p>
            </div>
            {detail.financial_summary ? (
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-xs text-slate-500">Envíos</p><p className="font-semibold">{detail.financial_summary.total_shipments}</p></div>
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-xs text-slate-500">Deuda</p><p className="font-semibold">{formatCOP(detail.financial_summary.total_owed)}</p></div>
                <div className="rounded-lg border border-slate-200 p-2"><p className="text-xs text-slate-500">Ingresos</p><p className="font-semibold">{formatCOP(detail.financial_summary.total_revenue)}</p></div>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Últimos envíos</p>
              <ul className="mt-2 space-y-1 text-sm">{(detail.shipments || []).map((shipment) => <li key={shipment.id}>{shipment.display_code} · {shipment.status} · {formatCOP(shipment.shipping_cost)}</li>)}</ul>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">Direcciones</p>
              <ul className="mt-2 space-y-1 text-sm">{(detail.addresses || []).map((address, idx) => <li key={`${address.label}-${idx}`}>{address.label}: {address.address} ({address.zone})</li>)}</ul>
            </div>
            <div className="mt-4 flex justify-end"><button onClick={() => setModal(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cerrar</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
