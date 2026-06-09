# SPRINT-COD-V6 — Deploy Producción + QA + Hardening

## PREREQUISITO: SPRINT-COD-V5 completado
## REGLAS PERMANENTES: Ley de Secuencia · Cero fechas · Solo calidad

---

## OBJETIVO V6
Llevar todo el ecosistema de DEV a PRODUCCIÓN.
Al final de V6: API, Admin y Portal funcionando en HTTPS con datos reales.
App Repartidor con APK funcional distribuible.

---

## BLOQUE 10 — Backend: Hardening para producción

### 10.1 Auditoría SQLite → MySQL

Revisar TODOS los controllers buscando queries raw que usen sintaxis SQLite:

```bash
# Buscar en todo el API
grep -rn "DB::raw\|DB::select\|DB::statement\|IFNULL\|strftime\|datetime(" api/app/
```

Patrones a migrar:

| SQLite | MySQL |
|--------|-------|
| `strftime('%Y-%m', date)` | `DATE_FORMAT(date, '%Y-%m')` |
| `datetime('now')` | `NOW()` |
| `IFNULL(x, 0)` | `COALESCE(x, 0)` (funciona en ambos) |
| `|| ' ' ||` (concatenar) | `CONCAT(x, ' ', y)` |
| `CAST(x AS TEXT)` | `CAST(x AS CHAR)` |

Archivos a auditar:
- `ShipmentController.php` (dashboard, hourlyStats, batchStatus)
- `FinancialController.php` (overview, driverBoard, settleBatch)
- `ReportController.php` (todos los métodos de stats)
- `ClientController.php` (accountsReceivable)
- `DriverController.php` (show con stats)
- `RouteController.php` (myRoute)

### 10.2 Crear config para dual-driver DB

En cada query raw, usar un helper o trait:

```php
// app/Helpers/DbCompat.php
namespace App\Helpers;

use Illuminate\Support\Facades\DB;

class DbCompat
{
    public static function dateFormat(string $column, string $format): string
    {
        if (DB::getDriverName() === 'sqlite') {
            $map = ['%Y' => '%Y', '%m' => '%m', '%d' => '%d', '%H' => '%H'];
            return "strftime('{$format}', {$column})";
        }
        // MySQL format
        $mysqlFormat = str_replace(['%Y', '%m', '%d', '%H'], ['%Y', '%m', '%d', '%H'], $format);
        return "DATE_FORMAT({$column}, '{$mysqlFormat}')";
    }

    public static function now(): string
    {
        return DB::getDriverName() === 'sqlite' ? "datetime('now')" : 'NOW()';
    }

    public static function concat(string ...$parts): string
    {
        if (DB::getDriverName() === 'sqlite') {
            return implode(" || ", $parts);
        }
        return "CONCAT(" . implode(", ", $parts) . ")";
    }
}
```

### 10.3 Rate limiting por endpoint

En `api/routes/api.php`, agregar throttle a endpoints sensibles:

```php
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');                    // Ya existe

Route::post('/shipments', ...)->middleware('throttle:30,1');  // 30/min
Route::post('/shipments/batch-assign', ...)->middleware('throttle:10,1');
Route::post('/shipments/batch-status', ...)->middleware('throttle:10,1');
Route::post('/financial/settle-batch', ...)->middleware('throttle:5,1');
```

### 10.4 Logging de acciones críticas

Agregar logging en acciones financieras y destructivas:

```php
// En FinancialController::markCollected, settleShipment, markDriverPaid
Log::channel('daily')->info('Financial action', [
    'action' => 'collect',
    'user_id' => $request->user()->id,
    'shipment_id' => $shipment->id,
    'amount' => $shipment->cod_amount,
    'ip' => $request->ip(),
]);
```

### 10.5 Crear ProductionSeeder

`database/seeders/ProductionSeeder.php`:
- Crear roles: superadmin, admin, client, driver
- Crear permisos (todos los que ya existen + nuevos)
- Crear usuario superadmin inicial:
  - Email: admin@danheiexpress.com
  - Password: generar uno seguro (documentar en .env)
