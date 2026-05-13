const STORAGE_KEY = "danhei-admin-demo-v1";
const SESSION_KEY = "danhei-admin-session";

const seedData = {
  orders: [
    { id: "#DHE12456", client: "Maria Gomez", phone: "300 456 1122", address: "Cl 85 # 15-20, Chapinero", zone: "Chapinero", status: "route", driver: "Juan Perez", driverInitials: "JP", paymentType: "Contra entrega", payment: 50000, time: "09:30 AM", notes: "Entregar en recepcion.", evidence: "", issueNote: "" },
    { id: "#DHE12455", client: "Pedro Ramirez", phone: "312 905 4411", address: "Cra 11 # 68-45, Kennedy", zone: "Kennedy", status: "route", driver: "Laura Sanchez", driverInitials: "LS", paymentType: "Contra entrega", payment: 35000, time: "09:20 AM", notes: "Llamar antes de llegar.", evidence: "", issueNote: "" },
    { id: "#DHE12454", client: "Daniel Herrera", phone: "301 222 6733", address: "Cl 140 # 12-50, Cedritos", zone: "Cedritos", status: "pending", driver: "Sin asignar", driverInitials: "--", paymentType: "Prepago", payment: 0, time: "09:15 AM", notes: "Paquete fragil.", evidence: "", issueNote: "" },
    { id: "#DHE12453", client: "Ana Martinez", phone: "320 118 9877", address: "Cra 7 # 32-16, Centro", zone: "Centro", status: "delivered", driver: "Carlos Torres", driverInitials: "CT", paymentType: "Contra entrega", payment: 25000, time: "08:45 AM", notes: "Pago exacto.", evidence: "Foto de entrega registrada", issueNote: "" },
    { id: "#DHE12452", client: "Jorge Lopez", phone: "315 445 2290", address: "Dg 23 Sur # 45-30, Bosa", zone: "Bosa", status: "issue", driver: "Miguel Angel", driverInitials: "MA", paymentType: "Contra entrega", payment: 40000, time: "08:30 AM", notes: "Cliente solo recibe en porteria.", evidence: "", issueNote: "Cliente no contesta telefono." },
    { id: "#DHE12451", client: "Camila Ruiz", phone: "310 807 6612", address: "Av Suba # 118-35, Suba", zone: "Suba", status: "delivered", driver: "Andres Rojas", driverInitials: "AR", paymentType: "Contra entrega", payment: 32000, time: "08:10 AM", notes: "Confirmar recaudo.", evidence: "Firma digital registrada", issueNote: "" },
    { id: "#DHE12450", client: "Felipe Mora", phone: "314 772 5501", address: "Cl 26 # 69-76, Salitre", zone: "Salitre", status: "pending", driver: "Sin asignar", driverInitials: "--", paymentType: "Contra entrega", payment: 46000, time: "07:55 AM", notes: "Recoger en bodega 2.", evidence: "", issueNote: "" }
  ],
  drivers: [
    { name: "Juan Perez", initials: "JP", phone: "300 810 4401", vehicle: "Moto AKT 125", plate: "DX-124", zone: "Chapinero", status: "route", efficiency: 98, lastActivity: "09:30 AM" },
    { name: "Laura Sanchez", initials: "LS", phone: "311 640 2290", vehicle: "Moto Victory", plate: "DX-221", zone: "Kennedy", status: "route", efficiency: 96, lastActivity: "09:20 AM" },
    { name: "Carlos Torres", initials: "CT", phone: "320 905 1130", vehicle: "Moto NKD", plate: "DX-312", zone: "Centro", status: "active", efficiency: 94, lastActivity: "08:45 AM" },
    { name: "Miguel Angel", initials: "MA", phone: "315 448 7601", vehicle: "Moto Yamaha", plate: "DX-418", zone: "Bosa", status: "route", efficiency: 91, lastActivity: "08:30 AM" },
    { name: "Andres Rojas", initials: "AR", phone: "301 762 5519", vehicle: "Moto Honda", plate: "DX-509", zone: "Suba", status: "active", efficiency: 90, lastActivity: "08:10 AM" }
  ],
  timeline: [
    { title: "Maria Gomez", detail: "Pedido en ruta con Juan Perez", time: "09:30", status: "route" },
    { title: "Ana Martinez", detail: "Entrega confirmada", time: "08:45", status: "delivered" },
    { title: "Jorge Lopez", detail: "Novedad reportada por el conductor", time: "08:30", status: "issue" },
    { title: "Daniel Herrera", detail: "Pedido pendiente de asignacion", time: "09:15", status: "pending" }
  ],
  settings: {
    companyName: "Danhei Express",
    city: "Bogota",
    baseFare: 10000,
    codEnabled: true,
    codFee: 0,
    slaMinutes: 90,
    evidenceRequired: true,
    zones: ["Chapinero", "Kennedy", "Cedritos", "Centro", "Bosa", "Suba", "Salitre"],
    roles: ["Administrador", "Operador", "Conductor", "Cliente"],
    supportChannel: "WhatsApp"
  }
};

const statusConfig = {
  delivered: { label: "Entregado", chip: "status-delivered", color: "#12a85f" },
  route: { label: "En ruta", chip: "status-route", color: "#1f86ff" },
  pending: { label: "Pendiente", chip: "status-pending", color: "#ff8616" },
  issue: { label: "Novedad", chip: "status-issue", color: "#e72256" },
  returned: { label: "Devolucion", chip: "status-issue", color: "#8f96a3" }
};

const statusFilters = [
  { key: "all", label: "Todos" },
  { key: "route", label: "En ruta" },
  { key: "pending", label: "Pendiente" },
  { key: "issue", label: "Novedad" },
  { key: "delivered", label: "Entregado" }
];

const moduleDefinitions = [
  { title: "Pedidos", description: "Crear, asignar y monitorear entregas.", icon: "admin-icon-box", target: "#orders", metric: "orders", color: "#ae0082", soft: "#fff0fa" },
  { title: "Conductores", description: "Disponibilidad, eficiencia y rutas.", icon: "admin-icon-driver", target: "#drivers", metric: "drivers", color: "#1f86ff", soft: "#eaf4ff" },
  { title: "Clientes", description: "Base de clientes y seguimiento.", icon: "admin-icon-dashboard", target: "#clients", metric: "clients", color: "#12a85f", soft: "#eafaf1" },
  { title: "Novedades", description: "Problemas, detenidos y alertas.", icon: "admin-icon-alert", target: "#alerts", metric: "issues", color: "#e72256", soft: "#fff0f4" },
  { title: "Pagos", description: "Recaudo contra entrega y pendientes.", icon: "admin-icon-pay", target: "#payments", metric: "payments", color: "#ff8616", soft: "#fff3e7" },
  { title: "Reportes", description: "CSV operativo y desempeno.", icon: "admin-icon-chart", target: "#reports", metric: "reports", color: "#7357d8", soft: "#f3efff" },
  { title: "Configuracion", description: "Reglas, tarifas y usuarios.", icon: "admin-icon-settings", target: "#settings", metric: "settings", color: "#687083", soft: "#f2f3f6" }
];

const state = {
  orders: [],
  drivers: [],
  settings: {},
  timeline: [],
  activeFilter: "all",
  driverFilter: "all",
  search: "",
  notificationOpen: false,
  eventsBound: false
};

const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

const wait = (payload) => new Promise((resolve) => {
  window.setTimeout(() => resolve(structuredClone(payload)), 80);
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value, fallback = "", maxLength = 160) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanLongText(value, fallback = "", maxLength = 420) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanMoney(value) {
  return Math.max(0, Math.min(50000000, Math.round(Number(value) || 0)));
}

function cleanPercent(value, fallback = 90) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || fallback)));
}

function cleanPhone(value) {
  return cleanText(value, "300 000 0000", 24).replace(/[^\d\s()+-]/g, "").trim() || "300 000 0000";
}

function cleanList(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  const items = source.map((item) => cleanText(item, "", 42)).filter(Boolean);
  return [...new Set(items)].slice(0, 16);
}

function loadLocalData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeData(stored ? JSON.parse(stored) : structuredClone(seedData));
  } catch {
    return normalizeData(structuredClone(seedData));
  }
}

function normalizeData(data) {
  return {
    orders: (data.orders || []).slice(0, 250).map(normalizeOrder),
    drivers: (data.drivers || structuredClone(seedData.drivers)).slice(0, 80).map(normalizeDriver),
    settings: normalizeSettings(data.settings),
    timeline: (data.timeline || structuredClone(seedData.timeline)).slice(0, 80).map(normalizeTimelineItem)
  };
}

function normalizeTimelineItem(item) {
  return {
    title: cleanText(item?.title, "Sistema", 90),
    detail: cleanLongText(item?.detail, "Evento operativo", 180),
    time: cleanText(item?.time, getTimeNow(), 24),
    status: cleanOption(item?.status, Object.keys(statusConfig), "route")
  };
}

function normalizeSettings(settings = {}) {
  return {
    ...structuredClone(seedData.settings),
    ...settings,
    companyName: cleanText(settings.companyName, seedData.settings.companyName, 80),
    city: cleanText(settings.city, seedData.settings.city, 50),
    baseFare: cleanMoney(settings.baseFare ?? seedData.settings.baseFare),
    codFee: cleanMoney(settings.codFee ?? seedData.settings.codFee),
    slaMinutes: Math.max(1, Math.min(720, Math.round(Number(settings.slaMinutes) || seedData.settings.slaMinutes))),
    codEnabled: Boolean(settings.codEnabled ?? seedData.settings.codEnabled),
    evidenceRequired: Boolean(settings.evidenceRequired ?? seedData.settings.evidenceRequired),
    supportChannel: cleanText(settings.supportChannel, seedData.settings.supportChannel, 40),
    zones: cleanList(settings.zones, structuredClone(seedData.settings.zones)),
    roles: cleanList(settings.roles, structuredClone(seedData.settings.roles))
  };
}

