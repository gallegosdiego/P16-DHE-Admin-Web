# Sprint Cod V3 — Bloque Pesado de Producción

## Meta

Llevar P16-DHE-Admin-Web al cierre completo de la Fase 1 del roadmap. Este sprint cubre **4 bloques masivos** que Cod debe ejecutar secuencialmente. NO hay fechas ni estimados. Se trabaja hasta terminar todo.

---

## Contexto Técnico Actualizado

| Campo | Valor |
|-------|-------|
| Repo | `d:\Danhei Dev\P16-DHE-Admin-Web` |
| Backend | Laravel 13 + PHP 8.4 → `localhost:8000` |
| Frontend | Next.js 16 + React 19 + TailwindCSS v4 → `localhost:3000` |
| Auth | Sanctum Bearer token |
| API client | `src/lib/api.ts` → `apiGet<T>(path)`, `apiSend<T>(path, method, body)` |
| Types | `src/lib/types.ts` — interfaces completas (388 líneas) |
| Dark mode | `[data-theme="dark"]` en `globals.css` |
| Package manager | npm |
| Tests actuales | Backend: 61 tests / 249 assertions PASS |
| Endpoints actuales | 72 |
| Rutas frontend | 17 (`/`, `/pedidos`, `/clientes`, `/conductores`, `/conductores/[id]`, `/novedades`, `/pagos`, `/reportes`, `/metricas`, `/usuarios`, `/auditoria`, `/zonas`, `/rutas`, `/configuracion`, `/login`, `/manifest.webmanifest`, `/_not-found`) |

### Reglas de Cod

1. **NO poner fechas, timelines, ni estimados en NINGÚN documento — LEY DE SECUENCIA**
2. Seguir patrones existentes del código — NO inventar nuevas convenciones
3. Dark mode obligatorio en cada elemento nuevo (clases en `globals.css`)
4. Responsive 375px obligatorio
5. `npm run lint` y `npm run build` deben pasar al cerrar cada bloque
6. `php artisan test` debe pasar al cerrar cada bloque

---

## BLOQUE 1: E2E Tests Completos (Playwright)

### Objetivo
Ampliar la cobertura E2E para cubrir los módulos nuevos. Los smoke y regression existentes en `frontend/e2e/` cubren: login, dashboard, usuarios, reportes, command palette, conductores, auditoria, pagos, configuracion.

### Archivos

- CREAR `frontend/e2e/zones.spec.ts`
- CREAR `frontend/e2e/routes.spec.ts`
- MODIFICAR `frontend/e2e/regression.spec.ts` (agregar nuevos)

### Tests requeridos — `zones.spec.ts`

```typescript
// 1. Navegación: sidebar "Zonas" lleva a /zonas
// 2. Carga: la tabla/grid muestra al menos 8 zonas del seeder
// 3. Tipo: cada zona muestra badge de tipo (Urbana/Suburbana/Extendida)
// 4. Precio: cada zona muestra tarifa base formateada en COP
// 5. Crear zona: click "Nueva Zona" → llenar form → submit → toast éxito → zona aparece
// 6. Detalle: click en zona → modal con reglas de tarifa
// 7. Calculadora: click 🧮 en zona → modal calculadora → ingresar peso → click Calcular → ver resultado
// 8. Filtro activas: toggle "Mostrar inactivas" → "Ruta al Llano" aparece/desaparece
// 9. Dark mode: verificar que cards y modales tienen clases dark
```

### Tests requeridos — `routes.spec.ts`

```typescript
// 1. Navegación: sidebar "Rutas" lleva a /rutas
// 2. Empty state: si no hay rutas para el día, muestra "No hay rutas para {fecha}"
// 3. Selector de fecha: cambiar fecha y verificar que la lista se recarga
// 4. Crear ruta: click "Nueva Ruta" → seleccionar conductor → seleccionar envíos → submit → ruta aparece en "Planificadas"
// 5. Iniciar ruta: click "Iniciar Ruta" en card → card se mueve a columna "En Ruta"
// 6. Detalle: click en card → modal con paradas y barra de progreso
// 7. Completar parada: en modal activo → click "Completar" en parada → progreso sube
// 8. Dark mode: verificar cards y modales
```

### Tests requeridos — agregar a `regression.spec.ts`