- NO crear datos demo (eso es solo para dev)

```php
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        // Permisos
        $permissions = [
            'shipments.view', 'shipments.create', 'shipments.edit',
            'shipments.change_status', 'shipments.assign',
            'clients.view', 'clients.create', 'clients.edit',
            'drivers.view', 'drivers.create', 'drivers.edit', 'drivers.toggle_status',
            'routes.view', 'routes.create', 'routes.manage',
            'financial.view', 'financial.collect', 'financial.settle',
            'users.view', 'users.create', 'users.edit',
            'reports.view', 'audit.view',
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'sanctum']);
        }

        // Roles
        $superadmin = Role::firstOrCreate(['name' => 'superadmin', 'guard_name' => 'sanctum']);
        $superadmin->syncPermissions($permissions);

        $admin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'sanctum']);
        $admin->syncPermissions($permissions);

        $clientRole = Role::firstOrCreate(['name' => 'client', 'guard_name' => 'sanctum']);
        $clientRole->syncPermissions([
            'shipments.view', 'shipments.create',
            'clients.view', 'clients.edit',
        ]);

        $driverRole = Role::firstOrCreate(['name' => 'driver', 'guard_name' => 'sanctum']);
        $driverRole->syncPermissions([
            'routes.view', 'routes.manage',
            'shipments.view', 'shipments.change_status',
            'financial.collect',
        ]);

        // Usuario inicial
        $user = User::firstOrCreate(
            ['email' => 'admin@danheiexpress.com'],
            [
                'name' => 'Administrador',
                'password' => Hash::make(env('ADMIN_INITIAL_PASSWORD', 'changeme123!')),
            ]
        );
        $user->assignRole('superadmin');
    }
}
```

### 10.6 .htaccess para API en cPanel

