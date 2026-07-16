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
  driver_id?: number | null;
  permissions_count: number;
  created_at: string;
}

export interface UserDetailDTO {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  client_id?: number | null;
  driver_id?: number | null;
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
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
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
  city?: string | null;
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
  document_status?: DriverDocumentAlertLevel;
  documents?: DriverDocumentsPayload;
}

export type DriverDocumentKey =
  | "driver_license_photo"
  | "vehicle_registration_photo"
  | "soat_photo"
  | "technical_inspection_photo"
  | "national_id_front_photo"
  | "national_id_back_photo";

export type DriverDocumentAlertLevel = "ok" | "warning" | "expired" | "missing";

export interface DriverDocumentItem {
  key: DriverDocumentKey;
  label: string;
  url: string | null;
  present: boolean;
  supports_expiry: boolean;
  expires_at: string | null;
  days_to_expiry: number | null;
  alert_level: DriverDocumentAlertLevel;
  alert_message: string | null;
}

export interface DriverDocumentsPayload {
  items: DriverDocumentItem[];
  count_present: number;
  count_required: number;
  completion_percent: number;
  count_missing: number;
  count_warning: number;
  count_expired: number;
  needs_attention_count: number;
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
  documents: DriverDocumentsPayload;
}

export interface DriverProfile extends Driver {
  user?: { id?: number; email?: string } | null;
  documents: DriverDocumentsPayload;
}

export interface DriverHistoryShipment {
  id: number;
  display_code: string;
  tracking_code: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  recipient_zone: string | null;
  recipient_city: string | null;
  status: ShipmentStatus;
  financial_status: string | null;
  payment_type: PaymentType;
  shipping_cost: number;
  cod_amount: number | null;
  cod_collected_amount: number | null;
  driver_fee: number | null;
  delivered_at: string | null;
  created_at: string | null;
  route_id: number;
  route_status: RouteStatus;
  stop_id: number;
  stop_status: "pending" | "completed" | "issue";
  sort_order: number;
}

export interface DriverHistoryRoute {
  id: number;
  route_date: string;
  zone: string | null;
  status: RouteStatus;
  total_stops: number;
  completed_stops: number;
  progress: number;
  created_at: string | null;
  updated_at: string | null;
  stops: DriverHistoryShipment[];
}

export interface DriverHistoryDaySummary {
  route_date: string;
  status: RouteStatus;
  route_count: number;
  zones: string[];
  total_stops: number;
  completed_stops: number;
  pending_stops: number;
  issue_stops: number;
  shipment_count: number;
  delivered_count: number;
  cod_collected: number;
  earnings_total: number;
}

export interface DriverHistorySummary {
  worked_days: number;
  route_count: number;
  shipment_count: number;
  completed_stops: number;
  pending_stops: number;
  issue_stops: number;
  delivered_count: number;
  cod_collected: number;
  earnings_total: number;
  last_route_date: string | null;
}

