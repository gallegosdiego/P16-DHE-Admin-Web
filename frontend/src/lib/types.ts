export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
}

export interface UserListItem {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role_names: string[];
  permissions_count: number;
  created_at: string;
}

export interface UserDetailDTO {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  client_id?: number | null;
  roles: string[];
  permissions: string[];
  created_at: string;
  tokens_count: number;
}

export interface RoleDTO {
  name: string;
  label?: string;
  users_count: number;
  permissions: string[];
}

export interface AuditLog {
  id: number;
  user_id: number;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: { id: number; name: string } | null;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  nit: string | null;
  billing_type: "cash_on_delivery" | "post_sale" | "prepaid";
  is_active: boolean;
  notes: string | null;
  shipments_count?: number;
  created_at: string;
}

export interface ClientAddress {
  id: number;
  client_id: number;
  address: string;
  zone: string | null;
  label: string | null;
}

export interface ClientDetail extends Client {
  addresses: ClientAddress[];
  shipments: Shipment[];
  financial_summary: {
    total_shipments: number;
    total_owed: number;
    total_revenue: number;
  };
}

export interface Driver {
  id: number;
  name: string;
  initials: string;
  phone: string;
  user?: { id?: number; email?: string } | null;
  vehicle: string | null;
  plate: string | null;
  zone: string | null;
  status: "active" | "route" | "inactive";
  per_package_rate: number | null;
  daily_rate: number | null;
  active_shipments_count?: number;
  delivered_today_count?: number;
}

export interface DriverDetail extends Driver {
  shipments: Shipment[];
  today_summary: {
    assigned: number;
    delivered: number;
    cash_collected: number;
    pending_cash: number;
    earnings: number;
  };
}

export type ShipmentStatus =
  | "registered"
  | "confirmed"
  | "pickup_scheduled"
  | "picked_up"
  | "in_warehouse"
  | "assigned_to_route"
  | "in_transit"
  | "delivered"
  | "issue"
  | "returned"
  | "cancelled";
export type PaymentType = "cash_on_delivery" | "post_sale" | "prepaid" | "mercado_libre";
export type FinancialStatus = "pending" | "collected" | "invoiced" | "settled" | "overdue";

export interface Shipment {
  id: number;
  tracking_code: string;
  display_code: string;
  sequence_number: number;
  client_id: number;
  driver_id: number | null;
  created_by: number;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_zone: string | null;
  recipient_city: string | null;
  delivery_instructions: string | null;
  status: ShipmentStatus;
  payment_type: PaymentType;
  financial_status: FinancialStatus;
  shipping_cost: number;
  cod_amount: number | null;
  driver_fee: number | null;
  driver_paid: boolean;
  is_outsourced: boolean;
  outsource_company: string | null;
  outsource_amount: number | null;
  issue_note: string | null;
  notes: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  driver?: Driver;
  events?: ShipmentEvent[];
  created_by_user?: { id: number; name: string };
}

