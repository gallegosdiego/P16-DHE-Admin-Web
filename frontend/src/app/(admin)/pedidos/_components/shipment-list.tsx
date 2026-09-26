"use client";

import Link from "next/link";
import { formatCOP, formatDateShort, shipmentStatusLabel, stalledLabel } from "@/lib/utils";
import { zonesUiEnabled } from "@/lib/features";
import { Badge, Button, Card, Select, StatusBadge, TableScroller } from "@/components/ui";
import type { Driver, ShipmentStatus } from "@/lib/types";
import { paymentLabel, paymentTooltip, type ShipmentListItem } from "./labels";

export type StatusAction = { next: ShipmentStatus; description: string; label: string };

export function getStatusAction(status: ShipmentStatus): StatusAction | null {
  if (status === "in_transit") return { next: "delivered", description: "Entregado", label: "Entregar" };
  if (status === "issue") return { next: "in_transit", description: "Reintento de entrega", label: "Reintentar" };
  return null;
}

const HANDOVER_STATUSES: ShipmentStatus[] = ["in_warehouse", "picked_up", "assigned_to_route"];

export function formatReceiptTime(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(date);
}

export type ShipmentListProps = {
  shipments: ShipmentListItem[];
  drivers: Driver[];
  statusLoadingId: number | null;
  assignLoadingId: number | null;
  handoverLoadingId: number | null;
  deleteLoadingId: number | null;
  detectingRowId: number | null;
  onOpen: (id: number) => void;
  onChangeStatus: (id: number, action: StatusAction) => void;
  onHandover: (id: number, code: string) => void;
  onAssign: (id: number, driverId: number | null) => void;
  onDelete: (id: number, code: string) => void;
  onDetectZone: (id: number) => void;
};

function clientName(item: ShipmentListItem) {
  return item.client_name || item.client?.name || item.sender_name || item.sender_company || "Sin cliente vinculado";
}

function clientPhone(item: ShipmentListItem) {
  return item.client_phone || item.client?.phone || item.sender_phone || item.recipient_phone || "--";
}

function CreatedLine({ item }: { item: ShipmentListItem }) {
  const stalled = stalledLabel(item.created_at, item.status);
  return (
    <>
      {formatDateShort(item.created_at)}
      {stalled ? (
        <>
          {" · "}
          <span className="font-semibold text-warning">{stalled}</span>
        </>
      ) : null}
    </>
  );
}

function Amount({ item, compact = false }: { item: ShipmentListItem; compact?: boolean }) {
  if (item.payment_type === "cash_on_delivery" && (!item.cod_amount || item.cod_amount <= 0)) {
    return (
      <span className="inline-flex w-fit rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
        Monto pendiente
      </span>
    );
  }
  return (
    <span className={compact ? "text-xs font-bold text-ink" : "font-semibold text-ink"}>
      {formatCOP(Number(item.cod_amount || item.shipping_cost || 0))}
    </span>
  );
}

function DriverSelect({
  item,
  drivers,
  loading,
  onAssign,
  compact,
}: {
  item: ShipmentListItem;
  drivers: Driver[];
  loading: boolean;
  onAssign: ShipmentListProps["onAssign"];
  compact?: boolean;
}) {
  const onChange = (raw: string) => {
    if (raw === "none") {
      if (item.driver_id != null) onAssign(item.id, null);
      return;
    }
    const nextDriverId = Number(raw);
    if (nextDriverId && nextDriverId !== item.driver_id) onAssign(item.id, nextDriverId);
  };
  const options = (
    <>
      <option value="" disabled>
        {loading ? "Guardando..." : compact ? "Piloto" : "Asignar piloto..."}
      </option>
      {/* Sin piloto: permite corregir una asignación equivocada. */}
      {item.driver_id != null ? <option value="none">Sin piloto (quitar)</option> : null}
      {drivers.map((driver) => (
        <option key={driver.id} value={driver.id}>
          {driver.name}
        </option>
      ))}
    </>
  );

  if (compact) {
    return (
      <select
        aria-label={`Asignar piloto a ${item.display_code}`}
        disabled={loading}
        value={item.driver_id != null ? String(item.driver_id) : ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 max-w-[120px] rounded-lg border border-edge bg-surface px-2 text-xs text-ink outline-none focus:border-brand"
      >
        {options}
      </select>
    );
  }
  return (
    <Select disabled={loading} value={item.driver_id != null ? String(item.driver_id) : ""} onChange={(event) => onChange(event.target.value)}>
      {options}
    </Select>
  );
}

const trashIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
  </svg>
);

