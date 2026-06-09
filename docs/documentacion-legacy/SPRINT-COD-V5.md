# SPRINT-COD-V5 — Bloques 7, 8, 9

## REGLAS DE COD (PERMANENTES)
1. **LEY DE SECUENCIA**: Cero fechas. Solo pasos numerados por calidad.
2. **No romper lo que funciona**: `php artisan test` debe seguir en 118+ pass.
3. **Dark mode obligatorio** en toda UI nueva.
4. **Responsive 375px+** en toda página web.
5. **Conventional commits**: `feat:`, `fix:`, `test:`, `sec:`.
6. **Validar al final de cada bloque**: lint + build + tests.

---

## BLOQUE 7 — Backend: Endpoints nuevos + Middleware

### Contexto
El archivo `api/app/Http/Middleware/ScopeClient.php` ya existe. Necesitas:
1. Registrarlo en el kernel/bootstrap
2. Crear 2 endpoints nuevos
3. Crear rol "client" con permisos
4. Tests

### 7.1 Registrar ScopeClient middleware

En `api/bootstrap/app.php` (o donde se registren middleware aliases), agregar:
```php
'scope' => \App\Http\Middleware\ScopeClient::class,
```

### 7.2 Agregar campo client_id y driver_id a users table

Crear migración:
```
php artisan make:migration add_client_driver_ids_to_users_table
```

```php
Schema::table('users', function (Blueprint $table) {
    $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
    $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
});
```

### 7.3 Agregar relaciones al modelo User

En `app/Models/User.php`:
```php
public function client(): BelongsTo
{
    return $this->belongsTo(Client::class);
}

public function driver(): BelongsTo
{
    return $this->belongsTo(Driver::class);
}
```

### 7.4 Crear endpoint GET /api/client/my-dashboard

En `api/routes/api.php` dentro del grupo auth:
```php
Route::get('/client/my-dashboard', [ClientController::class, 'myDashboard'])
    ->middleware('scope');
```

En `ClientController.php` agregar método:
```php
public function myDashboard(Request $request)
{
    $clientId = $request->input('_scoped_client_id');
    if (! $clientId) {
        return response()->json(['error' => 'Acceso denegado'], 403);
    }

    $client = Client::findOrFail($clientId);

    $activeShipments = Shipment::where('client_id', $clientId)
        ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
        ->count();

    $deliveredThisMonth = Shipment::where('client_id', $clientId)
        ->where('status', 'delivered')
        ->whereMonth('updated_at', now()->month)
        ->whereYear('updated_at', now()->year)
        ->count();

    // Balance pendiente
    $balance = Shipment::where('client_id', $clientId)
        ->where('payment_type', 'post_sale')
        ->where('payment_status', '!=', 'settled')
        ->sum('shipping_cost');

    $recentShipments = Shipment::where('client_id', $clientId)
        ->orderByDesc('created_at')
        ->limit(5)
        ->get(['id', 'display_code', 'status', 'recipient_name', 'created_at']);

    return response()->json([
        'client' => $client->only(['id', 'name', 'company', 'phone']),
        'active_shipments' => $activeShipments,
        'delivered_this_month' => $deliveredThisMonth,
        'pending_balance' => $balance,
        'recent_shipments' => $recentShipments,
    ]);
}
```

### 7.5 Crear endpoint GET /api/driver/my-route

En `api/routes/api.php`:
```php
Route::get('/driver/my-route', [RouteController::class, 'myRoute'])
    ->middleware('scope');
```

En `RouteController.php` agregar método:
```php
public function myRoute(Request $request)
{
    $driverId = $request->input('_scoped_driver_id');
    if (! $driverId) {
        return response()->json(['error' => 'Acceso denegado'], 403);
    }

    $route = \App\Models\Route::where('driver_id', $driverId)
        ->whereDate('date', now()->toDateString())
        ->with(['stops' => function ($query) {
            $query->orderBy('sort_order')
                ->with('shipment:id,display_code,status,recipient_name,recipient_phone,recipient_address,recipient_zone,payment_type,cod_amount,shipping_cost,notes');
        }])
        ->first();

    if (! $route) {
        return response()->json([
            'route' => null,
            'message' => 'No tienes ruta asignada para hoy.',
        ]);
    }

    return response()->json([
        'route' => $route,
    ]);
}
```

