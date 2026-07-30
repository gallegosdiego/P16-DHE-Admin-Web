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

### Contexto de identidad del remitente

El cliente maestro es opcional al crear o actualizar una guía. La guía puede
operarse con datos independientes del remitente y, cuando todavía no existe
un cliente confirmado, conservar esos datos para revisión posterior:

```ts
type ShipmentClientContext = {
  client_id: number | null;
  sender_name?: string | null;
  sender_phone?: string | null;
  sender_email?: string | null;
  sender_company?: string | null;
};
```

`sender_*` es una instantánea operativa de la guía y no reemplaza al contacto
de cobro ni a la empresa del cliente maestro. El nombre del remitente, la
empresa remitente y el destinatario deben poder representar personas o
empresas distintas.

- `GET /api/shipments/pending-client-review` requiere `shipments.view` y
  devuelve una lista paginada de guías con `client_id = null`, excluyendo las
  canceladas. Acepta `search`, `payment_type`, `status` y `per_page` (máximo
  100). La búsqueda cubre código de guía, remitente, empresa y destinatario.
- `POST /api/shipments/{id}/link-client` requiere `shipments.edit` y recibe:

```ts
{ client_id: number }
```

  Solo permite vincular un cliente activo. La operación es transaccional,
  completa únicamente los campos vacíos de la instantánea del remitente,
  actualiza la trazabilidad y, si existe COD recaudado, recupera su relación
  financiera con el cliente. Si la guía ya pertenece a otro cliente devuelve
  `422`.

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

## Despacho y custodia de ruta

Una ruta planificada organiza paradas, pero no demuestra por si sola que el piloto recibio fisicamente los paquetes. El traspaso sede -> piloto se registra por parada y no debe inferirse desde `driver_id`.

- `POST /api/driver/routes/{route}/stops/{stop}/handover` — app del piloto; requiere `scope` y `Idempotency-Key`.
- `POST /api/routes/{route}/stops/{stop}/handover` — alternativa manual del panel; requiere `shipments.assign` y `Idempotency-Key`.

La app del piloto debe enviar:

```ts
{
  scan_code: string; // tracking_code o display_code de la guia
  physical_condition?: "intact" | "observed_damage" | "unknown";
  lat?: number;
  lng?: number;
}
```

La alternativa manual exige `notes` para justificar por que no se uso el lector. El servidor verifica que la parada pertenezca a la ruta, que la ruta este `planned` o `active`, que la guia coincida y que el ultimo custodio sea `hub`. Si el ultimo custodio ya es el mismo piloto, la operacion se trata como reintento seguro y no crea otro evento.

Una confirmacion exitosa crea el evento inmutable `assigned_to_driver`, conserva el usuario que ejecuto la peticion como actor de auditoria y devuelve `route_id`, `route_stop_id`, la guia y el evento de custodia. Cuando la ruta ya esta activa, tambien normaliza el envio a `in_transit` mediante la cadena de estados validada.

- `GET /api/routes/dispatch-board` — tablero administrativo de paquetes disponibles en custodia de sede.

Filtros opcionales: `zone`, `city`, `size_code` (`small`, `medium`, `large`), `search` y `limit` (`1..500`). Solo devuelve envíos con estado `in_warehouse`, sin una ruta operativa abierta para la fecha y cuyo último evento de custodia tenga `new_custodian_type = hub`.

```ts
type DispatchBoardResponse = {
  date: string;
  summary: {
    total: number;
    by_size: { small: number; medium: number; large: number; unspecified: number };
    by_zone: Record<string, number>;
    fragile: number;
    missing_coordinates: number;
    total_weight_kg: number;
  };
  groups: Array<{
    zone: string | null;
    city: string | null;
    total: number;
    by_size: { small: number; medium: number; large: number; unspecified: number };
    fragile_count: number;
    items: Array<{
      id: number;
      display_code: string;
      recipient_name: string;
      recipient_address: string;
      recipient_zone: string | null;
      recipient_city: string | null;
      size_code: "small" | "medium" | "large" | "unspecified";
      size_label: string;
      is_fragile: boolean;
      approx_weight_kg: number | null;
      recipient_lat: number | null;
      recipient_lng: number | null;
      custody: {
        event_type: string | null;
        new_custodian_type: "hub";
        new_custodian_id: number | null;
        new_custodian_name: string | null;
        physical_condition: string | null;
        occurred_at: string | null;
      };
    }>;
  }>;
  shipments: Array<unknown>;
};
```

