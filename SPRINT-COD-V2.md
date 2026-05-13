# Sprint Cod V2 — Trabajo Estructurado de Producción

## Contexto técnico

- **Repo:** `d:\DHE dev\P16-DHE-Admin-Web`
- **Backend:** Laravel 13 + PHP 8.3 → `localhost:8000` (40+ endpoints funcionales)
- **Frontend:** Next.js 16 + React 19 + TailwindCSS v4 → `localhost:3000`
- **Auth:** Sanctum Bearer token. Credenciales: `admin@danheiexpress.com` / `DanheiAdmin2026!`
- **API client:** `src/lib/api.ts` → `apiGet<T>(path)` y `apiSend<T>(path, method, body)`
- **Types:** `src/lib/types.ts` — interfaces completas para toda la API
- **CSS:** `src/app/globals.css` — variables CSS con soporte dark mode via `[data-theme="dark"]`
- **Tailwind:** `tailwind.config.ts` — colores custom: primary, delivered, route, pending, issue

### REGLA CRÍTICA — Next.js 16

Lee `node_modules/next/dist/docs/` ANTES de escribir código. Next.js 16 tiene breaking changes vs versiones anteriores. Respeta `AGENTS.md`.

### REGLA: Dark mode

TODOS los componentes nuevos o modificados DEBEN soportar dark mode. Usa las clases existentes:
- `dark:bg-[#0f0f23]` (fondo principal)
- `dark:bg-[#1a1a2e]` (cards)
- `dark:bg-[#16162a]` (sidebar/header)
- `dark:text-[#e0e0e0]` (texto)
- `dark:border-[#2a2a3e]` (bordes)
- `dark:hover:bg-[#1f1f35]` (hover)

### REGLA: Al final de CADA bloque

```bash
cd frontend && npm run lint   # 0 errores
cd frontend && npm run build  # compila OK
```

---

## BLOQUE 1: Dashboard — Auto-refresh + Últimos envíos + Widget financiero

**Archivo:** `src/app/(admin)/page.tsx`

### Problemas actuales detectados:
1. NO hay auto-refresh (solo carga una vez en `useEffect`)
2. La gráfica "Entregas por hora" usa datos MOCK (`lineChartPoints` de mock-data.ts)
3. Los eventos recientes usan datos MOCK (`timelineSeed` de mock-data.ts)
4. Botones de "Acciones rápidas" no navegan a ninguna ruta
5. No hay "Últimos 5 envíos" con datos reales
6. No hay widget financiero expandible

### Tareas:

**1.1 Auto-refresh cada 30 segundos:**
- Agregar `setInterval` de 30s que vuelva a hacer `apiGet("/dashboard")`
- Mostrar indicador "Actualizado hace Xs" con dot verde pulsante
- Si falla el fetch: dot rojo + texto "Sin conexión"
- Botón manual de refresh (ícono circular)
- Cleanup del interval en `useEffect` return

**1.2 Gráfica real — Distribución por estado (stacked bar):**
- ELIMINAR `ChartLine` y los imports de `lineChartPoints` de mock-data.ts
- Reemplazar con barra horizontal segmentada proporcional por estado
- Usar los datos de `data.today` (registered, in_transit, delivered, issue, returned, cancelled)
- Cada segmento con el color del enum (ya definidos en `distribution`)
- Animación CSS de llenado (width transition 0.5s)

**1.3 Últimos 5 envíos reales (reemplaza eventos mock):**
- ELIMINAR import de `timelineSeed` de mock-data.ts
- Hacer `apiGet<PaginatedResponse<Shipment>>("/shipments?per_page=5&sort=-created_at")` junto al dashboard
- Mostrar tabla: guía (`display_code`), destinatario (`recipient_name`), estado (chip con color), conductor (`driver?.name`), tiempo relativo ("hace 5 min")
- Click en fila → `router.push("/pedidos")`

**1.4 Widget financiero expandible:**
- Card "Por cobrar" → mostrar `formatCOP(cod_pending + post_sale_owed)`
- Subtexto: "N clientes con deuda"
- Obtener datos de `apiGet<ReceivableResponse>("/clients-receivable")`
- Click expande top 3 deudores (nombre + monto + días de deuda)
- Animación de expand/collapse con `max-height` + transition

**1.5 Acciones rápidas funcionales:**
- "Nuevo pedido" → `router.push("/pedidos")` (luego abrir modal crear, si existe)
- "Ver novedades" → `router.push("/novedades")`
- "Conciliar pagos" → `router.push("/pagos")`

---

## BLOQUE 2: Pedidos — Completar selección múltiple + Acciones batch

**Archivo:** `src/app/(admin)/pedidos/page.tsx` (36K — revisar estado actual)