Crear `api/.htaccess.production`:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(.*)$ public/$1 [L]
</IfModule>
```

Y `api/public/.htaccess` ya existe por Laravel.

### 10.7 CORS final para producción

Verificar `api/config/cors.php`:
```php
'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')),
'allowed_methods' => ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
'exposed_headers' => [],
'max_age' => 86400,
'supports_credentials' => true,
```

### 10.8 Tests de producción

Crear `tests/Feature/ProductionReadyTest.php`:
```
- Test: health endpoint responds 200
- Test: login with invalid credentials returns 401
- Test: CORS headers present on OPTIONS request
- Test: rate limiting kicks in after 5 failed logins
- Test: unauthorized access to admin endpoints returns 403
- Test: client scope isolates data correctly
- Test: driver scope isolates data correctly
```

### 10.9 Validación Bloque 10

```bash
php artisan test          # 130+ pass
php artisan config:clear
php artisan route:list    # Verificar todas las rutas
```

---

## BLOQUE 11 — P16 Admin: E2E completos + polish final

### 11.1 E2E para páginas no cubiertas

Crear `frontend/e2e/pedidos.spec.ts`:
```
- Test: load pedidos page
- Test: search by guide code
- Test: filter by status tab
- Test: create new shipment via modal
- Test: open detail modal
- Test: batch select and assign
- Test: batch status change
- Test: pagination works
```

Crear `frontend/e2e/clientes.spec.ts`:
```
- Test: load clientes page
- Test: search by name
- Test: filter by billing type
- Test: create new client
- Test: edit client
- Test: open detail with tabs (resumen, envios, direcciones)
- Test: detail shipments pagination
```

Crear `frontend/e2e/pagos.spec.ts`:
```
- Test: load pagos page
- Test: KPI cards show values
- Test: receivable section renders
- Test: driver board renders
- Test: expenses section with mark paid
- Test: payroll section
- Test: create new expense modal
```

Crear `frontend/e2e/conductores.spec.ts`:
```
- Test: load conductores page
- Test: driver cards render
- Test: create new driver
- Test: open driver detail page
- Test: toggle driver status
```

Crear `frontend/e2e/usuarios-auditoria.spec.ts`:
```
- Test: load usuarios page
- Test: create user with role
- Test: edit user role
- Test: load auditoria page
- Test: audit log entries show metadata
```

### 11.2 Polish visual pendientes

Auditar estas páginas que Cod no tocó en V4:
- `conductores/page.tsx` — verificar dark mode completo
- `conductores/[id]/page.tsx` — verificar responsive
- `pagos/page.tsx` — verificar touch targets 44px
- `pedidos/page.tsx` — verificar mobile cards
- `clientes/page.tsx` — verificar modal detalle dark
- `reportes/page.tsx` — verificar gráficas dark
- `usuarios/page.tsx` — verificar formulario dark
- `auditoria/page.tsx` — verificar metadata expandible dark

Checklist por página:
```
[ ] animate-fade-in en container principal
[ ] Skeleton loading (no spinner solo)
[ ] Empty state con ícono + texto + CTA
[ ] Dark mode: bg, text, border, inputs, modals, badges
[ ] Responsive: flex-col en móvil, overflow-x-auto en tablas
[ ] Botones: min-h-11, active:scale-95, transition-all
[ ] Inputs: dark:bg-[#16162a] dark:text-[#e0e0e0] dark:border-[#2a2a3e]
[ ] Modals: h-[100dvh] en móvil, rounded-xl en desktop
```

### 11.3 Accessibility pass

En todas las páginas:
```
[ ] Todos los botones tienen texto visible (no solo íconos)
[ ] Inputs tienen placeholder o label
[ ] Tablas tienen thead con th
[ ] Modals tienen heading (h2)
[ ] Links tienen texto descriptivo
[ ] Imágenes/SVG tienen aria-label si son informativos
```

### 11.4 Performance audit

```bash
# Verificar bundle size
npm run build
# Revisar output: páginas > 200KB necesitan lazy loading
# Verificar que no hay imports de toda la librería (tree-shaking)
```

### 11.5 Validación Bloque 11

```bash
npx playwright test    # 55+ specs pass (31 existentes + 24 nuevos)
npm run lint           # 0 errores
npm run build          # OK, verificar bundle sizes
```

---

## BLOQUE 12 — P14 Portal: E2E + polish + deploy-ready

### 12.1 Instalar Playwright en P14

```bash
cd p14-cliente-web
npm init playwright@latest -- --quiet
```

### 12.2 Crear mock-api para P14

Crear `e2e/support/mock-api.ts`:
- Mock de login → token
- Mock de GET /api/me → datos cliente
- Mock de GET /api/client/my-dashboard → KPIs
- Mock de GET /api/shipments → lista paginada
- Mock de GET /api/shipments/{id} → detalle
- Mock de GET /api/clients-receivable → balance
- Mock de GET /api/notifications → lista
- Mock de PUT /api/me → perfil actualizado

### 12.3 E2E tests P14

Crear `e2e/smoke.spec.ts`:
```
- Test: login page loads
- Test: login with valid credentials → redirect to dashboard
- Test: dashboard KPI cards render
- Test: navigate to envios
- Test: navigate to finanzas
- Test: navigate to notificaciones
- Test: navigate to perfil
- Test: navigate to soporte
- Test: logout works
```

Crear `e2e/envios.spec.ts`:
```
- Test: shipments list loads
- Test: search by code
- Test: filter by status
- Test: open detail
- Test: create new shipment
- Test: detail shows timeline
```

Crear `e2e/perfil.spec.ts`:
```
- Test: profile loads with user data
- Test: edit profile
- Test: add address
- Test: delete address
- Test: change password form
```

### 12.4 Polish visual P14

Mismo checklist de P16 aplicado a las 8 páginas:
```
[ ] animate-fade-in
[ ] Skeleton loading
[ ] Empty states
[ ] Dark mode completo
[ ] Responsive 375px
[ ] Touch targets 44px
[ ] Transitions en botones
[ ] Modals responsive
```

### 12.5 SEO meta tags

En cada página, agregar:
```tsx
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Dashboard | Danhei Express Portal',
  description: 'Panel de control para clientes de Danhei Express',
};
```

Para páginas con `"use client"`, usar `usePageTitle()` como en P16.

### 12.6 Validación Bloque 12

```bash
npx playwright test    # 15+ specs pass
npm run lint           # 0 errores
npm run build          # OK
```

---

## BLOQUE 13 — P15 App: QA + APK build

### 13.1 Offline handling

Crear `lib/offline.ts`:
```typescript
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