Si faltan `shipments.size_code`, `shipments.is_fragile`, `shipments.approx_weight_kg` o la tabla `custody_events`, responde `409` con `code = dispatch_board_schema_pending`; el operador debe completar la migración antes de usar el tablero.

### Propuesta de despacho revisable

- `POST /api/routes/dispatch-proposals/preview` — propone una agrupación revisable por pilotos, zona, coordenadas y capacidad.

Permiso requerido: `shipments.assign`. La operación es de solo lectura: no crea `routes`, `route_stops`, eventos de custodia, asignaciones ni cambios de estado.

```ts
type DispatchProposalPreviewRequest = {
  driver_ids: number[]; // 1..20; pilotos active o route
  shipment_ids?: number[]; // si se omite, usa el tablero de custodia con los filtros
  zone?: string;
  city?: string;
  size_code?: "small" | "medium" | "large";
  search?: string;
  limit?: number; // 1..500
  max_packages_per_driver?: number; // 1..100
  origin_lat?: number;
  origin_lng?: number;
};
```

La selección usa únicamente paquetes `in_warehouse`, con el último evento de custodia en `hub` y sin una parada pendiente en una ruta operativa abierta del día. Los paquetes pedidos explícitamente que no cumplan esas condiciones se reportan en `criteria.excluded_requested_shipment_ids` y no se fuerzan en la propuesta.

```ts
type DispatchProposalPreviewResponse = {
  date: string;
  read_only: true;
  criteria: {
    requested_driver_ids: number[];
    zone: string | null;
    city: string | null;
    size_code: "small" | "medium" | "large" | null;
    max_packages_per_driver: number | null;
    candidate_count: number;
    excluded_requested_shipment_ids: number[];
  };
  proposals: Array<{
    driver: {
      id: number;
      name: string;
      phone: string | null;
      vehicle: string | null;
      plate: string | null;
      zone: string | null;
      status: "active" | "route";
      last_lat: number | null;
      last_lng: number | null;
    };
    capacity: {
      total: number;
      already_assigned: number;
      available_before_proposal: number;
      remaining_after_proposal: number;
      source: "vehicle_default";
    };
    assigned_count: number;
    estimated_distance_km: number | null;
    estimated_duration_min: number | null;
    optimization_source: "local_fallback" | "sequence_fallback" | string;
    warnings: string[];
    shipments: Array<{
      sequence: number;
      id: number;
      tracking_code: string | null;
      display_code: string | null;
      recipient_name: string | null;
      recipient_phone: string | null;
      recipient_address: string | null;
      recipient_zone: string | null;
      recipient_city: string | null;
      recipient_lat: number | null;
      recipient_lng: number | null;
      has_coordinates: boolean;
      size_code: "small" | "medium" | "large" | "unspecified";
      size_label: string;
      is_fragile: boolean;
      approx_weight_kg: number | null;
      payment_type: string | null;
      cod_amount: number | null;
      shipping_cost: number | null;
      driver_fee: number | null;
      delivery_instructions: string | null;
      created_at: string | null;
    }>;
  }>;
  unassigned: Array<{ id: number; reason: "no_available_capacity" | string }>;
  totals: { candidates: number; assigned: number; unassigned: number };
};
```

La heurística actual prioriza coincidencia de zona, equilibrio de cantidad, proximidad al origen/última ubicación conocida y finalmente el identificador del piloto para mantener resultados deterministas. La capacidad se estima por vehículo (bicicleta 12, moto 25, carro/camioneta 60) y se descuenta la carga pendiente de rutas abiertas; cada respuesta lo marca como `vehicle_default` para no confundir una estimación con la capacidad operativa definitiva. La decisión final sigue siendo humana; la generación de manifiesto y la confirmación de custodia son pasos posteriores.

### Manifiesto de despacho y contador de custodia

- `GET /api/routes/{route}/manifest` — genera una vista de solo lectura de la ruta y sus paquetes asignados.

Requiere `shipments.view` y el alcance operativo de la ruta. No crea ni modifica `routes`, `route_stops`, estados del envío ni eventos de custodia. El código del manifiesto es derivado de la fecha y del identificador de la ruta (`MAN-YYYYMMDD-{route_id}`); no se persiste una copia, por lo que siempre refleja el último evento de custodia disponible.

