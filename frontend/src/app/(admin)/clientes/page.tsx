"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { billingTypeLabel, formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { WhatsAppClientPanel } from "@/components/whatsapp-client-panel";
import { usePageTitle } from "@/lib/page-title";
import { whatsappAdminUiEnabled } from "@/lib/features";
import type {
  Client as BaseClient,
  ClientBillingType,
  ClientDetail,
  PaginatedResponse,
  ReceivableResponse,
  Shipment,
} from "@/lib/types";

type BillingType = ClientBillingType;

type ClientRow = Partial<Omit<BaseClient, "id" | "name" | "phone" | "billing_type" | "billing_types">> & {
  id: number;
  name: string;
  phone: string;
  billing_type?: BillingType | null;
  billing_types?: BillingType[] | null;
  shipments_count?: number;
  shipments?: Shipment[];
};

type ClientForm = {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  company_phone: string;
  nit: string;
  billing_types: BillingType[];
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
  company_phone: "",
  nit: "",
  billing_types: ["cash_on_delivery"],
  notes: "",
};

const billingText: Record<BillingType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
};

const billingTooltip: Record<BillingType, string> = {
  cash_on_delivery:
    "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente despues de la entrega",
  prepaid: "El cliente ya pagó el envío",
};

const billingOptions: Array<{ value: BillingType; label: string; description: string }> = [
  {
    value: "cash_on_delivery",
    label: "Contra entrega",
    description: "El destinatario paga al recibir.",
  },
  {
    value: "post_sale",
    label: "Cobro post entrega",
    description: "Se factura al cliente después de entregar.",
  },
  {
    value: "prepaid",
    label: "Prepago",
    description: "El cliente paga antes de enviar.",
  },
];

function getClientBillingTypes(client: {
  billing_types?: BillingType[] | null;
  billing_type?: BillingType | null;
}): BillingType[] {
  const selected = Array.from(new Set(client.billing_types ?? []));
  if (selected.length > 0) return selected;
  return client.billing_type ? [client.billing_type] : [];
}

function isArchivedClient(client: Pick<ClientRow, "deleted_at">): boolean {
  return Boolean(client.deleted_at);
}

function DetailInfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
        {value || "-"}
      </dd>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-[#2a2a3e] dark:bg-[#16162a]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">{value}</p>
    </div>
  );
}

