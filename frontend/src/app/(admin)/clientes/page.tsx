"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, describeApiError } from "@/lib/api";
import { billingTypeLabel, formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Pagination } from "@/components/pagination";
import { usePageTitle } from "@/lib/page-title";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  FilterChipGroup,
  Input,
  KpiCard,
  MobileListCard,
  SearchInput,
  Select,
  StatusBadge,
  Textarea,
  type BadgeTone,
} from "@/components/ui";
import type {
  Client as BaseClient,
  ClientBillingType,
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

const billingTone: Record<BillingType, BadgeTone> = {
  cash_on_delivery: "warning",
  post_sale: "info",
  prepaid: "success",
};

const billingOptions: Array<{ value: BillingType; label: string; description: string }> = [
  { value: "cash_on_delivery", label: "Contra entrega", description: "El destinatario paga al recibir." },
  { value: "post_sale", label: "Cobro post entrega", description: "Se factura al cliente después de entregar." },
  { value: "prepaid", label: "Prepago", description: "El cliente paga antes de enviar." },
];

function getClientBillingTypes(client: { billing_types?: BillingType[] | null; billing_type?: BillingType | null }): BillingType[] {
  const selected = Array.from(new Set(client.billing_types ?? []));
  return selected.length > 0 ? selected : client.billing_type ? [client.billing_type] : [];
}

function isArchivedClient(client: Pick<ClientRow, "deleted_at">): boolean {
  return Boolean(client.deleted_at);
}

function getWhatsAppUrl(phone: string | null | undefined): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("57") ? digits : `57${digits}`}`;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L4 20l.9-3.7A8.5 8.5 0 1 1 20.5 11.7Z" />
      <path d="M8.7 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.3.1.5-.1.7l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.2.4-.2.7-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3-.1.5-.4.7-.4.3-.9.4-1.4.3-2.5-.5-5.8-3.8-6.3-6.3-.1-.5 0-1 .3-1.4Z" />
    </svg>
  );
}

function ClientActionIcon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

const clientActionIcons = {
  view: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  edit: "m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.3 2.3 0 0 0-3.3-3.3L3.2 15.2ZM14.5 5.5l4 4",
  trash: "M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13M10 11v5M14 11v5",
};

export default function ClientesPage() {
  usePageTitle("Clientes | Danhei Express");

  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [totalOwed, setTotalOwed] = useState(0);
  const [receivableMap, setReceivableMap] = useState<Record<number, number>>({});
  const [receivableShipmentsMap, setReceivableShipmentsMap] = useState<Record<number, number>>({});
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<ClientForm>(formDefault);
  const [actionClientId, setActionClientId] = useState<number | null>(null);
  const [pendingClientShipments, setPendingClientShipments] = useState<Shipment[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const [pendingClientSelection, setPendingClientSelection] = useState<Record<number, string>>({});
  const [availableClients, setAvailableClients] = useState<BaseClient[]>([]);
  const [loadError, setLoadError] = useState("");
  const clientsRequestSequence = useRef(0);

  const loadReceivable = async () => {
    try {
      const response = await apiGet<ReceivableResponse>("/clients-receivable");
      setTotalOwed(response.total_owed || 0);
      const nextMap: Record<number, number> = {};
      const nextShipmentsMap: Record<number, number> = {};
      for (const client of response.clients || []) {
        nextMap[client.id] = client.total_owed;
        nextShipmentsMap[client.id] = client.owed_shipments_count;
      }
      setReceivableMap(nextMap);
      setReceivableShipmentsMap(nextShipmentsMap);
    } catch {
      setTotalOwed(0);
      setReceivableMap({});
      setReceivableShipmentsMap({});
    }
  };

  const loadClients = async () => {
    const requestId = ++clientsRequestSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (appliedSearch) params.set("search", appliedSearch);
      if (tab !== "all") params.set("billing_type", tab);
      const response = await apiGet<PaginatedResponse<ClientRow>>(`/clients?${params.toString()}`);
      if (requestId !== clientsRequestSequence.current) return;
      setRows((response.data || []).sort((a, b) => a.name.localeCompare(b.name)));
      setMeta({ current_page: response.current_page || 1, last_page: response.last_page || 1, total: response.total || 0 });
    } catch (error) {
      if (requestId !== clientsRequestSequence.current) return;
      setRows([]);
      setMeta({ current_page: 1, last_page: 1, total: 0 });
      setLoadError(describeApiError(error, "No se pudieron cargar clientes.").message);
    } finally {
      if (requestId === clientsRequestSequence.current) setLoading(false);
    }
  };

  const loadAvailableClients = async () => {
    try {
      const response = await apiGet<PaginatedResponse<BaseClient>>("/clients?active_only=1&per_page=100");
      setAvailableClients(response.data || []);
    } catch {
      setAvailableClients([]);
    }
  };

  const loadPendingClientShipments = async () => {
    setPendingLoading(true);
    setPendingError("");
    try {
      const response = await apiGet<PaginatedResponse<Shipment>>("/shipments/pending-client-review?per_page=100");
      setPendingClientShipments(response.data || []);
    } catch (error) {
      setPendingClientShipments([]);
      setPendingError(describeApiError(error, "No se pudieron cargar los pendientes de cliente.").message);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    // These loaders intentionally synchronize the initial view with the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReceivable();
    void loadPendingClientShipments();
    void loadAvailableClients();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, appliedSearch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedClientId = Number(params.get("clientId") || 0);
    if (requestedClientId > 0) {
      router.push(`/clientes/${requestedClientId}`);
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
  }, [router]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const closeModal = () => {
    setModal(null);
    setForm(formDefault);
  };

  const openEdit = (item: ClientRow) => {
    const selected = getClientBillingTypes(item);
    setForm({
      id: item.id,
      name: item.name,
      phone: item.phone || "",
      email: item.email || "",
      company: item.company || "",
      company_phone: item.company_phone || "",
      nit: item.nit || "",
      billing_types: selected.length > 0 ? selected : ["cash_on_delivery"],
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
    } catch (error) {
      showToast(describeApiError(error, "No se pudo guardar el cliente.").message, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (item: ClientRow) => {
    const shipmentCount = item.shipments_count || 0;
    if (!window.confirm(`¿Eliminar a ${item.name}? Se moverá a la papelera y se conservarán sus ${shipmentCount} paquetes e historial.`)) return;
    setActionClientId(item.id);
    try {
      await apiSend(`/clients/${item.id}`, "DELETE", {});
      showToast("Cliente enviado a la papelera; su historial se conserva", "success");
      await Promise.all([loadClients(), loadReceivable()]);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo enviar el cliente a la papelera.").message, "error");
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
      await apiSend(`/shipments/${shipment.id}/link-client`, "POST", { client_id: clientId });
      showToast("Guía vinculada al cliente; su historial ya está disponible", "success");
      setPendingClientSelection((current) => {
        const next = { ...current };
        delete next[shipment.id];
        return next;
      });
      await Promise.all([loadPendingClientShipments(), loadClients(), loadReceivable()]);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo vincular la guía al cliente.").message, "error");
    } finally {
      setPendingActionId(null);
    }
  };

  const summary = useMemo(() => {
    const activeRows = rows.filter((item) => !isArchivedClient(item) && item.is_active !== false);
    const withDebt = activeRows.filter((item) => Number(receivableMap[item.id] || 0) > 0).length;
    return { active: activeRows.length, withDebt };
  }, [rows, receivableMap]);

  const openCreate = () => {
    setForm(formDefault);
    setModal("create");
  };

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Relación comercial</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">Clientes</h1>
          <p className="mt-1 text-sm text-ink-secondary">Quién solicita los envíos y cómo se gestiona su cartera.</p>
        </div>
        <Button onClick={openCreate} className="w-full md:w-auto">Nuevo cliente</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total clientes" value={meta.total} support="En el filtro actual" />
        <KpiCard label="Activos" value={summary.active} support="Contactos disponibles" tone="success" />
        <KpiCard label="Con deuda" value={summary.withDebt} support="Requieren seguimiento" tone="warning" />
        <KpiCard label="Total por cobrar" value={formatCOP(totalOwed)} support="Cartera actual" tone="brand" />
      </div>

      <Card title="Buscar y filtrar clientes" headerAction={<Badge tone="neutral">{meta.total} registros</Badge>}>
        <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, empresa o teléfono" className="flex-1" />
          <Button type="submit" variant="secondary" className="w-full lg:w-auto">Buscar</Button>
        </form>
        <FilterChipGroup label="Tipo de facturación" className="mt-4">
          {tabs.map((item) => (
            <FilterChip key={item.value} selected={tab === item.value} onClick={() => { setTab(item.value); setPage(1); }}>
              {item.label}
            </FilterChip>
          ))}
        </FilterChipGroup>
      </Card>

      <Card title="Pendientes por identificar cliente" headerAction={<Badge tone={pendingClientShipments.length > 0 ? "warning" : "success"}>{pendingClientShipments.length} pendientes</Badge>}>
        {pendingLoading ? (
          <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : pendingError ? (
          <div className="rounded-input border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert"><p>{pendingError}</p><Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void loadPendingClientShipments()}>Reintentar</Button></div>
        ) : pendingClientShipments.length === 0 ? (
          <EmptyState title="No hay guías pendientes" description="Las guías sin cliente maestro aparecerán aquí para completar cartera e historial." />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary"><tr><th className="px-3 py-3">Guía</th><th className="px-3 py-3">Contacto</th><th className="px-3 py-3">Destinatario</th><th className="px-3 py-3">Pago/estado</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Acción</th></tr></thead>
                <tbody>{pendingClientShipments.map((shipment) => <tr key={shipment.id} className="border-t border-edge"><td className="px-3 py-3 align-top"><p className="font-display font-semibold text-ink">{shipment.display_code}</p><p className="text-xs text-ink-secondary">{formatDate(shipment.created_at)}</p></td><td className="px-3 py-3 align-top"><p className="font-semibold text-ink">{shipment.sender_name || "Sin contacto"}</p><p className="text-xs text-ink-secondary">{shipment.sender_phone || "Sin teléfono"}</p></td><td className="px-3 py-3 align-top"><p className="font-medium text-ink">{shipment.recipient_name}</p><p className="text-xs text-ink-secondary">{shipment.recipient_phone}</p></td><td className="px-3 py-3 align-top"><Badge tone="neutral">{billingTypeLabel(shipment.payment_type)}</Badge><p className="mt-1 text-xs text-ink-secondary">{shipmentStatusLabel(shipment.status)}</p></td><td className="px-3 py-3 align-top"><Select aria-label={`Cliente para ${shipment.display_code}`} value={pendingClientSelection[shipment.id] || ""} onChange={(event) => setPendingClientSelection((current) => ({ ...current, [shipment.id]: event.target.value }))}><option value="">Selecciona cliente</option>{availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.company ? ` · ${client.company}` : ""}</option>)}</Select></td><td className="px-3 py-3 align-top"><Button size="sm" disabled={pendingActionId === shipment.id || !pendingClientSelection[shipment.id]} onClick={() => void linkPendingShipment(shipment)}>{pendingActionId === shipment.id ? "Vinculando..." : "Vincular"}</Button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="space-y-3 lg:hidden">{pendingClientShipments.map((shipment) => <MobileListCard key={shipment.id} title={shipment.display_code} subtitle={`${shipment.sender_name || "Sin contacto"} → ${shipment.recipient_name}`} meta={`${formatDate(shipment.created_at)} · ${billingTypeLabel(shipment.payment_type)}`} status={<StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status)} />} action={<div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Select aria-label={`Cliente para ${shipment.display_code}`} value={pendingClientSelection[shipment.id] || ""} onChange={(event) => setPendingClientSelection((current) => ({ ...current, [shipment.id]: event.target.value }))}><option value="">Selecciona cliente</option>{availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select><Button size="sm" disabled={pendingActionId === shipment.id || !pendingClientSelection[shipment.id]} onClick={() => void linkPendingShipment(shipment)}>{pendingActionId === shipment.id ? "Vinculando..." : "Vincular"}</Button></div>} />)}</div>
          </>
        )}
      </Card>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : loadError ? (
        <Card className="border-danger/30 bg-danger/10" role="alert"><p className="text-sm text-danger">{loadError}</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadClients()}>Reintentar</Button></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No hay clientes para este filtro" description="Ajusta la búsqueda o registra el primer cliente de tu cartera." action={<Button onClick={openCreate}>Crear cliente</Button>} />
      ) : (
        <Card title="Cartera de clientes" headerAction={<span className="text-sm text-ink-secondary">Mostrando {rows.length} de {meta.total}</span>} flush>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary"><tr><th className="px-6 py-3">Cliente</th><th className="px-3 py-3">Facturación</th><th className="px-3 py-3">Teléfono</th><th className="px-3 py-3">Envíos</th><th className="px-3 py-3">Deuda</th><th className="px-3 py-3">Estado</th><th className="px-6 py-3">Acciones</th></tr></thead>
              <tbody>{rows.map((item) => { const billingTypes = getClientBillingTypes(item); const archived = isArchivedClient(item); return <tr key={item.id} className="border-t border-edge align-top"><td className="px-6 py-4"><p className="font-display font-semibold text-ink">{item.name}</p>{item.company ? <p className="mt-1 text-xs text-ink-secondary">{item.company}</p> : null}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-1">{billingTypes.length ? billingTypes.map((type) => <Badge key={type} tone={billingTone[type]}>{billingText[type]}</Badge>) : <Badge>Sin definir</Badge>}</div></td><td className="px-3 py-4"><div className="flex items-center gap-2"><span className="text-ink">{item.phone || "-"}</span>{getWhatsAppUrl(item.phone) ? <a href={getWhatsAppUrl(item.phone) || undefined} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-button border border-success/25 bg-success/10 text-success"><WhatsAppIcon /></a> : null}</div></td><td className="px-3 py-4 text-ink">{receivableShipmentsMap[item.id] || item.shipments_count || 0}</td><td className="px-3 py-4 font-semibold text-ink">{formatCOP(receivableMap[item.id] || 0)}</td><td className="px-3 py-4"><StatusBadge status={archived ? "inactive" : item.is_active === false ? "inactive" : "active"} label={archived ? "Archivado" : item.is_active === false ? "Inactivo" : "Activo"} tone={archived ? "neutral" : item.is_active === false ? "warning" : "success"} /></td><td className="px-6 py-4"><div className="flex items-center gap-1"><Button variant="ghost" size="sm" aria-label={`Ver cliente ${item.name}`} onClick={() => router.push(`/clientes/${item.id}`)}><ClientActionIcon path={clientActionIcons.view} /></Button><Button variant="ghost" size="sm" aria-label={`Editar cliente ${item.name}`} onClick={() => openEdit(item)}><ClientActionIcon path={clientActionIcons.edit} /></Button><Button variant="ghost" size="sm" aria-label={`Eliminar cliente ${item.name}`} disabled={actionClientId === item.id} onClick={() => void deleteClient(item)} className="text-danger hover:bg-danger/10"><ClientActionIcon path={clientActionIcons.trash} /></Button></div></td></tr>; })}</tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 lg:hidden">{rows.map((item) => { const billingTypes = getClientBillingTypes(item); const archived = isArchivedClient(item); return <MobileListCard key={item.id} title={item.name} subtitle={item.company || item.phone || "Sin contacto adicional"} meta={`${receivableShipmentsMap[item.id] || item.shipments_count || 0} envíos · ${formatCOP(receivableMap[item.id] || 0)} por cobrar`} status={<StatusBadge status={archived ? "inactive" : item.is_active === false ? "inactive" : "active"} label={archived ? "Archivado" : item.is_active === false ? "Inactivo" : "Activo"} tone={archived ? "neutral" : item.is_active === false ? "warning" : "success"} />} action={<div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1">{billingTypes.map((type) => <Badge key={type} tone={billingTone[type]}>{billingText[type]}</Badge>)}</div><div className="flex items-center gap-2"><Button variant="secondary" size="sm" aria-label={`Ver cliente ${item.name}`} onClick={() => router.push(`/clientes/${item.id}`)}>Ver ficha</Button><Button variant="ghost" size="sm" aria-label={`Editar cliente ${item.name}`} onClick={() => openEdit(item)}>Editar</Button><Button variant="ghost" size="sm" aria-label={`Eliminar cliente ${item.name}`} disabled={actionClientId === item.id} onClick={() => void deleteClient(item)} className="text-danger">Eliminar</Button></div></div>} />; })}</div>
          <div className="border-t border-edge px-4 py-3 md:px-6"><Pagination currentPage={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} /></div>
        </Card>
      )}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <form onSubmit={saveClient} className="max-h-[100dvh] w-full overflow-y-auto rounded-t-card bg-surface p-5 shadow-card sm:max-h-[90vh] sm:max-w-2xl sm:rounded-card md:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Ficha comercial</p><h2 className="mt-1 font-display text-xl font-bold text-ink">{modal === "create" ? "Nuevo cliente" : "Editar cliente"}</h2></div><Button type="button" variant="ghost" aria-label="Cerrar" onClick={closeModal}>×</Button></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input label="Nombre" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre del cliente" />
              <Input label="Teléfono" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Número principal" />
              <Input label="Correo" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="correo@empresa.com" />
              <Input label="Empresa" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Razón social o marca" />
              <Input label="Teléfono de empresa" value={form.company_phone} onChange={(event) => setForm({ ...form, company_phone: event.target.value })} placeholder="Teléfono corporativo" />
              <Input label="NIT" value={form.nit} onChange={(event) => setForm({ ...form, nit: event.target.value })} placeholder="Identificación tributaria" />
              <div className="md:col-span-2"><p className="text-sm font-medium text-ink">Preferencias de pago</p><p className="mt-1 text-xs text-ink-secondary">El tipo real se elige por cada paquete; estas preferencias sirven como contexto comercial.</p><div className="mt-3 grid gap-2 md:grid-cols-3">{billingOptions.map((option) => <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-input border p-3 transition-colors ${form.billing_types.includes(option.value) ? "border-brand bg-brand-soft" : "border-edge bg-surface hover:bg-app-secondary"}`}><input type="checkbox" checked={form.billing_types.includes(option.value)} onChange={() => toggleBillingType(option.value)} className="mt-1 h-4 w-4 accent-brand" /><span><span className="block text-sm font-semibold text-ink">{option.label}</span><span className="mt-1 block text-xs text-ink-secondary">{option.description}</span></span></label>)}</div></div>
              <Textarea label="Notas" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Observaciones comerciales o de cobranza" wrapperClassName="md:col-span-2" />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cliente"}</Button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