```ts
type DispatchManifestResponse = {
  manifest_code: string;
  generated_at: string;
  read_only: true;
  route: {
    id: number;
    date: string;
    status: "planned" | "active" | "completed" | string;
    zone: string | null;
    driver: {
      id: number;
      name: string;
      phone: string | null;
      vehicle: string | null;
      plate: string | null;
      zone: string | null;
    } | null;
  };
  custody: {
    total: number;
    accepted_by_pilot: number;
    in_hub: number;
    pending: number;
    complete: boolean;
  };
  items: Array<{
    sequence: number;
    route_stop_id: number;
    shipment_id: number;
    stop_status: string | null;
    guide: { display_code: string | null; tracking_code: string | null };
    recipient: {
      name: string | null;
      phone: string | null;
      address: string | null;
      zone: string | null;
      city: string | null;
      lat: number | null;
      lng: number | null;
    };
    package: {
      size_code: "small" | "medium" | "large" | string | null;
      is_fragile: boolean;
      approx_weight_kg: number | null;
      delivery_instructions: string | null;
    };
    collection: {
      payment_type: string | null;
      cod_amount: number | null;
      shipping_cost: number | null;
      driver_fee: number | null;
    };
    custody: {
      state: "with_driver" | "in_hub" | "unknown";
      scan_confirmed: boolean;
      new_custodian_type: "hub" | "driver" | string | null;
      new_custodian_id: number | null;
      new_custodian_name: string | null;
      occurred_at: string | null;
    };
  }>;
};
```

`accepted_by_pilot` cuenta únicamente los paquetes cuyo último evento de custodia es `assigned_to_driver` para el piloto de esa ruta. `in_hub` cuenta los que permanecen bajo custodia de sede y `pending` es el total todavía no aceptado por el piloto. `complete` solo es `true` cuando la ruta contiene al menos un paquete y todos fueron aceptados. La impresión del panel es una representación operativa del manifiesto; la aceptación física continúa requiriendo escaneo del piloto o entrega manual justificada.

### Activación condicionada por custodia

- `POST /api/routes/{route}/start` — activa una ruta planificada.

Cuando los paquetes de la ruta ya tienen eventos de custodia, todos deben tener como último custodio al piloto de esa ruta. Si falta una aceptación, la respuesta es `422` y no cambia la ruta ni el estado de los envíos:

```ts
type RouteCustodyPendingResponse = {
  message: string;
  code: "route_custody_pending";
  pending_shipment_ids: number[];
};
```

Los datos históricos sin eventos de custodia conservan compatibilidad temporal; los ingresos trazables no pueden pasar a `active` solo por estar incluidos en una ruta. La app del piloto debe dirigir al flujo **Recibir despacho** y volver a intentar la activación cuando el contador de custodia esté completo.

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
- `DELETE /api/clients/{id}` — archiva; requiere `clients.delete`.
- `GET /api/clients-trashed` — lista clientes archivados para la papelera.
- `POST /api/clients/{id}/restore` — restaura; requiere `clients.delete`.
- `POST /api/clients/{id}/purge` — retira definitivamente el maestro de la operación; requiere `clients.delete`.
- `GET /api/clients-receivable`

La lista acepta `search`, `billing_type`, `active_only`, `include_archived` y
`per_page` (máximo 100). El detalle incluye direcciones, las últimas guías y
`financial_summary` (`total_shipments`, `total_owed`, `total_revenue`). El
contrato del cliente maestro es:

```ts
type ClientMaster = {
  id: number;
  name: string;              // contacto de cobro
  phone: string | null;
  email: string | null;
  company: string | null;    // empresa / razón social
  company_phone: string | null;
  nit: string | null;
  billing_type: "cash_on_delivery" | "post_sale" | "prepaid" | null;
  billing_types: Array<"cash_on_delivery" | "post_sale" | "prepaid">;
  is_active: boolean;
  deleted_at: string | null;
  purged_at?: string | null;
  notes: string | null;
  shipments_count?: number;
};
```

`billing_types` contiene preferencias informativas del cliente y admite las
tres opciones simultáneamente. El tipo efectivo que determina el cobro se
elige en cada guía o paquete; no debe inferirse de una única preferencia del
maestro. `billing_type` se mantiene por compatibilidad con integraciones
anteriores.

