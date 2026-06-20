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

export const shipmentStatusLabel = (status?: string | null): string => {
  if (!status) return "Sin estado";
  return shipmentStatusLabels[status] || toTitle(status);
};
