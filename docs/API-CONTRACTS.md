# API Contracts (Frontend-Facing)

## Conventions
- Base URL: `http://<host>:8000/api`
- Auth: `Authorization: Bearer <token>`
- Content type: JSON unless export endpoints return CSV
- Pagination shape:
```ts
type PaginatedResponse<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
```

## Auth
- `POST /api/login` -> `{ token, user? }`
- `GET /api/me` -> authenticated user profile
- `POST /api/logout` -> session/token invalidation

## Dashboard
- `GET /api/dashboard`
```ts
{
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
```

- `GET /api/dashboard/hourly`
```ts
{
  registrations: Array<{ hour: string; label: string; count: number }>;
  deliveries: Array<{ hour: string; count: number }>;
  peak_hour: { hour: string; label: string; count: number };
}
```

## Shipments
- `GET /api/shipments` (filters: `status`, `search`, `driver_id`, `client_id`, `per_page`, `page`)
- `GET /api/shipments/{id}`
- `POST /api/shipments`
- `PUT /api/shipments/{id}`
- `POST /api/shipments/{id}/status`
```ts
{
  status: "delivered" | "issue" | string;
  description?: string;
  issue_note?: string;
  evidence_receiver_name?: string;
  evidence_photo?: File;

  // Used by the driver app when delivering cash_on_delivery shipments.
  cod_collected_amount?: number;
  cod_payment_method?: "Efectivo" | "Transferencia" | "Nequi" | "Daviplata" | string;
}
```
When `status = delivered` and the shipment is `cash_on_delivery`, the API records `cod_collected_amount`, `cod_payment_method`, sets `cod_collected_at`, and marks pending COD as `financial_status = collected`. If the original `cod_amount` is `0` and the collected amount is greater than `0`, the API also fills `cod_amount` so existing financial reports keep working.

Driver mobile compatibility: when the driver app sends `status = delivered` for a shipment that is already assigned to a route but still has `status = assigned_to_route`, the API performs the valid transition chain internally:

```text
assigned_to_route -> in_transit -> delivered
```

This prevents mobile delivery closures from failing when the route was assigned but the shipment had not been explicitly moved to `in_transit` before tapping `Entregar`. Both transitions are persisted as shipment events for auditability. Shipments in earlier or terminal states are not auto-normalized.
- `POST /api/shipments/{id}/assign`
- `POST /api/shipments/batch-status`
```ts
{
  shipment_ids: number[];
  status: string;
  description?: string;
}
```
- `POST /api/shipments/batch-assign`
```ts
{
  shipment_ids: number[];
  driver_id: number;
}
```

## Driver Mobile
- `GET /api/driver/my-route`
```ts
{
  route: null | {
    id: number;
    driver_id: number;
    route_date: string;
    status: "planned" | "active" | "completed" | string;
    stops: Array<{
      id: number;
      sort_order: number;
      status: "pending" | "completed" | "issue" | string;
      shipment: {
        id: number;
        display_code: string;
        status: string;
        recipient_name: string;
        recipient_phone: string;
        recipient_address: string;
        recipient_zone: string | null;
        recipient_city: string | null;
        payment_type: "cash_on_delivery" | "post_sale" | "prepaid" | "mercado_libre";
        cod_amount: number | null;
        cod_collected_amount: number | null;
        cod_payment_method: string | null;
        cod_collected_at: string | null;
        financial_status: string;
        intake_photo: string | null;
        recipient_lat: number | null;
        recipient_lng: number | null;
        shipping_cost: number;
        driver_fee: number | null;
      };
    }>;
  };
  message?: string;
}
```
`intake_photo`, `recipient_lat` and `recipient_lng` are compatibility fields for the driver mobile app. They can be `null` when production is running without those optional schema columns; the endpoint must not fail because of their absence.
- `GET /api/driver/assigned-shipments`
- `POST /api/driver/smart-route`
When the driver already completed today's route and receives a new shipment on the same date, the API reopens the existing route for that `driver_id` and `route_date` instead of creating a second route row. This preserves the day's completed stops and appends the new shipment as a pending stop.

## Clients
- `GET /api/clients`
- `GET /api/clients/{id}`
- `POST /api/clients`
- `PUT /api/clients/{id}`
- `GET /api/clients-receivable`
```ts
{
  clients: Array<{
    id: number;
    name: string;
    phone: string | null;
    company: string | null;
    total_owed: number;
    owed_shipments_count: number;
    days_oldest_debt: number;
  }>;
  total_owed: number;
  count: number;
}
```

## Drivers
- `GET /api/drivers`
- `GET /api/drivers/{id}`
```ts
{
  id: number;
  name: string;
  initials: string;
  phone: string;
  vehicle: string | null;
  plate: string | null;
  zone: string | null;
  status: "active" | "route" | "inactive";
  per_package_rate: number | null;
  shipments: Shipment[];
  today_summary: {
    assigned: number;
    delivered: number;
    cash_collected: number;
    pending_cash: number;
    earnings: number;
  };
}
```
- `POST /api/drivers`
- `PUT /api/drivers/{id}`
- `POST /api/drivers/{id}/toggle-status`

## Users and Roles
- `GET /api/users`
- `GET /api/users/{id}`
- `POST /api/users`
```ts
{
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: string;
}
```
- `PUT /api/users/{id}`
```ts
{
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
}
```
- `GET /api/roles`

## Audit Log
- `GET /api/audit-logs?per_page=50&page=1`
- Optional filters:
  - `search`: matches action, description, or user name.
  - `action`: exact action key, for example `financial.settle`.
  - `user_id`: exact user id.
  - `date_from`: lower bound on `occurred_at`, format `YYYY-MM-DD`.
  - `date_to`: upper bound on `occurred_at`, format `YYYY-MM-DD`.
- `per_page` is capped at `100`.
```ts
{
  data: Array<{
    id: number;
    user_id: number;
    action: string;
    description: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    occurred_at: string;
    created_at: string;
    user?: { id: number; name: string } | null;
  }>;
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
```

Frontend note: `/auditoria` renders `old_values` and `new_values` as the audit inspector payload. It still accepts a legacy `metadata` object defensively, but the backend contract is `old_values/new_values`.

## Reports
- `GET /api/reports/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`
```ts
{
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
  by_driver: Array<{
    id: number;
    name: string;
    total: number;
    delivered: number;
    delivery_rate: number;
    revenue: number;
    earnings: number;
  }>;
  by_client: Array<{
    id: number;
    name: string;
    company: string | null;
    total: number;
    revenue: number;
  }>;
}
```
- `GET /api/reports/export/shipments?from=...&to=...` -> CSV download
- `GET /api/reports/export/financial?from=...&to=...` -> CSV download

## Financial / Expenses / Payroll
- Financial:
  - `GET /api/financial/overview`
  - `GET /api/financial/driver-board`
  - `POST /api/financial/shipments/{id}/collect`
    - Admin/financial operation. Driver app delivery COD should use `POST /api/shipments/{id}/status` with `cod_collected_amount` and `cod_payment_method`.
  - `POST /api/financial/shipments/{id}/settle`
  - `POST /api/financial/shipments/{id}/driver-paid`
  - `POST /api/financial/settle-batch`
- Expenses:
  - `GET /api/expenses`
  - `POST /api/expenses`
  - `PUT /api/expenses/{id}`
  - `POST /api/expenses/{id}/pay`
- Payroll:
  - `GET /api/employees`
  - `POST /api/employees`
  - `PUT /api/employees/{id}`
  - `POST /api/employees/{id}/pay`
