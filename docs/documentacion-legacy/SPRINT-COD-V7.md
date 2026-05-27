# SPRINT-COD-V7 — Funcionalidades Avanzadas + Automatización + Escalabilidad

## PREREQUISITO: SPRINT-COD-V6 completado (ecosistema en producción)
## REGLAS PERMANENTES: Ley de Secuencia · Cero fechas · Solo calidad

---

## OBJETIVO V7
Elevar el ecosistema de "funcional" a "profesional":
CI/CD automatizado, notificaciones push, tracking público,
reportes PDF, password reset real, analytics, y optimización.

---

## BLOQUE 15 — CI/CD GitHub Actions

### 15.1 Pipeline API Backend

Crear `.github/workflows/api-ci.yml` en repo P16:

```yaml
name: API CI
on:
  push:
    branches: [main]
    paths: ['api/**']
  pull_request:
    branches: [main]
    paths: ['api/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: pdo_sqlite, mbstring, xml, bcmath
      - run: cd api && composer install --no-interaction
      - run: cd api && cp .env.example .env && php artisan key:generate
      - run: cd api && php artisan test --parallel
```

### 15.2 Pipeline Frontend Admin

Crear `.github/workflows/frontend-ci.yml`:

```yaml
name: Frontend CI
on:
  push:
    branches: [main]
    paths: ['frontend/**']
  pull_request:
    branches: [main]
    paths: ['frontend/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run build
      - run: cd frontend && npm audit --audit-level=high
```

### 15.3 Pipeline P14 Portal

Mismo template que P16 frontend, adaptado para P14 repo.

### 15.4 Pipeline P15 App

```yaml
name: P15 CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx expo export --platform web
```

### 15.5 Validación

```
[ ] Push a P16 main → CI verde (API + Frontend)
[ ] Push a P14 main → CI verde
[ ] Push a P15 main → CI verde
[ ] PR con lint error → CI falla (verificar que bloquea)
```

---

## BLOQUE 16 — Tracking Público + Password Reset

### 16.1 Página de tracking público

En P13 Landing, crear `tracking.html`:
- Input: código de guía
- Botón "Rastrear"
- Fetch GET /api/track?code=XXXX (endpoint público, ya existe)
- Mostrar: timeline de estados del envío
- Diseño consistente con landing (dark, misma paleta)
- Sin login requerido
- URL: danheiexpress.com/tracking.html?code=DHE-XXXX
- Meta tags para compartir por WhatsApp

### 16.2 Widget de tracking embebible

Crear `assets/js/tracking-widget.js`:
- Script standalone que cualquier cliente puede poner en su web
- `<div id="danhei-tracking" data-code="DHE-XXXX"></div>`
- `<script src="https://www.danheiexpress.com/assets/js/tracking-widget.js"></script>`
- Se renderiza como iframe o shadow DOM

### 16.3 Password Reset — Backend

En `api/routes/api.php`:
```php
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,5');
Route::post('/reset-password', [AuthController::class, 'resetPassword']);
```

En `AuthController.php`:
```php
public function forgotPassword(Request $request)
{
    $request->validate(['email' => 'required|email']);
    $user = User::where('email', $request->email)->first();
    if (!$user) return response()->json(['message' => 'Si el email existe, recibirás instrucciones.']);

    $token = Str::random(64);
    DB::table('password_reset_tokens')->updateOrInsert(
        ['email' => $request->email],
        ['token' => Hash::make($token), 'created_at' => now()]
    );

    // Enviar email con token
    Mail::to($user->email)->send(new PasswordResetMail($token));

    return response()->json(['message' => 'Si el email existe, recibirás instrucciones.']);
}

public function resetPassword(Request $request)
{
    $request->validate([
        'email' => 'required|email',
        'token' => 'required',
        'password' => 'required|min:8|confirmed',
    ]);

    $record = DB::table('password_reset_tokens')
        ->where('email', $request->email)->first();

    if (!$record || !Hash::check($request->token, $record->token)) {
        return response()->json(['error' => 'Token inválido.'], 400);
    }

    if (Carbon::parse($record->created_at)->addHours(2)->isPast()) {
        return response()->json(['error' => 'Token expirado.'], 400);
    }

    $user = User::where('email', $request->email)->firstOrFail();
    $user->update(['password' => Hash::make($request->password)]);

    DB::table('password_reset_tokens')->where('email', $request->email)->delete();

    return response()->json(['message' => 'Contraseña actualizada.']);
}
```

