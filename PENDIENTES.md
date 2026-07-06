# Danhei Express — Pendientes

> Última actualización: 2026-06-18 00:22 (hora Colombia)
> Sesión: Iteración 1A + 1B completadas

---

## 🔴 Acción Inmediata (antes de usar la app)

### 1. Build APK de P15
```bash
cd "D:\Danhei Dev\P15-DHE-App-Repartidor"
npx eas-cli login
npx eas-cli build --platform android --profile preview
```
- El perfil `preview` genera APK con API apuntando a `api.danheiexpress.com`
- Sin esto, los cambios visuales (header fucsia, tab bar, puntos rosados) no se ven en el celular

### 2. Verificar deploy P16 en GitHub Actions
- Ir a: https://github.com/gallegosdiego/P16-DHE-Admin-Web/actions
- Commit `bf80cb2` debió disparar el workflow `deploy-api`
- Si falló: probablemente es el WAF (Imunify360) bloqueando el health check
- El health check ahora solo emite warning, no debería bloquear el deploy

### 3. Whitelistear IPs de GitHub Actions en Imunify360
- `api.danheiexpress.com/api/health` devuelve "Access denied by Imunify360 bot-protection"
- Opciones:
  - A) Whitelistear IPs de GitHub en Imunify360 (panel cPanel → Imunify360 → Whitelist)
  - B) Crear endpoint `/api/ping` sin middleware que devuelva `{"ok":true}` y cambiar el workflow para usarlo

---

## 🟡 Mejoras Pendientes (Iteración 2)

### Mapa Real en P15
- **Estado actual**: resuelto a nivel base
- **App**: ya consume mapa nativo + ruta operativa
- **Backend**: ya persiste `recipient_lat`, `recipient_lng`, `geocoded_at`
- **Geocodificación**: crea/edita envíos, repara rutas al vuelo, usa fallback Nominatim y centro de zona si hace falta
- **Producción**: solo requiere deploy manual por cPanel para quedar activo

### Security Sprint 1 — Auth Hardening Admin (P16)

> **Prioridad**: Mediano plazo. No mezclar con funcionalidad actual.
> **No aplica a P15 móvil**: la app usa Bearer token en `SecureStore` (no navegador).

**Estado actual**: Token en `localStorage` + cookie accesible desde JS. Funciona, pero si entra XSS, un script podría robar el token. Con `HttpOnly` el token no sería accesible por JS (aunque XSS podría seguir haciendo acciones en sesión activa).

**Opciones de migración**:

| Opción | Descripción | Ventaja | Costo |
|--------|-------------|---------|-------|
| **A) BFF con Next.js** (recomendada) | Login pasa por ruta server-side de Next. Next guarda token en cookie `HttpOnly/Secure/SameSite=Lax` y hace proxy al API Laravel con `Authorization: Bearer` | Token nunca vive en JS | Crear API routes en Next, tocar cliente API |
| **B) Sanctum SPA cookies** | Laravel maneja sesión/cookie `HttpOnly` directamente. Requiere `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, CORS con credentials, CSRF | Más Laravel-native | Delicado en subdominios, cPanel, Vercel, CORS |
| **C) Hardening corto** (mientras no se migre) | CSP fuerte, sanitizar contenido, expirar tokens, revocar en logout, rate limit login, cookies con `Secure`+`SameSite` | Rápido, sin cambio de arquitectura | No elimina la raíz del problema |

**Orden de ejecución**:
1. Auditar XSS/CSP en frontend admin
2. Agregar expiración y revocación real de tokens Sanctum
3. Decidir BFF Next vs Sanctum cookie
4. Migrar auth
5. Pruebas E2E de login/logout/sesión expirada
6. Revisar permisos y usuarios demo restantes

### Deploy Más Estricto
- `.cpanel.yml` usa `|| echo "WARN"` para todos los pasos
- `composer install` fallando silenciosamente puede dejar producción sin dependencias nuevas
- Propuesta: hacer fallar en `composer install` y `migrate`, tolerar solo cache/seeder

---

## ✅ Completado (Iteración 1A + 1B)

### Backend P16
- [x] Migración: `intake_photo` + `mercado_libre` enum
- [x] `intake_photo` en `$fillable` de Shipment
- [x] `ShipmentController`: upload de foto con validación
- [x] `RouteController::myRoute()`: incluye `delivery_instructions`, `intake_photo`, `evidence_photo`
- [x] `mercado_libre` integrado en servicios financieros (KPI + CashFlow)
- [x] `PaymentType` enum con docstring correcto (post-entrega, ML paga después)
- [x] Seeder: usuarios demo solo en `local/testing/staging`, nunca en producción
- [x] Migración: guard `DB::getDriverName()` en vez de try/catch ciego
- [x] `deploy-repair.php` eliminado de producción
- [x] Health check: 3 reintentos, valida HTTP 200 + JSON
- [x] `.cpanel.yml`: `storage:link` + `mkdir intake/ evidence/`
- [x] `storage/app/public/intake/.gitkeep` trackeado

### Frontend P16
- [x] Form de pedidos: foto de recepción, instrucciones, Mercado Libre
- [x] `apiSend`: soporta `File` objects nativamente con FormData
- [x] Dropdown de asignación de piloto

### App Piloto P15
- [x] Header fucsia sólido `#d1007f` con texto blanco
- [x] StatusBar integrada (light-content)
- [x] Tab bar: borde fucsia 2px, altura 72px, sombra, iconos outline
- [x] KPIs: iconos outline unificados en color primario
- [x] Patrón de puntos rosados (DotPattern component)
- [x] "Acciones Rápidas" eliminadas (duplicaban tabs)
- [x] Bottom spacer 100px para tab bar
- [x] Splash screen: fondo fucsia
- [x] Auth: logout funciona correctamente
- [x] Tipo `mercado_libre` en types.ts y labels

