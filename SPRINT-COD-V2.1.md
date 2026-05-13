# Sprint Cod V2.1 â€” Plan de EjecuciÃ³n Estructurado

## Meta

Llevar el frontend Next.js 16 a paridad completa con el backend Laravel 13 (40+ endpoints) y demostrar en la demo del viernes con Ángel un producto de producción.

Este plan se ejecuta en **8 bloques de implementación** más **2 fases de cierre**: 8A (QA Funcional) y 8B (Polish Visual).

---

## Contexto TÃ©cnico

| Campo | Valor |
|-------|-------|
| Repo | `d:\DHE dev\P16-DHE-Admin-Web` |
| Backend | Laravel 13 + PHP 8.3 â†’ `localhost:8000` |
| Frontend | Next.js 16 + React 19 + TailwindCSS v4 â†’ `localhost:3000` |
| Auth | Sanctum Bearer vía token en `.env.local` (no exponer credenciales en documentos de sprint) |
| API client | `src/lib/api.ts` â†’ `apiGet<T>(path)`, `apiSend<T>(path, method, body)` |
| Types | `src/lib/types.ts` â€” interfaces completas |
| Dark mode | `[data-theme="dark"]` en `globals.css` |
| Package manager | npm (no pnpm/yarn) |

### Regla: Next.js 16

El proyecto usa Next.js 16.2.6 que tiene breaking changes. Seguir patrones del cÃ³digo existente (`"use client"`, App Router, patrones de `layout.tsx` y `page.tsx` actuales).

---

## DoD (Definition of Done) â€” Todos los bloques

Cada bloque se considera DONE cuando cumple TODO:

```
[ ] npm run lint → 0 errores, 0 warnings nuevos
[ ] npx tsc --noEmit → typecheck OK
[ ] npm run build â†’ compila OK
[ ] Loading state: skeleton o spinner mientras carga datos
[ ] Empty state: mensaje amigable cuando no hay datos
[ ] Error state: toast o mensaje cuando falla el fetch
[ ] Dark mode: todos los elementos nuevos con variantes dark
[ ] Mobile 375px: layout no se rompe, scroll funcional
[ ] NavegaciÃ³n: links/botones llevan a la ruta correcta
```

### Clases dark mode obligatorias:

| Elemento | Clase |
|----------|-------|
| Card bg | `dark:bg-[#1a1a2e] dark:border-[#2a2a3e]` |
| Header/sidebar bg | `dark:bg-[#16162a]` |
| Texto principal | `dark:text-[#e0e0e0]` |
| Texto secundario | `dark:text-slate-400` |
| Hover | `dark:hover:bg-[#1f1f35]` |
| Input | `dark:bg-[#16162a] dark:border-[#2a2a3e] dark:text-[#e0e0e0]` |
| Bordes | `dark:border-[#2a2a3e]` |
| Tabla header | `dark:text-slate-400` |
| Tabla rows | `dark:border-[#2a2a3e]` |

---

## Contratos Backend (DTOs reales)

### GET /api/dashboard

```typescript
interface DashboardResponse {
  today: {
    total: number;
    registered: number; confirmed: number;
    in_transit: number; delivered: number;
    issue: number; returned: number; cancelled: number;
  };
  financial: {
    cod_pending: number; cod_collected: number;
    post_sale_owed: number; today_revenue: number;
    today_driver_cost: number; today_profit: number;
  };
  week: { total: number };
}
```

### GET /api/dashboard/hourly

```typescript
interface HourlyStatsResponse {
  registrations: Array<{ hour: string; label: string; count: number }>;
  deliveries: Array<{ hour: string; count: number }>;
  peak_hour: { hour: string; label: string; count: number };
}
```

### GET /api/shipments?per_page=5

```typescript
// PaginatedResponse<Shipment> â€” ya existe en types.ts
```

### GET /api/clients-receivable

```typescript
interface ReceivableResponse {
  clients: Array<{
    id: number; name: string; phone: string | null;
    company: string | null; total_owed: number;
    owed_shipments_count: number; days_oldest_debt: number;
  }>;
  total_owed: number;
  count: number;
}
```

### GET /api/users (paginated)

