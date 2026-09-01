"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, describeApiError } from "@/lib/api";
import { billingTypeLabel, formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/skeleton";
import { WhatsAppClientPanel } from "@/components/whatsapp-client-panel";
import { usePageTitle } from "@/lib/page-title";
import { whatsappAdminUiEnabled } from "@/lib/features";
import { Badge, Button, Card, EmptyState, KpiCard, MobileListCard, StatusBadge, type BadgeTone } from "@/components/ui";
import type { ClientBillingType, ClientDetail, PaginatedResponse, Shipment } from "@/lib/types";

type DetailTab = "resumen" | "envios" | "direcciones" | "whatsapp";

const billingTooltip: Record<ClientBillingType, string> = {
  cash_on_delivery: "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente después de la entrega",
  prepaid: "El cliente ya pagó el envío",
};

const billingTone: Record<ClientBillingType, BadgeTone> = {
  cash_on_delivery: "warning",
  post_sale: "info",
  prepaid: "success",
};

function getBillingTypes(client: Pick<ClientDetail, "billing_type" | "billing_types">): ClientBillingType[] {
  const values = Array.from(new Set(client.billing_types || []));
  return values.length > 0 ? values : client.billing_type ? [client.billing_type] : [];
}

function getWhatsAppUrl(phone: string | null | undefined): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("57") ? digits : `57${digits}`}`;
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L4 20l.9-3.7A8.5 8.5 0 1 1 20.5 11.7Z" /><path d="M8.7 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.3.1.5-.1.7l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.2.4-.2.7-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3-.1.5-.4.7-.4.3-.9.4-1.4.3-2.5-.5-5.8-3.8-6.3-6.3-.1-.5 0-1 .3-1.4Z" /></svg>;
}

function DetailInfoItem({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</dt><dd className="mt-1 truncate text-sm font-medium text-ink">{value || "-"}</dd></div>;
}

export default function ClienteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const validClientId = Number.isInteger(clientId) && clientId > 0;
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentMeta, setShipmentMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [tab, setTab] = useState<DetailTab>("resumen");
  const [loading, setLoading] = useState(validClientId);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [error, setError] = useState(validClientId ? "" : "El cliente solicitado no es válido.");
  const [shipmentError, setShipmentError] = useState("");

  usePageTitle(client ? `${client.name} | Clientes | Danhei Express` : "Detalle cliente | Danhei Express");

  async function loadShipments(targetPage: number) {
    setShipmentsLoading(true);
    setShipmentError("");
    try {
      const response = await apiGet<PaginatedResponse<Shipment>>(`/shipments?client_id=${clientId}&page=${targetPage}&per_page=10`);
      setShipments(response.data || []);
      setShipmentMeta({ current_page: response.current_page || 1, last_page: response.last_page || 1, total: response.total || 0 });
    } catch (caught) {
      setShipments([]);
      setShipmentMeta({ current_page: 1, last_page: 1, total: 0 });
      setShipmentError(describeApiError(caught, "No se pudieron cargar los envíos del cliente.").message);
    } finally {
      setShipmentsLoading(false);
    }
  }

  useEffect(() => {
    if (!validClientId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiGet<ClientDetail>(`/clients/${clientId}`);
        if (cancelled) return;
        setClient(response);
        void loadShipments(1);
      } catch (caught) {
        if (!cancelled) setError(describeApiError(caught, "No se pudo cargar la ficha del cliente.").message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, validClientId]);

  const initials = client?.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CL";
  const billingTypes = client ? getBillingTypes(client) : [];
  const whatsappUrl = getWhatsAppUrl(client?.phone);

  if (loading) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-56" /><Skeleton className="h-40" /></div>;

  if (!client) {
    return <Card className="border-danger/30 bg-danger/10 text-center"><p className="text-sm text-danger">{error || "No se encontró el cliente."}</p><Button variant="secondary" className="mt-4" onClick={() => router.push("/clientes")}>Volver a clientes</Button></Card>;
  }

  const detailTabs: Array<[DetailTab, string]> = [
    ["resumen", "Resumen"],
    ["envios", `Envíos (${shipmentMeta.total})`],
    ["direcciones", `Direcciones (${client.addresses?.length || 0})`],
    ...(whatsappAdminUiEnabled ? [["whatsapp", "WhatsApp"] as [DetailTab, string]] : []),
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary"><Button variant="ghost" size="sm" onClick={() => router.push("/clientes")}>← Clientes</Button><span aria-hidden="true">/</span><span className="max-w-[min(60vw,28rem)] truncate text-ink">{client.name}</span></div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand">{initials}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Ficha del cliente</p><h1 className="mt-1 truncate font-display text-2xl font-bold text-ink">{client.name}</h1><p className="mt-1 text-sm text-ink-secondary">{client.company || "Sin empresa relacionada"}</p></div></div>
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-button border border-success/25 bg-success/10 px-4 text-sm font-semibold text-success"><WhatsAppIcon /> WhatsApp</a> : null}
        </div>
        <dl className="mt-5 grid gap-4 border-t border-edge pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><DetailInfoItem label="Teléfono" value={client.phone} /><DetailInfoItem label="Correo" value={client.email} /><DetailInfoItem label="NIT" value={client.nit} /><DetailInfoItem label="Teléfono empresa" value={client.company_phone} /></dl>
      </Card>

      {client.deleted_at ? <div className="rounded-input border border-warning/35 bg-warning/15 px-4 py-3 text-sm text-ink">Cliente archivado. Sus paquetes e historial siguen disponibles.</div> : null}

      <div role="tablist" aria-label="Secciones del cliente" className="flex gap-1 overflow-x-auto border-b border-edge">{detailTabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors ${tab === value ? "border-brand bg-brand-soft text-brand" : "border-transparent text-ink-secondary hover:bg-app-secondary"}`}>{label}</button>)}</div>

      {tab === "resumen" ? <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2"><Card title="Contacto de cobro"><p className="text-sm text-ink-secondary">Persona principal para consultar saldos y realizar cobros.</p><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailInfoItem label="Nombre" value={client.name} /><DetailInfoItem label="Teléfono" value={client.phone} /><DetailInfoItem label="Correo" value={client.email} /></dl></Card><Card title="Empresa relacionada"><p className="font-display text-lg font-semibold text-ink">{client.company || "Sin empresa registrada"}</p><p className="mt-1 text-sm text-ink-secondary">Contexto corporativo asociado al contacto.</p><dl className="mt-4 grid gap-4 sm:grid-cols-2"><DetailInfoItem label="NIT" value={client.nit} /><DetailInfoItem label="Teléfono empresa" value={client.company_phone} /></dl></Card></div>
        <Card title="Preferencias de pago" headerAction={<Badge tone="neutral">Informativas</Badge>}><p className="text-sm text-ink-secondary">El tipo real se define por cada paquete.</p><div className="mt-3 flex flex-wrap gap-2">{billingTypes.length ? billingTypes.map((type) => <Badge key={type} tone={billingTone[type]}>{billingTypeLabel(type)}<span className="sr-only">: {billingTooltip[type]}</span></Badge>) : <span className="text-sm text-ink-secondary">Sin preferencias registradas</span>}</div></Card>
        <div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Envíos" value={client.financial_summary?.total_shipments || 0} /><KpiCard label="Deuda" value={formatCOP(client.financial_summary?.total_owed || 0)} tone="warning" /><KpiCard label="Ingresos" value={formatCOP(client.financial_summary?.total_revenue || 0)} tone="success" /></div>
        {client.notes ? <Card title="Notas"><p className="text-sm leading-6 text-ink-secondary">{client.notes}</p></Card> : null}
      </div> : null}

      {tab === "envios" ? <Card title="Historial de envíos" headerAction={<span className="text-sm text-ink-secondary">{shipments.length} de {shipmentMeta.total}</span>}>
        {shipmentsLoading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : shipmentError ? <div className="rounded-input border border-danger/30 bg-danger/10 p-4 text-sm text-danger"><p>{shipmentError}</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadShipments(shipmentMeta.current_page)}>Reintentar</Button></div> : shipments.length === 0 ? <EmptyState title="Sin envíos para este cliente" description="Los movimientos asociados aparecerán aquí cuando se registre el primer envío." /> : <><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[680px] text-sm"><thead className="bg-app-secondary text-left text-xs uppercase tracking-wide text-ink-secondary"><tr><th className="px-3 py-3">Guía</th><th className="px-3 py-3">Destinatario</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Monto</th></tr></thead><tbody>{shipments.map((shipment) => <tr key={shipment.id} className="border-t border-edge"><td className="px-3 py-3 font-display font-semibold text-ink">{shipment.display_code}</td><td className="px-3 py-3 text-ink">{shipment.recipient_name || "-"}</td><td className="px-3 py-3"><StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status)} /></td><td className="px-3 py-3 text-ink-secondary">{formatDate(shipment.created_at)}</td><td className="px-3 py-3 font-semibold text-ink">{formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}</td></tr>)}</tbody></table></div><div className="space-y-3 lg:hidden">{shipments.map((shipment) => <MobileListCard key={shipment.id} title={shipment.display_code} subtitle={shipment.recipient_name || "Sin destinatario"} meta={`${formatDate(shipment.created_at)} · ${formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}`} status={<StatusBadge status={shipment.status} label={shipmentStatusLabel(shipment.status)} />} />)}</div><div className="mt-4 border-t border-edge pt-3"><Pagination currentPage={shipmentMeta.current_page} lastPage={shipmentMeta.last_page} onPageChange={(target) => void loadShipments(target)} /></div></>}
      </Card> : null}

      {tab === "direcciones" ? <Card title="Direcciones guardadas">{(client.addresses || []).length === 0 ? <EmptyState title="Sin direcciones registradas" description="Las direcciones de recogida y entrega aparecerán aquí." /> : <div className="grid gap-3 md:grid-cols-2">{client.addresses.map((address) => <article key={address.id} className="rounded-card border border-edge bg-app-secondary p-4"><div className="flex items-start justify-between gap-2"><p className="font-display font-semibold text-ink">{address.label || "Dirección"}</p>{address.city ? <Badge tone="neutral">{address.city}</Badge> : null}</div><p className="mt-2 text-sm text-ink">{address.address}</p>{address.zone ? <p className="mt-1 text-xs text-ink-secondary">Zona: {address.zone}</p> : null}</article>)}</div>}</Card> : null}

      {whatsappAdminUiEnabled && tab === "whatsapp" ? <WhatsAppClientPanel clientId={client.id} clientName={client.name} addresses={client.addresses || []} /> : null}
    </div>
  );
}
