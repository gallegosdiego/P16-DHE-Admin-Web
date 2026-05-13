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
  roles: string[];
  permissions: string[];
  created_at: string;
  tokens_count: number;
}

export interface RoleDTO {
  name: string;
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
export type PaymentType = "cash_on_delivery" | "post_sale" | "prepaid";
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
