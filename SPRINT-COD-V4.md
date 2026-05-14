# Sprint Cod V4 — Cierre Fase 1 + Preparación Fase 2-3

## ⚖️ LEY DE SECUENCIA (PERMANENTE)

**NO EXISTE EL TIEMPO EN ESTE ECOSISTEMA.** No hay fechas. No hay timelines. No hay días ni meses ni estimados. Solo existe la **secuencia de producción por calidad.** Lo que va primero es lo que DEBE ir primero por dependencias técnicas y valor de negocio. Se trabaja hasta terminar. Punto.

## Meta

Cerrar TODO lo pendiente de la Fase 1 (bloques B3 y B1 del V3), resolver deuda técnica menor, y preparar las bases para las Fases 2 y 3 del roadmap (Portal Cliente polish + App Repartidor). Este sprint tiene **6 bloques** que Cod debe ejecutar secuencialmente. Se trabaja hasta terminar todo.

---

## Contexto Técnico Actualizado

| Campo | Valor |
|-------|-------|
| Repo | `d:\DHE dev\P16-DHE-Admin-Web` |
| Backend | Laravel 13 + PHP 8.4 → `localhost:8000` |
| Frontend | Next.js 16 + React 19 + TailwindCSS v4 → `localhost:3000` |
| Auth | Sanctum Bearer token |
| API client | `src/lib/api.ts` → `apiGet<T>(path)`, `apiSend<T>(path, method, body)` |
| Types | `src/lib/types.ts` — interfaces completas (388 líneas) |
| Dark mode | `[data-theme="dark"]` en `globals.css` + CSS vars |
| Package manager | npm |
| Tests actuales | Backend: 117 pass + 1 skip / 442 assertions |
| E2E actuales | 11 tests en 3 specs (smoke, regression, zones-routes-notifications) |
| Endpoints | 76 |
| Rutas frontend | 17 |
| Build | ✅ Compila sin errores |
| Lint | ✅ 0 errores |

### CSS Design Tokens (globals.css)

```css
:root {
  --color-primary: #d1007f;
  --color-delivered: #12a85f;
  --color-route: #1f86ff;
  --color-pending: #ff8616;
  --color-issue: #e72256;
  --background: #f8fafc;
  --foreground: #0f172a;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --border: #e2e8f0;
}

[data-theme="dark"] {
  --background: #0f0f23;
  --foreground: #e0e0e0;
  --surface: #1a1a2e;
  --surface-2: #16162a;
  --border: #2a2a3e;
}
```

### Reglas de Cod

1. **NO poner fechas, timelines, ni estimados en NINGÚN documento — LEY DE SECUENCIA**
2. Seguir patrones existentes del código — NO inventar nuevas convenciones
3. Dark mode obligatorio usando CSS vars: `var(--surface)`, `var(--border)`, `var(--foreground)` — NO hardcodear hex en clases nuevas, usar las vars
4. Responsive 375px obligatorio
5. `npm run lint` y `npm run build` deben pasar al cerrar cada bloque
6. `php artisan test` debe pasar al cerrar cada bloque
7. Todos los botones interactivos: `active:scale-95 transition-all duration-150`
8. Contenedores principales: clase `animate-fade-in`
9. Chips de estado: `bg-{color}-50/20 text-{color}-700` pattern
10. Skeletons para loading, empty states con ícono + mensaje, error toast para fetch fails

---

## BLOQUE 1: E2E Tests Dedicados (Playwright)

### Objetivo
Crear specs E2E dedicados y detallados para zonas y rutas. Los mock handlers en `frontend/e2e/support/mock-api.ts` ya cubren todos los endpoints necesarios (677 líneas, handlers completos para zones, routes, notifications).

### Archivos

- CREAR `frontend/e2e/zones.spec.ts`
- CREAR `frontend/e2e/routes.spec.ts`
- MODIFICAR `frontend/e2e/regression.spec.ts` (agregar 3 tests de notificaciones navbar)

### Tests requeridos — `zones.spec.ts`

Usar patrón existente: `import { withSession } from "./support/mock-api"`;

```typescript
// 1. Navegación: la página /zonas carga y muestra heading "Zonas de cobertura"
// 2. Grid: muestra al menos 1 zona del mock (Zona Norte)
// 3. Badge tipo: cada zona muestra su tipo (urban → "Urban")
// 4. Precio base: cada zona muestra tarifa formateada en COP (formatCOP)
// 5. Crear zona: click "Nueva zona" → llenar form → submit → toast "Zona creada"
// 6. Editar zona: click "Editar" → modal se abre con datos → heading "Editar zona"
// 7. Ver reglas: click "Ver reglas" → panel expand → muestra "Regla base"
// 8. Calculadora: seleccionar zona → click "Calcular" → ver "Precio:" y "$14.500"
// 9. Dark mode: verificar que cards tienen clases dark (data-theme check no necesario, solo que el markup usa las clases correctas)
```

