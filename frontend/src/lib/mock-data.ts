export type OrderStatus = "route" | "pending" | "issue" | "delivered";

export type Order = {
  id: string;
  client: string;
  phone: string;
  address: string;
  zone: string;
  status: OrderStatus;
  driver: string;
  driverInitials: string;
  paymentType: "Contra entrega" | "Post-venta" | "Prepago";
  payment: number;
  time: string;
  notes: string;
  evidence: string;
  issueNote: string;
};

export type DriverStatus = "active" | "route" | "inactive";
export type Driver = {
  name: string;
  initials: string;
  phone: string;
  vehicle: string;
  plate: string;
  zone: string;
  status: DriverStatus;
  efficiency: number;
  lastActivity: string;
};

export const statusConfig: Record<
  OrderStatus,
  { label: string; className: string; textColor: string; chipBg: string }
> = {
  delivered: {
    label: "Entregado",
    className: "text-delivered bg-emerald-50",
    textColor: "text-delivered",
    chipBg: "bg-emerald-50",
  },
  route: {
    label: "En ruta",
    className: "text-route bg-blue-50",
    textColor: "text-route",
    chipBg: "bg-blue-50",
  },
  pending: {
    label: "Pendiente",
    className: "text-pending bg-orange-50",
    textColor: "text-pending",
    chipBg: "bg-orange-50",
  },
  issue: {
    label: "Novedad",
    className: "text-issue bg-rose-50",
    textColor: "text-issue",
    chipBg: "bg-rose-50",
  },
};

export const ordersSeed: Order[] = [
  { id: "#DHE12456", client: "Maria Gomez", phone: "300 456 1122", address: "Cl 85 # 15-20, Chapinero", zone: "Chapinero", status: "route", driver: "Juan Perez", driverInitials: "JP", paymentType: "Contra entrega", payment: 50000, time: "09:30 AM", notes: "Entregar en recepcion.", evidence: "", issueNote: "" },
  { id: "#DHE12455", client: "Pedro Ramirez", phone: "312 905 4411", address: "Cra 11 # 68-45, Kennedy", zone: "Kennedy", status: "route", driver: "Laura Sanchez", driverInitials: "LS", paymentType: "Contra entrega", payment: 35000, time: "09:20 AM", notes: "Llamar antes de llegar.", evidence: "", issueNote: "" },
  { id: "#DHE12454", client: "Daniel Herrera", phone: "301 222 6733", address: "Cl 140 # 12-50, Cedritos", zone: "Cedritos", status: "pending", driver: "Sin asignar", driverInitials: "--", paymentType: "Prepago", payment: 0, time: "09:15 AM", notes: "Paquete fragil.", evidence: "", issueNote: "" },
  { id: "#DHE12453", client: "Ana Martinez", phone: "320 118 9877", address: "Cra 7 # 32-16, Centro", zone: "Centro", status: "delivered", driver: "Carlos Torres", driverInitials: "CT", paymentType: "Contra entrega", payment: 25000, time: "08:45 AM", notes: "Pago exacto.", evidence: "Foto de entrega registrada", issueNote: "" },
  { id: "#DHE12452", client: "Jorge Lopez", phone: "315 445 2290", address: "Dg 23 Sur # 45-30, Bosa", zone: "Bosa", status: "issue", driver: "Miguel Angel", driverInitials: "MA", paymentType: "Contra entrega", payment: 40000, time: "08:30 AM", notes: "Cliente solo recibe en porteria.", evidence: "", issueNote: "Cliente no contesta telefono." },
  { id: "#DHE12451", client: "Camila Ruiz", phone: "310 807 6612", address: "Av Suba # 118-35, Suba", zone: "Suba", status: "delivered", driver: "Andres Rojas", driverInitials: "AR", paymentType: "Contra entrega", payment: 32000, time: "08:10 AM", notes: "Confirmar recaudo.", evidence: "Firma digital registrada", issueNote: "" },
  { id: "#DHE12450", client: "Felipe Mora", phone: "314 772 5501", address: "Cl 26 # 69-76, Salitre", zone: "Salitre", status: "pending", driver: "Sin asignar", driverInitials: "--", paymentType: "Contra entrega", payment: 46000, time: "07:55 AM", notes: "Recoger en bodega 2.", evidence: "", issueNote: "" },
];

export const driversSeed: Driver[] = [
  { name: "Juan Perez", initials: "JP", phone: "300 810 4401", vehicle: "Moto AKT 125", plate: "DX-124", zone: "Chapinero", status: "route", efficiency: 98, lastActivity: "09:30 AM" },
  { name: "Laura Sanchez", initials: "LS", phone: "311 640 2290", vehicle: "Moto Victory", plate: "DX-221", zone: "Kennedy", status: "route", efficiency: 96, lastActivity: "09:20 AM" },
  { name: "Carlos Torres", initials: "CT", phone: "320 905 1130", vehicle: "Moto NKD", plate: "DX-312", zone: "Centro", status: "active", efficiency: 94, lastActivity: "08:45 AM" },
  { name: "Miguel Angel", initials: "MA", phone: "315 448 7601", vehicle: "Moto Yamaha", plate: "DX-418", zone: "Bosa", status: "route", efficiency: 91, lastActivity: "08:30 AM" },
  { name: "Andres Rojas", initials: "AR", phone: "301 762 5519", vehicle: "Moto Honda", plate: "DX-509", zone: "Suba", status: "active", efficiency: 90, lastActivity: "08:10 AM" },
];

export const timelineSeed = [
  { title: "Maria Gomez", detail: "Pedido en ruta con Juan Perez", time: "09:30", status: "route" as const },
  { title: "Ana Martinez", detail: "Entrega confirmada", time: "08:45", status: "delivered" as const },
  { title: "Jorge Lopez", detail: "Novedad reportada por el conductor", time: "08:30", status: "issue" as const },
  { title: "Daniel Herrera", detail: "Pedido pendiente de asignacion", time: "09:15", status: "pending" as const },
  { title: "Camila Ruiz", detail: "Liquidacion COD registrada", time: "08:12", status: "delivered" as const },
  { title: "Felipe Mora", detail: "Esperando asignacion de conductor", time: "07:55", status: "pending" as const },
];

export const lineChartPoints = [
  { hour: "7:00", value: 12 },
  { hour: "8:00", value: 28 },
  { hour: "9:00", value: 44 },
  { hour: "10:00", value: 58 },
  { hour: "11:00", value: 69 },
  { hour: "12:00", value: 78 },
  { hour: "13:00", value: 88 },
  { hour: "14:00", value: 71 },
];

export const receivablesSeed = [
  { name: "Empresa ServiYa", amount: 450000, agingDays: 15 },
  { name: "Tienda MegaShop", amount: 230000, agingDays: 7 },
  { name: "Sr. Rodriguez", amount: 85000, agingDays: 3 },
  { name: "Almacen Central", amount: 120000, agingDays: 1 },
];

export const fixedExpensesSeed = [
  { name: "Arriendo local", amount: 2200000, dueDate: "2026-05-25", status: "pendiente" },
  { name: "Internet oficina", amount: 180000, dueDate: "2026-05-18", status: "pagado" },
];

export const payrollSeed = [
  { name: "Angel", role: "Administrador", salary: 1500000, frequency: "Mensual", status: "pagado" },
  { name: "Sandra", role: "Vendedora", salary: 1200000, frequency: "Mensual", status: "pendiente" },
  { name: "Carlos", role: "Despacho", salary: 900000, frequency: "Quincenal", status: "pagado" },
];

export const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