export interface DriverHistoryDayDetail extends DriverHistoryDaySummary {
  routes: DriverHistoryRoute[];
  shipments: DriverHistoryShipment[];
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
export type ShipmentGeocodingStatus = "ready" | "pending" | "blocked";
export type ShipmentAddressRoadType =
  | "calle"
  | "carrera"
  | "diagonal"
  | "transversal"
  | "avenida"
  | "autopista"
  | "circular"
  | "via"
  | "vereda";
export type ShipmentGeocodingReason =
  | "missing_address"
  | "address_too_short"
  | "address_without_reference"
  | "missing_location_context"
  | "provider_no_match";

export interface ShipmentAddressMeta {
  mode: "structured";
  road_type: ShipmentAddressRoadType;
  road_number: string;
  road_suffix?: string | null;
  cross_number: string;
  cross_suffix?: string | null;
  property_number: string;
  property_suffix?: string | null;
  unit_details?: string | null;
  neighborhood?: string | null;
  reference?: string | null;
  formatted_address?: string | null;
  zone?: string | null;
  city?: string | null;
  source?: string | null;
}

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
  recipient_address_meta?: ShipmentAddressMeta | null;
  recipient_zone: string | null;
  recipient_city: string | null;
  recipient_lat?: number | null;
  recipient_lng?: number | null;
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
  intake_photo?: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  has_coordinates?: boolean;
  geocoding_pending?: boolean;
  geocoding_status?: ShipmentGeocodingStatus;
  geocoding_reason?: ShipmentGeocodingReason | null;
  geocoding_reason_label?: string | null;
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

export interface ShipmentGeoSummaryResponse {
  summary: {
    total: number;
    with_coordinates: number;
    without_coordinates: number;
    pending_geocoding: number;
    coverage_percent: number;
  };
  recent_missing: Shipment[];
}

export interface ShipmentGeodataRepairResponse {
  message: string;
  summary: {
    processed: number;
    repaired: number;
    already_ready: number;
    city_resolved: number;
    still_missing: number;
  };
  shipments: Array<{
    id: number;
    display_code: string;
    recipient_city: string | null;
    recipient_zone: string | null;
    recipient_lat: number | null;
    recipient_lng: number | null;
    has_coordinates: boolean;
    geocoding_pending: boolean;
    geocoding_status: ShipmentGeocodingStatus;
    geocoding_reason: ShipmentGeocodingReason | null;
    geocoding_reason_label: string | null;
  }>;
}

export interface DashboardResponse {
  today: {
    total: number;
    scope?: "today" | "latest_activity";
    scope_date?: string;
    registered: number;
    confirmed: number;
    pickup_scheduled?: number;
    picked_up?: number;
    in_warehouse?: number;
    assigned_to_route?: number;
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
  status: "pending" | "completed" | "issue";
  shipment: Partial<Shipment> & {
    id: number;
    display_code: string;
    recipient_name?: string;
    recipient_address?: string;
    recipient_zone?: string | null;
    recipient_lat?: number | null;
    recipient_lng?: number | null;
    status?: ShipmentStatus;
  };
}

export type WhatsAppPermission =
  | "CREATE_PICKUP"
  | "VIEW_OWN_PICKUPS"
  | "USE_SAVED_ADDRESSES"
  | "CREATE_COD_SHIPMENT"
  | "CANCEL_UNASSIGNED_PICKUP";

export type PickupRequestStatus =
  | "draft"
  | "pending_review"
  | "needs_customer_input"
  | "submitted"
  | "accepted"
  | "ready_for_assignment"
  | "assigned"
  | "driver_on_the_way"
  | "partially_picked_up"
  | "picked_up"
  | "not_picked_up"
  | "cancelled";

export type PickupCoverageStatus =
  | "IN_COVERAGE"
  | "NEAR_BOUNDARY"
  | "OUT_OF_COVERAGE"
  | "UNRESOLVED";

export type PickupCustomerVisibleStatus =
  | "request_received"
  | "pending_review"
  | "accepted"
  | "delivery_confirmed";

export type PickupIntakeMode =
  | "pickup_at_client_location"
  | "planned_dropoff_at_hub"
  | "walk_in_at_hub";

export interface PickupRequestPackageDTO {
  id: number;
  package_index: number;
  recipient_name: string;
  recipient_phone: string;
  delivery_address_line1: string;
  delivery_address_complement: string | null;
  delivery_zone: string | null;
  delivery_city: string | null;
  is_cod: boolean;
  requested_cod_amount: number;
  is_fragile: boolean;
  package_type: string | null;
  size_code: string | null;
  approx_weight_kg: number | null;
  special_handling_notes: string | null;
  guide_number: string | null;
  qr_reference: string | null;
  shipment: {
    id: number;
    display_code: string;
    tracking_code: string;
    status: ShipmentStatus;
    status_label: string;
    driver_name: string | null;
    delivered_at: string | null;
  } | null;
}

export interface PickupReviewEventDTO {
  id: number;
  event_type: string;
  reason_code: string | null;
  notes: string | null;
  requested_fields: string[];
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_type: string | null;
  actor_id: number | null;
  occurred_at: string | null;
}

export interface PickupWhatsAppMessageDTO {
  id: number;
  direction: string;
  message_type: string;
  message_status: string | null;
  notification_type: string | null;
  notification_label: string | null;
  customer_visible_status: PickupCustomerVisibleStatus | null;
  customer_visible_status_label: string | null;
  provider_message_id: string | null;
  to: string | null;
  body: string | null;
  dispatch_mode: string | null;
  provider_status_event: Record<string, unknown> | null;
  last_error: Record<string, unknown> | null;
  retry_of_message_id: number | null;
  can_retry: boolean;
  sent_at: string | null;
  received_at: string | null;
  created_at: string | null;
}

export interface PickupRequestDTO {
  id: number;
  pickup_code: string;
  customer_id: number;
  customer: {
    id: number;
    name: string;
    company: string | null;
    phone: string | null;
  } | null;
  whatsapp_contact: {
    id: number;
    wa_id: string | null;
    phone: string | null;
    display_name: string | null;
    role: string | null;
  } | null;
  source: string;
  intake_mode: PickupIntakeMode;
  service_location_id: number | null;
  service_location: {
    id: number;
    name: string;
    address_line1: string;
    city: string;
  } | null;
  planned_dropoff_at: string | null;
  status: PickupRequestStatus;
  status_label: string;
  customer_visible_status: PickupCustomerVisibleStatus;
  customer_visible_status_label: string;
  review_reason_code: string | null;
  pickup_address_line1: string;
  pickup_address_complement: string | null;
  pickup_zone: string | null;
  pickup_city: string | null;
  coverage_status: PickupCoverageStatus;
  coverage_status_label: string;
  contact_name: string;
  contact_phone: string;
  pickup_window_code: string;
  pickup_window_label: string;
  package_count: number;
  requested_cod_total: number;
  special_instructions: string | null;
  correlation_id: string;
  submitted_at: string | null;
  accepted_at: string | null;
  ready_for_assignment_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipments_summary: {
    total_packages: number;
    materialized_packages: number;
    pending_materialization_packages: number;
    delivered_packages: number;
  };
  packages?: PickupRequestPackageDTO[];
  review_events?: PickupReviewEventDTO[];
  whatsapp_messages?: PickupWhatsAppMessageDTO[];
}

export interface PickupRequestListResponse extends PaginatedResponse<PickupRequestDTO> {
  summary: {
    total: number;
    pending_review: number;
    needs_customer_input: number;
    accepted: number;
    ready_for_assignment: number;
    cancelled: number;
  };
}

export interface PickupReadinessCheckDTO {
  key: string;
  label: string;
  ready: boolean;
  required_for_live: boolean;
}

export interface PickupReadinessResponse {
  status: "ready_for_sandbox" | "configuration_pending";
  status_label: string;
  outbound_enabled: boolean;
  can_send_live: boolean;
  ready_checks: number;
  required_checks: number;
  supported_pickup_cities_count: number;
  recommended_next_step: string;
  checks: PickupReadinessCheckDTO[];
}

export type CustomerWhatsAppStatus =
  | "DISABLED"
  | "PENDING_CONFIGURATION"
  | "ACTIVE"
  | "SUSPENDED";

export type CustomerWhatsAppContactStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "SUSPENDED"
  | "REVOKED";

export interface CustomerWhatsAppContactDTO {
  id: number;
  customer_id: number;
  wa_id: string | null;
  phone: string | null;
  display_name: string | null;
  role: string | null;
  status: CustomerWhatsAppContactStatus;
  authorized_at: string | null;
  authorized_by: number | null;
  revoked_at: string | null;
  revoked_by: number | null;
  permissions: WhatsAppPermission[];
}

export interface ClientWhatsAppSettingsDTO {
  customer_id: number;
  status: CustomerWhatsAppStatus;
  cod_enabled: boolean;
  automatic_package_limit: number;
  manual_review_package_limit: number;
  automatic_cod_limit: number;
  manual_review_cod_limit: number;
  automatic_cod_total_limit: number;
  allowed_windows: string[];
  default_pickup_address_id: number | null;
  default_pickup_address: {
    id: number;
    label: string | null;
    address: string;
    zone: string | null;
    city: string | null;
  } | null;
  contacts: CustomerWhatsAppContactDTO[];
}

export interface WhatsAppLinkRequestDTO {
  id: number;
  whatsapp_contact_id: number;
  requested_customer_id: number | null;
  requested_company_name: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requested_by_phone: string | null;
  notes: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_contact?: {
    id: number;
    wa_id: string | null;
    phone: string | null;
    display_name: string | null;
  } | null;
  requested_customer?: {
    id: number;
    name: string;
    company: string | null;
  } | null;
}

export interface RouteMetricsSnapshot {
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
  total_distance_km: number | null;
  total_duration_min: number | null;
  remaining_distance_meters: number | null;
  remaining_duration_seconds: number | null;
  remaining_distance_km: number | null;
  remaining_duration_min: number | null;
  optimization_source: string | null;
  optimized_at: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
}

export interface RouteGeometryLegSnapshot {
  stop_id: number;
  sort_order: number;
  status: "pending" | "completed" | "issue" | null;
  distance_meters: number;
  duration_seconds: number;
  distance_km: number;
  duration_min: number;
  encoded_polyline: string | null;
}

export interface RouteGeometrySnapshot {
  overview_polyline: string | null;
  source: string | null;
  legs: RouteGeometryLegSnapshot[];
}

export interface DriverLocationSnapshot {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
  age_seconds: number | null;
  freshness: "live" | "recent" | "stale";
}

export interface DailyRoute {
  id: number;
  driver: Driver | null;
  driver_location?: DriverLocationSnapshot | null;
  route_metrics?: RouteMetricsSnapshot | null;
  route_geometry?: RouteGeometrySnapshot | null;
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