function normalizeDriver(driver) {
  const name = cleanText(driver?.name, "Conductor", 80);
  return {
    phone: "300 000 0000",
    vehicle: "Moto",
    plate: "DX-000",
    zone: "Bogota",
    status: "active",
    lastActivity: "Sin actividad",
    ...driver,
    name,
    phone: cleanPhone(driver?.phone),
    vehicle: cleanText(driver?.vehicle, "Moto", 60),
    plate: cleanText(driver?.plate, "DX-000", 16).toUpperCase(),
    zone: cleanText(driver?.zone, "Bogota", 50),
    status: cleanOption(driver?.status, ["active", "route", "inactive"], "active"),
    lastActivity: cleanText(driver?.lastActivity, "Sin actividad", 30),
    initials: cleanText(driver?.initials, initialsFromName(name), 3).toUpperCase(),
    efficiency: cleanPercent(driver?.efficiency)
  };
}

function normalizeOrder(order) {
  const address = cleanText(order?.address, "Direccion pendiente", 140);
  const status = cleanOption(order?.status, Object.keys(statusConfig), "pending");
  const paymentType = cleanOption(order?.paymentType, ["Contra entrega", "Prepago"], "Contra entrega");
  const zone = cleanText(order?.zone || address.split(",").at(-1), "Bogota", 50);
  const paymentStatus = paymentType === "Contra entrega"
    ? cleanOption(order?.paymentStatus, ["pending", "collected", "settled"], status === "delivered" ? "collected" : "pending")
    : "settled";
  const driver = cleanText(order?.driver, "Sin asignar", 80);
  return {
    phone: "300 000 0000",
    zone,
    notes: "",
    evidence: "",
    issueNote: "",
    paymentStatus,
    ...order,
    id: cleanText(order?.id, generateOrderId(), 24),
    client: cleanText(order?.client, "Cliente sin nombre", 90),
    phone: cleanPhone(order?.phone),
    address,
    zone,
    status,
    driver,
    paymentType,
    payment: cleanMoney(order?.payment),
    time: cleanText(order?.time, getTimeNow(), 24),
    notes: cleanLongText(order?.notes, "", 280),
    evidence: cleanLongText(order?.evidence, "", 280),
    issueNote: cleanLongText(order?.issueNote, "", 280),
    paymentStatus,
    driverInitials: cleanText(order?.driverInitials, initialsFromName(driver), 3).toUpperCase()
  };
}

function saveLocalData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      orders: state.orders.slice(0, 250).map(normalizeOrder),
      drivers: state.drivers.slice(0, 80).map(normalizeDriver),
      settings: normalizeSettings(state.settings),
      timeline: state.timeline.slice(0, 12).map(normalizeTimelineItem)
    }));
  } catch {
    showToast("No se pudo guardar la demo local", "error");
  }
}

function fetchDashboardData() {
  return wait(loadLocalData());
}

function fetchOrders() {
  return wait(loadLocalData().orders);
}

function fetchDrivers() {
  return wait(loadLocalData().drivers);
}

function fetchSettings() {
  return wait(loadLocalData().settings);
}

function iconUse(id) {
  return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function toneStyles(tone) {
  return {
    pink: ["#fff0fa", "#ae0082"],
    blue: ["#eaf4ff", "#1f86ff"],
    green: ["#eafaf1", "#12a85f"],
    orange: ["#fff3e7", "#ff8616"],
    purple: ["#f3efff", "#7357d8"]
  }[tone] || ["#f2f3f6", "#687083"];
}

function getTimeNow() {
  return new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function getOrderStatusLabel(order) {
  return statusConfig[order.status]?.label || "Pendiente";
}

function initialsFromName(name) {
  if (!name || name === "Sin asignar") return "--";
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function getCounts() {
  return state.orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    counts.total += 1;
    return counts;
  }, { total: 0, route: 0, delivered: 0, issue: 0, pending: 0, returned: 0 });
}

function getDashboardModel() {
  const counts = getCounts();
  const totalToCollect = state.orders
    .filter((order) => order.paymentType === "Contra entrega" && order.paymentStatus === "pending")
    .reduce((sum, order) => sum + Number(order.payment || 0), 0);
  const totalCollected = state.orders
    .filter((order) => order.paymentType === "Contra entrega" && order.paymentStatus === "collected")
    .reduce((sum, order) => sum + Number(order.payment || 0), 0);
  const totalSettled = state.orders
    .filter((order) => order.paymentType === "Contra entrega" && order.paymentStatus === "settled")
    .reduce((sum, order) => sum + Number(order.payment || 0), 0);
  const successRate = counts.total ? Math.round((counts.delivered / counts.total) * 1000) / 10 : 0;

  return {
    kpis: [
      { label: "Pedidos hoy", value: counts.total, trend: 18, direction: "up", icon: "admin-icon-box", tone: "pink" },
      { label: "En ruta", value: counts.route, trend: 12, direction: "up", icon: "admin-icon-driver", tone: "blue" },
      { label: "Entregados", value: counts.delivered, trend: 25, direction: "up", icon: "admin-icon-dashboard", tone: "green" },
      { label: "Con novedad", value: counts.issue, trend: 20, direction: "down", icon: "admin-icon-alert", tone: "orange" },
      { label: "Devoluciones", value: counts.returned, trend: 25, direction: "down", icon: "admin-icon-pay", tone: "purple" }
    ],
    alerts: buildAlerts(),
    performance: buildPerformance(counts.delivered),
    performanceSummary: [
      { label: "Tiempo promedio de entrega", value: "1h 18m" },
      { label: "% Entregas exitosas", value: `${successRate}%` },
      { label: "Pedidos por conductor", value: state.drivers.length ? (counts.total / state.drivers.length).toFixed(1) : "0" }
    ],
    distribution: [
      { label: "Entregados", value: counts.delivered, color: statusConfig.delivered.color },
      { label: "En ruta", value: counts.route, color: statusConfig.route.color },
      { label: "Pendientes", value: counts.pending, color: statusConfig.pending.color },
      { label: "Novedad", value: counts.issue, color: statusConfig.issue.color },
      { label: "Devoluciones", value: counts.returned, color: statusConfig.returned.color }
    ],
    payments: [
      { label: "Total por cobrar", value: totalToCollect },
      { label: "Por liquidar", value: totalCollected },
      { label: "Liquidado oficina", value: totalSettled }
    ],
    moduleMetrics: {
      orders: counts.total,
      drivers: state.drivers.length,
      clients: new Set(state.orders.map((order) => order.client)).size,
      issues: counts.issue,
      payments: totalToCollect + totalCollected,
      reports: state.timeline.length,
      settings: Object.keys(state.settings).length
    },
    mapPins: [
      ...state.orders.slice(0, 6).map((order, index) => ({
        id: order.id,
        label: order.id.replace("#DHE", ""),
        type: order.status,
        x: `${22 + ((index * 17) % 58)}%`,
        y: `${25 + ((index * 23) % 55)}%`
      })),
      { id: "drivers", label: "DX", type: "driver", x: "23%", y: "52%" }
    ]
  };
}

function buildPerformance(delivered) {
  const base = [2, 8, 13, 19, 28, 33, 48, 55, 60, 70, 77, 82, 85];
  const scale = Math.max(delivered, 1) / 85;
  return ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"].map((hour, index) => ({
    hour,
    value: Math.min(100, Math.round(base[index] * scale))
  }));
}

function addTimeline(title, detail, status) {
  state.timeline.unshift({ title, detail, status, time: getTimeNow() });
  state.timeline = state.timeline.slice(0, 12);
}