```typescript
interface UserListItem {
  id: number; name: string; email: string;
  phone: string | null; role_names: string[];
  permissions_count: number; created_at: string;
}
```

### GET /api/users/{id}

```typescript
interface UserDetailDTO {
  id: number; name: string; email: string;
  phone: string | null; roles: string[];
  permissions: string[]; created_at: string;
  tokens_count: number;
}
```

### POST /api/users

```typescript
// Request:
{ name: string; email: string; password: string; phone?: string; role: string }
// Response 201: { ...user, roles: string[] }
```

### PUT /api/users/{id}

```typescript
// Request:
{ name?: string; email?: string; phone?: string; password?: string; role?: string }
// Response: { ...user, roles: string[] }
```

### GET /api/roles

```typescript
type RolesResponse = Array<{
  name: string;
  users_count: number;
  permissions: string[];
}>;
```

### GET /api/audit-logs?per_page=50

```typescript
// PaginatedResponse<AuditLog>
interface AuditLog {
  id: number; user_id: number; action: string;
  description: string; metadata: Record<string, unknown> | null;
  created_at: string; user?: { id: number; name: string };
}
```

### GET /api/reports/stats?from=YYYY-MM-DD&to=YYYY-MM-DD

```typescript
interface ReportStatsResponse {
  period: { from: string; to: string };
  summary: {
    total: number; delivered: number; delivery_rate: number;
    issues: number; returned: number; cancelled: number;
    revenue: number; driver_cost: number; profit: number;
    cod_collected: number;
  };
  by_status: Record<string, number>;
  by_driver: Array<{
    id: number; name: string; total: number; delivered: number;
    delivery_rate: number; revenue: number; earnings: number;
  }>;
  by_client: Array<{
    id: number; name: string; company: string | null;
    total: number; revenue: number;
  }>;
}
```

### GET /api/reports/export/shipments?from=&to=

```
Response: text/csv (descarga directa, NO async)
Header: Content-Disposition: attachment; filename=envios_{from}_{to}.csv
```

### GET /api/reports/export/financial?from=&to=

```
Response: text/csv (descarga directa, NO async)
Header: Content-Disposition: attachment; filename=financiero_{from}_{to}.csv
```

### GET /api/drivers/{id}

```typescript
interface DriverDetailDTO extends Driver {
  shipments: Shipment[]; // envÃ­os del dÃ­a
  today_summary: {
    assigned: number; delivered: number;
    cash_collected: number; pending_cash: number;
    earnings: number;
  };
}
```

### POST /api/shipments/batch-status

```typescript
// Request:
{ shipment_ids: number[]; status: string; description?: string }
// Response:
{ success: number; failed: number; errors: string[]; message: string }
```

### POST /api/shipments/batch-assign

```typescript
// Request:
{ shipment_ids: number[]; driver_id: number }
// Response:
{ updated: number; message: string }
```

---

## Matriz de Riesgos

| Bloque | Riesgo | Impacto | Probabilidad | Plan B |
|--------|--------|---------|-------------|--------|
| Dashboard live | `/dashboard/hourly` no tiene datos con SQLite demo | Alto | Media | Usar distribuciÃ³n por estado como chart principal, grÃ¡fica horaria como secundaria con empty state "Sin actividad hoy" |
| Dashboard live | Auto-refresh en 30s puede causar race conditions con navegaciÃ³n | Medio | Baja | Cleanup del interval en useEffect return + abort controller |
| Conductores stats | `today_summary` puede venir vacÃ­o si no hay envÃ­os del dÃ­a | Medio | Alta | Mostrar 0/0 con mensaje "Sin actividad registrada hoy" |
| Usuarios CRUD | PÃ¡gina nueva puede tener problemas de routing en Next.js 16 | Medio | Baja | Seguir patrÃ³n exacto de `/pedidos/page.tsx` |
| Reportes export | CSV grande puede bloquear UI | Bajo | Baja | Los endpoints son sÃ­ncronos pero rÃ¡pidos (no hay millones de registros) |
| Audit Log | Endpoint protegido por permission:financial.view puede responder 403 según rol | Medio | Media | Validar permisos del usuario demo; si no tiene acceso, ocultar entrada de menú y mostrar mensaje de autorización |

