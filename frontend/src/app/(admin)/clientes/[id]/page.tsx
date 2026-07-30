"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { billingTypeLabel, formatCOP, formatDate, shipmentStatusLabel } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/skeleton";
import { WhatsAppClientPanel } from "@/components/whatsapp-client-panel";
import { usePageTitle } from "@/lib/page-title";
import { whatsappAdminUiEnabled } from "@/lib/features";
import type { ClientBillingType, ClientDetail, PaginatedResponse, Shipment } from "@/lib/types";

type DetailTab = "resumen" | "envios" | "direcciones" | "whatsapp";

const billingTooltip: Record<ClientBillingType, string> = {
  cash_on_delivery: "El conductor cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente despues de la entrega",
  prepaid: "El cliente ya pagó el envío",
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

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L4 20l.9-3.7A8.5 8.5 0 1 1 20.5 11.7Z" />
      <path d="M8.7 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.3.1.5-.1.7l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.2.4-.2.7-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3-.1.5-.4.7-.4.3-.9.4-1.4.3-2.5-.5-5.8-3.8-6.3-6.3-.1-.5 0-1 .3-1.4Z" />
    </svg>
  );
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
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{value}</p>
    </div>
  );
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
      const response = await apiGet<PaginatedResponse<Shipment>>(
        `/shipments?client_id=${clientId}&page=${targetPage}&per_page=10`,
      );
      setShipments(response.data || []);
      setShipmentMeta({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || 0,
      });
    } catch {
      setShipments([]);
      setShipmentMeta({ current_page: 1, last_page: 1, total: 0 });
      setShipmentError("No se pudieron cargar los envíos del cliente.");
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
      } catch {
        if (!cancelled) setError("No se pudo cargar la ficha del cliente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // The route id is the only source for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, validClientId]);

  const initials = client?.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CL";
  const whatsappUrl = getWhatsAppUrl(client?.phone);
  const billingTypes = client ? getBillingTypes(client) : [];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button
          type="button"
          onClick={() => router.push("/clientes")}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 transition-colors duration-150 hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-[#2a2a3e] dark:text-slate-200 dark:hover:border-primary dark:hover:bg-primary/10 dark:hover:text-primary"
        >
          <ArrowLeftIcon />
          Clientes
        </button>
        <span aria-hidden="true">/</span>
        <span className="max-w-[min(60vw,28rem)] truncate">{client?.name || "Detalle"}</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-12" />
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-issue/30 bg-issue/5 p-6 text-center">
          <p className="text-sm text-issue">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/clientes")}
            className="mt-4 min-h-10 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-all duration-150 active:scale-95"
          >
            Volver a clientes
          </button>
        </div>
      ) : client ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-[#2a2a3e] dark:bg-[#1a1a2e]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Ficha del cliente</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-bold text-slate-900 dark:text-[#e0e0e0]">{client.name}</h1>
                    {client.deleted_at ? (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                        Archivado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {client.company ? `Empresa relacionada: ${client.company}` : "Sin empresa relacionada"}
                  </p>
                </div>
              </div>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm font-semibold text-emerald-600 transition-all duration-150 hover:border-emerald-500 hover:bg-emerald-100 hover:text-emerald-700 hover:shadow-[0_0_0_3px_rgba(34,197,94,0.16)] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:border-emerald-300 dark:hover:bg-emerald-400/20 dark:hover:text-emerald-200 md:self-center"
                >
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </section>

          {client.deleted_at ? (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
              Cliente archivado. Sus paquetes e historial siguen disponibles.
            </p>
          ) : null}

          <div role="tablist" aria-label="Secciones del cliente" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#2a2a3e]">
            {([
              ["resumen", "Resumen"],
              ["envios", `Envíos (${shipmentMeta.total})`],
              ["direcciones", `Direcciones (${client.addresses?.length || 0})`],
              ...(whatsappAdminUiEnabled ? [["whatsapp", "WhatsApp"]] : []),
            ] as Array<[DetailTab, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#202035]"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "resumen" ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 dark:border-primary/30 dark:bg-primary/[0.08]">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Contacto de cobro</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Persona principal para consultar saldos y realizar cobros.</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailInfoItem label="Nombre" value={client.name} />
                    <DetailInfoItem label="Teléfono" value={client.phone} />
                    <DetailInfoItem label="Correo" value={client.email} />
                  </dl>
                </section>
                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2a2a3e] dark:bg-[#16162a]">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Empresa / razón social</p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-[#e0e0e0]">{client.company || "Sin empresa registrada"}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contexto corporativo asociado al contacto.</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailInfoItem label="NIT" value={client.nit} />
                    <DetailInfoItem label="Teléfono de empresa" value={client.company_phone} />
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
                  {billingTypes.length > 0 ? billingTypes.map((billingType) => (
                    <span
                      key={billingType}
                      title={billingTooltip[billingType]}
                      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-500/20 dark:text-slate-200"
                    >
                      {billingTypeLabel(billingType)}
                    </span>
                  )) : <span className="text-xs text-slate-500 dark:text-slate-400">Sin preferencias registradas</span>}
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-3">
                <DetailMetric label="Envíos" value={String(client.financial_summary?.total_shipments || 0)} />
                <DetailMetric label="Deuda" value={formatCOP(client.financial_summary?.total_owed || 0)} />
                <DetailMetric label="Ingresos" value={formatCOP(client.financial_summary?.total_revenue || 0)} />
              </div>
              {client.notes ? (
                <section className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Notas</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{client.notes}</p>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "envios" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">Mostrando {shipments.length} de {shipmentMeta.total} envíos</p>
                <span className="text-xs text-slate-500 dark:text-slate-400">Últimos movimientos del cliente</span>
              </div>
              {shipmentsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
                </div>
              ) : shipmentError ? (
                <div className="rounded-xl border border-issue/30 bg-issue/5 p-4">
                  <p className="text-sm text-issue">{shipmentError}</p>
                  <button type="button" onClick={() => void loadShipments(shipmentMeta.current_page)} className="mt-3 min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-[#2a2a3e]">
                    Reintentar
                  </button>
                </div>
              ) : shipments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">Sin envíos para este cliente.</p>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {shipments.map((shipment) => (
                      <article key={shipment.id} className="rounded-xl border border-slate-200 p-3 dark:border-[#2a2a3e]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-[#e0e0e0]">{shipment.display_code}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{shipment.recipient_name || "-"}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">{shipmentStatusLabel(shipment.status)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</p><p className="mt-1 text-slate-700 dark:text-slate-200">{formatDate(shipment.created_at)}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Monto</p><p className="mt-1 font-semibold text-slate-900 dark:text-[#e0e0e0]">{formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}</p></div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"><tr><th className="py-2">Guía</th><th className="py-2">Destinatario</th><th className="py-2">Estado</th><th className="py-2">Fecha</th><th className="py-2">Monto</th></tr></thead>
                      <tbody>{shipments.map((shipment) => <tr key={shipment.id} className="border-t border-slate-100 dark:border-[#2a2a3e]"><td className="py-2 font-semibold dark:text-[#e0e0e0]">{shipment.display_code}</td><td className="py-2 dark:text-slate-300">{shipment.recipient_name}</td><td className="py-2 dark:text-slate-300">{shipmentStatusLabel(shipment.status)}</td><td className="py-2 dark:text-slate-300">{formatDate(shipment.created_at)}</td><td className="py-2 dark:text-slate-300">{formatCOP(Number(shipment.cod_amount || shipment.shipping_cost || 0))}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <Pagination currentPage={shipmentMeta.current_page} lastPage={shipmentMeta.last_page} onPageChange={(target) => void loadShipments(target)} />
                </>
              )}
            </section>
          ) : null}

          {tab === "direcciones" ? (
            <section>
              {(client.addresses || []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-[#2a2a3e] dark:text-slate-400">Sin direcciones registradas.</p>
              ) : (
                <ul className="space-y-2 text-sm dark:text-slate-300">
                  {(client.addresses || []).map((address) => (
                    <li key={address.id} className="rounded-xl border border-slate-200 p-4 dark:border-[#2a2a3e]">
                      <p className="font-medium text-slate-900 dark:text-[#e0e0e0]">{address.label || "Dirección"}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{address.address}</p>
                      {address.zone ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Zona: {address.zone}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {whatsappAdminUiEnabled && tab === "whatsapp" ? (
            <WhatsAppClientPanel clientId={client.id} clientName={client.name} addresses={client.addresses || []} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
