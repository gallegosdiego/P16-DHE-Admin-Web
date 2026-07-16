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
        geocoded_at?: string | null;
        has_coordinates?: boolean;
        geocoding_pending?: boolean;
        shipping_cost: number;
        driver_fee: number | null;
      };
    }>;
  };
  message?: string;
}
```
`intake_photo`, `recipient_lat` and `recipient_lng` are compatibility fields for the driver mobile app. They can be `null` when production is running without those optional schema columns; the endpoint must not fail because of their absence.

Driver live-location snapshots now expose a three-level freshness contract aligned with the real mobile ping cadence:

```ts
type DriverLocationFreshness = "live" | "recent" | "stale";
```

Operational meaning:

- `live`: last ping up to 180 seconds ago;
- `recent`: last ping between 181 and 600 seconds ago;
- `stale`: last ping older than 600 seconds.

The admin monitoring UI should treat `recent` as attention-worthy but not equivalent to a lost signal.
- `GET /api/driver/assigned-shipments`
- `POST /api/driver/smart-route`
When the driver already completed today's route and receives a new shipment on the same date, the API reopens the existing route for that `driver_id` and `route_date` instead of creating a second route row. This preserves the day's completed stops and appends the new shipment as a pending stop.
- `POST /api/routes/{route}/stops/{stop}/resolve`
```ts
{
  status: "delivered" | "issue";
  description?: string;
  issue_note?: string;
  evidence_receiver_name?: string;
  evidence_photo?: File;
  cod_collected_amount?: number;
  cod_payment_method?: string;
}
```
This is the preferred mobile closing contract. It atomically updates the shipment and completes the route stop in one request. If the shipment was already persisted as `delivered` or `issue` during a previous attempt, the endpoint still completes the pending stop instead of failing on a repeated transition.

## Shipment geodata operations
- `GET /api/shipments/geo-summary`
- `POST /api/shipments/address-preview`
```ts
{
  recipient_address: string;
  recipient_city?: string | null;
  recipient_zone?: string | null;
  address_mode?: "structured" | "manual";
  address_road_type?: string;
  address_road_number?: string;
  address_road_suffix?: string;
  address_cross_number?: string;
  address_cross_suffix?: string;
  address_property_number?: string;
  address_property_suffix?: string;
  address_unit_details?: string;
  address_neighborhood?: string;
  address_reference?: string;
  limit?: number; // 1..5
}
```

Response shape:

```ts
{
  address: string;
  city: string | null;
  zone: string | null;
  recipient_lat: number | null;
  recipient_lng: number | null;
  has_coordinates: boolean;
  geocoding_pending: boolean;
  message: string;
  candidates: Array<{
    label: string;
    formatted_address: string;
    lat: number;
    lng: number;
    provider: "google" | "nominatim" | "fallback" | string;
    query: string;
  }>;
}
```

Operational purpose:

- reuse the same normalization rules as shipment create/update;
- preview structured/manual addresses before saving;
- infer zone/city when possible;
- allow the admin UI to lock `recipient_lat` and `recipient_lng` before `POST /api/shipments`.
- `GET /api/shipments?has_coordinates=1`
- `GET /api/shipments?needs_geocoding=1`

For shipment create/update requests, the backend now normalizes geographic text context before saving and geocoding:

- `recipient_address`
- `recipient_zone`
- `recipient_city`

Normalization guarantees:

- trims extra whitespace and punctuation noise;
- removes duplicated trailing zone/city context from the address;
- standardizes common Colombian address abbreviations (`cl`, `cll`, `cra`, `kr`, `diag`, `tv`, `no`);
- resolves accented variants like `Bogotá` into a stable technical value used for geocoding;
- retries geocoding with a simplified address variant when secondary details such as apartment/office/tower are present.

Operational recommendation for web/admin capture:

- write only the base street address in `recipient_address`;
- keep `recipient_zone` as a known zone value when possible;
- do not repeat zone/city inside the address text field unless they are truly part of the address name.

For shipment create/update requests, manual coordinates must travel as a complete pair:

```ts
{
  recipient_lat?: number;
  recipient_lng?: number;
}
```

Accepted cases:

- both fields present and valid;
- both fields omitted.

Rejected cases:

- `recipient_lat` without `recipient_lng`;
- `recipient_lng` without `recipient_lat`.

If a legacy shipment is detected with an orphan coordinate pair, `POST /api/shipments/repair-geodata` now normalizes the record by clearing the broken pair before retrying geocoding/fallback logic.

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
# Solicitudes multicanal de recogida

## `GET /api/service-locations`

Devuelve las sedes activas disponibles para entrega planificada o ingreso espontáneo. Requiere `shipments.view`. El parámetro `include_inactive=1` permite a administración consultar el catálogo completo.

## `POST /api/service-locations`

Crea una sede operativa. Requiere `settings.edit`.

## `PUT /api/service-locations/{serviceLocation}`

Actualiza una sede operativa. Requiere `settings.edit`.

## `POST /api/pickup-intakes`

Crea una solicitud neutral de canal, sus paquetes y una única tarea operativa. Requiere `intakes.create` y el encabezado `Idempotency-Key`.

Valores de `intake_mode`:

- `pickup_at_client_location`;
- `planned_dropoff_at_hub`;
- `walk_in_at_hub`.

`service_location_id` es obligatorio para los dos modos en sede. `planned_dropoff_at` es obligatorio para la entrega planificada. `pickup_address_line1` es obligatorio para recogida en el cliente.

Los usuarios vinculados a un cliente no pueden cambiar `customer_id` ni registrar ingresos espontáneos.

## `GET /api/pickup-requests`

Devuelve la bandeja administrativa de ingresos. Acepta `intake_mode` para filtrar por cualquiera de las tres vías y entrega en cada elemento `intake_mode`, `service_location_id`, `service_location` y `planned_dropoff_at`, además de los paquetes, la tarea y los totales ya existentes.

## `POST /api/pickup-requests/{pickupRequest}/packages`

Agrega un paquete esperado antes de asignar, iniciar o cerrar la recepción. Requiere `intakes.add_package` y `Idempotency-Key`. El servidor bloquea la solicitud, limita el total a 100 paquetes y recalcula `package_count` y `requested_cod_total`. Un reintento con la misma llave devuelve el resultado original.

## `POST /api/pickup-requests/{pickupRequest}/materialize-shipments`

Materializa guías para todos los paquetes pendientes o para `package_ids` seleccionados. Requiere `intakes.materialize`. La operación bloquea la solicitud y los paquetes dentro de una transacción; nunca crea más de una guía por `pickup_package`. En esta etapa continúa siendo una acción explícita porque la automatización al aprobar depende de las reglas de tarifa de FIN-01.

## `POST /api/pickup-intakes/walk-in/complete`

Registra un ingreso espontáneo de mostrador completo en una transacción. Requiere `intakes.receive` e `Idempotency-Key`. Crea solicitud, paquetes, tarea, lote, guías únicamente para los paquetes aceptados, resultados de recepción y eventos de custodia. Admite `delivered_by_name`, `delivered_by_phone`, `delivered_by_relationship` y `delivered_by_notes` para identificar al tercero que llevó los paquetes.

## Operación física de recogidas

- `GET /api/operational-tasks`: bandeja administrativa de tareas.
- `POST /api/operational-tasks/{id}/assign`: asigna una tarea materializada. Para `danhei_employee` exige `assigned_user_id`; el nombre libre se reserva para recolectores autorizados y compatibilidad de operador de sede.
- `POST /api/operational-tasks/{id}/batch`: abre la recepción y acepta los campos `delivered_by_*`; requiere `intakes.receive`.
- `POST /api/operational-pickup-batches/{id}/reconcile`: registra recibido, rechazado o faltante y actualiza estado/custodia; requiere `intakes.receive`.

Los permisos de ingreso son `intakes.create`, `intakes.add_package`, `intakes.assign`, `intakes.receive` e `intakes.materialize`. `shipments.direct_create` queda reservado para administración, pero la ruta heredada `POST /api/shipments` conserva temporalmente su permiso anterior hasta migrar todos los CTAs de P14 y P16.

## Conciliación financiera por guía

> Vigente desde el 12 de julio de 2026. Los endpoints agregados de `cod-settlements` y `driver-payouts` se conservan por compatibilidad, pero los movimientos nuevos deben usar los libros auxiliares cuando se requiera trazabilidad por guía o abonos parciales.

### `GET /api/financial/driver-reconciliations/{driver}?from=YYYY-MM-DD&to=YYYY-MM-DD`

Devuelve dos cuentas independientes:

```ts
type DriverReconciliation = {
  driver: { id: number; name: string; phone?: string };
  cod: {
    collected: number;
    remitted: number;
    pending: number;
    lines: Array<{
      id: number;
      shipment_id: number;
      collected_amount: number;
      remitted_amount: number;
      collection_date: string;
    }>;
  };
  services: {
    earned: number;
    paid: number;
    pending: number;
    lines: Array<{
      id: number;
      shipment_id: number;
      amount: number;
      paid_amount: number;
      earned_date: string;
    }>;
  };
  rule: string;
};
```

### `POST /api/financial/driver-reconciliations/{driver}/remittances`

Registra dinero COD recibido desde el piloto.

### `POST /api/financial/driver-reconciliations/{driver}/service-payments`

Registra un pago de Danhei al piloto por servicios.

Payload compartido:

```ts
type AllocatedPaymentPayload = {
  amount: number;
  method?: string;
  external_reference?: string;
  received_at?: string;
  paid_at?: string;
  notes?: string;
  allocations?: Array<{ id: number; amount: number }>;
};
```

Sin `allocations`, el servicio asigna el monto por antigüedad (`fecha`, luego `id`). Con asignaciones, cada `id` corresponde a una obligación o causación del libro respectivo.

**Control pendiente antes de producción financiera:** la primera versión del contrato definitivo deberá rechazar IDs duplicados, exigir idempotencia y rechazar atómicamente cualquier operación cuyo monto no quede asignado por completo. Una cuenta futura de pagos sin aplicar requerirá un libro explícito y no será un remanente implícito. La validación actual no debe considerarse cierre contable definitivo hasta completar `FIN-06` del roadmap.

### `GET /api/financial/client-ledger/{client}`

Devuelve `reported`, `available`, `transferred`, `pending_transfer` y líneas por guía.

### `POST /api/financial/client-ledger/{client}/payouts`

Registra una transferencia total o parcial al cliente usando el mismo contrato de asignaciones.

### Resumen del piloto

`GET /api/driver/reconciliation` entrega al piloto autenticado sus saldos COD y de servicios. P15 debe tratar este endpoint como lectura; los pagos se registran desde P16 con permisos financieros.

## Intenciones de pago QR

### `POST /api/payment-intents`

```ts
type CreatePaymentIntentPayload = {
  shipment_id: number;
  provider?: "nequi";
  expires_in_minutes?: number;
};
```

Solo admite guías COD cobrables. La respuesta incluye identificador público, monto, expiración y `qr_payload`.

### `GET /api/payment-intents/{paymentIntent}`

Consulta el estado de la intención y marca como expirada una intención vencida todavía pendiente.

### `POST /api/payment-intents/{paymentIntent}/simulate-verification`

Exclusivo de `local`, `testing` o entornos con simulador habilitado explícitamente. No demuestra una integración bancaria productiva y no debe activarse como mecanismo real sin proveedor autorizado y webhook firmado.
- `GET /api/driver/pickup-tasks`: tareas activas del piloto autenticado.
- `POST /api/driver/pickup-tasks/{id}/transition`: acepta o inicia una tarea propia.
- `POST /api/driver/pickup-tasks/{id}/batch`: abre o recupera el lote físico.
- `POST /api/driver/pickup-batches/{id}/reconcile`: informa una vez cada paquete como `received`, `missing` o `rejected` y cierra el lote.