### Verificar si ya existe:
El archivo ya tiene 36K. Verificar si ya tiene:
- Checkbox por fila + "Seleccionar todos"
- Barra sticky inferior con acciones batch

### Si NO existe o está incompleto, implementar:

**2.1 Selección múltiple:**
- State `selectedIds: Set<number>`
- Checkbox en header de tabla → toggle all visibles
- Checkbox por fila → toggle individual
- Contador "X seleccionados" visible cuando hay selección

**2.2 Barra de acciones batch (sticky bottom):**
- Aparece con animación slide-up cuando `selectedIds.size > 0`
- Botón "Asignar conductor":
  - Selector dropdown con lista de conductores (`apiGet<Driver[]>("/drivers")`)
  - POST batch: `apiSend("/shipments/batch-assign", "POST", { shipment_ids: [...], driver_id })`
- Botón "Cambiar estado":
  - Selector con estados válidos (confirmed, in_transit, delivered, issue, returned)
  - POST batch: `apiSend("/shipments/batch-status", "POST", { shipment_ids: [...], status, description })`
- Loading con progreso: "Procesando..."
- Toast al completar: "X envíos actualizados"
- Deseleccionar todo al completar

**2.3 Botón imprimir guía en modal de detalle:**
- Integrar `<PrintReceipt shipment={selected} />` (ya existe `src/components/print-receipt.tsx`)
- Botón "Imprimir guía" que llame `window.print()`

---

## BLOQUE 3: Clientes — Tabs con historial de envíos

**Archivo:** `src/app/(admin)/clientes/page.tsx` (26K — revisar)

### Verificar si el modal de detalle ya tiene tabs.

### Si NO tiene tabs, implementar:

**3.1 Tabs en el modal/panel de detalle de cliente:**
- Tab "Resumen" → lo que ya existe (datos + financiero)
- Tab "Envíos" → tabla con envíos del cliente:
  - `apiGet<PaginatedResponse<Shipment>>("/shipments?client_id={id}")`
  - Columnas: guía, destinatario, estado (chip), fecha, monto
  - Paginación si > 10
- Tab "Direcciones" → lista de direcciones del cliente:
  - Usar `addresses[]` del `ClientDetail`
  - Mostrar dirección + zona + label
- Badge en cada tab con conteo: "Envíos (12)" "Direcciones (3)"

---

## BLOQUE 4: Conductores — Stats de rendimiento

**Archivos:**
- `src/app/(admin)/conductores/page.tsx` (16K)
- `src/app/(admin)/conductores/[id]/page.tsx` (verificar si existe)

### Tareas:

**4.1 Si `[id]/page.tsx` NO existe, crearlo:**
- Ruta dinámica para detalle de conductor
- `apiGet<DriverDetail>("/drivers/{id}")`

**4.2 Sección "Rendimiento":**
- Card "Tasa de entrega": `today_summary.delivered / today_summary.assigned × 100`
  - Barra de progreso lineal con porcentaje
- Card "Recaudo": barra segmentada verde (collected) / gris (pending)
  - `today_summary.cash_collected` vs `today_summary.pending_cash`
- Card "Novedades": conteo de envíos con status "issue" (rojo si > 0)

**4.3 Tabla de envíos con filtro por estado:**
- Tabs: Todos | Entregados | Pendientes | Novedad
- Filtrar `shipments[]` del DriverDetail por status
- Mostrar: guía, destinatario, estado, dirección

**4.4 Botón "Asignar envío":**
- Modal/selector de envíos sin conductor (`apiGet("/shipments?driver_id=null")`)
- `apiSend("/shipments/{id}/assign", "POST", { driver_id })` para asignar

---

## BLOQUE 5: Reportes — Backend export real

**Archivo:** `src/app/(admin)/reportes/page.tsx` (8K)

### Problemas detectados:
- La exportación CSV es solo local (genera blob desde `board`)
- No usa los endpoints reales de exportación del backend

### Tareas:

**5.1 Exportación real desde backend:**
- Botón "Exportar envíos" → descargar desde `GET /api/reports/export/shipments`
  - Usar `fetchWithAuth` directo (no `apiGet`, porque es blob download)
  - Trigger download con blob + `URL.createObjectURL`
- Botón "Exportar financiero" → descargar desde `GET /api/reports/export/financial`

**5.2 Agregar filtros de fecha:**
- Inputs date-picker: fecha inicio y fecha fin
- Pasar como query params: `?from=2026-05-01&to=2026-05-13`
- Aplicar a las llamadas de stats y de exportación

**5.3 Usar endpoint de stats real:**
- `apiGet("/reports/stats")` para obtener estadísticas reales del backend
- Reemplazar o complementar los datos actuales

---