### Tests requeridos — `routes.spec.ts`

```typescript
// 1. Navegación: la página /rutas carga y muestra heading "Rutas diarias"
// 2. Kanban lanes: se ven las 3 columnas — "Planificada", "Activa", "Completada"
// 3. Ruta card: se muestra "Ruta #18" con conductor y zona
// 4. Progreso: cada ruta muestra barra de progreso con completed_stops/total_stops
// 5. Iniciar ruta: botón "Iniciar" visible en ruta planned → click → toast "Ruta activada"
// 6. Completar parada: en ruta activa → botón "Completar" visible en parada pending
// 7. Nueva ruta: click "Nueva ruta" → modal con form → selector de conductor y paradas
// 8. Empty state: lane "Completada" muestra "Sin rutas" cuando no hay rutas completed
```

### Tests adicionales para `regression.spec.ts`

```typescript
// Agregar al final del describe existente:
// test "notificaciones navbar badge" — campana muestra "2"
// test "notificaciones dropdown" — click campana → dropdown con "Ruta #18 lista para iniciar"
// test "marcar todas leídas" — click "Marcar todas como leidas" → toast
```

**NOTA:** Los handlers de mock API para notificaciones, zonas, rutas ya existen en `mock-api.ts`. NO crear nuevos, reusar los existentes.

### DoD

```
[ ] zones.spec.ts — 9 tests
[ ] routes.spec.ts — 8 tests
[ ] regression.spec.ts — 3 tests nuevos (7 total)
[ ] npx playwright test → todos pasan
[ ] npm run lint → 0 errores
[ ] npm run build → compila
```

---

## BLOQUE 2: Frontend Polish Visual — Páginas Principales

### Objetivo
Auditoría y corrección visual de las 8 páginas principales. Cada página debe cumplir el checklist completo.

### Checklist universal por página

Verificar y corregir si falta:

```
[ ] Skeleton loading: <Skeleton> component mientras carga datos
[ ] Empty state: ícono + texto cuando no hay datos ("Sin X configurados")
[ ] Error state: showToast("...", "error") en catch de cada fetch
[ ] Dark mode cards: usar var(--surface) o clase dark:bg-[#1a1a2e] dark:border-[#2a2a3e]
[ ] Dark mode headers: dark:bg-[#16162a] donde corresponda
[ ] Dark mode texto: dark:text-[#e0e0e0] para principal, dark:text-slate-400 para secundario
[ ] Dark mode inputs: ya cubierto por globals.css regla genérica
[ ] Dark mode modales: fondo var(--surface), bordes var(--border)
[ ] Mobile 375px: flex-col en headers, overflow-x-auto en tablas
[ ] Mobile modales: items-end + rounded-t-xl (patrón existente)
[ ] animate-fade-in: en el div contenedor principal
[ ] Botones: active:scale-95 transition-all duration-150
[ ] Chips status: bg opacity pattern (bg-emerald-50 text-emerald-700)
```

### Páginas a auditar en este bloque

**Orden de ejecución:**

1. **`/` (Dashboard)** — Widget financiero expandible necesita animación smooth. Verificar gráfica horaria en dark.
2. **`/pedidos`** — Barra batch sticky bottom: verificar dark mode y mobile. Tabla con overflow-x-auto.
3. **`/clientes`** — Tabs (datos, direcciones, financiero): verificar dark mode en cada tab.
4. **`/conductores`** — Board de cards: verificar responsive grid 1-col mobile.
5. **`/conductores/[id]`** — Detalle con tabla de envíos: overflow-x-auto, chips de estado.
6. **`/pagos`** — Tres secciones (overview, driver board, COD). Verificar dark en todas.
7. **`/novedades`** — Lista de issues: dark mode y empty state.
8. **`/login`** — Ya tiene redesign. Verificar que el fondo y formulario se ven bien en dark + mobile 375px.

### DoD

```
[ ] 8 páginas auditadas y corregidas
[ ] npm run lint → 0 errores
[ ] npm run build → compila
```

---

## BLOQUE 3: Frontend Polish Visual — Páginas Secundarias

### Objetivo
Auditoría y corrección de las 7 páginas restantes.

### Páginas a auditar

1. **`/zonas`** — Ajustes específicos:
   - Calculadora: agregar `[calculating, setCalculating]` state → mostrar spinner o texto "Calculando..." en botón mientras espera respuesta
   - Grid de zonas: agregar `hover:shadow-md transition-shadow duration-150` a cada `<article>`
   - Badge de tipo (Urbana/Suburbana/Extendida): usar chip con color diferenciado por tipo