---

## BLOQUE 1: Usuarios CRUD

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (4-6h) |
| Owner | Cod |
| Dependencia externa | Ninguna â€” backend 100% listo |
| Archivo | CREAR `src/app/(admin)/usuarios/page.tsx` |
| NavegaciÃ³n | Agregar item en `layout.tsx` â†’ `navItems[]` |

### Fase 1 â€” MVP de pantalla

**Alcance:**
- Tabla paginada de usuarios con datos reales (`GET /api/users`)
- Modal crear usuario (`POST /api/users`)
- Modal editar usuario (`PUT /api/users/{id}`)
- Select de roles (`GET /api/roles`)
- Loading, empty, error states
- Dark mode completo

**Endpoints:**
- `GET /api/users?search=&role=&per_page=25`
- `GET /api/users/{id}`
- `POST /api/users` â†’ `{ name, email, password, phone, role }`
- `PUT /api/users/{id}` â†’ `{ name?, email?, phone?, password?, role? }`
- `GET /api/roles`

**Criterios de aceptaciÃ³n:**
- [ ] Tabla muestra: nombre, email, telÃ©fono, rol (chip coloreado), fecha
- [ ] BotÃ³n "Nuevo usuario" abre modal con formulario validado
- [ ] Click en fila abre modal ediciÃ³n precargado
- [ ] Select de rol se llena desde `GET /api/roles`
- [ ] Toast de Ã©xito/error en crear y editar
- [ ] Skeleton loading mientras carga
- [ ] BÃºsqueda por nombre/email funciona

**Types a agregar en `src/lib/types.ts`:**
```typescript
export interface UserListItem {
  id: number; name: string; email: string;
  phone: string | null; role_names: string[];
  permissions_count: number; created_at: string;
}
export interface RoleDTO {
  name: string; users_count: number; permissions: string[];
}
```

### Fase 2 â€” UX mejorada (si hay tiempo)
- Filtro por rol (dropdown)
- Confirmar antes de cambiar rol de superadmin
- Indicador de permisos por rol

---

## BLOQUE 2: Audit Log

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **S** (2-3h) |
| Owner | Cod |
| Dependencia externa | Ninguna |
| Archivo | CREAR `src/app/(admin)/auditoria/page.tsx` |
| NavegaciÃ³n | Sub-ruta de ConfiguraciÃ³n o item nuevo |

### Fase 1 â€” MVP de pantalla

**Alcance:**
- Tabla paginada de logs (`GET /api/audit-logs?per_page=50`)
- Columnas: fecha, usuario, acciÃ³n, descripciÃ³n
- PaginaciÃ³n con `<Pagination />`
- Loading, empty, error states

**Endpoints:**
- `GET /api/audit-logs?per_page=50`

**Criterios de aceptaciÃ³n:**
- [ ] Tabla muestra logs mÃ¡s recientes
- [ ] PaginaciÃ³n funciona
- [ ] Skeleton loading
- [ ] Empty state "Sin registros de auditorÃ­a"
- [ ] Dark mode

**Type a agregar:**
```typescript
export interface AuditLog {
  id: number; user_id: number; action: string;
  description: string; metadata: Record<string, unknown> | null;
  created_at: string; user?: { id: number; name: string };
}
```

### Fase 2 â€” UX mejorada
- Filtro por usuario
- Filtro por rango de fechas
- Metadata expandible (JSON prettified en acordeÃ³n)

---

## BLOQUE 3: Dashboard Live

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **L** (6-8h) |
| Owner | Cod |
| Dependencia externa | Backend `/dashboard/hourly` (ya implementado) |
| Archivo | `src/app/(admin)/page.tsx` |

### Sub-tarea 3.1: Refresh + Polling (2h)

**Alcance:** Auto-refresh del dashboard cada 30 segundos.

- `setInterval(30_000)` que recarga `apiGet("/dashboard")`
- Indicador visual: dot verde pulsante + "Actualizado hace Xs"
- Si falla: dot rojo + "Sin conexiÃ³n"
- BotÃ³n manual de refresh (Ã­cono circular con animaciÃ³n rotate)
- Cleanup en `useEffect` return
- Usar `AbortController` para cancelar fetches en vuelo al desmontar