`DELETE /api/clients/{id}` aplica borrado lógico (`SoftDeletes`), marca el
cliente como inactivo y conserva guías, paquetes, saldos y auditoría. La
respuesta incluye `shipments_count`. `GET /api/clients` omite archivados por
defecto; `include_archived=true` los incluye. La restauración vuelve a activar
el cliente y conserva preferencias e historial. Un purge no borra guías,
paquetes, saldos ni auditoría: marca un tombstone inmutable (`purged_at`) para
que el maestro desaparezca de las bandejas operativas sin romper referencias
históricas.

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

`GET /api/clients-receivable` requiere `financial.view` y solo considera
clientes activos con guías `post_sale` pendientes, facturadas o vencidas. No
es el catálogo general de clientes.

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

Crea una sede operativa. Requiere `settings.edit`. `code` es opcional para nuevos registros: si se omite, la API genera un identificador interno único con prefijo `HUB-` o `PTO-` a partir del nombre. El nombre continúa siendo la etiqueta visible.

## `PUT /api/service-locations/{serviceLocation}`

Actualiza una sede operativa. Requiere `settings.edit`. Si no se envía `code`, conserva el identificador interno existente.

## `POST /api/pickup-intakes`

Crea una solicitud neutral de canal, sus paquetes y una única tarea operativa. Requiere `intakes.create` y el encabezado `Idempotency-Key`.

Valores de `intake_mode`:

- `pickup_at_client_location`;
- `planned_dropoff_at_hub`;
- `walk_in_at_hub`.

`service_location_id` es obligatorio para los dos modos en sede. `planned_dropoff_at` es obligatorio para la entrega planificada. `pickup_address_line1` es obligatorio para recogida en el cliente.

Para solicitudes administrativas, `customer_id` puede ser `null` cuando la
persona o empresa aún no está identificada. En ese caso se pueden registrar
`contact_name`, `contact_phone`, `contact_email` y `sender_company`; esos
valores se conservan como instantánea del remitente al materializar las
guías. Para `source = client_portal`, `customer_id` sigue siendo obligatorio.

Los usuarios vinculados a un cliente no pueden cambiar `customer_id` ni registrar ingresos espontáneos.

## `GET /api/pickup-requests`

Devuelve la bandeja administrativa de ingresos. Acepta `intake_mode` para filtrar por cualquiera de las tres vías y entrega en cada elemento `intake_mode`, `service_location_id`, `service_location` y `planned_dropoff_at`, además de los paquetes, la tarea y los totales ya existentes.

## `POST /api/pickup-requests/{pickupRequest}/packages`

Agrega un paquete esperado antes de asignar, iniciar o cerrar la recepción. Requiere `intakes.add_package` y `Idempotency-Key`. El servidor bloquea la solicitud, limita el total a 100 paquetes y recalcula `package_count` y `requested_cod_total`. Un reintento con la misma llave devuelve el resultado original.

## `POST /api/pickup-requests/{pickupRequest}/materialize-shipments`

Materializa guías para todos los paquetes pendientes o para `package_ids` seleccionados. Requiere `intakes.materialize`. La operación bloquea la solicitud y los paquetes dentro de una transacción; nunca crea más de una guía por `pickup_package`. Continúa siendo una acción explícita hasta aprobar la política de materialización automática y la fuente comercial del cobro al cliente; las reglas FIN-01 descritas abajo remuneran al piloto y no sustituyen `pricing_rules`.

## `POST /api/pickup-intakes/walk-in/complete`

Registra un ingreso espontáneo de mostrador completo en una transacción. Requiere `intakes.receive` e `Idempotency-Key`. Crea solicitud, paquetes, tarea, lote, guías únicamente para los paquetes aceptados, resultados de recepción y eventos de custodia. Admite `delivered_by_name`, `delivered_by_phone`, `delivered_by_relationship` y `delivered_by_notes` para identificar al tercero que llevó los paquetes. `received_by_user_id` es opcional: cuando se envía, debe corresponder a un empleado Danhei habilitado para recibir; la sesión que ejecuta la petición permanece como actor de auditoría y el empleado seleccionado queda en `pickup_batches.received_by` y como responsable de la tarea.

## `GET /api/pickup-intakes/receivers`

Busca empleados habilitados para recibir ingresos por `search` (nombre, teléfono o correo). Requiere `intakes.receive`. Devuelve como máximo 25 opciones con `id`, `name` y `phone`; no sustituye ni expone el catálogo general de usuarios.