```typescript
// 1. Navbar notificaciones: click campana → dropdown aparece con notificaciones
// 2. Navbar badge: badge rojo muestra número > 0
// 3. Marcar todas leídas: click "Marcar todas como leídas" → badge desaparece
```

### Mock API
Usar el patrón existente de `frontend/e2e/support/mock-api.ts`. Agregar handlers para:
- `GET /api/zones` → devolver array de 9 zonas demo
- `GET /api/zones/:id` → devolver zona con pricing_rules
- `POST /api/zones/:id/calculate` → devolver resultado de cálculo
- `POST /api/zones` → devolver zona creada
- `GET /api/routes` → devolver array de rutas
- `POST /api/routes` → devolver ruta creada
- `POST /api/routes/:id/start` → devolver status active
- `POST /api/routes/:id/stops/:stopId/complete` → devolver progreso
- `GET /api/notifications/unread-count` → devolver { count: 3 }
- `GET /api/notifications?per_page=5` → devolver 5 notificaciones demo
- `POST /api/notifications/read-all` → devolver { updated: 3 }

### DoD

```
[ ] npm run lint → 0 errores
[ ] npm run build → compila
[ ] npx playwright test → todos pasan
```

---

## BLOQUE 2: Backend — Deploy para cPanel

### Contexto
El deploy será en cPanel, igual que CarriRoad (carriroad.net). La estructura es:
- El repo se clona en el servidor
- cPanel ejecuta `.cpanel.yml` automáticamente al hacer push a main
- La app Laravel vive en una carpeta fuera del document root
- El document root apunta a `public/` via symlink o subdirectorio

### Estructura del servidor (estándar cPanel)

```
/home/danheiex/                     ← Home del usuario cPanel
├── api.danheiexpress.com/          ← Document root del subdominio API
│   └── → symlink a /home/danheiex/laravel_app/public
├── laravel_app/                    ← App Laravel completa
│   ├── .env                        ← Variables producción (NO en repo)
│   ├── storage/
│   └── public/
├── repositories/
│   └── P16-DHE-Admin-Web/          ← Repo clonado por cPanel
└── admin.danheiexpress.com/        ← Document root del frontend (Vercel o export estático)
```

### Archivos a crear/modificar

#### [NEW] `.cpanel.yml`

```yaml
---
deployment:
  tasks:
    - export DEPLOYPATH=/home/danheiex/laravel_app
    - /bin/cp -R api/. $DEPLOYPATH/
    - cd $DEPLOYPATH && /usr/local/bin/php composer.phar install --optimize-autoloader --no-dev --no-interaction
    - cd $DEPLOYPATH && /usr/local/bin/php artisan optimize:clear
    - cd $DEPLOYPATH && /usr/local/bin/php artisan config:cache
    - cd $DEPLOYPATH && /usr/local/bin/php artisan route:cache
    - cd $DEPLOYPATH && /usr/local/bin/php artisan view:cache
    - cd $DEPLOYPATH && /usr/local/bin/php artisan migrate --force
```

**IMPORTANTE:**
- Solo copiar la carpeta `api/` al servidor, NO el frontend
- NO ejecutar seeders automáticamente en producción
- La ruta de PHP puede variar — usar `/usr/local/bin/php` o `/usr/bin/php` según el servidor

#### [NEW] `api/.env.production.example`

```env
APP_NAME="Danhei Express API"
APP_ENV=production
APP_KEY=base64:GENERATE_ME
APP_DEBUG=false
APP_URL=https://api.danheiexpress.com
FRONTEND_URL=https://admin.danheiexpress.com

LOG_CHANNEL=daily
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=danheiex_production
DB_USERNAME=danheiex_dbuser
DB_PASSWORD=CHANGE_ME

SESSION_DRIVER=database
CACHE_STORE=file
QUEUE_CONNECTION=sync

SANCTUM_STATEFUL_DOMAINS=admin.danheiexpress.com

CORS_ALLOWED_ORIGINS=https://admin.danheiexpress.com
```

**IMPORTANTE:**
- BD será MySQL (cPanel provee MySQL, no PostgreSQL)
- Queue sync por ahora (sin Redis en cPanel básico)
- Session driver database (más robusto que file en hosting compartido)

#### [MODIFY] `api/config/cors.php`

Verificar que `allowed_origins` use variable de entorno:
```php
'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')),
```

#### [NEW] `api/database/seeders/ProductionSeeder.php`