**Criterios:**
- [ ] Dashboard se auto-refresca (esperar 30s y ver dot verde)
- [ ] Dot cambia a rojo si el backend se apaga
- [ ] BotÃ³n manual refresca inmediatamente
- [ ] No memory leaks al navegar fuera

### Sub-tarea 3.2: Chart Live (1.5h)

**Alcance:** Reemplazar grÃ¡fica mock con datos reales.

- ELIMINAR componente `ChartLine` y import de `lineChartPoints` de `mock-data.ts`
- OpciÃ³n A (principal): Barra horizontal segmentada proporcional por estado
  - Usa datos de `data.today` (ya cargados)
  - Cada segmento con color del enum, labels, tooltips
  - AnimaciÃ³n CSS `transition: width 0.5s ease`
- OpciÃ³n B (complementaria): Si `/dashboard/hourly` tiene datos, mostrar barras verticales con registros por hora
  - `apiGet<HourlyStatsResponse>("/dashboard/hourly")`
  - Empty state: "Sin actividad registrada hoy"

**Criterios:**
- [ ] No hay imports de `mock-data.ts` en el dashboard
- [ ] La grÃ¡fica muestra datos REALES de la API

### Sub-tarea 3.3: Timeline Live (1.5h)

**Alcance:** Reemplazar eventos mock con Ãºltimos 5 envÃ­os reales.

- ELIMINAR import de `timelineSeed` de `mock-data.ts`
- `apiGet<PaginatedResponse<Shipment>>("/shipments?per_page=5")` junto al dashboard
- Tabla compacta: guÃ­a, destinatario, estado (chip), conductor, tiempo relativo
- Calcular "hace X min" con `new Date() - new Date(created_at)`
- Click en fila â†’ `router.push("/pedidos")`

**Criterios:**
- [ ] Los 5 envÃ­os son reales de la API
- [ ] Tiempo relativo se muestra correctamente
- [ ] Click navega a pedidos

### Sub-tarea 3.4: Widget Financiero Expandible (1.5h)

**Alcance:** Card con cuentas por cobrar + top 3 deudores.

- `apiGet<ReceivableResponse>("/clients-receivable")` en paralelo
- Card muestra: `formatCOP(total_owed)` + `"${count} clientes con deuda"`
- Click o botÃ³n toggle expande top 3:
  - `clients.slice(0, 3).map(c => nombre + monto + dÃ­as)`
- AnimaciÃ³n: `max-height` transition o `grid-rows` transition

**Criterios:**
- [ ] Card muestra datos reales del backend
- [ ] Se expande/colapsa suavemente
- [ ] Top 3 deudores con monto y dÃ­as

### Sub-tarea 3.5: Acciones RÃ¡pidas Funcionales (0.5h)

- "Nuevo pedido" â†’ `router.push("/pedidos")`
- "Ver novedades" â†’ `router.push("/novedades")`
- "Conciliar pagos" â†’ `router.push("/pagos")`

---

## BLOQUE 4: Reportes â€” Export Real

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (3-4h) |
| Owner | Cod |
| Dependencia externa | Ninguna |
| Archivo | `src/app/(admin)/reportes/page.tsx` |

**DecisiÃ³n de diseÃ±o:** Los exports son **descarga directa** (no async/polling). El backend retorna CSV sÃ­ncrono.

### Tareas:

**4.1 Stats reales desde backend:**
- `apiGet<ReportStatsResponse>("/reports/stats?from=&to=")`
- Reemplazar KPIs actuales con `summary` del response
- Agregar tabla "Por conductor" desde `by_driver`
- Agregar tabla "Top clientes" desde `by_client`

**4.2 Filtros de fecha:**
- Dos inputs `<input type="date">` para `from` y `to`
- Default: primer dÃ­a del mes actual â†’ hoy
- Recarga datos y exports al cambiar

**4.3 ExportaciÃ³n real:**
- BotÃ³n "Exportar envÃ­os CSV" â†’ `fetchWithAuth("/api/reports/export/shipments?from=&to=")` + blob download
- BotÃ³n "Exportar financiero CSV" â†’ `fetchWithAuth("/api/reports/export/financial?from=&to=")` + blob download
- Eliminar funciÃ³n `exportCsv` local actual