### 7.6 Crear rol "client" en seeder

En `DemoDataSeeder.php` o un nuevo seeder, agregar:
```php
$clientRole = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'sanctum']);
$clientRole->syncPermissions([
    'shipments.view',
    'shipments.create',
    'clients.view',
    'clients.edit',
]);

$driverRole = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'sanctum']);
$driverRole->syncPermissions([
    'routes.view',
    'routes.manage',
    'shipments.view',
    'shipments.change_status',
    'financial.collect',
]);
```

### 7.7 Tests

Crear `tests/Feature/ScopedEndpointTest.php`:
- Test: client user can access my-dashboard
- Test: client user only sees own data
- Test: admin can still access everything
- Test: driver user can access my-route
- Test: unauthenticated user gets 401

### 7.8 Validación

```bash
php artisan test   # Debe dar 123+ pass (118 existentes + 5 nuevos)
```

---

## BLOQUE 8 — P14 Portal Cliente: Páginas funcionales

### Contexto
- Directorio: `D:\DHE dev\P14-DHE-app-Cliente-\p14-cliente-web`
- Ya tiene: login, 6 páginas scaffold, layout, build pasa
- Stack: Next.js 16 + Tailwind v4
- API: http://127.0.0.1:8000/api (dev)

### Design tokens (globals.css)
Usar los mismos tokens de P16:
```css
:root {
  --primary: #d1007f;
  --delivered: #12a85f;
  --route: #1f86ff;
  --pending: #ff8616;
  --issue: #e72256;
}

[data-theme="dark"] {
  --bg: #0f0f23;
  --surface: #1a1a2e;
  --surface-2: #16162a;
  --border: #2a2a3e;
  --text: #e0e0e0;
  --text-muted: #94a3b8;
}
```

### 8.1 Crear lib/api.ts

Copiar el patrón de P16 (`D:\DHE dev\P16-DHE-Admin-Web\frontend\src\lib\api.ts`):
- `apiGet<T>(path)` → GET con Bearer token
- `apiSend<T>(path, method, body)` → POST/PUT/DELETE con Bearer token
- Token leído de localStorage
- Base URL: `process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api"`

### 8.2 Crear lib/auth.tsx

Copiar el patrón de P16 (`D:\DHE dev\P16-DHE-Admin-Web\frontend\src\lib\auth.tsx`):
- AuthProvider con Context
- login(email, password) → POST /api/login → guardar token
- logout() → POST /api/logout → limpiar token
- user state con GET /api/me
- Loading state durante verificación

### 8.3 Crear lib/types.ts

Interfaces necesarias (subset de P16):
```typescript
export interface Client { id: number; name: string; phone: string; email?: string; company?: string; nit?: string; billing_type: string; }
export interface Shipment { id: number; display_code: string; status: ShipmentStatus; recipient_name: string; recipient_phone: string; recipient_address: string; recipient_zone: string; payment_type: PaymentType; shipping_cost: number; cod_amount: number; created_at: string; updated_at: string; notes?: string; }
export type ShipmentStatus = 'registered' | 'confirmed' | 'pickup_scheduled' | 'picked_up' | 'in_warehouse' | 'assigned_to_route' | 'in_transit' | 'delivered' | 'issue' | 'returned' | 'cancelled';
export type PaymentType = 'cash_on_delivery' | 'post_sale' | 'prepaid';
export interface Notification { id: number; title: string; body: string; read: boolean; created_at: string; }
export interface ClientAddress { id: number; label: string; address: string; zone: string; }
export interface PaginatedResponse<T> { data: T[]; current_page: number; last_page: number; total: number; }
export interface ShipmentEvent { id: number; status: string; description: string; occurred_at: string; }
```

### 8.4 Crear lib/utils.ts

```typescript
export const formatCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
export const formatDate = (d: string) => new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const toTitle = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
```

### 8.5 Dashboard page