### 16.4 Password Reset — Frontend (P16 + P14)

Crear página `/forgot-password`:
- Input email
- Botón "Enviar instrucciones"
- Mensaje de confirmación
- Link "Volver al login"

Crear página `/reset-password?token=XXX&email=XXX`:
- Input nueva contraseña + confirmación
- Botón "Cambiar contraseña"
- Redirect a login con toast de éxito

### 16.5 Email template

Crear `app/Mail/PasswordResetMail.php`:
- Template HTML con logo Danhei
- Botón "Restablecer contraseña"
- URL: `https://admin.danheiexpress.com/reset-password?token=XXX&email=XXX`
- Texto: "Este enlace expira en 2 horas"

### 16.6 Tests

```
- Test: forgot-password con email válido
- Test: forgot-password con email inválido (responde igual, no revela info)
- Test: reset-password con token válido
- Test: reset-password con token expirado
- Test: rate limiting en forgot-password (3 cada 5 min)
```

---

## BLOQUE 17 — Notificaciones Push (P15)

### 17.1 Backend: Push tokens

Crear migración `create_push_tokens_table`:
```php
Schema::create('push_tokens', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('token')->unique();
    $table->string('platform')->default('android');
    $table->timestamps();
});
```

Endpoints:
```php
Route::post('/push-tokens', [NotificationController::class, 'registerPushToken']);
Route::delete('/push-tokens', [NotificationController::class, 'removePushToken']);
```

### 17.2 Backend: Enviar push

Instalar `expo-server-sdk-php` o usar HTTP directo:
```php
// app/Services/PushService.php
class PushService
{
    public function send(int $userId, string $title, string $body): void
    {
        $tokens = PushToken::where('user_id', $userId)->pluck('token');

        foreach ($tokens as $token) {
            Http::post('https://exp.host/--/api/v2/push/send', [
                'to' => $token,
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
            ]);
        }
    }
}
```

### 17.3 Triggers de notificación

Enviar push automáticamente cuando:
- Envío asignado a ruta del conductor → "Nueva ruta asignada con X paradas"
- Ruta iniciada → "Tu ruta comenzó" (al admin)
- Envío entregado → "Entregado: DHE-XXXX" (al cliente)
- Novedad reportada → "Novedad en DHE-XXXX" (al admin)
- Cobro COD registrado → "Cobro $XX.XXX registrado" (al admin)

### 17.4 P15: Registrar token

En `app/_layout.tsx` después del login:
```typescript
import * as Notifications from 'expo-notifications';

async function registerPush() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await apiSend('/push-tokens', 'POST', { token });
}
```

### 17.5 Tests push
```
- Test: register push token
- Test: send push to user with valid token
- Test: remove push token on logout
- Test: delivery notification triggers push to client
```

---

## BLOQUE 18 — Reportes PDF + Export

### 18.1 Backend: Generar PDF

Instalar `barryvdh/laravel-dompdf`:
```bash
composer require barryvdh/laravel-dompdf
```

Endpoints:
```php
Route::get('/reports/shipments/pdf', [ReportController::class, 'shipmentsPdf'])
    ->middleware('permission:reports.view');
Route::get('/reports/financial/pdf', [ReportController::class, 'financialPdf'])
    ->middleware('permission:financial.view');
Route::get('/clients/{client}/statement/pdf', [ClientController::class, 'statementPdf'])
    ->middleware('permission:financial.view');
```