/** Tabla de escritorio (≥ 1024px). */
export function ShipmentTable(props: ShipmentListProps) {
  const { shipments, drivers } = props;
  return (
    <Card flush className="hidden overflow-hidden lg:block">
      <TableScroller>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-edge bg-bg-secondary/60 font-sans text-xs uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3.5 font-semibold">Guía</th>
              <th className="px-4 py-3.5 font-semibold">Cliente</th>
              <th className="px-4 py-3.5 font-semibold">Destinatario</th>
              <th className="px-4 py-3.5 font-semibold">Dirección</th>
              {zonesUiEnabled ? <th className="px-4 py-3.5 font-semibold">Zona</th> : null}
              <th className="px-4 py-3.5 font-semibold">Estado</th>
              <th className="px-4 py-3.5 font-semibold">Piloto</th>
              <th className="px-4 py-3.5 font-semibold">Pago</th>
              <th className="px-4 py-3.5 font-semibold">Recepción</th>
              <th className="px-4 py-3.5 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {shipments.map((item) => {
              const action = getStatusAction(item.status);
              return (
                <tr key={item.id} className="transition-colors duration-150 hover:bg-brand-soft/20">
                  <td className="px-4 py-3.5">
                    <Link href={`/pedidos/${item.id}`} className="font-display font-bold text-ink hover:text-brand hover:underline">
                      {item.display_code}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      <CreatedLine item={item} />
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-ink">{clientName(item)}</p>
                    <p className="text-xs text-ink-secondary">{clientPhone(item)}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{item.recipient_name || "Sin destinatario"}</p>
                    <p className="text-xs text-ink-secondary">{item.recipient_phone || "--"}</p>
                  </td>
                  <td className="max-w-[200px] px-4 py-3.5 text-ink-secondary" title={item.recipient_address ?? ""}>
                    <p className="truncate">{item.recipient_address}</p>
                    {!zonesUiEnabled && item.recipient_city ? <p className="truncate text-xs">{item.recipient_city}</p> : null}
                  </td>
                  {zonesUiEnabled ? (
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm ${item.recipient_zone ? "font-medium text-ink-secondary" : "font-semibold text-amber-700 dark:text-amber-400"}`}>
                          {item.recipient_zone || "Sin zona"}
                        </span>
                        {!item.recipient_zone ? (
                          <button
                            type="button"
                            onClick={() => props.onDetectZone(item.id)}
                            disabled={props.detectingRowId === item.id}
                            className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
                            title="Detectar localidad automáticamente"
                          >
                            {props.detectingRowId === item.id ? "..." : "Detectar"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td className="px-4 py-3.5">
                    <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
                  </td>
                  <td className="px-4 py-3.5 text-ink-secondary">{item.driver_name || item.driver?.name || "Sin asignar"}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-0.5">
                      <span
                        title={paymentTooltip[item.payment_type || "cash_on_delivery"]}
                        className="inline-flex w-fit text-xs font-medium text-ink-secondary"
                      >
                        {paymentLabel[item.payment_type || "cash_on_delivery"]}
                      </span>
                      <Amount item={item} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-secondary">{formatReceiptTime(item.created_at)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => props.onOpen(item.id)}
                        title="Ver paquete"
                        aria-label={`Ver detalle de ${item.display_code}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                      </Button>
                      {action ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={props.statusLoadingId === item.id}
                          onClick={() => props.onChangeStatus(item.id, action)}
                          title={action.label}
                          aria-label={`${action.label}: ${item.display_code}`}
                        >
                          {action.label}
                        </Button>
                      ) : null}
                      {item.driver_id != null && HANDOVER_STATUSES.includes(item.status) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={props.handoverLoadingId === item.id}
                          onClick={() => props.onHandover(item.id, item.display_code)}
                          title="Entregar al piloto (registra custodia)"
                          aria-label={`Entregar ${item.display_code} al piloto`}
                        >
                          {props.handoverLoadingId === item.id ? "..." : "Entregar"}
                        </Button>
                      ) : null}
                      {drivers.length > 0 ? (
                        <DriverSelect item={item} drivers={drivers} loading={props.assignLoadingId === item.id} onAssign={props.onAssign} compact />
                      ) : null}
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={props.deleteLoadingId === item.id}
                        onClick={() => props.onDelete(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                        title="Eliminar pedido"
                        aria-label={`Eliminar ${item.display_code}`}
                      >
                        {trashIcon}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroller>
    </Card>
  );
}

/** Tarjetas para móvil y tableta (< 1024px). */
export function ShipmentCards(props: ShipmentListProps) {
  const { shipments, drivers } = props;
  return (
    <div className="space-y-3 lg:hidden">
      {shipments.map((item) => {
        const action = getStatusAction(item.status);
        return (
          <Card key={item.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/pedidos/${item.id}`} className="font-display text-base font-bold text-ink hover:text-brand">
                  {item.display_code}
                </Link>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  <CreatedLine item={item} />
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{clientName(item)}</p>
                <p className="text-xs text-ink-secondary">{clientPhone(item)}</p>
              </div>
              <StatusBadge status={item.status} label={shipmentStatusLabel(item.status)} />
            </div>

            <div className="rounded-card border border-edge bg-bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">Destino</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{item.recipient_name || item.client_name || "Sin destinatario"}</p>
              <p className="mt-0.5 text-xs text-ink-secondary">{item.recipient_address}</p>
              {zonesUiEnabled ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={item.recipient_zone ? "neutral" : "warning"}>{item.recipient_zone || "Sin zona"}</Badge>
                  {!item.recipient_zone ? (
                    <button
                      type="button"
                      onClick={() => props.onDetectZone(item.id)}
                      disabled={props.detectingRowId === item.id}
                      className="rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 disabled:opacity-50"
                    >
                      {props.detectingRowId === item.id ? "Detectando..." : "Detectar localidad"}
                    </button>
                  ) : null}
                </div>
              ) : item.recipient_city ? (
                <p className="text-xs text-ink-secondary">{item.recipient_city}</p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-card border border-edge p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Pago</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-secondary">{paymentLabel[item.payment_type || "cash_on_delivery"]}</span>
                  <Amount item={item} compact />
                </div>
              </div>
              <div className="rounded-card border border-edge p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">Recepción</p>
                <p className="mt-1 text-xs font-medium text-ink">{item.driver_name || item.driver?.name || "Sin asignar"}</p>
                <p className="text-[11px] text-ink-secondary">{formatReceiptTime(item.created_at)}</p>
              </div>
            </div>

            {drivers.length > 0 ? (
              <DriverSelect item={item} drivers={drivers} loading={props.assignLoadingId === item.id} onAssign={props.onAssign} />
            ) : null}

            {item.driver_id != null && HANDOVER_STATUSES.includes(item.status) ? (
              <Button
                variant="secondary"
                disabled={props.handoverLoadingId === item.id}
                onClick={() => props.onHandover(item.id, item.display_code)}
                className="w-full"
              >
                {props.handoverLoadingId === item.id ? "Registrando..." : "Entregar al piloto (custodia)"}
              </Button>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button variant="secondary" onClick={() => props.onOpen(item.id)} className="flex-1">
                Detalle
              </Button>
              {action ? (
                <Button
                  variant="primary"
                  disabled={props.statusLoadingId === item.id}
                  onClick={() => props.onChangeStatus(item.id, action)}
                  className="flex-1"
                >
                  {props.statusLoadingId === item.id ? "Guardando..." : action.label}
                </Button>
              ) : null}
              <Button
                variant="danger"
                disabled={props.deleteLoadingId === item.id}
                onClick={() => props.onDelete(item.id, item.display_code || item.tracking_code || `#${item.id}`)}
                aria-label={`Eliminar ${item.display_code}`}
              >
                {trashIcon}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
