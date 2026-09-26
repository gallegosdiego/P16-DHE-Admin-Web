"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, apiFormData, apiGet, apiSend, describeApiError } from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import { preparePhoto } from "@/lib/prepare-photo";
import { usePageTitle } from "@/lib/page-title";
import {
  buildTimelineFromShipment,
  collectShipmentPhotos,
  normalizeTimelineResponse,
  shipmentSummaryLine,
  type TimelineItem,
} from "@/lib/shipment-timeline";
import { financialStatusLabel, formatCOP, shipmentStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { PrintReceiptButton } from "@/components/print-receipt";
import { Button, Card, CurrencyInput, EmptyState, StatusBadge } from "@/components/ui";
import { paymentLabel, type ShipmentDetail } from "../_components/labels";
import { ShipmentHistory } from "../_components/shipment-history";
import { ShipmentPhotos, MAX_UPLOAD_PHOTOS } from "../_components/shipment-photos";
import { LocationTools } from "../_components/location-tools";

/**
 * Rutas nuevas de la API que pueden no estar desplegadas todavía (el panel sale
 * antes que la API). Si responden 404/405 una vez, no se vuelven a pedir en la
 * sesión y la pantalla usa el respaldo sin mostrar error.
 */
const unsupported = { timeline: false, addPhotos: false };

function isMissingEndpoint(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 405);
}

const resolveUrl = (value?: string | null) => resolveApiAssetUrl(value);

function InfoBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      <div className="mt-1 text-sm text-ink">{children}</div>
    </div>
  );
}