// Queue de acciones pendientes
interface PendingAction {
  id: string;
  method: 'POST' | 'PUT';
  url: string;
  body: object;
  timestamp: number;
}

export async function queueAction(action: Omit<PendingAction, 'id' | 'timestamp'>) {
  const queue = await getQueue();
  queue.push({
    ...action,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
  });
  await SecureStore.setItemAsync('pending_queue', JSON.stringify(queue));
}

export async function processQueue(apiFn: Function) {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const queue = await getQueue();
  const failed: PendingAction[] = [];

  for (const action of queue) {
    try {
      await apiFn(action.url, action.method, action.body);
    } catch {
      failed.push(action);
    }
  }

  await SecureStore.setItemAsync('pending_queue', JSON.stringify(failed));
}

async function getQueue(): Promise<PendingAction[]> {
  const raw = await SecureStore.getItemAsync('pending_queue');
  return raw ? JSON.parse(raw) : [];
}
```

### 13.2 Indicador de conexión

Crear `components/OfflineBanner.tsx`:
```
- Usar NetInfo para detectar estado
- Mostrar banner rojo en top cuando offline: "Sin conexión — las acciones se guardarán localmente"
- Auto-ocultar cuando vuelve la conexión
- Ejecutar processQueue() al reconectar
```

### 13.3 Loading y error states

En TODAS las pantallas:
```
[ ] ActivityIndicator mientras carga (con color primary)
[ ] Mensaje de error + botón "Reintentar" si falla el fetch
[ ] Pull-to-refresh en todas las FlatList
[ ] Disabled state en botones durante submit
[ ] Toast/Alert de confirmación después de acción exitosa
```

### 13.4 Animaciones y feedback

```
[ ] Haptic feedback en "Confirmar entrega" (expo-haptics)
[ ] Animated.FlatList con fade-in en items
[ ] Transition en cambio de parada completada (color change)
[ ] Botones con activeOpacity={0.7} o Pressable con style feedback
```

### 13.5 App icon + Splash screen

Crear assets:
- `assets/icon.png` (1024x1024) — logo Danhei sobre fondo dark
- `assets/splash.png` (1284x2778) — logo centrado, fondo #0f0f23
- `assets/adaptive-icon.png` (1024x1024) — para Android adaptive icons

En `app.json`:
```json
{
  "expo": {
    "name": "Danhei Repartidor",
    "slug": "danhei-repartidor",
    "version": "1.0.0",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f0f23"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f0f23"
      },
      "package": "com.danheiexpress.repartidor"
    }
  }
}
```

### 13.6 EAS Build config

Crear `eas.json`:
```json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 13.7 Build APK

```bash
# Instalar EAS CLI
npm install -g eas-cli

# Login en Expo (necesita cuenta)
eas login

# Build APK
eas build --platform android --profile preview

# El APK se descarga del dashboard de Expo
```

### 13.8 Test en dispositivo real

Instalar APK en un Android real y verificar:
```
[ ] Splash screen aparece con logo
[ ] Login funciona contra API (local o producción)
[ ] Mi Ruta carga las paradas
[ ] Tap teléfono abre dialer
[ ] Tap dirección abre Google Maps
[ ] Confirmar entrega cambia estado
[ ] Cobro COD se registra
[ ] Novedad se reporta
[ ] Recaudo muestra totales
[ ] Perfil muestra datos
[ ] Cerrar sesión limpia token
[ ] App funciona con conexión lenta
[ ] Indicador offline aparece sin WiFi
```

### 13.9 Validación Bloque 13

```bash
npx expo start --web     # Bundle OK
eas build --platform android --profile preview  # APK generado
# APK instalado y testeado en dispositivo real
```

---