2. **`/rutas`** — Ajustes específicos:
   - Kanban responsive: el layout actual usa `flex min-w-max gap-4 md:grid md:grid-cols-3` (ya tiene overflow-x-auto). En mobile < md, las columnas son scrollables horizontalmente — **esto es aceptable**, pero agregar indicador visual de scroll (gradient fade en bordes o hint text "← Desliza →")
   - Drag-and-drop de paradas: agregar cursor-grab visual y hover highlight

3. **`/reportes`** — Verificar dark mode en cards de resumen y tabla de drivers/clientes.

4. **`/metricas`** — Verificar que las gráficas (Chart.js o similar) usan colores dark mode. Si hay hardcoded light colors, adaptar.

5. **`/usuarios`** — CRUD table: dark mode rows, headers, y modal de crear/editar usuario.

6. **`/auditoria`** — Tabla de logs + metadata inspector modal: dark mode.

7. **`/configuracion`** — Formulario de perfil + empresa + tema: verificar que el toggle de dark mode funciona en vivo.

### DoD

```
[ ] 7 páginas auditadas y corregidas
[ ] Ajustes específicos de /zonas y /rutas implementados
[ ] npm run lint → 0 errores
[ ] npm run build → compila
```

---

## BLOQUE 4: Deuda Técnica + Backend Hardening

### Objetivo
Resolver los problemas conocidos y verificar compatibilidad MySQL.

### Tareas

#### 4.1 Resolver test skipped (driver_paid)
- Archivo: buscar el test skipped en `/api/tests/Feature/`
- Problema: falta dato específico en seeder para el edge case
- Acción: agregar el dato necesario al `DemoDataSeeder` y quitar el skip

#### 4.2 Verificar queries SQLite vs MySQL
Revisar estos controllers y asegurar que las queries raw funcionen en ambos:

```php
// ShipmentController::hourlyStats() — ya tiene lógica dual, agregar MySQL:
// MySQL: DATE_FORMAT(created_at, '%H')
// SQLite: strftime('%H', created_at)
// Patrón: usar DB::getDriverName() === 'mysql' para branch

// ReportController::stats() — verificar agrupaciones
// FinancialController — verificar sumas y agrupaciones
// DashboardController — verificar whereDate funciona en MySQL
```

#### 4.3 Limpiar favicon.ico viejo
- Intentar eliminar `frontend/public/favicon.ico` si existe
- Si el filesystem no permite borrarlo, documentar el workaround (icon.png override vía metadata)

#### 4.4 Limpiar archivos temporales de favicon
- Eliminar: `frontend/public/favicon-256.tmp.png`, `frontend/public/favicon-64.tmp.png`
- Estos son archivos temporales que no deberían estar en el repo

### DoD

```
[ ] Test skipped resuelto → 118/118 pass
[ ] Queries MySQL verificadas en 4 controllers
[ ] Archivos temporales limpiados
[ ] php artisan test → ALL PASS
[ ] npm run lint → 0 errores
[ ] npm run build → compila
```

---

## BLOQUE 5: P14 Portal Cliente — Login Redesign + Polish

### Contexto
P14 está en un repo separado: `github.com/gallegosdiego/P14-DHE-app-Cliente-`
Clonar o ubicar en `d:\DHE dev\P14-DHE-app-Cliente-` si no existe.

### 5.1 Login Redesign (Split Layout)
El login actual es funcional. El redesign pedido es un **split layout**:

```
┌─────────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │              │  │                      │ │
│  │  FOTO/HERO   │  │   FORMULARIO LOGIN   │ │
│  │  repartidor  │  │   logo, email, pass  │ │
│  │  en acción   │  │   botón, links       │ │
│  │              │  │                      │ │
│  └──────────────┘  └──────────────────────┘ │
│        50%                  50%             │
└─────────────────────────────────────────────┘
Mobile: solo formulario, foto como background con overlay
```

- Usar la misma paleta dark de P16
- Logo Danhei: `public/danhei-logo.png` (copiar de P16 si no existe)
- Foto: buscar stock photo de repartidor en moto urbana, o usar gradiente + ilustración
- Dark mode obligatorio por defecto (igual que P16)

### 5.2 Polish General P14
Aplicar el mismo checklist visual de P16 a las 8 páginas de P14:
- Skeletons, empty states, error toasts
- Dark mode con mismos tokens CSS
- Responsive 375px
- animate-fade-in, active:scale-95 en botones

### DoD

```
[ ] Login redesign split layout implementado
[ ] 8 páginas P14 auditadas visualmente
[ ] npm run lint → 0 errores
[ ] npm run build → compila
[ ] Smoke test → 7/7 flujos OK
```