Seeder SOLO para producción. Debe crear:
1. Roles y permisos (usar `RolesAndPermissionsSeeder` existente)
2. Cuenta superadmin con contraseña de variable de entorno
3. Zonas de cobertura con tarifas reales

```php
<?php
// IMPORTANTE: Las contraseñas deben venir de .env
// MASTER_PASSWORD → contraseña del superadmin
// No insertar datos demo, no crear usuarios falsos
```

#### [NEW] `docs/DEPLOY-CPANEL.md`

Documentación paso a paso para el deploy. Incluir:
1. Requisitos del hosting (PHP 8.2+, MySQL 8+, extensiones: pdo_mysql, mbstring, openssl, bcmath)
2. Configuración del subdominio `api.danheiexpress.com`
3. Configuración del repositorio Git en cPanel
4. Creación de la BD MySQL
5. Symlink de storage
6. Variables de entorno (.env)
7. Primer deploy
8. Monitoreo y logs (`storage/logs/laravel.log`)
9. Rollback procedure
10. Comandos útiles vía Terminal cPanel

#### [MODIFY] `api/config/database.php`

Verificar que el driver MySQL esté bien configurado. El proyecto actualmente usa SQLite para dev y necesita soporte dual:

```php
'mysql' => [
    'driver' => 'mysql',
    'host' => env('DB_HOST', '127.0.0.1'),
    'port' => env('DB_PORT', '3306'),
    'database' => env('DB_DATABASE', 'danhei'),
    'username' => env('DB_USERNAME', 'root'),
    'password' => env('DB_PASSWORD', ''),
    'charset' => 'utf8mb4',
    'collation' => 'utf8mb4_unicode_ci',
    'prefix' => '',
    'strict' => true,
    'engine' => null,
],
```

**GOTCHA MySQL (aprendido de CarriRoad):**
- Si el hosting usa encoding latin1, los seeders con acentos fallarán
- Asegurarse de que la BD se cree con `utf8mb4_unicode_ci`
- Verificar que las migraciones con `->default('Bogotá')` funcionen en MySQL

#### [MODIFY] Verificar queries SQLite vs MySQL

Revisar todos los controllers que usan queries raw y verificar compatibilidad con MySQL:

1. `ShipmentController::hourlyStats()` — Ya tiene lógica dual SQLite/PostgreSQL, agregar MySQL:
   ```php
   // MySQL: DATE_FORMAT(created_at, '%H')
   // SQLite: strftime('%H', created_at)
   ```

2. `ShipmentController::dashboard()` — Verificar `whereDate()` funcione en MySQL

3. `ReportController::stats()` — Verificar queries de agrupación

4. `FinancialController` — Verificar sumas y agrupaciones

### DoD

```
[ ] .cpanel.yml creado y funcional
[ ] .env.production.example documentado
[ ] ProductionSeeder.php creado (sin datos demo)
[ ] docs/DEPLOY-CPANEL.md completo
[ ] Queries verificadas MySQL compatible
[ ] php artisan test → todos pasan (no romper SQLite dev)
```

---

## BLOQUE 3: Frontend — Polish Visual Completo

### Objetivo
Auditoría visual completa de TODAS las 17 páginas. Cada página debe cumplir:

### Checklist por página

Para CADA una de estas páginas, verificar y corregir:

```
/login
/               (dashboard)
/pedidos
/clientes
/conductores
/conductores/[id]
/novedades
/pagos
/reportes
/metricas
/usuarios
/auditoria
/zonas
/rutas
/configuracion
```

**Checklist visual obligatorio:**

```
[ ] Skeleton loading mientras carga datos de la API
[ ] Empty state con ícono + mensaje cuando no hay datos
[ ] Error state con toast cuando falla el fetch
[ ] Dark mode: CADA card → dark:bg-[#1a1a2e] dark:border-[#2a2a3e]
[ ] Dark mode: CADA header → dark:bg-[#16162a]
[ ] Dark mode: CADA texto → dark:text-[#e0e0e0] o dark:text-slate-400
[ ] Dark mode: CADA input → dark:bg-[#16162a] dark:border-[#2a2a3e] dark:text-[#e0e0e0]
[ ] Dark mode: CADA modal → fondo dark correcto, bordes dark
[ ] Dark mode: tablas → dark:text-slate-400 (header), dark:border-[#2a2a3e] (rows)
[ ] Mobile 375px: layout no se rompe
[ ] Mobile 375px: tablas con overflow-x-auto
[ ] Mobile 375px: modales no se salen de la pantalla
[ ] Transición animate-fade-in en el contenedor principal
[ ] Botones con active:scale-95 y transition-all
[ ] Chips de estado con bg opacity 20% + text color
```