export default function PaqueteDetallePage() {
  const params = useParams<{ id: string }>();
  const shipmentId = Number(params.id);
  const validId = Number.isInteger(shipmentId) && shipmentId > 0;
  const { showToast } = useToast();

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState(validId ? "" : "El paquete solicitado no es válido.");
  const [apiTimeline, setApiTimeline] = useState<TimelineItem[] | null>(null);
  const [canAddPhotos, setCanAddPhotos] = useState(!unsupported.addPhotos);
  const [uploading, setUploading] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState(0);
  const [savingAmount, setSavingAmount] = useState(false);

  usePageTitle(`${shipment?.display_code ?? "Paquete"} | Danhei Express`);

  const loadTimeline = useCallback(async () => {
    if (unsupported.timeline) {
      setApiTimeline(null);
      return;
    }
    try {
      const response = await apiGet<unknown>(`/shipments/${shipmentId}/timeline`);
      setApiTimeline(normalizeTimelineResponse(response, resolveUrl));
    } catch (err) {
      // 404/405: la API aún no tiene historial unificado → se arma aquí.
      // Cualquier otro error tampoco rompe la pantalla: se usa el respaldo.
      if (isMissingEndpoint(err)) unsupported.timeline = true;
      setApiTimeline(null);
    }
  }, [shipmentId]);

  const load = useCallback(async () => {
    if (!validId) return;
    setLoading(true);
    try {
      const [detail] = await Promise.all([apiGet<ShipmentDetail>(`/shipments/${shipmentId}`), loadTimeline()]);
      setShipment(detail);
      setError("");
    } catch (err) {
      setError(describeApiError(err, "No se pudo cargar el paquete.").message);
    } finally {
      setLoading(false);
    }
  }, [loadTimeline, shipmentId, validId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!shipment) return [];
    return apiTimeline ?? buildTimelineFromShipment(shipment, resolveUrl);
  }, [apiTimeline, shipment]);

  const photos = useMemo(
    () => (shipment ? collectShipmentPhotos(shipment, timeline, resolveUrl) : []),
    [shipment, timeline]
  );

  const summary = useMemo(() => (shipment ? shipmentSummaryLine(shipment, timeline) : ""), [shipment, timeline]);

  const uploadPhotos = async (files: File[]) => {
    if (!shipment) return;
    if (files.length > MAX_UPLOAD_PHOTOS) {
      showToast(`Puedes subir hasta ${MAX_UPLOAD_PHOTOS} fotos a la vez.`, "error");
      return;
    }
    setUploading(true);
    try {
      const prepared = await Promise.all(files.map((file) => preparePhoto(file)));
      const body = new FormData();
      prepared.forEach((file) => body.append("photos[]", file));
      await apiFormData(`/shipments/${shipment.id}/evidence`, "POST", body);
      showToast(prepared.length === 1 ? "Foto agregada" : `${prepared.length} fotos agregadas`, "success");
      await load();
    } catch (err) {
      if (isMissingEndpoint(err)) {
        unsupported.addPhotos = true;
        setCanAddPhotos(false);
        showToast("Por ahora no se pueden agregar fotos desde el panel.", "info");
      } else {
        showToast(describeApiError(err, "No se pudo subir la foto.").message, "error");
      }
    } finally {
      setUploading(false);
    }
  };

  const saveAmount = async () => {
    if (!shipment) return;
    if (!(amountDraft > 0)) {
      showToast("Escribe un monto mayor a 0", "error");
      return;
    }
    setSavingAmount(true);
    try {
      await apiSend(`/shipments/${shipment.id}`, "PUT", { cod_amount: amountDraft });
      showToast("Monto actualizado", "success");
      setShipment({ ...shipment, cod_amount: amountDraft });
      setAmountOpen(false);
    } catch (err) {
      showToast(describeApiError(err, "No se pudo actualizar el monto.").message, "error");
    } finally {
      setSavingAmount(false);
    }
  };

  const backLink = (
    <Link href="/pedidos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand hover:underline">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Paquetes
    </Link>
  );

  if (loading && !shipment) {
    return (
      <div className="space-y-4">
        {backLink}
        <Card className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </Card>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          title="No encontramos este paquete"
          description={error || "Revisa el número de guía e inténtalo de nuevo."}
          action={
            validId ? (
              <Button variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const isCod = shipment.payment_type === "cash_on_delivery";
  const codAmount = Number(shipment.cod_amount ?? 0);
  const collected = Number(shipment.cod_collected_amount ?? 0);
  const driverName = shipment.driver?.name || shipment.driver_name || null;
  const senderName =
    shipment.client_name || shipment.client?.name || shipment.sender_name || shipment.sender_company || "Sin remitente";
  const senderExtra = [shipment.sender_company && shipment.sender_company !== senderName ? shipment.sender_company : null, shipment.sender_phone || shipment.client?.phone]
    .filter(Boolean)
    .join(" · ");
  const meta = shipment.recipient_address_meta;

  return (
    <div className="animate-fade-in space-y-4 md:space-y-6">
      {backLink}

      {/* 1. Encabezado: qué es, dónde está y a quién va */}
      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Guía</p>
            <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{shipment.display_code}</h1>
            <p className="mt-1 text-base font-medium text-ink" data-testid="shipment-summary">
              {summary}
            </p>
          </div>
          <StatusBadge
            status={shipment.status}
            label={shipmentStatusLabel(shipment.status)}
            className="self-start px-3! py-1! text-sm!"
          />
        </div>

        <div className="grid gap-4 border-t border-edge pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoBlock label="Destinatario">
            <p className="font-semibold">{shipment.recipient_name || "Sin nombre"}</p>
            {shipment.recipient_phone ? (
              <a href={`tel:${shipment.recipient_phone}`} className="text-brand hover:underline">
                {shipment.recipient_phone}
              </a>
            ) : (
              <p className="text-ink-secondary">Sin teléfono</p>
            )}
          </InfoBlock>
          <InfoBlock label="Dirección">
            <p className="font-semibold">{shipment.recipient_address}</p>
            {meta?.unit_details ? <p className="text-ink-secondary">{meta.unit_details}</p> : null}
            {meta?.neighborhood ? <p className="text-ink-secondary">Barrio {meta.neighborhood}</p> : null}
            {meta?.reference ? <p className="text-ink-secondary">Referencia: {meta.reference}</p> : null}
            <p className="text-ink-secondary">{shipment.recipient_city || "Bogotá"}</p>
            {shipment.delivery_instructions ? (
              <p className="mt-1 text-ink-secondary">Indicaciones: {shipment.delivery_instructions}</p>
            ) : null}
          </InfoBlock>
          <InfoBlock label="Remitente">
            <p className="font-semibold">{senderName}</p>
            {senderExtra ? <p className="text-ink-secondary">{senderExtra}</p> : null}
          </InfoBlock>
          <InfoBlock label="Piloto">
            <p className="font-semibold">{driverName || "Sin piloto"}</p>
          </InfoBlock>
          <InfoBlock label="Cobro">
            <p className="font-semibold">{paymentLabel[shipment.payment_type || "cash_on_delivery"]}</p>
            {isCod ? (
              codAmount > 0 ? (
                <p>
                  Cobrar al entregar: <strong className="font-display">{formatCOP(codAmount)}</strong>
                </p>
              ) : (
                <p className="font-semibold text-danger">Falta definir el monto a cobrar</p>
              )
            ) : (
              <p>Valor del envío: {formatCOP(Number(shipment.shipping_cost || 0))}</p>
            )}
            {isCod && collected > 0 ? <p className="text-success">Recaudado: {formatCOP(collected)}</p> : null}
            {shipment.financial_status ? (
              <p className="text-ink-secondary">Estado del pago: {financialStatusLabel(shipment.financial_status)}</p>
            ) : null}
          </InfoBlock>
        </div>

        <div className="flex flex-col gap-2 border-t border-edge pt-4 sm:flex-row sm:flex-wrap">
          <PrintReceiptButton shipment={{ ...shipment, events: undefined, created_by_user: undefined }} label="Imprimir guía" />
          {isCod ? (
            <Button
              variant="secondary"
              onClick={() => {
                setAmountDraft(codAmount);
                setAmountOpen(true);
              }}
            >
              Editar monto
            </Button>
          ) : null}
          <Button variant="ghost" aria-expanded={showLocation} onClick={() => setShowLocation((value) => !value)}>
            {showLocation ? "Ocultar ubicación" : "Corregir ubicación"}
          </Button>
        </div>

        {showLocation ? <LocationTools shipment={shipment} onUpdated={setShipment} /> : null}
      </Card>

      {/* 2. Historial unificado */}
      <Card title="Historial">
        <ShipmentHistory items={timeline} />
      </Card>

      {/* 3. Fotos */}
      <ShipmentPhotos photos={photos} canUpload={canAddPhotos} uploading={uploading} onUpload={(files) => void uploadPhotos(files)} />

      {amountOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
          <Card
            role="dialog"
            aria-modal="true"
            aria-label="Editar monto a cobrar"
            className="mobile-modal-safe-area w-full max-w-sm rounded-b-none sm:rounded-card"
          >
            <h2 className="font-display text-lg font-bold text-ink">Monto a cobrar</h2>
            <p className="mt-1 text-sm text-ink-secondary">Lo que el piloto le cobra al destinatario al entregar.</p>
            <CurrencyInput
              autoFocus
              label="Monto"
              min={0}
              value={amountDraft}
              onValueChange={setAmountDraft}
              wrapperClassName="mt-4"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" disabled={savingAmount} onClick={() => setAmountOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={savingAmount || !(amountDraft > 0)} onClick={() => void saveAmount()}>
                {savingAmount ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