### Seguridad
- [x] `deploy-repair.php` eliminado (tenía token hardcodeado en /public/)
- [x] Seeder no crea usuarios demo en producción
- [x] Health check no expone datos sensibles

---

## 📋 Commits de Esta Sesión

### P16-DHE-Admin-Web
| Commit | Descripción |
|--------|-------------|
| `a126e80` | Deploy fix: eliminar repair script, health check robusto, storage dirs |
| `91fa5aa` | Critical: fillable, myRoute fields, migration guard, seeder env check |
| `bf80cb2` | Mercado Libre integración financiera completa |

### P15-DHE-App-Repartidor
| Commit | Descripción |
|--------|-------------|
| `d093fa9` | Visual redesign: header fucsia, tab bar, iconos outline |
| `2c18dbf` | Patrón de puntos rosados (DotPattern component) |

---

## 🏗️ Arquitectura Actual

```
P15-DHE-App-Repartidor (Expo/React Native)
├── App piloto para repartidores
├── API: https://api.danheiexpress.com
├── Auth: Sanctum token en SecureStore
└── Build: EAS (preview = APK, production = AAB)

P16-DHE-Admin-Web
├── api/ (Laravel 13, PHP 8.3)
│   ├── Deploy: cPanel Git + .cpanel.yml
│   └── Host: api.danheiexpress.com
└── frontend/ (Next.js)
    └── Deploy: manual o CI pendiente
```
## 2026-07-06 - hardening geodatos + archivos publicos

### Direcciones y geolocalizacion
- se endurecio la normalizacion de direcciones colombianas en backend y frontend admin;
- ahora se corrigen formatos como `# 14 05` a `# 14-05`;
- el backend puede inferir `zona` y `ciudad` cuando vienen incrustadas dentro del campo de direccion;
- la geocodificacion prueba variantes adicionales con y sin `#`, reduciendo casos `Geo pendiente`.

### Documentos e imagenes P15/P16
- se agrego un resolvedor de activos publicos para evitar que documentos e imagenes dependan de `APP_URL` o de hosts locales viejos;
- los documentos del piloto, `intake_photo` y `evidence_photo` ahora salen con URL consistente para app piloto y panel administrativo;
- la evidencia de entrega se corrigio para guardarse en el disco `public` correcto;
- P15 y P16 toleran datos legacy al reconstruir URLs de storage en cliente.

### QA recomendado
- crear pedidos con direcciones `Calle 22 #10 54`, `Cra 13 #58-10, Chapinero, Bogota` y `Calle 135 #103F 64, Bosa, Bogota`;
- revisar que administracion llene `recipient_lat` y `recipient_lng`;
- subir cedula/documentos desde P15 y confirmar miniatura + vista completa en P15 y P16;
- revisar tambien `intake_photo` desde la parada del piloto.