function generateOrderId() {
  const maxId = state.orders.reduce((max, order) => {
    const numeric = Number(order.id.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 12456);
  return `#DHE${maxId + 1}`;
}

function renderAll() {
  const data = getDashboardModel();
  renderKpis(data.kpis);
  renderModules(data.moduleMetrics);
  renderClients();
  renderOrders();
  renderMap(data.mapPins);
  renderAlertSummary(data.alerts);
  renderAlerts(data.alerts);
  renderLineChart(data.performance);
  renderPerformanceSummary(data.performanceSummary);
  renderReportGrid();
  renderDrivers(getDriverRanking());
  renderDriverSummary();
  renderDistribution(data.distribution);
  renderPayments(data.payments);
  renderPaymentBoard();
  renderSettings();
  renderNotifications(data.alerts);
  renderTimeline(state.timeline);
  document.querySelector("[data-notification-count]").textContent = data.alerts.filter((alert) => !alert.title.startsWith("0 ")).length;
}

function buildAlerts() {
  const issueAlerts = state.orders.filter((order) => order.status === "issue").map((order) => ({
    id: order.id,
    title: `${order.id} con novedad`,
    detail: order.issueNote || "Requiere revision operativa",
    type: "issue",
    priority: "Alta",
    action: "resolve"
  }));
  const pendingAlerts = state.orders.filter((order) => order.status === "pending" || order.driver === "Sin asignar").map((order) => ({
    id: order.id,
    title: `${order.id} sin asignar`,
    detail: `${order.client} - ${order.zone}`,
    type: "delay",
    priority: "Media",
    action: "assign"
  }));
  const inactiveDrivers = state.drivers.filter((driver) => driver.status === "inactive").map((driver) => ({
    id: driver.name,
    title: `${driver.name} inactivo`,
    detail: `Zona base ${driver.zone}`,
    type: "driver",
    priority: "Media",
    action: "driver"
  }));
  return [...issueAlerts, ...pendingAlerts, ...inactiveDrivers].slice(0, 8);
}

function renderModules(metrics) {
  document.querySelector("[data-module-grid]").innerHTML = moduleDefinitions.map((module) => {
    const rawValue = metrics[module.metric] || 0;
    const value = module.metric === "payments" ? moneyFormatter.format(rawValue) : rawValue;
    return `
      <article class="module-card" style="--module-color:${module.color};--module-soft:${module.soft}">
        <div class="module-card-top">
          <span class="module-icon">${iconUse(module.icon)}</span>
          <span class="module-count">${value}</span>
        </div>
        <div>
          <strong>${escapeHtml(module.title)}</strong>
          <p>${escapeHtml(module.description)}</p>
        </div>
        <button type="button" data-module-target="${module.target}">Abrir modulo</button>
      </article>
    `;
  }).join("");
}

function getClients() {
  const clients = new Map();
  state.orders.forEach((order) => {
    const current = clients.get(order.client) || {
      name: order.client,
      phone: order.phone,
      addresses: new Set(),
      orders: 0,
      delivered: 0,
      issues: 0,
      total: 0,
      lastOrder: order.id
    };
    current.phone = order.phone || current.phone;
    current.addresses.add(order.address);
    current.orders += 1;
    current.delivered += order.status === "delivered" ? 1 : 0;
    current.issues += order.status === "issue" ? 1 : 0;
    current.total += Number(order.payment || 0);
    current.lastOrder = order.id;
    clients.set(order.client, current);
  });
  return [...clients.values()].map((client) => ({
    ...client,
    addresses: [...client.addresses]
  })).sort((a, b) => b.orders - a.orders);
}

function renderClients() {
  const clients = getClients();
  const totalRevenue = clients.reduce((sum, client) => sum + client.total, 0);
  const repeated = clients.filter((client) => client.orders > 1).length;
  document.querySelector("[data-client-summary]").innerHTML = [
    ["Clientes", clients.length],
    ["Recurrentes", repeated],
    ["Pedidos cliente", clients.length ? (state.orders.length / clients.length).toFixed(1) : "0"],
    ["Valor asociado", moneyFormatter.format(totalRevenue)]
  ].map(([label, value]) => `
    <div class="client-summary-card"><span>${label}</span><strong>${value}</strong></div>
  `).join("");

  document.querySelector("[data-clients]").innerHTML = clients.map((client) => `
    <article class="client-card">
      <div>
        <strong>${escapeHtml(client.name)}</strong>
        <span>${escapeHtml(client.phone)}</span>
      </div>
      <span>${client.orders} pedidos - ${client.delivered} entregados - ${client.issues} novedades</span>
      <span>${client.addresses.length} direcciones - ${moneyFormatter.format(client.total)}</span>
      <button type="button" data-client-name="${escapeHtml(client.name)}">Ver historial</button>
    </article>
  `).join("") || `<p class="empty-state">No hay clientes registrados.</p>`;
}

function renderKpis(kpis) {
  const target = document.querySelector("[data-kpis]");
  target.innerHTML = kpis.map((kpi) => {
    const [background, color] = toneStyles(kpi.tone);
    return `
      <article class="kpi-card">
        <div class="kpi-icon" style="background:${background};color:${color}">${iconUse(kpi.icon)}</div>
        <div>
          <p>${kpi.label}</p>
          <h3>${kpi.value}</h3>
          <span class="trend ${kpi.direction}">${kpi.direction === "up" ? "Sube" : "Baja"} ${kpi.trend}% vs ayer</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderTabs() {
  const target = document.querySelector("[data-order-tabs]");
  target.innerHTML = statusFilters.map((filter) => `
    <button class="${filter.key === state.activeFilter ? "is-active" : ""}" type="button" data-filter="${filter.key}">
      ${filter.label}
    </button>
  `).join("");
}

function getFilteredOrders() {
  const search = state.search.trim().toLowerCase();
  return state.orders.filter((order) => {
    const matchesFilter = state.activeFilter === "all" || order.status === state.activeFilter;
    const matchesDriver = state.driverFilter === "all" || order.driver === state.driverFilter;
    const matchesSearch = !search || [order.id, order.client, order.phone, order.address, order.zone, order.driver].some((value) => String(value).toLowerCase().includes(search));
    return matchesFilter && matchesDriver && matchesSearch;
  });
}

function renderOrders() {
  renderTabs();
  renderOrderDriverFilter();
  renderOrderSummary();
  const orders = getFilteredOrders();
  const tbody = document.querySelector("[data-orders-table]");
  const empty = document.querySelector("[data-orders-empty]");

  tbody.innerHTML = orders.map((order) => `
    <tr>
      <td><strong>${escapeHtml(order.id)}</strong></td>
      <td><span class="cell-stack"><strong>${escapeHtml(order.client)}</strong><span>${escapeHtml(order.phone)}</span></span></td>
      <td><span class="cell-stack"><strong>${escapeHtml(order.address)}</strong><span>${escapeHtml(order.notes || "Sin observaciones")}</span></span></td>
      <td>${escapeHtml(order.zone)}</td>
      <td><span class="status-chip ${statusConfig[order.status]?.chip || "status-pending"}">${getOrderStatusLabel(order)}</span></td>
      <td>
        <span class="driver-cell">
          <span class="mini-avatar">${escapeHtml(order.driverInitials)}</span>
          ${escapeHtml(order.driver)}
        </span>
      </td>
      <td>${escapeHtml(order.paymentType)}<br><strong>${order.payment ? moneyFormatter.format(order.payment) : "-"}</strong></td>
      <td>${escapeHtml(order.time)}</td>
      <td>
        <div class="row-actions">
          <button type="button" data-order-action="detail" data-order-id="${escapeHtml(order.id)}">Detalle</button>
          <button type="button" data-order-action="edit" data-order-id="${escapeHtml(order.id)}">Editar</button>
          <button type="button" data-order-action="assign" data-order-id="${escapeHtml(order.id)}">Asignar</button>
          <button type="button" data-order-action="status" data-order-id="${escapeHtml(order.id)}">Estado</button>
          <button type="button" data-order-action="issue" data-order-id="${escapeHtml(order.id)}">Novedad</button>
        </div>
      </td>
    </tr>
  `).join("");

  empty.hidden = orders.length > 0;
}

function renderOrderDriverFilter() {
  const target = document.querySelector("[data-driver-filter]");
  target.innerHTML = `
    <option value="all">Todos los conductores</option>
    <option value="Sin asignar">Sin asignar</option>
    ${state.drivers.map((driver) => `<option value="${escapeHtml(driver.name)}" ${state.driverFilter === driver.name ? "selected" : ""}>${escapeHtml(driver.name)}</option>`).join("")}
  `;
  target.value = state.driverFilter;
}

function renderOrderSummary() {
  const orders = getFilteredOrders();
  const pendingCash = orders
    .filter((order) => order.paymentType === "Contra entrega" && order.status !== "delivered")
    .reduce((sum, order) => sum + Number(order.payment || 0), 0);
  const zones = new Set(orders.map((order) => order.zone)).size;
  const assigned = orders.filter((order) => order.driver !== "Sin asignar").length;
  document.querySelector("[data-order-summary]").innerHTML = [
    ["Pedidos filtrados", orders.length],
    ["Zonas activas", zones],
    ["Asignados", assigned],
    ["Por cobrar", moneyFormatter.format(pendingCash)]
  ].map(([label, value]) => `
    <div class="order-summary-card"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function renderMap(pins) {
  const colors = { route: "#1f86ff", delivered: "#12a85f", pending: "#ff8616", issue: "#e72256", returned: "#8f96a3", driver: "#ae0082" };
  document.querySelector("[data-map]").innerHTML = pins.map((pin) => `
    <button class="map-pin ${pin.type === "driver" ? "driver" : ""}" type="button" data-map-id="${escapeHtml(pin.id)}" style="--x:${pin.x};--y:${pin.y};--pin-color:${colors[pin.type]}">${escapeHtml(pin.label)}</button>
  `).join("");
}

function renderNotifications(alerts) {
  const payments = getPaymentByDriver().filter((driver) => driver.collected > 0);
  const notifications = [
    ...alerts.map((alert) => ({ title: alert.title, detail: alert.detail, target: alert.id })),
    ...payments.map((driver) => ({ title: `${driver.name} debe liquidar`, detail: moneyFormatter.format(driver.collected), target: "payments" }))
  ].slice(0, 8);
  document.querySelector("[data-notifications-panel]").innerHTML = notifications.map((item) => `
    <button class="notification-item" type="button" data-notification-target="${escapeHtml(item.target)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </button>
  `).join("") || `<div class="notification-item"><strong>Sin notificaciones</strong><span>Operacion al dia</span></div>`;
}

function renderAlerts(alerts) {
  const meta = {
    issue: ["!", "#fff0f4", "#e72256"],
    delay: ["30", "#fff3e7", "#ff8616"],
    driver: ["i", "#eaf4ff", "#1f86ff"]
  };
  document.querySelector("[data-alerts]").innerHTML = alerts.map((alert) => {
    const [icon, background, color] = meta[alert.type];
    return `
      <article class="alert-item" data-alert-id="${escapeHtml(alert.id)}">
        <span class="alert-icon" style="background:${background};color:${color}">${icon}</span>
        <div><strong>${escapeHtml(alert.title)}</strong><span>${escapeHtml(alert.priority)} - ${escapeHtml(alert.detail)}</span></div>
        <div class="alert-actions">
          <button type="button" data-alert-action="detail" data-alert-id="${escapeHtml(alert.id)}">Detalle</button>
          ${alert.action === "resolve" ? `<button type="button" data-alert-action="resolve" data-alert-id="${escapeHtml(alert.id)}">Resolver</button>` : ""}
          ${alert.action === "assign" ? `<button type="button" data-alert-action="assign" data-alert-id="${escapeHtml(alert.id)}">Asignar</button>` : ""}
          ${alert.action === "driver" ? `<button type="button" data-alert-action="activate-driver" data-alert-id="${escapeHtml(alert.id)}">Activar</button>` : ""}
        </div>
      </article>
    `;
  }).join("") || `<p class="empty-state">No hay novedades activas.</p>`;
}

function renderAlertSummary(alerts) {
  const issue = alerts.filter((alert) => alert.type === "issue").length;
  const pending = alerts.filter((alert) => alert.type === "delay").length;
  const driver = alerts.filter((alert) => alert.type === "driver").length;
  document.querySelector("[data-alert-summary]").innerHTML = [
    ["Novedades", issue],
    ["Sin asignar", pending],
    ["Conductores", driver]
  ].map(([label, value]) => `
    <div class="alert-summary-card"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function renderLineChart(points) {
  const width = 760;
  const height = 230;
  const padding = { top: 18, right: 18, bottom: 34, left: 38 };
  const maxValue = 100;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coords = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (point.value / maxValue) * plotHeight;
    return { ...point, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${padding.left + plotWidth},${padding.top + plotHeight}`;
  const grid = [0, 20, 40, 60, 80, 100].map((value) => {
    const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
    return `<line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}"></line><text class="chart-label" x="4" y="${y + 4}">${value}</text>`;
  }).join("");
  const labels = coords.filter((_, index) => index % 2 === 0).map((point) => `<text class="chart-label" x="${point.x - 14}" y="${height - 8}">${point.hour}</text>`).join("");

  document.querySelector("[data-line-chart]").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafica de entregas por hora">
      ${grid}
      <polygon class="chart-area" points="${area}"></polygon>
      <polyline class="chart-line" points="${line}"></polyline>
      ${coords.map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="3"></circle>`).join("")}
      ${labels}
    </svg>
  `;
}

function renderPerformanceSummary(items) {
  document.querySelector("[data-performance-summary]").innerHTML = items.map((item) => `
    <div class="summary-card"><span>${item.label}</span><strong>${item.value}</strong></div>
  `).join("");
}

function renderReportGrid() {
  const reports = [
    { type: "orders", title: "Pedidos", detail: `${state.orders.length} registros operativos` },
    { type: "drivers", title: "Conductores", detail: `${state.drivers.length} conductores activos/inactivos` },
    { type: "payments", title: "Pagos", detail: "Recaudo contra entrega por conductor" },
    { type: "alerts", title: "Novedades", detail: `${buildAlerts().length} alertas operativas` }
  ];
  document.querySelector("[data-report-grid]").innerHTML = reports.map((report) => `
    <article class="report-card">
      <strong>${report.title}</strong>
      <span>${report.detail}</span>
      <button type="button" data-report-type="${report.type}">Generar CSV</button>
    </article>
  `).join("");
}

function getDriverRanking() {
  return state.drivers.map((driver) => ({
    ...driver,
    deliveries: state.orders.filter((order) => order.driver === driver.name && order.status === "delivered").length,
    assigned: state.orders.filter((order) => order.driver === driver.name && order.status !== "delivered").length,
    issues: state.orders.filter((order) => order.driver === driver.name && order.status === "issue").length,
    cash: state.orders
      .filter((order) => order.driver === driver.name && order.paymentType === "Contra entrega" && order.paymentStatus !== "settled")
      .reduce((sum, order) => sum + Number(order.payment || 0), 0)
  })).sort((a, b) => b.deliveries - a.deliveries || b.efficiency - a.efficiency);
}

function renderDrivers(drivers) {
  const statusLabels = { active: "Activo", route: "En ruta", inactive: "Inactivo" };
  document.querySelector("[data-drivers]").innerHTML = drivers.map((driver) => `
    <article class="driver-card">
      <span class="mini-avatar">${escapeHtml(driver.initials)}</span>
      <div class="driver-card-main">
        <strong>${escapeHtml(driver.name)}</strong>
        <span>${escapeHtml(driver.phone)} - ${escapeHtml(driver.vehicle)} - ${escapeHtml(driver.plate)}</span>
        <div class="driver-card-meta">
          <span class="driver-pill ${driver.status}">${statusLabels[driver.status] || "Activo"}</span>
          <span class="driver-pill route">${driver.assigned} asignados</span>
          <span class="driver-pill">${driver.deliveries} entregas</span>
          <span class="driver-pill">${moneyFormatter.format(driver.cash)}</span>
        </div>
      </div>
      <div class="driver-actions">
        <button type="button" data-driver-action="detail" data-driver-name="${escapeHtml(driver.name)}">Detalle</button>
        <button type="button" data-driver-action="edit" data-driver-name="${escapeHtml(driver.name)}">Editar</button>
        <button type="button" data-driver-action="toggle" data-driver-name="${escapeHtml(driver.name)}">${driver.status === "inactive" ? "Activar" : "Inactivar"}</button>
      </div>
    </article>
  `).join("");
}

function renderDriverSummary() {
  const drivers = getDriverRanking();
  const active = drivers.filter((driver) => driver.status !== "inactive").length;
  const assigned = drivers.reduce((sum, driver) => sum + driver.assigned, 0);
  const cash = drivers.reduce((sum, driver) => sum + driver.cash, 0);
  document.querySelector("[data-driver-summary]").innerHTML = [
    ["Activos", active],
    ["Pedidos asignados", assigned],
    ["Recaudo en ruta", moneyFormatter.format(cash)]
  ].map(([label, value]) => `
    <div class="driver-summary-card"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function renderDistribution(distribution) {
  const total = distribution.reduce((sum, item) => sum + item.value, 0);
  const delivered = distribution.find((item) => item.label === "Entregados")?.value || 0;
  let cursor = 0;
  const slices = distribution.map((item) => {
    const start = total ? (cursor / total) * 100 : 0;
    cursor += item.value;
    const end = total ? (cursor / total) * 100 : 0;
    return `${item.color} ${start}% ${end}%`;
  }).join(", ");

  document.querySelector("[data-donut]").style.background = total ? `conic-gradient(${slices})` : "#eef1f5";
  document.querySelector("[data-donut-total]").textContent = delivered;
  document.querySelector("[data-donut-legend]").innerHTML = distribution.map((item) => {
    const percent = total ? Math.round((item.value / total) * 100) : 0;
    return `
      <div class="legend-item">
        <span class="legend-dot" style="--dot:${item.color}"></span>
        <span>${item.label}</span>
        <strong>${item.value} (${percent}%)</strong>
      </div>
    `;
  }).join("");
}

function renderPayments(payments) {
  document.querySelector("[data-payments]").innerHTML = payments.map((payment) => `
    <div class="payment-card"><span>${payment.label}</span><strong>${moneyFormatter.format(payment.value)}</strong></div>
  `).join("");
}

function getPaymentByDriver() {
  return state.drivers.map((driver) => {
    const orders = state.orders.filter((order) => order.driver === driver.name && order.paymentType === "Contra entrega");
    return {
      ...driver,
      toCollect: orders.filter((order) => order.paymentStatus === "pending").reduce((sum, order) => sum + Number(order.payment || 0), 0),
      collected: orders.filter((order) => order.paymentStatus === "collected").reduce((sum, order) => sum + Number(order.payment || 0), 0),
      settled: orders.filter((order) => order.paymentStatus === "settled").reduce((sum, order) => sum + Number(order.payment || 0), 0),
      orders: orders.length
    };
  }).filter((driver) => driver.orders || driver.toCollect || driver.collected || driver.settled);
}

function renderPaymentBoard() {
  const rows = getPaymentByDriver();
  document.querySelector("[data-payment-board]").innerHTML = rows.map((driver) => `
    <article class="payment-driver-card">
      <span class="mini-avatar">${escapeHtml(driver.initials)}</span>
      <div class="payment-driver-main">
        <strong>${escapeHtml(driver.name)}</strong>
        <span>${driver.orders} pedidos contra entrega</span>
        <div class="payment-driver-meta">
          <span class="driver-pill">${moneyFormatter.format(driver.toCollect)} por cobrar</span>
          <span class="driver-pill route">${moneyFormatter.format(driver.collected)} por liquidar</span>
          <span class="driver-pill active">${moneyFormatter.format(driver.settled)} liquidado</span>
        </div>
      </div>
      <div class="payment-actions">
        <button type="button" data-payment-action="detail" data-driver-name="${escapeHtml(driver.name)}">Detalle</button>
        <button type="button" data-payment-action="collect" data-driver-name="${escapeHtml(driver.name)}">Marcar recaudo</button>
        <button type="button" data-payment-action="settle" data-driver-name="${escapeHtml(driver.name)}">Liquidar</button>
      </div>
    </article>
  `).join("") || `<p class="empty-state">No hay pagos contra entrega asignados.</p>`;
}

function renderTimeline(items) {
  document.querySelector("[data-timeline]").innerHTML = items.map((item) => `
    <article class="timeline-item">
      <span class="timeline-dot" style="--dot:${statusConfig[item.status]?.color || "#8f96a3"}"></span>
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>
      <span class="timeline-time">${escapeHtml(item.time)}</span>
    </article>
  `).join("");
}

function renderSettings() {
  const settings = state.settings;
  const cards = [
    ["Empresa", settings.companyName, `${settings.city} - canal ${settings.supportChannel}`],
    ["Tarifa base", moneyFormatter.format(settings.baseFare), "Valor minimo sugerido por envio"],
    ["Contra entrega", settings.codEnabled ? "Activo" : "Inactivo", `Recargo: ${moneyFormatter.format(settings.codFee)}`],
    ["SLA operativo", `${settings.slaMinutes} min`, "Tiempo objetivo de entrega"],
    ["Evidencia", settings.evidenceRequired ? "Obligatoria" : "Opcional", "Aplica para cierre de pedido"],
    ["Zonas", settings.zones.length, settings.zones.join(", ")],
    ["Roles", settings.roles.length, settings.roles.join(", ")],
    ["Estados", Object.keys(statusConfig).length, Object.values(statusConfig).map((item) => item.label).join(", ")]
  ];
  document.querySelector("[data-settings-grid]").innerHTML = cards.map(([label, value, detail]) => `
    <article class="settings-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join("");
}

function openModal(title, body) {
  const modal = document.querySelector("[data-modal]");
  document.querySelector("[data-modal-title]").textContent = title;
  document.querySelector("[data-modal-body]").innerHTML = body;
  modal.hidden = false;
}

function closeModal() {
  document.querySelector("[data-modal]").hidden = true;
}

function showToast(message, type = "success") {
  const stack = document.querySelector("[data-toast-stack]");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function isValidPhone(phone) {
  return /^\d[\d\s]{6,}$/.test(String(phone).trim());
}

function availableDriverOptions(selectedName = "") {
  return state.drivers
    .filter((driver) => driver.status !== "inactive" || driver.name === selectedName)
    .map((driver) => `
      <option value="${escapeHtml(driver.name)}" ${driver.name === selectedName ? "selected" : ""}>${escapeHtml(driver.name)}${driver.status === "inactive" ? " (inactivo)" : ""}</option>
    `).join("");
}

function driverOptions(selectedName = "") {
  return state.drivers.map((driver) => `
    <option value="${escapeHtml(driver.name)}" ${driver.name === selectedName ? "selected" : ""}>${escapeHtml(driver.name)}</option>
  `).join("");
}

function driverStatusOptions(selectedStatus = "active") {
  return [
    ["active", "Activo"],
    ["route", "En ruta"],
    ["inactive", "Inactivo"]
  ].map(([value, label]) => `<option value="${value}" ${value === selectedStatus ? "selected" : ""}>${label}</option>`).join("");
}

function getDriverByName(name) {
  return state.drivers.find((driver) => driver.name === name);
}

function statusOptions(selectedStatus = "pending") {
  return Object.entries(statusConfig).map(([key, status]) => `
    <option value="${key}" ${key === selectedStatus ? "selected" : ""}>${status.label}</option>
  `).join("");
}

function getOrderById(orderId) {
  return state.orders.find((item) => item.id === orderId);
}

function openCreateOrderModal() {
  openModal("Crear pedido", `
    <form class="modal-form two-col" data-create-order-form>
      <label>Cliente<input name="client" value="Nuevo cliente" maxlength="90" required></label>
      <label>Telefono<input name="phone" value="300 000 0000" maxlength="24" required></label>
      <label>Direccion<input name="address" value="Cl 100 # 19-45" maxlength="140" required></label>
      <label>Zona<input name="zone" value="Chapinero" maxlength="50" required></label>
      <label>Conductor<select name="driver"><option value="">Sin asignar</option>${availableDriverOptions()}</select></label>
      <label>Pago<select name="paymentType"><option>Contra entrega</option><option>Prepago</option></select></label>
      <label>Valor<input name="payment" type="number" min="0" step="1000" value="30000"></label>
      <label class="full-row">Observaciones<textarea name="notes" maxlength="280">Sin observaciones.</textarea></label>
      <button class="modal-primary" type="submit">Guardar pedido</button>
    </form>
  `);
}

function openEditOrderModal(orderId) {
  const order = getOrderById(orderId);
  if (!order) return;
  openModal("Editar pedido", `
    <form class="modal-form two-col" data-edit-order-form>
      <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
      <label>ID<input value="${escapeHtml(order.id)}" readonly></label>
      <label>Cliente<input name="client" value="${escapeHtml(order.client)}" maxlength="90" required></label>
      <label>Telefono<input name="phone" value="${escapeHtml(order.phone)}" maxlength="24" required></label>
      <label>Direccion<input name="address" value="${escapeHtml(order.address)}" maxlength="140" required></label>
      <label>Zona<input name="zone" value="${escapeHtml(order.zone)}" maxlength="50" required></label>
      <label>Estado<select name="status">${statusOptions(order.status)}</select></label>
      <label>Conductor<select name="driver"><option value="">Sin asignar</option>${availableDriverOptions(order.driver)}</select></label>
      <label>Pago<select name="paymentType"><option ${order.paymentType === "Contra entrega" ? "selected" : ""}>Contra entrega</option><option ${order.paymentType === "Prepago" ? "selected" : ""}>Prepago</option></select></label>
      <label>Valor<input name="payment" type="number" min="0" step="1000" value="${order.payment}"></label>
      <label class="full-row">Observaciones<textarea name="notes" maxlength="280">${escapeHtml(order.notes)}</textarea></label>
      <label class="full-row">Evidencia<textarea name="evidence" maxlength="280">${escapeHtml(order.evidence)}</textarea></label>
      <button class="modal-primary" type="submit">Guardar cambios</button>
    </form>
  `);
}

function openOrderDetailModal(orderId) {
  const order = getOrderById(orderId);
  if (!order) return;
  openModal(`Detalle ${order.id}`, `
    <div class="detail-grid">
      <div class="detail-card"><span>Cliente</span><strong>${escapeHtml(order.client)}</strong></div>
      <div class="detail-card"><span>Telefono</span><strong>${escapeHtml(order.phone)}</strong></div>
      <div class="detail-card full-row"><span>Direccion</span><strong>${escapeHtml(order.address)}</strong></div>
      <div class="detail-card"><span>Zona</span><strong>${escapeHtml(order.zone)}</strong></div>
      <div class="detail-card"><span>Estado</span><strong>${getOrderStatusLabel(order)}</strong></div>
      <div class="detail-card"><span>Conductor</span><strong>${escapeHtml(order.driver)}</strong></div>
      <div class="detail-card"><span>Pago</span><strong>${escapeHtml(order.paymentType)} - ${order.payment ? moneyFormatter.format(order.payment) : "-"}</strong></div>
      <div class="detail-card full-row"><span>Observaciones</span><strong>${escapeHtml(order.notes || "Sin observaciones")}</strong></div>
      <div class="detail-card full-row"><span>Novedad</span><strong>${escapeHtml(order.issueNote || "Sin novedad registrada")}</strong></div>
      <div class="detail-card full-row"><span>Evidencia</span><strong>${escapeHtml(order.evidence || "Pendiente")}</strong></div>
    </div>
  `);
}

function openClientDetailModal(name) {
  const client = getClients().find((item) => item.name === name);
  if (!client) return;
  const orders = state.orders.filter((order) => order.client === name);
  openModal(`Cliente ${client.name}`, `
    <div class="detail-grid">
      <div class="detail-card"><span>Telefono</span><strong>${escapeHtml(client.phone)}</strong></div>
      <div class="detail-card"><span>Pedidos</span><strong>${client.orders}</strong></div>
      <div class="detail-card"><span>Total asociado</span><strong>${moneyFormatter.format(client.total)}</strong></div>
      <div class="detail-card"><span>Novedades</span><strong>${client.issues}</strong></div>
      <div class="detail-card full-row"><span>Direcciones</span><strong>${escapeHtml(client.addresses.join(" / "))}</strong></div>
      <div class="detail-card full-row"><span>Historial</span><strong>${escapeHtml(orders.map((order) => `${order.id} ${getOrderStatusLabel(order)}`).join(" / "))}</strong></div>
    </div>
  `);
}

function openAssignOrderModal(orderId = "") {
  const pendingOrders = state.orders.filter((order) => order.status !== "delivered");
  openModal("Asignar pedido", `
    <form class="modal-form" data-assign-order-form>
      <label>Pedido
        <select name="orderId">
          ${pendingOrders.map((order) => `<option value="${escapeHtml(order.id)}" ${order.id === orderId ? "selected" : ""}>${escapeHtml(order.id)} - ${escapeHtml(order.client)}</option>`).join("")}
        </select>
      </label>
      <label>Conductor<select name="driver">${availableDriverOptions()}</select></label>
      <button class="modal-primary" type="submit">Asignar conductor</button>
    </form>
  `);
}

function openStatusModal(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  openModal("Cambiar estado", `
    <form class="modal-form" data-status-order-form>
      <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
      <label>Pedido<input value="${escapeHtml(`${order.id} - ${order.client}`)}" readonly></label>
      <label>Estado<select name="status">${statusOptions(order.status)}</select></label>
      <label>Evidencia<textarea name="evidence" maxlength="280">${escapeHtml(order.evidence)}</textarea></label>
      <button class="modal-primary" type="submit">Actualizar estado</button>
    </form>
  `);
}

function openIssueModal(orderId) {
  const order = getOrderById(orderId);
  if (!order) return;
  openModal("Registrar novedad", `
    <form class="modal-form" data-issue-order-form>
      <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
      <label>Pedido<input value="${escapeHtml(`${order.id} - ${order.client}`)}" readonly></label>
      <label>Novedad<textarea name="issueNote" maxlength="280">${escapeHtml(order.issueNote || "Cliente no contesta / direccion incompleta / destinatario ausente.")}</textarea></label>
      <button class="modal-primary" type="submit">Guardar novedad</button>
    </form>
  `);
}

function resolveIssue(orderId) {
  const order = getOrderById(orderId);
  if (!order) return;
  order.status = order.driver === "Sin asignar" ? "pending" : "route";
  order.issueNote = "";
  addTimeline(order.client, `${order.id} novedad resuelta`, order.status);
  saveLocalData();
  renderAll();
}

function activateDriver(name) {
  const driver = getDriverByName(name);
  if (!driver) return;
  driver.status = "active";
  driver.lastActivity = getTimeNow();
  addTimeline(driver.name, "Conductor activado desde novedades", "route");
  saveLocalData();
  renderAll();
}

function openReportModal() {
  const rows = [["ID", "Cliente", "Telefono", "Direccion", "Zona", "Estado", "Conductor", "Tipo pago", "Valor", "Estado pago", "Hora"], ...state.orders.map((order) => [
    order.id,
    order.client,
    order.phone,
    order.address,
    order.zone,
    getOrderStatusLabel(order),
    order.driver,
    order.paymentType,
    order.payment,
    order.paymentStatus,
    order.time
  ])];
  openCsvModal("Reporte de pedidos", `Reporte CSV generado con ${state.orders.length} pedidos.`, rows);
}

function openPaymentReportModal() {
  const rows = [["Conductor", "Por cobrar", "Por liquidar", "Liquidado", "Pedidos"], ...getPaymentByDriver().map((driver) => [
    driver.name,
    driver.toCollect,
    driver.collected,
    driver.settled,
    driver.orders
  ])];
  openCsvModal("Reporte de pagos", "Resumen de recaudos contra entrega por conductor.", rows);
}

function openDriverReportModal() {
  const rows = [["Nombre", "Telefono", "Vehiculo", "Placa", "Zona", "Estado", "Eficiencia", "Entregas", "Asignados", "Recaudo pendiente"], ...getDriverRanking().map((driver) => [
    driver.name,
    driver.phone,
    driver.vehicle,
    driver.plate,
    driver.zone,
    driver.status,
    driver.efficiency,
    driver.deliveries,
    driver.assigned,
    driver.cash
  ])];
  openCsvModal("Reporte de conductores", "Resumen operativo del equipo de ruta.", rows);
}

function openAlertReportModal() {
  const rows = [["ID", "Titulo", "Detalle", "Tipo", "Prioridad"], ...buildAlerts().map((alert) => [
    alert.id,
    alert.title,
    alert.detail,
    alert.type,
    alert.priority
  ])];
  openCsvModal("Reporte de novedades", "Alertas operativas activas.", rows);
}

function openExecutiveReportModal() {
  const counts = getCounts();
  const payments = getDashboardModel().payments;
  const rows = [
    ["Metrica", "Valor"],
    ["Pedidos hoy", counts.total],
    ["Entregados", counts.delivered],
    ["En ruta", counts.route],
    ["Pendientes", counts.pending],
    ["Novedades", counts.issue],
    ["Conductores", state.drivers.length],
    [payments[0].label, payments[0].value],
    [payments[1].label, payments[1].value],
    [payments[2].label, payments[2].value]
  ];
  openCsvModal("Reporte consolidado", "Resumen ejecutivo de la operacion actual.", rows);
}

function openClientReportModal() {
  const rows = [["Cliente", "Telefono", "Pedidos", "Entregados", "Novedades", "Direcciones", "Valor asociado"], ...getClients().map((client) => [
    client.name,
    client.phone,
    client.orders,
    client.delivered,
    client.issues,
    client.addresses.join(" / "),
    client.total
  ])];
  openCsvModal("Reporte de clientes", "Base de clientes derivada de pedidos.", rows);
}

function openCsvModal(title, description, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const filename = `${title.toLowerCase().replaceAll(" ", "-")}.csv`;
  openModal(title, `
    <p>${escapeHtml(description)}</p>
    <textarea class="report-output" readonly>${escapeHtml(csv)}</textarea>
    <button class="modal-primary" type="button" data-download-csv data-filename="${escapeHtml(filename)}">Descargar CSV</button>
  `);
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV descargado");
}

function openPaymentDetailModal(driverName) {
  const orders = state.orders.filter((order) => order.driver === driverName && order.paymentType === "Contra entrega");
  const statusLabels = { pending: "Por cobrar", collected: "Por liquidar", settled: "Liquidado" };
  openModal(`Pagos ${driverName}`, `
    <div class="modal-list">
      ${orders.map((order) => `
        <article>
          <strong>${escapeHtml(order.id)} - ${escapeHtml(order.client)}</strong>
          <span>${moneyFormatter.format(order.payment)} - ${statusLabels[order.paymentStatus] || "Por cobrar"} - ${getOrderStatusLabel(order)}</span>
        </article>
      `).join("") || "<p>No tiene pagos contra entrega.</p>"}
    </div>
  `);
}

function markDriverPayments(driverName, nextStatus) {
  const fromStatus = nextStatus === "collected" ? "pending" : "collected";
  const changed = state.orders.filter((order) => (
    order.driver === driverName &&
    order.paymentType === "Contra entrega" &&
    order.paymentStatus === fromStatus
  ));
  changed.forEach((order) => {
    order.paymentStatus = nextStatus;
    if (nextStatus === "collected" && order.status !== "delivered") {
      order.status = "delivered";
      order.evidence = order.evidence || "Recaudo confirmado por administracion";
    }
  });
  if (!changed.length) {
    showToast("No hay pagos disponibles para esta accion", "error");
    return;
  }
  addTimeline(driverName, nextStatus === "collected" ? "Recaudo marcado como recibido" : "Recaudo liquidado en oficina", "delivered");
  saveLocalData();
  renderAll();
  showToast(nextStatus === "collected" ? "Recaudo marcado" : "Recaudo liquidado");
}

function openMessageModal() {
  openModal("Enviar mensaje", `
    <form class="modal-form" data-message-form>
      <label>Destinatario<select name="target"><option>Todos los conductores</option><option>Conductores en ruta</option><option>Equipo administrativo</option></select></label>
      <label>Mensaje<textarea name="message" maxlength="160">Recuerden actualizar evidencia de entrega al cerrar cada pedido.</textarea></label>
      <button class="modal-primary" type="submit">Registrar mensaje</button>
    </form>
  `);
}

function openCreateDriverModal() {
  openModal("Nuevo conductor", `
    <form class="modal-form two-col" data-create-driver-form>
      <label>Nombre<input name="name" value="Nuevo conductor" maxlength="80" required></label>
      <label>Telefono<input name="phone" value="300 000 0000" maxlength="24" required></label>
      <label>Vehiculo<input name="vehicle" value="Moto" maxlength="60"></label>
      <label>Placa<input name="plate" value="DX-000" maxlength="16"></label>
      <label>Zona base<input name="zone" value="Chapinero" maxlength="50"></label>
      <label>Estado<select name="status">${driverStatusOptions("active")}</select></label>
      <label>Eficiencia<input name="efficiency" type="number" min="0" max="100" value="90"></label>
      <button class="modal-primary" type="submit">Guardar conductor</button>
    </form>
  `);
}

function openSettingsModal() {
  const settings = state.settings;
  openModal("Editar configuracion", `
    <form class="modal-form two-col" data-settings-form>
      <label>Empresa<input name="companyName" value="${escapeHtml(settings.companyName)}" maxlength="80" required></label>
      <label>Ciudad<input name="city" value="${escapeHtml(settings.city)}" maxlength="50" required></label>
      <label>Tarifa base<input name="baseFare" type="number" min="0" step="1000" value="${settings.baseFare}"></label>
      <label>SLA minutos<input name="slaMinutes" type="number" min="1" step="5" value="${settings.slaMinutes}"></label>
      <label>Contra entrega<select name="codEnabled"><option value="true" ${settings.codEnabled ? "selected" : ""}>Activo</option><option value="false" ${!settings.codEnabled ? "selected" : ""}>Inactivo</option></select></label>
      <label>Recargo contra entrega<input name="codFee" type="number" min="0" step="1000" value="${settings.codFee}"></label>
      <label>Evidencia<select name="evidenceRequired"><option value="true" ${settings.evidenceRequired ? "selected" : ""}>Obligatoria</option><option value="false" ${!settings.evidenceRequired ? "selected" : ""}>Opcional</option></select></label>
      <label>Canal soporte<input name="supportChannel" value="${escapeHtml(settings.supportChannel)}" maxlength="40"></label>
      <label class="full-row">Zonas<textarea name="zones" maxlength="420">${escapeHtml(settings.zones.join(", "))}</textarea></label>
      <label class="full-row">Roles<textarea name="roles" maxlength="420">${escapeHtml(settings.roles.join(", "))}</textarea></label>
      <button class="modal-primary" type="submit">Guardar configuracion</button>
    </form>
  `);
}

function openEditDriverModal(name) {
  const driver = getDriverByName(name);
  if (!driver) return;
  openModal("Editar conductor", `
    <form class="modal-form two-col" data-edit-driver-form>
      <input type="hidden" name="originalName" value="${escapeHtml(driver.name)}">
      <label>Nombre<input name="name" value="${escapeHtml(driver.name)}" maxlength="80" required></label>
      <label>Telefono<input name="phone" value="${escapeHtml(driver.phone)}" maxlength="24" required></label>
      <label>Vehiculo<input name="vehicle" value="${escapeHtml(driver.vehicle)}" maxlength="60"></label>
      <label>Placa<input name="plate" value="${escapeHtml(driver.plate)}" maxlength="16"></label>
      <label>Zona base<input name="zone" value="${escapeHtml(driver.zone)}" maxlength="50"></label>
      <label>Estado<select name="status">${driverStatusOptions(driver.status)}</select></label>
      <label>Eficiencia<input name="efficiency" type="number" min="0" max="100" value="${driver.efficiency}"></label>
      <button class="modal-primary" type="submit">Guardar cambios</button>
    </form>
  `);
}

function openDriverDetailModal(name) {
  const driver = getDriverRanking().find((item) => item.name === name);
  if (!driver) return;
  const assignedOrders = state.orders.filter((order) => order.driver === driver.name);
  openModal(`Conductor ${driver.name}`, `
    <div class="detail-grid">
      <div class="detail-card"><span>Telefono</span><strong>${escapeHtml(driver.phone)}</strong></div>
      <div class="detail-card"><span>Vehiculo</span><strong>${escapeHtml(`${driver.vehicle} - ${driver.plate}`)}</strong></div>
      <div class="detail-card"><span>Zona base</span><strong>${escapeHtml(driver.zone)}</strong></div>
      <div class="detail-card"><span>Ultima actividad</span><strong>${escapeHtml(driver.lastActivity)}</strong></div>
      <div class="detail-card"><span>Entregas hoy</span><strong>${driver.deliveries}</strong></div>
      <div class="detail-card"><span>Recaudo pendiente</span><strong>${moneyFormatter.format(driver.cash)}</strong></div>
      <div class="detail-card full-row"><span>Pedidos</span><strong>${escapeHtml(assignedOrders.map((order) => `${order.id} ${getOrderStatusLabel(order)}`).join(" / ") || "Sin pedidos asignados")}</strong></div>
    </div>
  `);
}

function upsertDriver(form, isEdit = false) {
  const formData = new FormData(form);
  const originalName = formData.get("originalName");
  const driver = isEdit ? getDriverByName(originalName) : {};
  if (!driver) return;
  const nextName = cleanText(formData.get("name"), "Conductor", 80);
  const phone = cleanPhone(formData.get("phone"));
  if (!isValidPhone(phone)) {
    showToast("Telefono invalido para conductor", "error");
    return;
  }
  const nameTaken = state.drivers.some((item) => item.name === nextName && item.name !== originalName);
  if (nameTaken) {
    showToast("Ya existe un conductor con ese nombre", "error");
    return;
  }
  const previousName = driver.name;
  driver.name = nextName;
  driver.initials = initialsFromName(nextName);
  driver.phone = phone;
  driver.vehicle = cleanText(formData.get("vehicle"), "Moto", 60);
  driver.plate = cleanText(formData.get("plate"), "DX-000", 16).toUpperCase();
  driver.zone = cleanText(formData.get("zone"), "Bogota", 50);
  driver.status = cleanOption(String(formData.get("status")), ["active", "route", "inactive"], "active");
  driver.efficiency = cleanPercent(formData.get("efficiency"));
  driver.lastActivity = getTimeNow();
  if (!isEdit) state.drivers.push(driver);
  if (isEdit && previousName !== nextName) {
    state.orders.forEach((order) => {
      if (order.driver === previousName) {
        order.driver = nextName;
        order.driverInitials = driver.initials;
      }
    });
  }
  addTimeline(driver.name, isEdit ? "Conductor actualizado" : "Conductor creado", driver.status === "inactive" ? "issue" : "route");
  saveLocalData();
  renderAll();
  closeModal();
  showToast(isEdit ? "Conductor actualizado" : "Conductor creado");
}

function toggleDriverStatus(name) {
  const driver = getDriverByName(name);
  if (!driver) return;
  driver.status = driver.status === "inactive" ? "active" : "inactive";
  driver.lastActivity = getTimeNow();
  addTimeline(driver.name, `Estado del conductor: ${driver.status === "inactive" ? "Inactivo" : "Activo"}`, driver.status === "inactive" ? "issue" : "route");
  saveLocalData();
  renderAll();
  showToast(driver.status === "inactive" ? "Conductor inactivado" : "Conductor activado");
}

function saveSettings(form) {
  const formData = new FormData(form);
  state.settings = normalizeSettings({
    companyName: cleanText(formData.get("companyName"), "Danhei Express", 80),
    city: cleanText(formData.get("city"), "Bogota", 50),
    baseFare: cleanMoney(formData.get("baseFare")),
    slaMinutes: Number(formData.get("slaMinutes")) || 90,
    codEnabled: formData.get("codEnabled") === "true",
    codFee: cleanMoney(formData.get("codFee")),
    evidenceRequired: formData.get("evidenceRequired") === "true",
    supportChannel: cleanText(formData.get("supportChannel"), "WhatsApp", 40),
    zones: cleanList(String(formData.get("zones")).split(","), structuredClone(seedData.settings.zones)),
    roles: cleanList(String(formData.get("roles")).split(","), structuredClone(seedData.settings.roles))
  });
  addTimeline("Configuracion", "Reglas centrales actualizadas", "route");
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Configuracion guardada");
}

function exportBackupDemo() {
  const json = JSON.stringify({ orders: state.orders, drivers: state.drivers, settings: state.settings, timeline: state.timeline }, null, 2);
  openModal("Backup demo", `
    <p>JSON de respaldo para esta demo local.</p>
    <textarea class="report-output" readonly>${escapeHtml(json)}</textarea>
    <button class="modal-primary" type="button" data-download-json data-filename="danhei-backup-demo.json">Descargar JSON</button>
  `);
}

function resetDemoData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(structuredClone(seedData)));
  } catch {
    showToast("No se pudo restaurar el almacenamiento local", "error");
    return;
  }
  const data = loadLocalData();
  state.orders = data.orders;
  state.drivers = data.drivers;
  state.settings = data.settings;
  state.timeline = data.timeline;
  state.activeFilter = "all";
  state.driverFilter = "all";
  state.search = "";
  renderAll();
  addTimeline("Sistema", "Datos demo restaurados", "route");
  saveLocalData();
  renderAll();
  showToast("Datos demo restaurados");
}

function createOrder(form) {
  const formData = new FormData(form);
  const driverName = formData.get("driver") || "Sin asignar";
  const driver = state.drivers.find((item) => item.name === driverName);
  const phone = cleanPhone(formData.get("phone"));
  if (!isValidPhone(phone)) {
    showToast("Telefono invalido para crear pedido", "error");
    return;
  }
  if (driver?.status === "inactive") {
    showToast("No se puede asignar a un conductor inactivo", "error");
    return;
  }
  const order = {
    paymentType: cleanOption(String(formData.get("paymentType")), ["Contra entrega", "Prepago"], "Contra entrega"),
    id: generateOrderId(),
    client: cleanText(formData.get("client"), "Cliente sin nombre", 90),
    phone,
    address: cleanText(formData.get("address"), "Direccion pendiente", 140),
    zone: cleanText(formData.get("zone"), "Bogota", 50),
    status: driver ? "route" : "pending",
    driver: driver?.name || "Sin asignar",
    driverInitials: driver?.initials || "--",
    payment: cleanMoney(formData.get("payment")),
    time: getTimeNow(),
    notes: cleanLongText(formData.get("notes"), "", 280),
    evidence: "",
    issueNote: ""
  };
  order.paymentStatus = order.paymentType === "Contra entrega" ? "pending" : "settled";
  state.orders.unshift(order);
  addTimeline(order.client, `${order.id} creado${driver ? ` y asignado a ${driver.name}` : ""}`, order.status);
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Pedido creado");
}

function editOrder(form) {
  const formData = new FormData(form);
  const order = getOrderById(formData.get("orderId"));
  const driverName = formData.get("driver") || "Sin asignar";
  const driver = state.drivers.find((item) => item.name === driverName);
  if (!order) return;
  const phone = cleanPhone(formData.get("phone"));
  if (!isValidPhone(phone)) {
    showToast("Telefono invalido para editar pedido", "error");
    return;
  }
  if (driver?.status === "inactive") {
    showToast("No se puede asignar a un conductor inactivo", "error");
    return;
  }
  order.client = cleanText(formData.get("client"), order.client, 90);
  order.phone = phone || order.phone;
  order.address = cleanText(formData.get("address"), order.address, 140);
  order.zone = cleanText(formData.get("zone"), order.zone, 50);
  order.status = cleanOption(String(formData.get("status")), Object.keys(statusConfig), order.status);
  order.driver = driver?.name || "Sin asignar";
  order.driverInitials = driver?.initials || "--";
  const previousPaymentType = order.paymentType;
  order.paymentType = cleanOption(String(formData.get("paymentType")), ["Contra entrega", "Prepago"], order.paymentType);
  if (order.paymentType !== "Contra entrega") {
    order.paymentStatus = "settled";
  } else if (previousPaymentType !== "Contra entrega" || !["pending", "collected", "settled"].includes(order.paymentStatus)) {
    order.paymentStatus = order.status === "delivered" ? "collected" : "pending";
  }
  order.payment = cleanMoney(formData.get("payment"));
  order.notes = cleanLongText(formData.get("notes"), "", 280);
  order.evidence = cleanLongText(formData.get("evidence"), "", 280);
  addTimeline(order.client, `${order.id} actualizado por administracion`, order.status);
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Pedido actualizado");
}

function assignOrder(form) {
  const formData = new FormData(form);
  const order = state.orders.find((item) => item.id === formData.get("orderId"));
  const driver = state.drivers.find((item) => item.name === formData.get("driver"));
  if (!order || !driver) return;
  if (driver.status === "inactive") {
    showToast("No se puede asignar a un conductor inactivo", "error");
    return;
  }
  order.driver = driver.name;
  order.driverInitials = driver.initials;
  order.status = "route";
  addTimeline(order.client, `${order.id} asignado a ${driver.name}`, "route");
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Pedido asignado");
}

function updateOrderStatus(form) {
  const formData = new FormData(form);
  const order = state.orders.find((item) => item.id === formData.get("orderId"));
  if (!order) return;
  order.status = cleanOption(String(formData.get("status")), Object.keys(statusConfig), order.status);
  order.evidence = cleanLongText(formData.get("evidence"), "", 280);
  if (order.status === "pending") {
    order.driver = "Sin asignar";
    order.driverInitials = "--";
  }
  addTimeline(order.client, `${order.id} cambio a ${getOrderStatusLabel(order)}`, order.status);
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Estado actualizado");
}

function registerIssue(form) {
  const formData = new FormData(form);
  const order = getOrderById(formData.get("orderId"));
  if (!order) return;
  order.status = "issue";
  order.issueNote = cleanLongText(formData.get("issueNote"), "Novedad sin detalle", 280);
  addTimeline(order.client, `${order.id} con novedad: ${order.issueNote.slice(0, 54)}`, "issue");
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Novedad registrada");
}

function registerMessage(form) {
  const formData = new FormData(form);
  addTimeline(cleanText(formData.get("target"), "Equipo administrativo", 80), cleanLongText(formData.get("message"), "Mensaje operativo", 160), "route");
  saveLocalData();
  renderAll();
  closeModal();
  showToast("Mensaje registrado");
}

function handleQuickAction(action) {
  if (action === "create") openCreateOrderModal();
  if (action === "assign") openAssignOrderModal();
  if (action === "report") openReportModal();
  if (action === "message") openMessageModal();
  if (action === "driver-create") openCreateDriverModal();
  if (action === "payment-report") openPaymentReportModal();
  if (action === "settings-edit") openSettingsModal();
  if (action === "backup-demo") exportBackupDemo();
  if (action === "reset-demo") resetDemoData();
  if (action === "logout") logout();
}

function bindEvents() {
  document.querySelector("[data-order-tabs]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.activeFilter = button.dataset.filter;
    renderOrders();
  });

  document.querySelector("[data-order-search]").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderOrders();
  });

  document.querySelector("[data-driver-filter]").addEventListener("change", (event) => {
    state.driverFilter = event.target.value;
    renderOrders();
  });

  document.querySelector("[data-orders-table]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-action]");
    if (!button) return;
    if (button.dataset.orderAction === "detail") openOrderDetailModal(button.dataset.orderId);
    if (button.dataset.orderAction === "edit") openEditOrderModal(button.dataset.orderId);
    if (button.dataset.orderAction === "assign") openAssignOrderModal(button.dataset.orderId);
    if (button.dataset.orderAction === "status") openStatusModal(button.dataset.orderId);
    if (button.dataset.orderAction === "issue") openIssueModal(button.dataset.orderId);
  });

  document.querySelector("[data-module-grid]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-module-target]");
    if (!button) return;
    document.querySelector(button.dataset.moduleTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("[data-clients]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-client-name]");
    if (!button) return;
    openClientDetailModal(button.dataset.clientName);
  });

  document.querySelector("[data-map]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-id]");
    if (!button) return;
    if (button.dataset.mapId === "drivers") {
      document.querySelector("#drivers")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    openOrderDetailModal(button.dataset.mapId);
  });

  document.querySelector("[data-map-focus]").addEventListener("click", () => {
    state.activeFilter = "all";
    renderOrders();
    document.querySelector("#orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("[data-drivers]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-driver-action]");
    if (!button) return;
    if (button.dataset.driverAction === "detail") openDriverDetailModal(button.dataset.driverName);
    if (button.dataset.driverAction === "edit") openEditDriverModal(button.dataset.driverName);
    if (button.dataset.driverAction === "toggle") toggleDriverStatus(button.dataset.driverName);
  });

  document.querySelector("[data-payment-board]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-action]");
    if (!button) return;
    if (button.dataset.paymentAction === "detail") openPaymentDetailModal(button.dataset.driverName);
    if (button.dataset.paymentAction === "collect") markDriverPayments(button.dataset.driverName, "collected");
    if (button.dataset.paymentAction === "settle") markDriverPayments(button.dataset.driverName, "settled");
  });

  document.querySelector("[data-alerts]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-alert-action]");
    if (!button) return;
    if (button.dataset.alertAction === "detail") {
      const order = getOrderById(button.dataset.alertId);
      if (order) openOrderDetailModal(button.dataset.alertId);
      if (!order) openDriverDetailModal(button.dataset.alertId);
    }
    if (button.dataset.alertAction === "resolve") resolveIssue(button.dataset.alertId);
    if (button.dataset.alertAction === "assign") openAssignOrderModal(button.dataset.alertId);
    if (button.dataset.alertAction === "activate-driver") activateDriver(button.dataset.alertId);
  });

  document.querySelector("[data-alert-filter]").addEventListener("click", () => {
    state.activeFilter = "issue";
    renderOrders();
    document.querySelector("#orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("[data-report-grid]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-type]");
    if (!button) return;
    openReportByType(button.dataset.reportType);
  });

  document.querySelector("[data-report-type='executive']").addEventListener("click", () => {
    openExecutiveReportModal();
  });

  document.querySelector("[data-notifications-toggle]").addEventListener("click", () => {
    const panel = document.querySelector("[data-notifications-panel]");
    state.notificationOpen = !state.notificationOpen;
    panel.hidden = !state.notificationOpen;
  });

  document.querySelector("[data-notifications-panel]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-notification-target]");
    if (!button) return;
    const target = button.dataset.notificationTarget;
    const order = getOrderById(target);
    if (order) openOrderDetailModal(target);
    if (target === "payments") document.querySelector("#payments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!order && target !== "payments") openDriverDetailModal(target);
    state.notificationOpen = false;
    document.querySelector("[data-notifications-panel]").hidden = true;
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleQuickAction(button.dataset.action));
  });

  document.querySelector("[data-modal-body]").addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.matches("[data-create-order-form]")) createOrder(event.target);
    if (event.target.matches("[data-edit-order-form]")) editOrder(event.target);
    if (event.target.matches("[data-assign-order-form]")) assignOrder(event.target);
    if (event.target.matches("[data-status-order-form]")) updateOrderStatus(event.target);
    if (event.target.matches("[data-issue-order-form]")) registerIssue(event.target);
    if (event.target.matches("[data-message-form]")) registerMessage(event.target);
    if (event.target.matches("[data-create-driver-form]")) upsertDriver(event.target, false);
    if (event.target.matches("[data-edit-driver-form]")) upsertDriver(event.target, true);
    if (event.target.matches("[data-settings-form]")) saveSettings(event.target);
  });

  document.querySelector("[data-modal-body]").addEventListener("click", (event) => {
    const csvButton = event.target.closest("[data-download-csv]");
    const jsonButton = event.target.closest("[data-download-json]");
    if (csvButton) {
      const csv = document.querySelector(".report-output")?.value || "";
      downloadCsv(csvButton.dataset.filename || "reporte.csv", csv);
    }
    if (jsonButton) {
      const json = document.querySelector(".report-output")?.value || "";
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = jsonButton.dataset.filename || "backup.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Backup descargado");
    }
  });

  document.querySelectorAll("[data-modal-close]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

function openReportByType(type) {
  if (type === "orders") openReportModal();
  if (type === "drivers") openDriverReportModal();
  if (type === "payments") openPaymentReportModal();
  if (type === "alerts") openAlertReportModal();
  if (type === "clients") openClientReportModal();
  if (type === "executive") openExecutiveReportModal();
}

function showLogin() {
  document.querySelector("[data-login-screen]").hidden = false;
  document.querySelector("[data-admin-shell]").hidden = true;
}

function showAdmin() {
  document.querySelector("[data-login-screen]").hidden = true;
  document.querySelector("[data-admin-shell]").hidden = false;
}

function hasValidDemoSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return session?.user === "admin@danhei.demo" && session?.demo === true;
  } catch {
    return false;
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  showLogin();
}

function bindLogin() {
  document.querySelector("[data-login-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const user = String(formData.get("user")).trim();
    const password = String(formData.get("password")).trim();
    if (user === "admin@danhei.demo" && password === "admin123") {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user, demo: true, at: new Date().toISOString() }));
      showAdmin();
      loadApplication();
      return;
    }
    showToast("Credenciales demo invalidas", "error");
  });
}

async function loadApplication() {
  const [data, orders, drivers, settings] = await Promise.all([
    fetchDashboardData(),
    fetchOrders(),
    fetchDrivers(),
    fetchSettings()
  ]);

  state.orders = orders;
  state.drivers = drivers;
  state.settings = settings;
  state.timeline = data.timeline || [];
  renderAll();
  if (!state.eventsBound) {
    bindEvents();
    state.eventsBound = true;
  }
}

function init() {
  bindLogin();
  if (!hasValidDemoSession()) {
    localStorage.removeItem(SESSION_KEY);
    showLogin();
    return;
  }
  showAdmin();
  loadApplication();
}

init();