## Operación física de recogidas

- `GET /api/operational-tasks`: bandeja administrativa de tareas.
- `POST /api/operational-tasks/{id}/assign`: asigna una tarea materializada. Para `danhei_employee` exige `assigned_user_id`; el nombre libre se reserva para recolectores autorizados y compatibilidad de operador de sede.
- `POST /api/operational-tasks/{id}/batch`: abre la recepción y acepta los campos `delivered_by_*`; requiere `intakes.receive`.
- `POST /api/operational-pickup-batches/{id}/reconcile`: registra recibido, rechazado o faltante y actualiza estado/custodia; requiere `intakes.receive`. Acepta JSON para conciliaciones sin novedades o `multipart/form-data` cuando se adjunta evidencia. Para `missing`, `rejected` o `physical_condition=observed_damage` exige `exception_code` y `evidence_photo` (imagen JPG/PNG/WEBP de máximo 5 MB). La evidencia se guarda en `pickup_batch_item_evidence` con hash SHA-256, usuario, origen y ruta pública; no se crea una guía ni un evento de custodia adicional por la foto.

### `GET /api/operational-pickup-batches/{id}/receipt`

Devuelve el comprobante interno de una recepción conciliada. Requiere `intakes.receive`; no expone lotes a clientes ni pilotos. Solo responde cuando el lote está en `completed` o `completed_with_differences` y devuelve `409 reception_receipt_unavailable` mientras siga abierto o en conciliación.

El documento incluye el código del lote, solicitud y cliente/remitente comercial, sede, persona que recibió físicamente, persona que entregó los paquetes, fecha de cierre, totales esperados/recibidos/rechazados/faltantes y el detalle por guía con resultado, causal, observaciones y las evidencias asociadas (URL, hash, origen y fecha). El panel lo presenta como impresión del navegador para permitir **Guardar como PDF**; la consulta es de solo lectura y no crea nuevos eventos de custodia.

Los permisos de ingreso son `intakes.create`, `intakes.add_package`, `intakes.assign`, `intakes.receive` e `intakes.materialize`. `shipments.direct_create` queda reservado para administración, pero la ruta heredada `POST /api/shipments` conserva temporalmente su permiso anterior hasta migrar todos los CTAs de P14 y P16.

## Conciliación financiera por guía

> Vigente desde el 12 de julio de 2026. Los endpoints agregados de `cod-settlements` y `driver-payouts` se conservan por compatibilidad, pero los movimientos nuevos deben usar los libros auxiliares cuando se requiera trazabilidad por guía o abonos parciales.

### Reglas de remuneración de pilotos

- `GET /api/financial/rate-rules`: lista reglas y versiones. Requiere `financial.view`.
- `POST /api/financial/rate-rules`: crea y aprueba la versión inicial. Requiere `financial.rates`.
- `POST /api/financial/rate-rules/{financialRateRule}/versions`: crea una nueva versión sin modificar la historia. Requiere `financial.rates`.
- `POST /api/financial/rate-rules/{financialRateRule}/toggle`: activa o desactiva con motivo obligatorio. Requiere `financial.rates`.

Servicios soportados: `delivery`, `pickup`, `return_to_hub` y `return_to_client`. Los alcances son `global`, `driver`, `client` y `zone`; la entidad correspondiente es obligatoria salvo en el alcance global. Los montos son enteros en COP y cada regla define `effective_from`, `effective_to`, `priority`, `change_reason`, creador y aprobador.

El resolvedor aplica la regla vigente más específica en el orden piloto → cliente → zona → global, luego prioridad, fecha de inicio, versión e identificador. Una nueva versión continúa siempre desde la última versión de la cadena, no puede iniciar antes de ella y cierra la anterior sin reabrir una vigencia ya expirada.

La causación almacena `rate_rule_id`, `standard_amount` y `rate_snapshot_json`. Así, un cambio futuro no recalcula ni altera servicios ya realizados. En entregas, la ausencia de regla usa temporalmente `shipment.driver_fee` y después `driver.per_package_rate`; recogidas y devoluciones sin regla no crean una remuneración inventada.

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
      shipment_id: number | null;
      operational_task_id: number | null;
      service_type: "delivery" | "pickup" | "return_to_hub" | "return_to_client";
      amount: number;
      standard_amount: number;
      paid_amount: number;
      earned_date: string;
      rate_rule?: { id: number; name: string; version: number } | null;
      rate_snapshot_json?: Record<string, unknown> | null;
    }>;
  };
  remittances: LedgerMovement[];
  service_payments: LedgerMovement[];
  rule: string;
};

