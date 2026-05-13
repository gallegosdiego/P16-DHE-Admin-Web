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
```ts
{
  data: Array<{
    id: number;
    user_id: number;
    action: string;
    description: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    user?: { id: number; name: string } | null;
  }>;
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
```

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