### 18.2 Templates PDF

Crear `resources/views/reports/`:
- `shipments-report.blade.php` — lista de envíos con filtros aplicados
- `financial-report.blade.php` — resumen financiero del período
- `client-statement.blade.php` — estado de cuenta del cliente

Diseño: logo Danhei, tabla profesional, totales, fecha generación.

### 18.3 P16: Botones de exportación

En páginas Reportes, Pagos, Clientes detalle:
- Botón "Descargar PDF" que llama al endpoint
- `window.open(apiUrl + '/reports/shipments/pdf?from=X&to=Y', '_blank')`
- Con token en header (fetch + blob + URL.createObjectURL)

### 18.4 P14: Estado de cuenta

En Finanzas del portal cliente:
- Botón "Descargar estado de cuenta"
- GET /api/clients/{id}/statement/pdf

### 18.5 Tests
```
- Test: shipments PDF genera archivo válido
- Test: financial PDF con rango de fechas
- Test: client statement PDF con datos reales
- Test: client role puede descargar su propio statement
- Test: client role NO puede descargar statement de otro
```

---

## BLOQUE 19 — Analytics + WhatsApp + Optimización

### 19.1 Analytics P16 + P14

Agregar Google Analytics 4 en ambos portales:
- Crear properties en GA4 (o usar el mismo de P13)
- Implementar con `next/script` y consentimiento de cookies
- Eventos: login, create_shipment, create_client, view_report
- No trackear datos personales (solo acciones)

### 19.2 WhatsApp Business API (básico)

En P13 contacto y P14 soporte:
- Botón "Escribir por WhatsApp" con mensaje pre-armado
- `https://wa.me/57XXXXXXXXX?text=Hola,%20mi%20código%20es%20DHE-XXXX`
- En P14: auto-llenar el código del último envío del cliente

### 19.3 Performance — Backend

```php
// Eager loading en queries pesadas
Shipment::with(['client:id,name', 'driver:id,name', 'route:id,name'])
    ->paginate(20);

// Cache de dashboard (5 minutos)
Cache::remember("dashboard_{$user->id}", 300, function () {
    return $this->computeDashboard();
});

// Index en BD
Schema::table('shipments', function ($table) {
    $table->index(['client_id', 'status']);
    $table->index(['driver_id', 'status']);
    $table->index(['created_at']);
    $table->index(['display_code']);
});
```

### 19.4 Performance — Frontend

- Lazy loading de páginas pesadas (dynamic import)
- Image optimization con `next/image`
- Debounce en búsquedas (300ms)
- Memoización de componentes con `React.memo`
- `useSWR` o `react-query` para cache de API (opcional)

### 19.5 Performance — P15 Mobile

- FlatList con `getItemLayout` para scroll fluido
- Comprimir fotos evidencia a max 800px antes de upload
- Cache de ruta del día en SecureStore
- Lazy load de tabs no activos

### 19.6 Validación final V7

```
API:  php artisan test = 145+ pass
P16:  npx playwright test = 60+ specs, lint=0, build=OK
P14:  npx playwright test = 20+ specs, lint=0, build=OK
P15:  APK con push + offline OK
PROD: CI/CD verde en los 4 repos
PROD: Tracking público funcional
PROD: Password reset funcional
PROD: Reportes PDF funcionales
PROD: Monitoring 4 checks activos
```

---

## RESUMEN — SECUENCIA COMPLETA POST-V7

```
V5:  Backend endpoints + P14 páginas + P15 pantallas
V6:  Hardening + E2E + APK build + Deploy producción
V7:  CI/CD + Tracking + Push + PDF + Analytics + Performance
```

Al completar V7, el ecosistema Danhei Express es un producto
profesional, seguro, monitoreado, y listo para escalar.

---

**Arquitecto: Popus · Ejecutor: Cod · Ley de Secuencia vigente.**
