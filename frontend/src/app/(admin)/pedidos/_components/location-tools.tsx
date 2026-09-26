"use client";

import { useState } from "react";
import { apiPost, describeApiError } from "@/lib/api";
import { zonesUiEnabled } from "@/lib/features";
import { useToast } from "@/components/toast";
import { Badge, Button } from "@/components/ui";
import type { ShipmentDetail } from "./labels";

type DetectionSuggestion = {
  detected_zone: string | null;
  locality: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  is_real: boolean;
  reason: string | null;
  available_zones?: Array<{ id: number; name: string; slug: string; city?: string }>;
};

/**
 * "Corregir ubicación": herramientas de mapa del paquete. Solo se usan cuando
 * el punto quedó mal o sin ubicar, por eso viven plegadas.
 */
export function LocationTools({
  shipment,
  onUpdated,
}: {
  shipment: ShipmentDetail;
  onUpdated: (next: ShipmentDetail) => void;
}) {
  const { showToast } = useToast();
  const [detecting, setDetecting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestion, setSuggestion] = useState<DetectionSuggestion | null>(null);
  const [zone, setZone] = useState(shipment.recipient_zone || "");

  const hasPoint = Boolean(shipment.recipient_lat && shipment.recipient_lng);
  const pointLabel =
    shipment.geocoding_status === "ready" && hasPoint
      ? "Ubicado en el mapa"
      : hasPoint
        ? "Ubicación aproximada"
        : "Sin ubicar en el mapa";

  const detect = async () => {
    setDetecting(true);
    setSuggestion(null);
    try {
      const response = await apiPost<DetectionSuggestion>(`/shipments/${shipment.id}/detect-location`, { mode: "suggest" });
      setSuggestion(response);
      setZone(response.detected_zone || shipment.recipient_zone || "");
    } catch (error) {
      showToast(describeApiError(error, "No se pudo buscar la ubicación.").message, "error");
    } finally {
      setDetecting(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const response = await apiPost<{ message: string; shipment: ShipmentDetail }>(
        `/shipments/${shipment.id}/detect-location`,
        {
          mode: "apply",
          zone: (zonesUiEnabled ? zone : suggestion?.detected_zone || shipment.recipient_zone) || null,
          lat: suggestion?.lat,
          lng: suggestion?.lng,
        }
      );
      showToast(response.message || "Ubicación guardada.", "success");
      if (response.shipment) onUpdated({ ...shipment, ...response.shipment });
      setSuggestion(null);
    } catch (error) {
      showToast(describeApiError(error, "No se pudo guardar la ubicación.").message, "error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3 rounded-card border border-edge bg-app-secondary/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{pointLabel}</p>
        {hasPoint ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${shipment.recipient_lat},${shipment.recipient_lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-brand hover:underline"
          >
            Ver en Google Maps
          </a>
        ) : null}
      </div>
      <p className="text-xs text-ink-secondary">
        Ciudad: <strong className="text-ink">{shipment.recipient_city || "Bogotá"}</strong>
        {zonesUiEnabled ? (
          <>
            {" · "}Zona: <strong className="text-ink">{shipment.recipient_zone || "Sin zona"}</strong>
          </>
        ) : null}
        {shipment.geocoding_status !== "ready" && shipment.geocoding_reason_label ? ` · ${shipment.geocoding_reason_label}` : null}
      </p>

      {suggestion ? (
        <div className="space-y-3 rounded-card border border-brand/20 bg-brand-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">
              {suggestion.lat && suggestion.lng
                ? `Encontramos la dirección${suggestion.neighborhood ? ` (barrio ${suggestion.neighborhood})` : ""}.`
                : "No encontramos la dirección en el mapa."}
            </p>
            {suggestion.is_real ? <Badge tone="success">Punto exacto</Badge> : null}
          </div>
          {suggestion.reason ? <p className="text-xs text-ink-secondary">{suggestion.reason}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {zonesUiEnabled ? (
              <select
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                aria-label="Zona"
                className="h-10 rounded-button border border-edge bg-surface px-2.5 text-xs font-medium text-ink"
              >
                <option value="">Selecciona zona</option>
                {(suggestion.available_zones || []).map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              size="sm"
              disabled={applying || (zonesUiEnabled ? !zone : !(suggestion.lat && suggestion.lng))}
              onClick={() => void apply()}
            >
              {applying ? "Guardando..." : "Guardar ubicación"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
              Descartar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" disabled={detecting} onClick={() => void detect()}>
          {detecting ? "Buscando..." : "Buscar la dirección en el mapa"}
        </Button>
      )}
    </div>
  );
}