---

## BLOQUE 6: P15 App Repartidor — Scaffolding + Diseño

### Contexto
P15 es una app React Native + Expo para los repartidores de Danhei Express. No existe código aún.

### 6.1 Crear el proyecto

```bash
# En d:\DHE dev\
npx -y create-expo-app@latest P15-DHE-App-Repartidor --template blank-typescript
cd P15-DHE-App-Repartidor
npx expo install expo-router expo-secure-store
```

### 6.2 Documentar arquitectura

Crear `docs/ARCHITECTURE.md` con:

```markdown
# P15 — App Repartidor

## Stack
- React Native + Expo (SDK 53+)
- expo-router (file-based routing)
- expo-secure-store (token storage)
- TypeScript strict

## Screens (planificadas)
1. Login
2. Mis Rutas (ruta del día, lista de paradas)
3. Detalle Parada (datos destinatario, mapa, acciones)
4. Entrega (confirmar entrega + evidencia foto)
5. Novedades (reportar problema con envío)
6. Recaudo (registrar cobro COD, monto)
7. Perfil (datos del conductor, cambiar contraseña)

## API Endpoints requeridos (ya existentes en P16 backend)
- POST /api/login
- GET /api/me
- GET /api/routes?driver_id={me}&date={today}
- POST /api/routes/{id}/start
- POST /api/routes/{id}/stops/{stopId}/complete
- POST /api/shipments/{id}/change-status
- POST /api/shipments/{id}/collect
- GET /api/notifications
- POST /api/notifications/read-all
- PUT /api/me (profile)
- PUT /api/me/password

## Design System
Misma paleta que P16:
- Primary: #d1007f
- Delivered: #12a85f
- Route: #1f86ff
- Pending: #ff8616
- Issue: #e72256
- Dark background: #0f0f23
- Surface: #1a1a2e
```

### 6.3 Crear repo en GitHub
- Repo: `P15-DHE-App-Repartidor`
- README con stack y setup instructions
- `.gitignore` de Expo
- Push initial commit

### 6.4 Implementar pantalla de Login
- Pantalla de login funcional que conecta a `POST /api/login`
- Token guardado en `expo-secure-store`
- Redirect a Home al autenticar
- Dark theme por defecto
- Logo Danhei centrado

### DoD

```
[ ] Proyecto Expo creado y funcional
[ ] docs/ARCHITECTURE.md documentado
[ ] Repo GitHub creado y pushed
[ ] Pantalla Login funcional contra API real
[ ] expo start → compila sin errores
```

---

## Orden de Ejecución

```
1. BLOQUE 1 → E2E Tests dedicados (usar lo que ya existe, ampliar)
2. BLOQUE 2 → Polish visual páginas principales (8 páginas)
3. BLOQUE 3 → Polish visual páginas secundarias (7 páginas)
4. BLOQUE 4 → Deuda técnica + MySQL verification
5. BLOQUE 5 → P14 Login redesign + polish
6. BLOQUE 6 → P15 Scaffolding + Login
```

**Reportar avance al cerrar cada bloque.**

**Validación final al terminar BLOQUES 1-4 (cierre Fase 1):**

```bash
# Backend
cd api && php artisan test

# Frontend
cd frontend && npm run lint && npm run build

# E2E
cd frontend && npx playwright test
```

**Los tres deben pasar sin errores.**

---

## Verificación de Cierre Fase 1

Al completar los bloques 1-4, generar un archivo `docs/FASE-1-CLOSURE.md` con:

1. Resumen de todos los módulos implementados
2. Conteo final de tests (backend + E2E)
3. Lista de endpoints con sus tests asociados
4. Screenshots o evidencia de dark mode y responsive
5. Lista de issues conocidos residuales (si los hay)
6. Checklist firmado de Definition of Done

---

## Notas para Cod

- **Mock API completa:** El archivo `frontend/e2e/support/mock-api.ts` tiene 677 líneas con handlers para TODOS los endpoints. NO crear mocks duplicados.
- **Patrones existentes:** Cada página ya sigue el patrón `Skeleton → Empty → Data`. Solo verificar que está completo.
- **Dark mode globals:** El `globals.css` ya tiene safety nets para `bg-white`, `bg-slate-50`, `border-slate-*`, `text-slate-*`, inputs, y placeholders. Muchas clases dark ya funcionan automáticamente.
- **SQLite path issue:** Si el backend falla con "disk I/O error", la BD está en `C:\tmp\p16-db.sqlite`. Verificar que el path es accesible.
- **No romper lo que funciona:** Los 117 tests backend y 11 E2E tests DEBEN seguir pasando en cada bloque.