- Fetch GET /api/client/my-dashboard (o fallback a GET /api/me + GET /api/shipments)
- 3 cards KPI: envíos activos, entregados este mes, balance pendiente
- Últimos 5 envíos con StatusBadge
- Skeleton loading
- Botón "Nuevo envío" → navega a /envios?nuevo=true
- Dark mode completo

### 8.6 Envíos page

- Tabla responsive de envíos del cliente
- GET /api/shipments (backend filtra por client_id automático si tiene scope)
- Filtros: status tabs, buscador por código guía
- Pagination component
- Click fila → /envios/[id] → detalle con timeline
- Modal crear envío (POST /api/shipments)
- Skeleton + empty state

### 8.7 Envíos [id] detail page

- GET /api/shipments/{id}
- Datos del envío completos
- Timeline de eventos (reutilizar componente de P16 o crear uno simple)
- Tracking code compartible (botón copiar)
- Botón volver

### 8.8 Finanzas page

- GET /api/clients-receivable (filtrado por cliente)
- Balance actual con badge (pagado/pendiente/vencido)
- Lista de envíos con estado de pago
- formatCOP para montos

### 8.9 Notificaciones page

- GET /api/notifications
- Lista con badge read/unread
- Botón "Marcar todas como leídas" (POST /api/notifications/read-all)
- Empty state: "Sin notificaciones"

### 8.10 Perfil page

- GET /api/me → datos del usuario/cliente
- Formulario editable: nombre, teléfono, empresa, NIT
- PUT /api/me para guardar
- Sección direcciones: lista + agregar + editar + eliminar
- POST/PUT/DELETE /api/clients/{id}/addresses
- Cambiar contraseña (PUT /api/me/password)
- Botón cerrar sesión

### 8.11 Soporte page

- FAQ estático (5 preguntas frecuentes sobre el servicio)
- Link WhatsApp: `https://wa.me/57XXXXXXXXX?text=Hola,%20necesito%20soporte`
- Formulario PQR simple (nombre + asunto + mensaje) — puede ser solo mailto o WhatsApp redirect por ahora

### 8.12 Sidebar component

- Logo Danhei arriba
- Links: Dashboard, Envíos, Finanzas, Notificaciones, Perfil, Soporte
- Indicador de página activa
- Colapsable en móvil (hamburger menu)
- Botón cerrar sesión abajo
- Badge contador de notificaciones no leídas

### 8.13 Validación P14

```bash
npm run lint    # 0 errores
npm run build   # compila OK
# Smoke test manual: todas las rutas devuelven 200
```

---

## BLOQUE 9 — P15 App Repartidor: Pantallas operativas

### Contexto
- Directorio: `D:\DHE dev\P15-DHE-App-Repartidor`
- Ya tiene: login.tsx, home.tsx, _layout.tsx, lib/api.ts
- Stack: Expo + React Native + TypeScript
- Arquitectura: `docs/ARCHITECTURE.md`
- API: http://127.0.0.1:8000/api (dev)
- Dark mode por defecto (repartidores trabajan día y noche)

### Design tokens (crear lib/colors.ts)
```typescript
export const colors = {
  primary: '#d1007f',
  delivered: '#12a85f',
  route: '#1f86ff',
  pending: '#ff8616',
  issue: '#e72256',
  bg: '#0f0f23',
  surface: '#1a1a2e',
  surface2: '#16162a',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textMuted: '#94a3b8',
  white: '#ffffff',
};
```

### 9.1 Tab Navigator

Reemplazar `home.tsx` con un tab layout:
- Crear `app/(tabs)/_layout.tsx` con 3 tabs:
  - 🚛 Mi Ruta (index)
  - 💰 Recaudo
  - 👤 Perfil
- Iconos con `@expo/vector-icons` (MaterialIcons o Ionicons)
- Tab bar dark: bg `#0f0f23`, active `#d1007f`

### 9.2 Mi Ruta (tab principal)