**Criterios:**
- [ ] Stats usan endpoint real con filtro de fechas
- [ ] Export descarga CSV real del backend
- [ ] Filtros de fecha funcionan
- [ ] Loading durante export

---

## BLOQUE 5: Conductores Stats

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (3-4h) |
| Owner | Cod |
| Dependencia externa | Ninguna |
| Archivos | `src/app/(admin)/conductores/[id]/page.tsx` (verificar si existe, si no: CREAR) |

### Tareas:

**5.1 Ruta dinÃ¡mica `[id]/page.tsx`:**
- `apiGet<DriverDetailDTO>("/drivers/{id}")`
- Datos del conductor: nombre, telÃ©fono, vehÃ­culo, placa, zona, estado

**5.2 SecciÃ³n "Rendimiento":**
- Card "Tasa de entrega": `delivered / assigned Ã— 100` con barra de progreso
- Card "Recaudo": barra segmentada `cash_collected` (verde) / `pending_cash` (gris)
- Card "Novedades": count de `shipments.filter(s => s.status === "issue")` â€” rojo si > 0

**5.3 Tabla de envÃ­os con tabs de filtro:**
- Tabs: Todos | Entregados | Pendientes | Novedad
- Filtrar `shipments[]` del DriverDetail por status

**Criterios:**
- [ ] Ruta `/conductores/{id}` muestra detalle real
- [ ] Cards de rendimiento con datos calculados
- [ ] Tabs filtran tabla de envÃ­os
- [ ] Empty state para "Sin actividad hoy"

---

## BLOQUE 6: Clientes Tabs

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (3-4h) |
| Owner | Cod |
| Dependencia externa | Ninguna |
| Archivo | `src/app/(admin)/clientes/page.tsx` (modificar modal/panel detalle) |

### Tareas:

**6.1 Sistema de tabs en modal/panel de detalle:**
- Tab "Resumen": lo que ya existe
- Tab "EnvÃ­os": `apiGet("/shipments?client_id={id}")` â†’ tabla paginada
- Tab "Direcciones": datos de `ClientDetail.addresses[]`
- Badge en tab con conteo

**Criterios:**
- [ ] Tabs funcionan con transiciÃ³n suave
- [ ] EnvÃ­os se cargan desde API real
- [ ] PaginaciÃ³n si > 10 envÃ­os
- [ ] Direcciones muestran direcciÃ³n + zona + label
- [ ] Badge con conteo en cada tab

---

## BLOQUE 7: Pedidos Batch

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (3-4h) |
| Owner | Cod |
| Dependencia externa | Ninguna |
| Archivo | `src/app/(admin)/pedidos/page.tsx` (verificar estado actual â€” 36K) |

**IMPORTANTE:** Verificar primero si ya existe selecciÃ³n mÃºltiple. El archivo tiene 36K, puede que ya estÃ© parcialmente implementado.

### Si no existe o estÃ¡ incompleto:

**7.1 SelecciÃ³n mÃºltiple:**
- `useState<Set<number>>` para IDs seleccionados
- Checkbox en header â†’ toggle all, checkbox por fila â†’ toggle individual
- Contador "X seleccionados"

**7.2 Barra de acciones batch (sticky bottom):**
- Slide-up animation cuando `selectedIds.size > 0`
- "Asignar conductor":
  - `apiGet<Driver[]>("/drivers")` para selector
  - `apiSend("/shipments/batch-assign", "POST", { shipment_ids, driver_id })`
- "Cambiar estado":
  - Select de estados vÃ¡lidos
  - `apiSend("/shipments/batch-status", "POST", { shipment_ids, status, description })`
- Toast con resultado: `"${success} envÃ­os actualizados"`
- Deseleccionar al completar

**Criterios:**
- [ ] Checkbox funciona individual y masivo
- [ ] Barra batch aparece con animaciÃ³n
- [ ] Assign y status batch ejecutan endpoints reales
- [ ] Toast muestra resultado
- [ ] IntegraciÃ³n con `<PrintReceipt>` (botÃ³n en modal detalle)

