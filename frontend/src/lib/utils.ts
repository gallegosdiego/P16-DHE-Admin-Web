export const formatCOP = (amount: number): string =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

export const formatDate = (date: string): string => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
};

/** Fecha corta sin hora: "2 sep 2026". Para listas donde la hora estorba. */
export const formatDateShort = (date: string): string => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
};

/**
 * Dias calendario transcurridos desde una fecha. Devuelve 0 el mismo dia.
 *
 * Compara por dia, no por horas: un paquete ingresado ayer a las 11 p. m.
 * cuenta como 1 dia represado y no como 0, que es lo que veria el operario.
 */
export const daysSince = (date: string): number | null => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = startOfDay(new Date()) - startOfDay(value);

  return Math.max(0, Math.round(diff / 86_400_000));
};

/** Estados donde el paquete ya salio del flujo: no tiene sentido llamarlo represado. */
const settledStatuses = new Set(["delivered", "returned", "cancelled"]);

/**
 * Antiguedad de un paquete para la lista: "hace 3 dias" cuando lleva mas de un
 * dia sin cerrarse. Devuelve null cuando no hay nada que advertir.
 */
export const stalledLabel = (createdAt?: string | null, status?: string | null): string | null => {
  if (!createdAt || settledStatuses.has(String(status ?? ""))) return null;

  const days = daysSince(createdAt);
  if (days === null || days < 1) return null;

  return days === 1 ? "hace 1 día" : `hace ${days} días`;
};

export const formatDateInput = (
  date: Date = new Date(),
  timeZone = "America/Bogota"
): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  let year = "";
  let month = "";
  let day = "";

  for (const part of parts) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }

  return `${year}-${month}-${day}`;
};

export const shiftDateInput = (
  value: string,
  days: number,
  timeZone = "America/Bogota"
): string => {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return value;

  // Noon UTC avoids crossing the target timezone's calendar day at midnight.
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return formatDateInput(shifted, timeZone);
};

export const toTitle = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const shipmentStatusLabels: Record<string, string> = {
  registered: "Registrado",
  confirmed: "Confirmado",
  pickup_scheduled: "Recogida programada",
  picked_up: "Recogido",
  in_warehouse: "En bodega",
  assigned_to_route: "Asignado a ruta",
  in_transit: "En ruta",
  delivered: "Entregado",
  issue: "Novedad",
  returned: "Devuelto",
  cancelled: "Cancelado",
};

const routeStatusLabels: Record<string, string> = {
  planned: "Planeada",
  active: "Activa",
  completed: "Completada",
};

const routeStopStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  completed: "Completada",
  issue: "Novedad",
};

const driverStatusLabels: Record<string, string> = {
  active: "Activo",
  route: "En ruta",
  inactive: "Inactivo",
};

const billingTypeLabels: Record<string, string> = {
  cash_on_delivery: "Contra entrega",
  post_sale: "Cobro post entrega",
  prepaid: "Prepago",
  mercado_libre: "Mercado Libre",
};

const financialStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  collected: "Recaudado",
  settled: "Liquidado",
  invoiced: "Facturado",
  overdue: "Vencido",
  partial: "Parcial",
  paid: "Pagado",
};

const auditActionLabels: Record<string, string> = {
  created: "Creado",
  updated: "Actualizado",
  deleted: "Eliminado",
  restored: "Restaurado",
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  status_changed: "Estado cambiado",
  assigned: "Asignado",
  unassigned: "Desasignado",
  batch_status: "Cambio masivo de estado",
  batch_assign: "Asignación masiva",
  batch_delete: "Eliminación masiva",
  sin_accion: "Sin acción",
};

export const shipmentStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return shipmentStatusLabels[status] || toTitle(status);
};

export const routeStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return routeStatusLabels[status] || toTitle(status);
};

export const routeStopStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return routeStopStatusLabels[status] || toTitle(status);
};

export const driverStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return driverStatusLabels[status] || toTitle(status);
};

export const billingTypeLabel = (type?: string | null): string => {
  if (!type) return "Sin tipo";
  return billingTypeLabels[type] || toTitle(type);
};

export const financialStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return financialStatusLabels[status] || toTitle(status);
};

export const auditActionLabel = (action?: string | null): string => {
  if (!action) return "Sin acción";
  return auditActionLabels[action] || toTitle(action);
};