### Ajustes específicos conocidos

1. **`/zonas`**: La calculadora debe mostrar loading spinner mientras calcula. El grid de zonas necesita hover con sombra más pronunciada.

2. **`/rutas`**: El Kanban necesita responsivo: en mobile mostrar las 3 columnas como tabs o como lista vertical, no como grid horizontal que se corta.

3. **`/metricas`**: Verificar que todas las gráficas tienen variantes dark correctas.

4. **`/pedidos`**: Verificar que la barra batch (sticky bottom) funciona en dark mode y mobile.

5. **Dashboard (`/`)**: El widget financiero expandible debe tener animación smooth en dark mode.

### DoD

```
[ ] Todas las 15 páginas revisadas
[ ] npm run lint → 0 errores
[ ] npm run build → compila
[ ] Screenshot mental: cada página se ve premium en dark mode a 375px
```

---

## BLOQUE 4: Backend — Tests Exhaustivos + Hardening

### Objetivo
Subir la cobertura de tests del backend para cubrir edge cases y validaciones. Actualmente: 61 tests / 249 assertions.

### Tests a crear

#### [NEW] `tests/Feature/FinancialEdgeCaseTest.php`

```
[ ] test_cannot_collect_non_cod_shipment
[ ] test_collect_creates_audit_log
[ ] test_settle_creates_audit_log
[ ] test_driver_paid_creates_audit_log
[ ] test_settle_batch_with_mixed_valid_invalid
[ ] test_financial_overview_sums_correctly
[ ] test_driver_board_shows_pending_payments
[ ] test_receivable_calculates_days_oldest_debt
```

#### [NEW] `tests/Feature/ShipmentEdgeCaseTest.php`

```
[ ] test_cannot_create_shipment_without_required_fields
[ ] test_cannot_change_to_invalid_status
[ ] test_status_change_creates_event
[ ] test_batch_assign_updates_all_shipments
[ ] test_batch_status_fails_gracefully_on_invalid_ids
[ ] test_search_by_tracking_code
[ ] test_search_by_recipient_name
[ ] test_filter_by_status
[ ] test_filter_by_date_range
[ ] test_pagination_works
```

#### [NEW] `tests/Feature/ClientEdgeCaseTest.php`

```
[ ] test_cannot_create_client_without_name
[ ] test_client_detail_includes_addresses
[ ] test_client_detail_includes_financial_summary
[ ] test_store_address_for_client
[ ] test_update_address
[ ] test_delete_address
[ ] test_accounts_receivable_filters_correctly
```

#### [MODIFY] `tests/Feature/RbacTest.php` — Ampliar

```
[ ] test_operador_cannot_access_users_crud
[ ] test_operador_cannot_access_financial_settle
[ ] test_operador_can_view_shipments
[ ] test_admin_can_create_users
[ ] test_unauthenticated_gets_401
```

### Hardening — Validaciones

Revisar que TODOS los controllers tengan:

1. **Validación de request** con `$request->validate()` — no confiar en datos del frontend
2. **Respuestas JSON consistentes** — siempre `{ message, data? }` para errores
3. **Paginación default** — `per_page` con valor sensato y máximo de 100
4. **Soft delete protection** — no mostrar registros eliminados en listados

### DoD

```
[ ] 15+ tests nuevos creados
[ ] Todos los tests pasan (80+ total)
[ ] Validaciones revisadas en todos los controllers
[ ] php artisan test → ALL PASS
```

---

## Orden de Ejecución

```
1. BLOQUE 2 → Deploy cPanel (configuración, NO deploy real)
2. BLOQUE 4 → Tests + Hardening backend
3. BLOQUE 3 → Polish visual frontend
4. BLOQUE 1 → E2E tests
```

**Reportar avance al cerrar cada bloque.**
**Al terminar los 4 bloques, ejecutar:**

```bash
# Backend
cd api && php artisan test

# Frontend
cd frontend && npm run lint && npm run build
```

**Ambos deben pasar sin errores.**