export default function ClientesPage() {
  usePageTitle("Clientes | Danhei Express");

  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalOwed, setTotalOwed] = useState(0);
  const [receivableMap, setReceivableMap] = useState<Record<number, number>>({});
  const [modal, setModal] = useState<"create" | "edit" | "detail" | null>(null);
  const [form, setForm] = useState<ClientForm>(formDefault);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailTab, setDetailTab] = useState<
    "resumen" | "envios" | "direcciones" | "whatsapp"
  >("resumen");
  const [detailShipments, setDetailShipments] = useState<Shipment[]>([]);
  const [detailShipMeta, setDetailShipMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [detailShipLoading, setDetailShipLoading] = useState(false);
  const [detailShipError, setDetailShipError] = useState("");
  const [actionClientId, setActionClientId] = useState<number | null>(null);
  const [pendingClientShipments, setPendingClientShipments] = useState<Shipment[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const [pendingClientSelection, setPendingClientSelection] = useState<Record<number, string>>({});
  const [availableClients, setAvailableClients] = useState<BaseClient[]>([]);
  const clientsRequestSequence = useRef(0);

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
    const requestId = ++clientsRequestSequence.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (appliedSearch) params.set("search", appliedSearch);
      if (tab !== "all") params.set("billing_type", tab);
      if (showArchived) params.set("include_archived", "1");

      const response = await apiGet<PaginatedResponse<ClientRow>>(
        `/clients?${params.toString()}`
      );
      if (requestId !== clientsRequestSequence.current) return;
      const data = (response.data || []).sort((a, b) => a.name.localeCompare(b.name));
      setRows(data);
      setMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      if (requestId !== clientsRequestSequence.current) return;
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      showToast("No se pudieron cargar clientes", "error");
    } finally {
      if (requestId === clientsRequestSequence.current) setLoading(false);
    }
  };

  const loadAvailableClients = async () => {
    try {
      const response = await apiGet<PaginatedResponse<BaseClient>>(
        "/clients?active_only=1&per_page=100",
      );
      setAvailableClients(response.data || []);
    } catch {
      setAvailableClients([]);
    }
  };

  const loadPendingClientShipments = async () => {
    setPendingLoading(true);
    try {
      const response = await apiGet<PaginatedResponse<Shipment>>(
        "/shipments/pending-client-review?per_page=100",
      );
      setPendingClientShipments(response.data || []);
    } catch {
      setPendingClientShipments([]);
      showToast("No se pudieron cargar los pendientes de cliente", "error");
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReceivable();
    void loadPendingClientShipments();
    void loadAvailableClients();
    // These loaders intentionally run once when the page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, showArchived, appliedSearch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedClientId = Number(params.get("clientId") || 0);
    if (requestedClientId > 0) {
      void openDetail(requestedClientId);
      params.delete("clientId");
      const next = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (next ? "?" + next : ""));
    }
    if (params.get("quickAction") === "new") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal("create");
      params.delete("quickAction");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
    // The query-string deep link is consumed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
    setDetail(null);
    setDetailShipments([]);
    setDetailShipMeta({ current_page: 1, last_page: 1, total: 0 });
    setDetailShipError("");
  };

  const openEdit = (item: ClientRow) => {
    setForm({
      id: item.id,
      name: item.name,
      phone: item.phone || "",
      email: item.email || "",
      company: item.company || "",
      company_phone: item.company_phone || "",
      nit: item.nit || "",
      billing_types: getClientBillingTypes(item).length > 0
        ? getClientBillingTypes(item)
        : ["cash_on_delivery"],
      notes: item.notes || "",
    });
    setModal("edit");
  };

  const toggleBillingType = (billingType: BillingType) => {
    setForm((current) => {
      const selected = current.billing_types.includes(billingType)
        ? current.billing_types.filter((type) => type !== billingType)
        : [...current.billing_types, billingType];

      return selected.length > 0 ? { ...current, billing_types: selected } : current;
    });
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        company_phone: form.company_phone.trim() || null,
        nit: form.nit.trim() || null,
        billing_types: form.billing_types,
        // Compatibilidad para consumidores que aún leen el campo singular.
        billing_type: form.billing_types[0],
        notes: form.notes.trim() || null,
      };

      if (form.id) {
        await apiSend(`/clients/${form.id}`, "PUT", payload);
        showToast("Cliente actualizado", "success");
      } else {
        await apiSend("/clients", "POST", payload);
        showToast("Cliente creado", "success");
      }
      closeModal();
      await Promise.all([loadClients(), loadReceivable(), loadAvailableClients()]);
    } catch {
      showToast("No se pudo guardar cliente", "error");
    } finally {
      setSaving(false);
    }
  };

  const archiveClient = async (item: ClientRow) => {
    const shipmentCount = item.shipments_count || 0;
    const confirmed = window.confirm(
      `¿Archivar a ${item.name}? Se retirará de clientes activos, pero se conservarán sus ${shipmentCount} paquetes e historial.`,
    );
    if (!confirmed) return;

    setActionClientId(item.id);
    try {
      await apiSend(`/clients/${item.id}`, "DELETE", {});
      showToast("Cliente archivado; su historial se conserva", "success");
      await Promise.all([loadClients(), loadReceivable()]);
    } catch {
      showToast("No se pudo archivar el cliente", "error");
    } finally {
      setActionClientId(null);
    }
  };

  const restoreClient = async (item: ClientRow) => {
    setActionClientId(item.id);
    try {
      await apiSend(`/clients/${item.id}/restore`, "POST", {});
      showToast("Cliente restaurado", "success");
      await Promise.all([loadClients(), loadReceivable()]);
    } catch {
      showToast("No se pudo restaurar el cliente", "error");
    } finally {
      setActionClientId(null);
    }
  };

  const linkPendingShipment = async (shipment: Shipment) => {
    const clientId = Number(pendingClientSelection[shipment.id] || 0);
    if (!clientId) {
      showToast("Selecciona el cliente que corresponde a la guía", "error");
      return;
    }

    setPendingActionId(shipment.id);
    try {
      await apiSend("/shipments/" + shipment.id + "/link-client", "POST", { client_id: clientId });
      showToast("Guía vinculada al cliente; su historial ya está disponible", "success");
      setPendingClientSelection((current) => {
        const next = { ...current };
        delete next[shipment.id];
        return next;
      });
      await Promise.all([loadPendingClientShipments(), loadClients(), loadReceivable()]);
    } catch {
      showToast("No se pudo vincular la guía al cliente", "error");
    } finally {
      setPendingActionId(null);
    }
  };

  async function openDetail(id: number) {
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

  async function loadClientShipments(clientId: number, targetPage: number) {
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
    const activeRows = rows.filter((item) => !isArchivedClient(item) && item.is_active !== false);
    const withDebt = activeRows.filter((item) => Number(receivableMap[item.id] || 0) > 0).length;
    return { active: activeRows.length, withDebt };
  }, [rows, receivableMap]);

  const detailBillingTypes = detail ? getClientBillingTypes(detail) : [];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#e0e0e0]">Clientes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gestión comercial y financiera</p>
          </div>
          <form
            onSubmit={submitSearch}
            className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente o empresa"
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
            />
            <button className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]">
              Buscar
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(formDefault);
                setModal("create");
              }}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
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
        <label className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 dark:border-[#2a2a3e] dark:bg-[#1a1a2e] dark:text-slate-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => {
              setShowArchived(event.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 accent-primary"
          />
          Mostrar archivados
        </label>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-400/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Revisión de cierre
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-[#e0e0e0]">
              Pendientes por identificar cliente
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Son guías que pudieron continuar el flujo operativo sin cliente maestro. Vincúlalas al contacto de cobro correcto para completar cartera, COD e historial.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200">
              {pendingClientShipments.length} pendientes
            </span>
            <button
              type="button"
              onClick={() => void loadPendingClientShipments()}
              className="min-h-10 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-400/40 dark:text-amber-200"
            >
              Actualizar
            </button>
          </div>
        </div>

        {pendingLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 dark:bg-[#23233b]" />
            <Skeleton className="h-12 dark:bg-[#23233b]" />
          </div>
        ) : pendingClientShipments.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-amber-300 p-3 text-sm text-amber-800 dark:border-amber-400/30 dark:text-amber-200">
            No hay guías pendientes de identificación. Este control queda listo para el cierre diario o semanal.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto rounded-lg border border-amber-200 bg-white dark:border-amber-400/20 dark:bg-[#1a1a2e] lg:block">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-amber-100/60 text-left text-xs uppercase tracking-wide text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
                  <tr>
                    <th className="px-3 py-3">Guía</th>
                    <th className="px-3 py-3">Remitente / contacto</th>
                    <th className="px-3 py-3">Destinatario</th>
                    <th className="px-3 py-3">Pago / estado</th>
                    <th className="px-3 py-3">Cliente maestro</th>
                    <th className="px-3 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingClientShipments.map((shipment) => (
                    <tr key={shipment.id} className="border-t border-amber-100 dark:border-amber-400/20">
                      <td className="px-3 py-3 align-top">
                        <p className="font-semibold dark:text-[#e0e0e0]">{shipment.display_code}</p>
                        <p className="text-xs text-slate-500">{formatDate(shipment.created_at)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-semibold dark:text-slate-200">{shipment.sender_name || "Sin contacto registrado"}</p>
                        <p className="text-xs text-slate-500">{shipment.sender_phone || "Sin teléfono"}{shipment.sender_email ? " · " + shipment.sender_email : ""}</p>
                        {shipment.sender_company ? <p className="text-xs text-slate-500">{shipment.sender_company}</p> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium dark:text-slate-200">{shipment.recipient_name}</p>
                        <p className="text-xs text-slate-500">{shipment.recipient_phone}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium dark:text-slate-200">{billingTypeLabel(shipment.payment_type)}</p>
                        <p className="text-xs text-slate-500">{shipmentStatusLabel(shipment.status)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <select
                          value={pendingClientSelection[shipment.id] || ""}
                          onChange={(event) => setPendingClientSelection((current) => ({ ...current, [shipment.id]: event.target.value }))}
                          className="h-10 min-w-64 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-200"
                        >
                          <option value="">Selecciona cliente</option>
                          {availableClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}{client.company ? " · " + client.company : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          disabled={pendingActionId === shipment.id || !pendingClientSelection[shipment.id]}
                          onClick={() => void linkPendingShipment(shipment)}
                          className="min-h-10 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {pendingActionId === shipment.id ? "Vinculando..." : "Vincular"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 lg:hidden">
              {pendingClientShipments.map((shipment) => (
                <article key={shipment.id} className="rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-400/20 dark:bg-[#1a1a2e]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold dark:text-slate-100">{shipment.display_code}</p>
                      <p className="text-xs text-slate-500">{formatDate(shipment.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20 dark:text-slate-300">
                      {shipmentStatusLabel(shipment.status)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="font-semibold dark:text-slate-200">{shipment.sender_name || "Sin contacto registrado"}</p>
                    <p className="text-xs text-slate-500">{shipment.sender_phone || "Sin teléfono"}{shipment.sender_company ? " · " + shipment.sender_company : ""}</p>
                    <p className="text-xs text-slate-500">Entrega: {shipment.recipient_name} · {shipment.recipient_phone}</p>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{billingTypeLabel(shipment.payment_type)}</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={pendingClientSelection[shipment.id] || ""}
                      onChange={(event) => setPendingClientSelection((current) => ({ ...current, [shipment.id]: event.target.value }))}
                      className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-slate-200"
                    >
                      <option value="">Selecciona cliente</option>
                      {availableClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}{client.company ? " · " + client.company : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pendingActionId === shipment.id || !pendingClientSelection[shipment.id]}
                      onClick={() => void linkPendingShipment(shipment)}
                      className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {pendingActionId === shipment.id ? "Vinculando..." : "Vincular"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
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
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#16162a] dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Teléfono</th>
                    <th className="px-3 py-3">Empresa</th>
                    <th className="px-3 py-3">Preferencias de pago</th>
                    <th className="px-3 py-3">Envíos</th>
                    <th className="px-3 py-3">Deuda</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-[#2a2a3e]">
                      <td className="px-3 py-3 font-semibold dark:text-[#e0e0e0]">
                        <div>{item.name}</div>
                        {isArchivedClient(item) ? (
                          <span className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                            Archivado
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        <p>{item.phone || "-"}</p>
                        {item.email ? <p className="text-xs text-slate-500">{item.email}</p> : null}
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">
                        <p>{item.company || "-"}</p>
                        {item.company_phone ? <p className="text-xs text-slate-500">{item.company_phone}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {getClientBillingTypes(item).map((billingType) => (
                            <span
                              key={billingType}
                              title={billingTooltip[billingType]}
                              className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20 dark:text-slate-300"
                            >
                              {billingText[billingType]}
                            </span>
                          ))}
                          {getClientBillingTypes(item).length === 0 ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Sin definir</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 dark:text-slate-300">{item.shipments_count || 0}</td>
                      <td className="px-3 py-3 dark:text-slate-300">{formatCOP(receivableMap[item.id] || 0)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(item.id)}
                            className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                          >
                            Detalle
                          </button>
                          {isArchivedClient(item) ? (
                            <button
                              type="button"
                              onClick={() => void restoreClient(item)}
                              disabled={actionClientId === item.id}
                              className="min-h-11 rounded border border-delivered/40 px-2 py-1 text-xs font-semibold text-delivered transition-all duration-150 active:scale-95 disabled:opacity-60"
                            >
                              {actionClientId === item.id ? "Procesando..." : "Restaurar"}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(item)}
                                className="min-h-11 rounded border border-slate-300 px-2 py-1 text-xs transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void archiveClient(item)}
                                disabled={actionClientId === item.id}
                                className="min-h-11 rounded border border-issue/40 px-2 py-1 text-xs font-semibold text-issue transition-all duration-150 active:scale-95 disabled:opacity-60"
                              >
                                {actionClientId === item.id ? "Procesando..." : "Archivar"}
                              </button>
                            </>
                          )}
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
                className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow duration-200 hover:shadow-md dark:border-[#2a2a3e] dark:bg-[#1a1a2e]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">{item.name}</p>
                    {isArchivedClient(item) ? (
                      <span className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                        Archivado
                      </span>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.phone}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.company || "Sin empresa"}</p>
                  </div>
                  <div className="flex max-w-[52%] flex-wrap justify-end gap-1">
                    {getClientBillingTypes(item).map((billingType) => (
                      <span
                        key={billingType}
                        title={billingTooltip[billingType]}
                        className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-500/20 dark:text-slate-300"
                      >
                        {billingText[billingType]}
                      </span>
                    ))}
                    {getClientBillingTypes(item).length === 0 ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Sin definir</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-[#16162a]">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Envíos</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">{item.shipments_count || 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Deuda</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">{formatCOP(receivableMap[item.id] || 0)}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(item.id)}
                    className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                  >
                    Detalle
                  </button>
                  {isArchivedClient(item) ? (
                    <button
                      type="button"
                      onClick={() => void restoreClient(item)}
                      disabled={actionClientId === item.id}
                      className="min-h-11 rounded-xl border border-delivered/40 px-3 py-2 text-sm font-semibold text-delivered transition-all duration-150 active:scale-95 disabled:opacity-60"
                    >
                      {actionClientId === item.id ? "Procesando..." : "Restaurar"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-95 dark:border-[#2a2a3e] dark:hover:bg-[#1f1f35]"
                    >
                      Editar
                    </button>
                  )}
                </div>
                {!isArchivedClient(item) ? (
                  <button
                    type="button"
                    onClick={() => void archiveClient(item)}
                    disabled={actionClientId === item.id}
                    className="mt-2 min-h-11 w-full rounded-xl border border-issue/40 px-3 py-2 text-sm font-semibold text-issue transition-all duration-150 active:scale-95 disabled:opacity-60"
                  >
                    {actionClientId === item.id ? "Procesando..." : "Archivar cliente"}
                  </button>
                ) : null}
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
              <div className="sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Contacto de cobro</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Es la persona principal para consultar saldos y realizar cobros.
                </p>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Nombre</span>
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Nombre del cliente"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Teléfono</span>
                <input
                  required
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="Número principal"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="correo@empresa.com"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <div className="sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Empresa relacionada</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Razón social, teléfono corporativo y NIT son contexto adicional del cliente.
                </p>
              </div>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Empresa</span>
                <input
                  value={form.company}
                  onChange={(event) => setForm({ ...form, company: event.target.value })}
                  placeholder="Razón social o marca"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Teléfono de empresa</span>
                <input
                  value={form.company_phone}
                  onChange={(event) => setForm({ ...form, company_phone: event.target.value })}
                  placeholder="Teléfono corporativo"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">NIT</span>
                <input
                  value={form.nit}
                  onChange={(event) => setForm({ ...form, nit: event.target.value })}
                  placeholder="Identificación tributaria"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
              <div className="space-y-2 text-sm sm:col-span-2">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">Preferencias de pago</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Información general del cliente. El tipo real se elige por cada paquete.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {billingOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-300 p-3 transition-colors hover:border-primary dark:border-[#2a2a3e] dark:hover:border-primary"
                    >
                      <input
                        type="checkbox"
                        checked={form.billing_types.includes(option.value)}
                        onChange={() => toggleBillingType(option.value)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="block font-medium text-slate-700 dark:text-slate-200">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700 dark:text-slate-200">Notas</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Observaciones comerciales o de cobranza"
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2a2a3e] dark:bg-[#16162a] dark:text-[#e0e0e0]"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-detail-title"
            className="h-[100dvh] w-full overflow-y-auto rounded-none bg-white p-5 animate-fade-in dark:bg-[#1a1a2e] sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-[#2a2a3e]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Ficha del cliente</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 id="client-detail-title" className="truncate text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">
                    {detail.name}
                  </h2>
                  {isArchivedClient(detail) ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                      Archivado
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {detail.company ? `Empresa relacionada: ${detail.company}` : "Sin empresa relacionada"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
                title="Cerrar detalle del cliente"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-xl leading-none text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-[#2a2a3e] dark:text-slate-300 dark:hover:bg-[#202035] dark:hover:text-white"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            {isArchivedClient(detail) ? (
              <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                Cliente archivado. Sus paquetes e historial siguen disponibles.
              </p>
            ) : null}
            <div role="tablist" aria-label="Secciones del cliente" className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#2a2a3e]">
              <button
                type="button"
                role="tab"
                id="client-detail-tab-resumen"
                aria-selected={detailTab === "resumen"}
                aria-controls="client-detail-panel"
                onClick={() => setDetailTab("resumen")}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${detailTab === "resumen" ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#202035]"}`}
              >
                Resumen
              </button>
              <button
                type="button"
                role="tab"
                id="client-detail-tab-envios"
                aria-selected={detailTab === "envios"}
                aria-controls="client-detail-panel"
                onClick={() => setDetailTab("envios")}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${detailTab === "envios" ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#202035]"}`}
              >
                Envíos ({detailShipMeta.total})
              </button>
              <button
                type="button"
                role="tab"
                id="client-detail-tab-direcciones"
                aria-selected={detailTab === "direcciones"}
                aria-controls="client-detail-panel"
                onClick={() => setDetailTab("direcciones")}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${detailTab === "direcciones" ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#202035]"}`}
              >
                Direcciones ({detail.addresses?.length || 0})
              </button>
              {whatsappAdminUiEnabled ? (
                <button
                  type="button"
                  role="tab"
                  id="client-detail-tab-whatsapp"
                  aria-selected={detailTab === "whatsapp"}
                  aria-controls="client-detail-panel"
                  onClick={() => setDetailTab("whatsapp")}
                  className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${detailTab === "whatsapp" ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#202035]"}`}
                >
                  WhatsApp
                </button>
              ) : null}
            </div>

            <div
              id="client-detail-panel"
              role="tabpanel"
              aria-labelledby={`client-detail-tab-${detailTab}`}
              tabIndex={0}
              className="mt-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {detailTab === "resumen" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 dark:border-primary/30 dark:bg-primary/[0.08]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-primary">Contacto de cobro</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Persona principal para consultar saldos y realizar cobros.</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-primary dark:bg-[#1a1a2e]">Cliente</span>
                      </div>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <DetailInfoItem label="Nombre" value={detail.name} />
                        <DetailInfoItem label="Teléfono" value={detail.phone} />
                        <DetailInfoItem label="Correo" value={detail.email} />
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Empresa / razón social</p>
                        <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">{detail.company || "Sin empresa registrada"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contexto corporativo asociado al contacto.</p>
                      </div>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <DetailInfoItem label="NIT" value={detail.nit} />
                        <DetailInfoItem label="Teléfono de empresa" value={detail.company_phone} />
                      </dl>
                    </section>
                  </div>

                  <section className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-[#e0e0e0]">Preferencias de pago</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Información general; el tipo real se define por cada paquete.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-500/20 dark:text-slate-300">Informativas</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {detailBillingTypes.length > 0 ? detailBillingTypes.map((billingType) => (
                        <span
                          key={billingType}
                          title={billingTooltip[billingType]}
                          className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-200"
                        >
                          {billingText[billingType]}
                        </span>
                      )) : <span className="text-xs text-slate-500 dark:text-slate-400">Sin preferencias registradas</span>}
                    </div>
                  </section>

                  {detail.financial_summary ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <DetailMetric label="Envíos" value={String(detail.financial_summary.total_shipments)} />
                      <DetailMetric label="Deuda" value={formatCOP(detail.financial_summary.total_owed)} />
                      <DetailMetric label="Ingresos" value={formatCOP(detail.financial_summary.total_revenue)} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === "envios" ? (
              <div>
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
                    <div className="space-y-2 sm:hidden">
                      {detailShipments.map((shipment) => (
                        <article
                          key={shipment.id}
                          className="rounded-xl border border-slate-200 p-3 dark:border-[#2a2a3e]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{shipment.display_code}</p>
                              <p className="text-sm text-slate-600 dark:text-slate-300">{shipment.recipient_name || "-"}</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                              {shipmentStatusLabel(shipment.status)}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</p>
                              <p className="mt-1 text-slate-700 dark:text-slate-200">{formatDate(shipment.created_at)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Monto</p>
                              <p className="mt-1 font-semibold text-slate-900 dark:text-[#e0e0e0]">
                                {formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <tr><th className="py-2">Guía</th><th className="py-2">Destinatario</th><th className="py-2">Estado</th><th className="py-2">Fecha</th><th className="py-2">Monto</th></tr>
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
                  <ul className="space-y-2 text-sm dark:text-slate-300">
                    {(detail.addresses || []).map((address) => (
                      <li key={address.id} className="rounded-xl border border-slate-200 p-3 dark:border-[#2a2a3e]">
                        <p className="font-medium text-slate-900 dark:text-[#e0e0e0]">{address.label || "Dirección"}</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">{address.address}</p>
                        {address.zone ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Zona: {address.zone}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {whatsappAdminUiEnabled && detailTab === "whatsapp" ? (
              <div className="mt-4">
                <WhatsAppClientPanel
                  clientId={detail.id}
                  clientName={detail.name}
                  addresses={detail.addresses || []}
                />
              </div>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