## BLOQUE 6: Usuarios — CRUD completo en frontend

**Archivo:** CREAR `src/app/(admin)/usuarios/page.tsx`

### El backend ya tiene endpoints:
- `GET /api/users` — listar usuarios
- `GET /api/users/{id}` — detalle
- `POST /api/users` — crear
- `PUT /api/users/{id}` — actualizar
- `GET /api/roles` — listar roles disponibles

### Tareas:

**6.1 Agregar ruta a la navegación:**
- En `layout.tsx`, agregar item en `navItems[]`:
  ```
  { href: "/usuarios", label: "Usuarios", icon: "..." }
  ```
- Ícono SVG path: persona/grupo (24x24 viewBox, stroke style)

**6.2 Crear la página:**
- Tabla de usuarios: nombre, email, teléfono, rol (chip), fecha creación
- Botón "Nuevo usuario" → modal con formulario:
  - name, email, phone, password, role (select de `GET /api/roles`)
  - `apiSend("/users", "POST", data)`
- Click en fila → modal de edición:
  - Mismos campos (sin password obligatorio)
  - `apiSend("/users/{id}", "PUT", data)`
- Skeleton loading
- Toast de éxito/error

**6.3 Types (agregar en `src/lib/types.ts` si no existen):**
```typescript
export interface UserDetail extends User {
  created_at: string;
  updated_at: string;
}
export interface RoleDTO {
  id: number;
  name: string;
}
```

---

## BLOQUE 7: Audit Log — Vista de trazabilidad

**Archivo:** CREAR `src/app/(admin)/auditoria/page.tsx`

### El backend ya tiene endpoint:
- `GET /api/audit-logs?per_page=50` — logs paginados con relación `user`

### Tareas:

**7.1 Agregar a navegación (opcionalmente como sub-item de Configuración)**

**7.2 Crear la página:**
- Tabla: fecha/hora, usuario, acción, descripción, metadata (JSON expandible)
- Filtros: por usuario, por fecha, por tipo de acción
- Paginación con `<Pagination />`
- Skeleton loading

---

## BLOQUE 8: QA completa + Polish visual

### Checklist de verificación (ejecutar TODO):

```
[ ] cd frontend && npm run lint → 0 errores
[ ] cd frontend && npm run build → compila OK
[ ] Login funciona con credenciales demo
[ ] Dashboard: auto-refresh funciona (esperar 30s, ver dot verde)
[ ] Dashboard: barra de estados con datos REALES (no mock)
[ ] Dashboard: últimos 5 envíos con datos reales
[ ] Dashboard: widget financiero se expande con top 3 deudores
[ ] Pedidos: selección múltiple y batch assign/status funcionan
[ ] Pedidos: botón imprimir guía genera recibo legible
[ ] Clientes: tabs (Resumen / Envíos / Direcciones) funcionan
[ ] Conductores: detalle con stats de rendimiento
[ ] Reportes: exportación real desde backend
[ ] Usuarios: CRUD completo funciona
[ ] Pagos: gastos y nómina muestran datos reales
[ ] Configuración: formularios visibles y bonitos
[ ] Dark mode: toggle funciona, TODOS los módulos se ven bien en dark
[ ] Offline banner aparece al desconectar red
[ ] Error boundary muestra pantalla amigable (no pantalla en blanco)
[ ] Responsive 375px: todos los módulos se ven bien
[ ] Ctrl+K: búsqueda funciona en desktop y mobile
[ ] NO hay imports de mock-data.ts en Dashboard (debe usar API real)
```

### Si algo falla, corregirlo antes de reportar.

### Visual polish checklist:
- Todos los cards deben tener `dark:bg-[#1a1a2e] dark:border-[#2a2a3e]`
- Todos los textos deben tener variante dark: `dark:text-[#e0e0e0]` o `dark:text-slate-300`
- Botones hover deben tener `dark:hover:bg-[#1f1f35]`
- Tablas deben tener header con `dark:text-slate-400` y rows con `dark:border-[#2a2a3e]`
- Inputs deben tener `dark:bg-[#16162a] dark:border-[#2a2a3e] dark:text-[#e0e0e0]`
- Skeleton debe funcionar en dark mode

---

## Orden de ejecución recomendado

1. **BLOQUE 1** — Dashboard (más visible, más impacto en demo)
2. **BLOQUE 2** — Pedidos batch
3. **BLOQUE 3** — Clientes tabs
4. **BLOQUE 4** — Conductores stats
5. **BLOQUE 6** — Usuarios CRUD
6. **BLOQUE 5** — Reportes export real
7. **BLOQUE 7** — Audit log
8. **BLOQUE 8** — QA completa

Reportar **SOLO** cuando el BLOQUE 8 (checklist) pase al 100%.