---

## BLOQUE 8A: QA Funcional

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **M** (2-3h) |
| Owner | Cod |

### Checklist funcional obligatorio:

```
[ ] npm run lint → 0 errores
[ ] npx tsc --noEmit → typecheck OK
[ ] npm run build â†’ compila OK
[ ] Login con credenciales demo funciona
[ ] Dashboard: auto-refresh 30s (dot verde visible)
[ ] Dashboard: NO hay imports de mock-data.ts
[ ] Dashboard: Ãºltimos 5 envÃ­os son reales
[ ] Dashboard: widget financiero se expande
[ ] Dashboard: acciones rÃ¡pidas navegan correctamente
[ ] Pedidos: selecciÃ³n mÃºltiple funcional
[ ] Pedidos: batch assign ejecuta endpoint real
[ ] Pedidos: batch status ejecuta endpoint real
[ ] Pedidos: imprimir guÃ­a genera recibo legible
[ ] Clientes: modal tiene tabs (Resumen/EnvÃ­os/Direcciones)
[ ] Clientes: tab EnvÃ­os carga desde API
[ ] Conductores: /conductores/{id} muestra stats reales
[ ] Reportes: usa GET /api/reports/stats (no datos locales)
[ ] Reportes: export descarga CSV del backend
[ ] Usuarios: CRUD completo funciona
[ ] Audit: tabla de logs con paginaciÃ³n
[ ] ConfiguraciÃ³n: perfil se guarda vÃ­a PUT /api/me
[ ] ConfiguraciÃ³n: cambio password usa PUT /api/me/password
[ ] Novedades: reintentar/devolver ejecutan endpoint real
[ ] Pagos: datos reales del backend
[ ] Ctrl+K: bÃºsqueda global funciona
[ ] Offline banner aparece al desconectar
[ ] Error boundary captura errores (no pantalla blanca)
```

---

## BLOQUE 8B: Polish Visual

| Campo | Valor |
|-------|-------|
| EstimaciÃ³n | **S** (1-2h) |
| Owner | Cod |

### Checklist visual:

```
[ ] Dark mode: CADA card tiene dark:bg-[#1a1a2e] dark:border-[#2a2a3e]
[ ] Dark mode: CADA texto tiene variante dark
[ ] Dark mode: CADA input tiene dark:bg dark:border dark:text
[ ] Dark mode: tablas con dark:text-slate-400 (header) y dark:border-[#2a2a3e] (rows)
[ ] Dark mode: modales con fondo dark correcto
[ ] Dark mode: chips de estado mantienen colores con bg opacity 20%
[ ] Mobile 375px: sidebar oculta correctamente
[ ] Mobile 375px: tablas tienen overflow-x-auto
[ ] Mobile 375px: modales no se salen de la pantalla
[ ] Mobile 375px: bÃºsqueda global funciona
[ ] Skeleton loading en CADA pÃ¡gina mientras carga
[ ] Empty states con Ã­cono + mensaje en CADA mÃ³dulo sin datos
[ ] Transiciones fade-in en CADA pÃ¡gina (animate-fade-in)
[ ] Botones con active:scale-95 y transition-all
```

---

## Orden de EjecuciÃ³n (por dependencia)

```
1. BLOQUE 1 â†’ Usuarios CRUD (pantalla nueva, sin riesgo de romper existente)
2. BLOQUE 2 â†’ Audit Log (pantalla nueva, sin riesgo)
3. BLOQUE 3 â†’ Dashboard Live (reemplazar mocks â€” mayor impacto visual)
4. BLOQUE 4 â†’ Reportes Export Real
5. BLOQUE 5 â†’ Conductores Stats
6. BLOQUE 6 â†’ Clientes Tabs
7. BLOQUE 7 â†’ Pedidos Batch (verificar primero si ya existe)
8. BLOQUE 8A â†’ QA Funcional (validar TODO)
9. BLOQUE 8B â†’ Polish Visual (Ãºltimo pase)
```

**Reportar avance al cerrar cada bloque (1-7) y validar cierre final con 8A + 8B al 100%.**

