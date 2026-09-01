import { Badge, type BadgeTone } from "./badge";

/**
 * Mapa estado → tono según el libro de marca:
 * Pendiente→brand-soft/brand · En validación→info · Listo→success suave · Asignado→teal ·
 * Recogido→teal · En ruta→info · Entregado→success · Incidencia/Novedad→danger · Cancelado→gris.
 * El texto del estado siempre es visible: nunca se depende solo del color.
 */
const statusTones: Record<string, BadgeTone> = {
  // Envíos
  registered: "brand",
  confirmed: "info",
  pickup_scheduled: "teal",
  picked_up: "teal",
  in_warehouse: "info",
  assigned_to_route: "teal",
  in_transit: "info",
  delivered: "success",
  issue: "danger",
  returned: "warning",
  cancelled: "neutral",
  // Estados financieros / genéricos
  pending: "brand",
  collected: "teal",
  invoiced: "info",
  settled: "success",
  overdue: "danger",
  ready: "success",
  blocked: "danger",
  // Rutas y paradas
  planned: "brand",
  active: "info",
  completed: "success",
  // Pilotos
  route: "info",
  inactive: "neutral",
};

export type StatusBadgeProps = {
  /** Clave del estado (p. ej. "in_transit"). Determina el tono si no se pasa `tone`. */
  status?: string | null;
  /** Texto visible del chip (p. ej. el resultado de shipmentStatusLabel). */
  label: string;
  /** Fuerza un tono concreto por encima del mapa de estados. */
  tone?: BadgeTone;
  className?: string;
};

export function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const resolvedTone = tone ?? (status ? statusTones[status] : undefined) ?? "neutral";
  return (
    <Badge tone={resolvedTone} className={className}>
      {label}
    </Badge>
  );
}