export interface ShipmentEvent {
  id: number;
  shipment_id: number;
  user_id: number;
  from_status: string | null;
  to_status: string;
  description: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  user?: { id: number; name: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface DashboardResponse {
  today: {
    total: number;
    registered: number;
    confirmed: number;
    in_transit: number;
    delivered: number;
    issue: number;
    returned: number;
    cancelled: number;
  };
  financial: {
    cod_pending: number;
    cod_collected: number;
    post_sale_owed: number;
    today_revenue: number;
    today_driver_cost: number;
    today_profit: number;
  };
  week: { total: number };
}

export interface HourlyStatsResponse {
  registrations: Array<{ hour: string; label: string; count: number }>;
  deliveries: Array<{ hour: string; count: number }>;
  peak_hour: { hour: string; label: string; count: number };
}

export interface DriverReportRow {
  id: number;
  name: string;
  total: number;
  delivered: number;
  delivery_rate: number;
  revenue: number;
  earnings: number;
}

export interface ClientReportRow {
  id: number;
  name: string;
  company: string | null;
  total: number;
  revenue: number;
}

export interface ReportStatsResponse {
  period: { from: string; to: string };
  summary: {
    total: number;
    delivered: number;
    delivery_rate: number;
    issues: number;
    returned: number;
    cancelled: number;
    revenue: number;
    driver_cost: number;
    profit: number;
    cod_collected: number;
  };
  by_status: Record<string, number>;
  by_driver: DriverReportRow[];
  by_client: ClientReportRow[];
}

export interface FinancialOverview {
  cod: { pending: number; collected: number; settled: number };
  post_sale: { pending: number; invoiced: number; overdue: number; total_receivable: number };
  drivers: { pending_payment: number };
  totals: { total_receivable: number; total_payable: number };
}

export interface ReceivableClient {
  id: number;
  name: string;
  phone: string | null;
  company: string | null;
  total_owed: number;
  owed_shipments_count: number;
  days_oldest_debt: number;
}

export interface ReceivableResponse {
  clients: ReceivableClient[];
  total_owed: number;
  count: number;
}

export interface DriverBoardItem extends Driver {
  cod_pending: number | null;
  cod_collected: number | null;
  unpaid_fees: number | null;
  today_deliveries: number;
  collect_shipment_id?: number | null;
  settle_shipment_id?: number | null;
  driver_paid_shipment_id?: number | null;
}

export interface Expense {
  id: number;
  name: string;
  amount: number;
  frequency: "monthly" | "biweekly" | "weekly";
  due_day: number | null;
  notes: string | null;
  is_active: boolean;
  current_month_status: "pending" | "paid";
  current_month_paid_at: string | null;
  days_until_due: number | null;
  is_due_soon: boolean;
  is_overdue: boolean;
}

export interface Employee {
  id: number;
  name: string;
  position: string;
  phone: string | null;
  salary: number;
  pay_frequency: "monthly" | "biweekly";
  is_active: boolean;
  last_payment_status: "pending" | "paid";
  last_payment_date: string | null;
  last_period_end: string | null;
}

export type ZoneType = "urban" | "suburban" | "extended";

export interface PricingRule {
  id: number;
  zone_id?: number;
  name: string;
  type: "flat" | "per_kg" | "per_km" | "surge";
  base_price: number;
  per_kg_price: number;
  per_km_price: number;
  min_price: number;
  max_weight_kg: number | null;
  is_active: boolean;
  priority: number;
  notes?: string | null;
}

export interface Zone {
  id: number;
  name: string;
  slug?: string;
  city?: string | null;
  type: ZoneType;
  is_active: boolean;
  sort_order?: number;
  description?: string | null;
  active_rules_count?: number;
  base_price?: number;
  pricingRules?: PricingRule[];
}

export interface ZoneDetailResponse {
  zone: Zone;
  pricing_rules: PricingRule[];
}

export interface PriceCalculationResponse {
  zone: string;
  calculated_price: number;
  formatted: string;
  rule_applied: {
    name: string;
    type: string;
    base_price: number;
  } | null;
}

export interface AppNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RouteStatus = "planned" | "active" | "completed";

export interface RouteStop {
  id: number;
  sort_order: number;
  status: "pending" | "completed";
  shipment: Partial<Shipment> & {
    id: number;
    display_code: string;
    recipient_name?: string;
    recipient_address?: string;
    recipient_zone?: string | null;
    status?: ShipmentStatus;
  };
}

export interface DailyRoute {
  id: number;
  driver: Driver | null;
  route_date: string;
  zone: string | null;
  status: RouteStatus;
  total_stops: number;
  completed_stops: number;
  progress: number;
  stops: RouteStop[];
}

// ── Financial Module (Fase B/C) ──────────────

export interface DailySummary {
  date: string;
  packages: {
    total_today: number;
    delivered_today: number;
    total_week: number;
    total_month: number;
  };
  revenue: {
    gross_income: number;
    driver_cost: number;
    gross_profit: number;
    fixed_expenses_month: number;
    payroll_month: number;
  };
  cod: {
    collected_today: number;
    pending_today: number;
    drivers_with_cash: number;
  };
  receivables: {
    total_owed: number;
    overdue_count: number;
    oldest_days: number;
  };
  outsourcing: {
    service_income: number;
    driver_cost: number;
    profit: number;
    packages: number;
  };
}

export interface ProfitLoss {
  period: { from: string; to: string };
  income: {
    direct_revenue: number;
    outsource_revenue: number;
    gross_income: number;
  };
  costs: {
    driver_fees: number;
    fixed_expenses: number;
    payroll: number;
    total_costs: number;
  };
  net_profit: number;
  margin_percent: number;
}

export interface CodSettlementItem {
  id: number;
  driver_id: number;
  settlement_date: string;
  total_collected: number;
  total_settled: number;
  difference: number;
  status: "pending" | "partial" | "settled";
  notes: string | null;
  driver?: { id: number; name: string };
}

export interface CodSettlement {
  id: number;
  driver_id: number;
  settlement_date: string;
  total_collected: number;
  total_settled: number;
  difference: number;
  status: "pending" | "partial" | "settled";
  notes: string | null;
  settled_by: number;
  driver?: { id: number; name: string };
  created_at: string;
}

export interface CodDailySummaryDriver {
  driver_id: number;
  driver_name: string;
  packages: number;
  total_expected: number;
  collected: number;
  pending: number;
  difference: number;
}

export interface DriverPayoutItem {
  id: number;
  driver_id: number;
  payout_date: string;
  packages_count: number;
  total_amount: number;
  paid_at: string | null;
  status: "pending" | "paid";
  driver?: { id: number; name: string };
}

export interface DriverPayout {
  id: number;
  driver_id: number;
  payout_date: string;
  packages_count: number;
  total_amount: number;
  status: "pending" | "paid";
  paid_at: string | null;
  driver?: { id: number; name: string };
}

export interface DriverPendingPayout {
  driver_id: number;
  driver_name: string;
  packages: number;
  total_fee: number;
  total_revenue: number;
}

export interface ExpensePayment {
  id: number;
  fixed_expense_id: number;
  amount: number;
  period_date: string;
  paid_at: string | null;
  status: "pending" | "paid";
}

export interface PayrollPayment {
  id: number;
  employee_id: number;
  amount: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  status: "pending" | "paid";
}

// ── Módulo Financiero Avanzado ────────────────────────

export interface FinancialKpis {
  dso: number;
  cod_collection_rate: number;
  avg_margin_per_shipment: number;
  operating_ratio: number;
  revenue_per_delivery: number;
  total_receivable: number;
  total_cod_in_street: number;
  monthly_revenue: number;
  monthly_costs: number;
  monthly_profit: number;
  profit_margin_pct: number;
}

export interface AgingReportClient {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  total_owed: number;
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  shipments_count: number;
  oldest_days: number;
}

export interface AgingReportSummary {
  total_receivable: number;
  total_current: number;
  total_1_30: number;
  total_31_60: number;
  total_61_90: number;
  total_90_plus: number;
  overdue_pct: number;
}

export interface AgingReport {
  clients: AgingReportClient[];
  summary: AgingReportSummary;
}

export interface ProfitLossReport {
  period: { from: string; to: string };
  income: {
    direct_revenue: number;
    outsource_revenue: number;
    gross_income: number;
  };
  costs: {
    driver_fees: number;
    fixed_expenses: number;
    payroll: number;
    total_costs: number;
  };
  net_profit: number;
  margin_percent: number;
}

export interface ProfitabilityRow {
  id: number;
  name: string;
  company?: string | null;
  total_shipments: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_pct: number;
}

export interface DriverSettlementShipment {
  id: number;
  display_code: string;
  delivered_at: string | null;
  shipping_cost: number;
  driver_fee: number;
  payment_type: string;
  financial_status: string;
}

export interface DriverSettlement {
  driver: { id: number; name: string };
  period: { from: string; to: string };
  deliveries: DriverSettlementShipment[];
  totals: {
    total_packages: number;
    total_driver_fee: number;
    bonuses: number;
    deductions: number;
    net_pay: number;
  };
  cod_summary: {
    total_cod_handled: number;
    total_cod_deposited: number;
    difference: number;
  };
}

export interface CashFlowWeek {
  week_number: number;
  start_date: string;
  end_date: string;
  opening_balance: number;
  inflows: {
    client_payments: number;
    cod_collections: number;
    other: number;
    total: number;
  };
  outflows: {
    driver_payments: number;
    expenses: number;
    payroll: number;
    cod_remittance: number;
    other: number;
    total: number;
  };
  net_flow: number;
  closing_balance: number;
}

export interface CashFlowProjection {
  weeks: CashFlowWeek[];
}

export interface FinancialAlert {
  type: "overdue_clients" | "cod_not_deposited" | "expenses_due" | "cod_in_street";
  severity: "warning" | "danger" | "info";
  title: string;
  count: number;
  amount?: number;
}