- Header: nombre del conductor + fecha de hoy
- Fetch GET /api/driver/my-route (o fallback a GET /api/routes?date=today)
- Card resumen: X paradas / Y completadas / Z pendientes
- Barra de progreso (completadas / total)
- FlatList de paradas ordenadas por sort_order:
  - ✅ Verde: completada (status = delivered)
  - 🔵 Azul destacada: siguiente pendiente
  - ⬜ Gris: pendientes
- Cada parada muestra: destinatario, dirección, zona, tipo pago
- Tap en parada → navegar a `/ruta/[stopId]`
- Pull-to-refresh (RefreshControl)
- Empty state si no hay ruta para hoy

### 9.3 Detalle Parada

Crear `app/ruta/[stopId].tsx`:
- Datos grandes del destinatario (nombre, teléfono, dirección)
- Tap teléfono → `Linking.openURL('tel:...')`
- Tap dirección → `Linking.openURL('geo:...')` o `Linking.openURL('https://maps.google.com/...')`
- Zona + tipo pago + monto COD
- Notas/instrucciones de entrega
- 2 botones grandes (44px+ height):
  - "✅ Entregar" (verde) → navega a `/entrega/[shipmentId]`
  - "⚠️ Novedad" (rojo) → navega a `/novedad/[shipmentId]`

### 9.4 Confirmar Entrega

Crear `app/entrega/[shipmentId].tsx`:
- Resumen del envío (código, destinatario, dirección)
- Si payment_type === 'cash_on_delivery':
  - Toggle/Switch "¿Cobró?" 
  - Campo monto (pre-llenado con cod_amount)
- Botón "📷 Tomar foto" (expo-camera o expo-image-picker)
  - Preview de la foto tomada
  - Botón para retomar
- Botón grande "Confirmar entrega"
  - POST /api/shipments/{id}/status → { status: "delivered", description: "Entregado" }
  - Si cobró COD: POST /api/financial/shipments/{id}/collect
  - Navegar de regreso a Mi Ruta
  - Toast de éxito
- Loading state durante submit

### 9.5 Reportar Novedad

Crear `app/novedad/[shipmentId].tsx`:
- Resumen del envío
- Picker/select motivo:
  - "No hay nadie"
  - "Dirección incorrecta"
  - "Rechazado por destinatario"
  - "Zona peligrosa"
  - "Otro"
- TextInput para nota adicional (multiline)
- Botón "📷 Tomar foto" (opcional)
- Botón "Reportar novedad"
  - POST /api/shipments/{id}/status → { status: "issue", description: "motivo: nota" }
  - Navegar de regreso
  - Toast de éxito

### 9.6 Tab Recaudo

Crear `app/(tabs)/recaudo.tsx`:
- Header: "Recaudos de hoy"
- Card resumen: total cobrado / total por cobrar
- FlatList de cobros realizados hoy:
  - Código guía + destinatario + monto + hora
- Los datos salen de los envíos con status=delivered + payment_type=cash_on_delivery de la ruta del día
- Empty state si no hay cobros

### 9.7 Tab Perfil

Crear `app/(tabs)/perfil.tsx`:
- Datos del conductor (GET /api/me):
  - Nombre, teléfono, vehículo, placa
  - Zona asignada
- Stats del día:
  - Entregas completadas / total
  - Monto recaudado
- Botón "Cambiar contraseña" → PUT /api/me/password
- Botón "Cerrar sesión" → limpiar SecureStore + navegar a /login

### 9.8 Validación P15

```bash
npx expo start --web    # Bundle sin errores
# O en Android: expo start, escanear QR con Expo Go
# Verificar: login → mi ruta → tap parada → entregar → recaudo
```

---

## ORDEN DE EJECUCIÓN

```
BLOQUE 7 → BLOQUE 8 → BLOQUE 9
(Backend)   (P14 Web)   (P15 Mobile)
```

Bloque 7 primero porque los endpoints nuevos desbloquean P14 y P15.

## VALIDACIÓN FINAL

Al terminar los 3 bloques:
```
php artisan test           → 123+ pass
P14: npm run lint          → 0 errores
P14: npm run build         → compila
P15: npx expo start --web  → bundle OK
```

---

**Arquitecto: Popus · Ejecutor: Cod · Ley de Secuencia vigente.**
