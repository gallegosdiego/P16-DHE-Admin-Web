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
