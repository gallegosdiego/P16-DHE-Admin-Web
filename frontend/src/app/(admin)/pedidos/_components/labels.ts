import type { PaymentType, Shipment, ShipmentStatus } from "@/lib/types";
import type { TimelineSourceShipment } from "@/lib/shipment-timeline";

export const paymentLabel: Record<PaymentType, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

export const paymentTooltip: Record<PaymentType, string> = {
  cash_on_delivery: "El piloto cobra al destinatario y luego entrega a la empresa",
  post_sale: "Se factura al cliente después de la entrega",
  prepaid: "El cliente ya pagó el envío",
  mercado_libre: "Mercado Libre paga después de confirmar la entrega",
};

/** Fila del listado de paquetes. */
export type ShipmentListItem = Partial<Shipment> & {
  id: number;
  display_code: string;
  status: ShipmentStatus;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  driver_name?: string | null;
};

/** Detalle completo de `GET /shipments/{id}` (incluye custodia, intentos y fotos). */
export type ShipmentDetail = Omit<Shipment, "events" | "intake_photo" | "created_by_user"> &
  TimelineSourceShipment & {
    client_name?: string;
    client_phone?: string;
    driver_name?: string | null;
    cod_collected_amount?: number | null;
  };

/**
 * Filtros del listado por estado. Cada opción agrupa los estados reales que
 * para la operación significan lo mismo. La API filtra por un solo estado a la
 * vez, así que las opciones con varios estados consultan cada uno y juntan.
 */
export type StatusFilter = {
  key: string;
  label: string;
  statuses: ShipmentStatus[];
};

export const statusFilters: StatusFilter[] = [
  { key: "all", label: "Todos", statuses: [] },
  { key: "registered", label: "Registrado", statuses: ["registered", "confirmed", "pickup_scheduled", "picked_up"] },
  { key: "in_warehouse", label: "En bodega", statuses: ["in_warehouse"] },
  { key: "handed_to_driver", label: "Con el piloto", statuses: ["handed_to_driver"] },
  { key: "in_transit", label: "En ruta", statuses: ["assigned_to_route", "in_transit"] },
  { key: "delivered", label: "Entregado", statuses: ["delivered"] },
  { key: "issue", label: "Novedad", statuses: ["issue"] },
  { key: "returned", label: "Devuelto", statuses: ["returned"] },
  { key: "cancelled", label: "Cancelado", statuses: ["cancelled"] },
];

/** Traduce `?status=` (clave de filtro o estado real) a la clave del filtro. */
export function statusFilterKeyFromParam(value: string | null): string {
  if (!value) return "all";
  const byKey = statusFilters.find((filter) => filter.key === value);
  if (byKey) return byKey.key;
  const byStatus = statusFilters.find((filter) => filter.statuses.includes(value as ShipmentStatus));
  return byStatus?.key ?? "all";
}