## BLOQUE 14 — Deploy producción

### 14.1 cPanel: subdominio API

Seguir GUIA-DEPLOY-PRODUCCION.txt pasos 1-7:
```
[ ] Crear subdominio api.danheiexpress.com
[ ] SSL AutoSSL activado
[ ] PHP 8.2+ con extensiones
[ ] BD MySQL creada (danhei_prod)
[ ] Usuario BD con todos los privilegios
[ ] Archivos API subidos
[ ] .env configurado con datos reales
[ ] php artisan key:generate
[ ] php artisan migrate --force
[ ] php artisan db:seed --class=ProductionSeeder --force
[ ] php artisan config:cache
[ ] php artisan route:cache
[ ] GET https://api.danheiexpress.com/api/health = 200
```

### 14.2 Vercel: deploy P16 Admin

```
[ ] Crear proyecto en Vercel (import GitHub repo P16)
[ ] Configurar root directory: frontend
[ ] Agregar env var: NEXT_PUBLIC_API_URL = https://api.danheiexpress.com/api
[ ] Deploy automático desde main
[ ] Configurar dominio: admin.danheiexpress.com (CNAME en cPanel)
[ ] Verificar SSL automático
[ ] Login funciona contra API producción
[ ] Dashboard muestra datos reales
[ ] Navegación completa OK
```

### 14.3 Vercel: deploy P14 Portal

```
[ ] Crear proyecto en Vercel (import GitHub repo P14)
[ ] Configurar root directory: p14-cliente-web
[ ] Agregar env var: NEXT_PUBLIC_API_URL = https://api.danheiexpress.com/api
[ ] Deploy automático desde main
[ ] Configurar dominio: portal.danheiexpress.com (CNAME en cPanel)
[ ] Verificar SSL
[ ] Login con cuenta client funciona
[ ] Cliente solo ve sus datos (scope verificado)
```

### 14.4 Monitoring

```
[ ] Crear cuenta UptimeRobot (gratis)
[ ] Monitor: https://api.danheiexpress.com/api/health (5 min)
[ ] Monitor: https://admin.danheiexpress.com (5 min)
[ ] Monitor: https://portal.danheiexpress.com (5 min)
[ ] Monitor: https://www.danheiexpress.com (5 min)
[ ] Alertas por email configuradas
```

### 14.5 Backup automático

```
[ ] Cron job en cPanel:
    0 3 * * * mysqldump -u danhei_user -p'PASSWORD' danhei_prod > /home/user/backups/danhei_$(date +\%Y\%m\%d).sql
[ ] Verificar que el backup se genera
[ ] Retención: últimos 7 archivos
```

### 14.6 Smoke test producción

```
[ ] API health: 200
[ ] Admin login: OK
[ ] Admin dashboard: datos cargan
[ ] Admin crear envío: funciona
[ ] Admin crear cliente: funciona
[ ] Portal login (client): OK
[ ] Portal dashboard: datos del cliente
[ ] Portal envíos: lista correcta
[ ] App Repartidor login: OK (contra prod)
[ ] App Repartidor mi ruta: carga
```

### 14.7 Validación Bloque 14

```
Todo el ecosistema funcionando en producción:
[ ] P13: https://www.danheiexpress.com ✅ (ya live)
[ ] API: https://api.danheiexpress.com/api/health = 200
[ ] P16: https://admin.danheiexpress.com → login + dashboard
[ ] P14: https://portal.danheiexpress.com → login + dashboard
[ ] P15: APK conecta a API prod → login + ruta
[ ] Monitoring: 4 checks activos
[ ] Backup: cron ejecutándose
```

---

## VALIDACIÓN FINAL SPRINT V6

```
API:  php artisan test = 130+ pass
P16:  npx playwright test = 55+ pass, lint=0, build=OK
P14:  npx playwright test = 15+ pass, lint=0, build=OK
P15:  APK build OK, test en dispositivo real OK
PROD: 4 servicios live con monitoring
```

---

**Arquitecto: Popus · Ejecutor: Cod · Ley de Secuencia vigente.**