type LedgerMovement = {
  id: number;
  reference: string;
  amount: number;
  allocated_amount: number;
  balance_before: number;
  balance_after: number;
  movement_type: "standard" | "reversal";
  status: string;
  reversal_of_id?: number | null;
  method: string;
  external_reference?: string | null;
  notes?: string | null;
  received_at?: string | null;
  paid_at?: string | null;
  received_by?: { id: number; name: string } | null;
  paid_by?: { id: number; name: string } | null;
  approved_by?: { id: number; name: string } | null;
  reversal_of?: { id: number; reference: string } | null;
  reversal?: { id: number; reference: string } | null;
  allocations: Array<{
    id: number;
    amount: number;
    obligation?: { shipment?: { id: number; display_code: string } };
    earning?: { shipment?: { id: number; display_code: string } };
    entitlement?: { shipment?: { id: number; display_code: string } };
  }>;
};
```

`remittances` y `service_payments` incluyen hasta 50 movimientos recientes dentro del período consultado, con usuario, aprobación, saldo anterior/posterior, relación de reverso y asignaciones por guía o asiento de apertura.

### `POST /api/financial/driver-reconciliations/{driver}/remittances`

Registra dinero COD recibido desde el piloto. Requiere un encabezado `Idempotency-Key` único de máximo 191 caracteres.

### `POST /api/financial/driver-reconciliations/{driver}/service-payments`

Registra un pago de Danhei al piloto por servicios. Requiere un encabezado `Idempotency-Key` único de máximo 191 caracteres.

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

Reglas vigentes:

- `amount` debe quedar asignado por completo;
- una línea no puede aparecer más de una vez en `allocations`;
- ninguna asignación puede superar el saldo pendiente;
- repetir la misma llave con el mismo contenido devuelve el movimiento original;
- reutilizar la llave con contenido diferente devuelve `422`.

Una cuenta futura de pagos sin aplicar requerirá un libro explícito y no será un remanente implícito.

### `GET /api/financial/client-ledger/{client}`

Devuelve `reported`, `available`, `transferred`, `pending_transfer`, líneas por guía y hasta 50 movimientos recientes en `payouts`, con usuario y asignaciones.

### `POST /api/financial/client-ledger/{client}/payouts`

Registra una transferencia total o parcial al cliente usando el mismo contrato de asignaciones y requiere `Idempotency-Key`.

### Reversos financieros

- `POST /api/financial/driver-remittances/{remittance}/reverse`
- `POST /api/financial/driver-service-payments/{payment}/reverse`
- `POST /api/financial/client-payouts/{clientCodPayout}/reverse`

Requieren `financial.reverse`, `Idempotency-Key` y `reason` de al menos 10 caracteres. Crean un movimiento de tipo `reversal`, restauran las asignaciones y marcan el original como `reversed`; nunca eliminan el original. Una remesa COD no puede reversarse cuando reducir el disponible dejaría al cliente con más dinero transferido que disponible.

### Apertura histórica

- `GET /api/financial/opening-entries`: lista hasta 100 asientos; requiere `financial.view`.
- `POST /api/financial/opening-entries`: crea un asiento aprobado e idempotente; requiere `financial.opening`.

Tipos:

- `driver_cod_due`: COD que el piloto ya debía a Danhei en la fecha de corte;
- `driver_service_payable`: servicios que Danhei ya debía al piloto;
- `client_cod_available`: COD ya disponible para transferir al cliente.

El payload incluye `amount`, `effective_date`, `support_reference`, `notes` y el `driver_id` o `client_id` correspondiente. El asiento genera una línea normal del libro con `shipment_id=null` y `opening_entry_id`; puede pagarse o conciliarse con los mismos endpoints sin crear guías ficticias.

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
- `POST /api/driver/pickup-batches/{id}/reconcile`: informa una vez cada paquete como `received`, `missing` o `rejected` y cierra el lote. El piloto envía `multipart/form-data` cuando hay faltante o rechazo; esas novedades requieren `exception_code` y `evidence_photo`. P15 captura la foto antes de habilitar el cierre.
