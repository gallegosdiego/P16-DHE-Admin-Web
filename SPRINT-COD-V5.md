# Sprint Cod V5 — P15 App Repartidor (Implementación Completa)

## ⚖️ LEY DE SECUENCIA (PERMANENTE)

**NO EXISTE EL TIEMPO EN ESTE ECOSISTEMA.** No hay fechas. No hay timelines. No hay días ni meses ni estimados. Solo existe la **secuencia de producción por calidad.** Lo que va primero es lo que DEBE ir primero por dependencias técnicas y valor de negocio. Se trabaja hasta terminar. Punto.

## Meta

Llevar P15-DHE-App-Repartidor desde el scaffolding actual (login funcional) hasta una app operativa completa que permita a los conductores de Danhei Express ejecutar su ruta diaria, confirmar entregas, registrar novedades, cobrar contra entrega y gestionar su perfil. Este sprint tiene **5 bloques** que se ejecutan secuencialmente.

---

## Contexto Técnico

| Campo | Valor |
|-------|-------|
| Repo | `d:\Danhei Dev\P15-DHE-App-Repartidor` |
| Stack | React Native + Expo SDK 54, expo-router, expo-secure-store |
| API | Laravel 13 compartida en `localhost:8000` (P16 backend) |
| Auth | Sanctum Bearer Token → guardado en `expo-secure-store` |
| Usuarios conductor | Login con cualquier usuario de rol `operador` o `conductor` |
| Estado actual | Proyecto Expo inicializado + `app/index.tsx` (login screen) |
| Design System | Dark-first, misma paleta que P16/P14 |

### Design Tokens (StyleSheet)

```typescript
const colors = {
  primary: '#d1007f',
  primaryHover: '#b8006f',
  delivered: '#12a85f',
  route: '#1f86ff',
  pending: '#ff8616',
  issue: '#e72256',
  background: '#0f0f23',
  surface: '#1a1a2e',
  card: '#16162a',
  border: '#2a2a3e',
  text: '#e0e0e0',
  textSecondary: '#94a3b8',
};
```

### Endpoints API disponibles para el Repartidor

Los siguientes endpoints YA existen en la API de P16 y están listos para consumir:

```
POST   /api/login                              → Autenticación
POST   /api/logout                             → Cerrar sesión
GET    /api/me                                 → Datos del usuario autenticado
PUT    /api/me                                 → Actualizar perfil
PUT    /api/me/password                        → Cambiar contraseña
GET    /api/driver/my-route                    → Ruta del día para el conductor actual
GET    /api/routes?driver_id={id}&date={date}  → Rutas filtradas por conductor
GET    /api/routes/{id}                        → Detalle de ruta con paradas
POST   /api/routes/{id}/start                  → Activar ruta (planned → active)
POST   /api/routes/{id}/stops/{stopId}/complete → Completar una parada
POST   /api/shipments/{id}/status              → Cambiar estado del envío
POST   /api/financial/shipments/{id}/collect    → Marcar recaudo COD
GET    /api/notifications                       → Lista de notificaciones
GET    /api/notifications/unread-count          → Contador de no leídas
POST   /api/notifications/read-all             → Marcar todas como leídas
```

### Reglas

1. **LEY DE SECUENCIA** — sin fechas ni estimados
2. Dark mode obligatorio en toda la app
3. StyleSheet nativo de React Native (NO NativeWind por ahora)
4. Tipografía del sistema (no hay Google Fonts en RN por defecto)
5. Navegación con `expo-router` (file-based)
6. Token en `expo-secure-store` con key `dhe_driver_token`
7. Todas las pantallas deben tener skeleton loading y empty states
8. Botones con feedback táctil (`TouchableOpacity` con `activeOpacity={0.7}`)
9. La URL de la API debe ser configurable via constante (para cambiar a producción después)

---

## BLOQUE 1: Autenticación y Navegación Base

### Objetivo
Establecer el sistema de autenticación completo y la estructura de navegación con tabs.

### Archivos

#### [NEW] `lib/api.ts`
Cliente HTTP centralizado:
```typescript
import * as SecureStore from 'expo-secure-store';

const API_URL = 'http://127.0.0.1:8000/api'; // Cambiar por IP local para dispositivo físico

export async function apiGet<T>(path: string): Promise<T> {
  const token = await SecureStore.getItemAsync('dhe_driver_token');
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: object): Promise<T> {
  const token = await SecureStore.getItemAsync('dhe_driver_token');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API Error ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body: object): Promise<T> {
  // Mismo patrón que apiPost pero con method: 'PUT'
}
```

#### [NEW] `lib/auth.tsx`
AuthContext con Provider:
```typescript
// Estado: { user, token, isLoading, isAuthenticated }
// Acciones: login(email, password), logout()
// Al montar: verificar si hay token en SecureStore → GET /api/me
// Si hay token válido → redirigir a /(tabs)
// Si no hay token → redirigir a /login
```

#### [NEW] `lib/types.ts`
Interfaces TypeScript para la app:
```typescript
interface User { id: number; name: string; email: string; phone: string; }
interface RouteData { id: number; driver: Driver; route_date: string; zone: string; status: 'planned'|'active'|'completed'; total_stops: number; completed_stops: number; progress: number; stops: RouteStop[]; }
interface RouteStop { id: number; sort_order: number; status: 'pending'|'completed'; shipment: Shipment; }
interface Shipment { id: number; tracking_code: string; display_code: string; status: string; recipient_name: string; recipient_phone: string; recipient_address: string; recipient_zone: string; payment_type: string; cod_amount: number; shipping_cost: number; notes: string; }
interface Driver { id: number; name: string; initials: string; phone: string; vehicle: string; plate: string; zone: string; }
interface Notification { id: number; title: string; body: string; type: string; read_at: string|null; created_at: string; }
```

#### [MODIFY] `app/index.tsx` (Login)
- Refactorizar para usar `lib/api.ts` y `lib/auth.tsx`
- Después del login exitoso: `router.replace('/(tabs)')`

#### [NEW] `app/_layout.tsx`
Root layout con AuthProvider:
```typescript
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AuthProvider>
  );
}
```

#### [NEW] `app/(tabs)/_layout.tsx`
Tab navigator con 4 tabs:
```
🏠 Inicio     → /(tabs)/         → Ruta del día
📦 Paradas    → /(tabs)/paradas  → Lista de paradas de la ruta activa
🔔 Avisos     → /(tabs)/avisos   → Notificaciones
👤 Perfil     → /(tabs)/perfil   → Datos del conductor
```

- Icons: usar `@expo/vector-icons` (Ionicons)
- Tab bar: fondo `#16162a`, activo `#d1007f`, inactivo `#64748b`
- Guard: si no hay token → redirect a login

#### [NEW] `app/(tabs)/index.tsx` (Placeholder Home)
Pantalla temporal con texto "Bienvenido, {user.name}" para validar la navegación.

### DoD

```
[ ] Login funcional con SecureStore
[ ] Navegación tabs con 4 pantallas
[ ] AuthProvider con guard
[ ] lib/api.ts y lib/types.ts completos
[ ] expo start → compila sin errores
```

---

## BLOQUE 2: Mi Ruta del Día (Pantalla Principal)

### Objetivo
La pantalla más importante de la app. El conductor ve su ruta asignada para hoy con todas las paradas y puede iniciarla.

### Archivos

#### [MODIFY] `app/(tabs)/index.tsx` → Pantalla "Mi Ruta"

**Estado: Sin ruta asignada**
- Ícono grande de ruta vacía
- Texto: "No tienes ruta asignada para hoy"
- Subtexto: "Contacta a tu coordinador"

**Estado: Ruta planificada (planned)**
- Header: "Ruta del día" + fecha
- Info: zona, total de paradas
- Botón grande: "INICIAR RUTA" (POST `/api/routes/{id}/start`)
- Lista preview de paradas (collapsed, solo nombres)

**Estado: Ruta activa (active)**
- Header: "Ruta en curso" + barra de progreso circular
- Progreso: "3/7 paradas completadas"
- Indicador visual de siguiente parada
- Lista de paradas con estado (✅ completada / 🔵 siguiente / ⚪ pendiente)
- Tap en parada → navega a detalle

**Estado: Ruta completada (completed)**
- Resumen del día: paradas completadas, envíos entregados, dinero recaudado
- Mensaje: "¡Excelente trabajo! Ruta completada."

**Endpoint:** `GET /api/driver/my-route`

**Pull to refresh:** Sí, con `RefreshControl`

#### [NEW] `components/RouteProgress.tsx`
Componente reutilizable de progreso circular:
- Círculo SVG con `react-native-svg` o simple barra
- Porcentaje en el centro
- Color: `#d1007f` (progreso) / `#2a2a3e` (fondo)

#### [NEW] `components/StopCard.tsx`
Card de parada en la lista:
- Indicador de estado (color lateral)
- Nombre del destinatario
- Dirección (1 línea, truncada)
- Tipo de pago (badge: "COD $X" o "Prepago")
- Hora estimada (si disponible)

### DoD

```
[ ] Pantalla "Mi Ruta" con los 4 estados
[ ] Iniciar ruta funcional contra API
[ ] Pull to refresh
[ ] StopCard y RouteProgress componentes
[ ] expo start → compila sin errores
```

---

## BLOQUE 3: Detalle de Parada + Entrega + Novedades

### Objetivo
El conductor puede ver el detalle de una parada, confirmar la entrega, registrar novedades y cobrar contra entrega.

### Archivos

#### [NEW] `app/parada/[stopId].tsx`
Pantalla de detalle de parada (modal o screen):

**Sección 1 — Información del destinatario:**
- Nombre
- Teléfono (con botón para llamar → `Linking.openURL('tel:...')`)
- Dirección completa
- Zona
- Notas de entrega (si hay)

**Sección 2 — Información del envío:**
- Código de guía (`display_code`)
- Estado actual (chip de color)
- Tipo de pago (COD / Prepago / Post-venta)
- Monto COD (si aplica, resaltado en grande)
- Costo de envío

**Sección 3 — Acciones:**

Botón "ENTREGAR" (verde, grande):
- Cambia estado del envío a `delivered` → POST `/api/shipments/{id}/status` con `{ status: "delivered" }`
- Completa la parada → POST `/api/routes/{routeId}/stops/{stopId}/complete`
- Si es COD: primero muestra modal de recaudo

Botón "REPORTAR NOVEDAD" (rojo):
- Cambia estado del envío a `issue` → POST `/api/shipments/{id}/status` con `{ status: "issue", issue_note: "..." }`
- Completa la parada como "novedad"

Botón "LLAMAR" (azul):
- `Linking.openURL('tel:${recipient_phone}')`

Botón "ABRIR MAPA" (azul):
- `Linking.openURL('https://maps.google.com/?q=${address}')`

#### [NEW] `components/CODModal.tsx`
Modal de recaudo contra entrega:
- Monto a cobrar: `$X.XXX` (grande, centrado)
- Selector de medio de pago: Efectivo / Transferencia / Nequi / Daviplata
- Botón "CONFIRMAR RECAUDO"
- Al confirmar: POST `/api/financial/shipments/{id}/collect`

#### [NEW] `components/IssueModal.tsx`
Modal de novedad:
- Selector de tipo de novedad:
  - "Dirección incorrecta"
  - "Cliente ausente"
  - "Rechazado por cliente"
  - "Paquete dañado"
  - "Zona insegura"
  - "Otro"
- Campo de texto: nota adicional (máx 280 caracteres)
- Botón "REPORTAR NOVEDAD"

### DoD

```
[ ] Pantalla detalle de parada completa
[ ] Flujo de entrega funcional (cambiar estado + completar parada)
[ ] Modal COD con medios de pago
[ ] Modal de novedad con tipos predefinidos
[ ] Llamar y abrir mapa funcionando
[ ] expo start → compila sin errores
```

---

## BLOQUE 4: Paradas, Notificaciones y Perfil

### Objetivo
Completar las 3 pantallas restantes de la app.

### Archivos

#### [MODIFY] `app/(tabs)/paradas.tsx`
Lista completa de paradas de la ruta activa:
- Si no hay ruta: empty state "No tienes ruta activa"
- Si hay ruta: lista con StopCard para cada parada
- Filtros: "Todas" / "Pendientes" / "Completadas"
- Tap en parada → navega a `app/parada/[stopId]`
- Indicador de siguiente parada (highlight)

#### [MODIFY] `app/(tabs)/avisos.tsx`
Lista de notificaciones:
- GET `/api/notifications?per_page=30`
- Badge en tab con contador de no leídas
- Cada notificación: ícono + título + body + fecha relativa
- No leídas: fondo ligeramente más claro
- Botón "Marcar todas como leídas" → POST `/api/notifications/read-all`
- Pull to refresh

#### [MODIFY] `app/(tabs)/perfil.tsx`
Pantalla de perfil del conductor:
- Avatar con iniciales (círculo con fondo primary)
- Nombre, email, teléfono
- Sección "Resumen del día":
  - Paradas completadas
  - Envíos entregados
  - Dinero recaudado hoy
- Botón "Cambiar contraseña" → modal con:
  - Contraseña actual
  - Nueva contraseña
  - Confirmar nueva
  - PUT `/api/me/password`
- Botón "Cerrar sesión" → logout + redirect a login
- Versión de la app en footer

### DoD

```
[ ] Pantalla paradas con filtros
[ ] Pantalla notificaciones con badge y marcar leídas
[ ] Pantalla perfil con resumen y cambiar contraseña
[ ] expo start → compila sin errores
```

---

## BLOQUE 5: Polish + Verificación Final

### Objetivo
Pulido visual, UX y verificación contra la API real.

### Tareas

#### 5.1 Skeleton loading
Agregar esqueletos animados en:
- Mi ruta (mientras carga)
- Lista de paradas
- Notificaciones
- Perfil

Usar `Animated` de React Native con opacidad pulsante.

#### 5.2 Error handling
- Cada fetch debe tener try/catch con Alert.alert()
- Si el token expiró (401) → logout automático
- Si no hay conexión → mostrar "Sin conexión a internet"

#### 5.3 Haptic feedback (opcional)
- Usar `expo-haptics` para feedback en acciones críticas:
  - Entrega confirmada → haptic success
  - Novedad reportada → haptic warning
  - Ruta iniciada → haptic success

#### 5.4 Verificación funcional
Smoke test contra la API real:
1. Login → token guardado
2. Ver ruta del día
3. Iniciar ruta
4. Ver detalle de parada
5. Entregar envío
6. Cobrar contra entrega
7. Reportar novedad
8. Ver notificaciones
9. Cambiar contraseña
10. Cerrar sesión

#### 5.5 Git
- Commits organizados por bloque
- Push al repo de GitHub (crear repo P15-DHE-App-Repartidor si no existe)

### DoD

```
[ ] Skeletons en todas las pantallas con fetch
[ ] Error handling robusto (401 auto-logout, sin conexión)
[ ] Smoke test 10/10 flujos OK
[ ] Git pushed
[ ] expo start → compila sin errores TypeScript
```

---

## Orden de Ejecución

```
1. BLOQUE 1 → Auth + Navegación tabs
2. BLOQUE 2 → Mi Ruta del día (pantalla principal)
3. BLOQUE 3 → Detalle parada + Entrega + COD + Novedades
4. BLOQUE 4 → Paradas, Notificaciones, Perfil
5. BLOQUE 5 → Polish + Verificación
```

**Reportar avance al cerrar cada bloque.**

**Validación final:**

```bash
cd "d:\Danhei Dev\P15-DHE-App-Repartidor"
npx expo start
# Verificar que compila sin errores TypeScript
# Smoke test de los 10 flujos principales
```

---

## Notas

- **API compartida:** La API de P16 ya tiene todos los endpoints necesarios. NO crear endpoints nuevos.
- **`myRoute` endpoint:** Ya existe `GET /api/driver/my-route` que devuelve la ruta del conductor autenticado para hoy. Usa middleware `scope` que inyecta `_scoped_driver_id`.
- **Rol del conductor:** El usuario autenticado necesita tener rol adecuado y un `driver_id` asociado (similar al `client_id` de P14). Verificar que el middleware `scope` lo resuelve.
- **Emulador vs dispositivo:** Para probar en dispositivo físico, cambiar `127.0.0.1` por la IP local de la máquina dev (ej: `192.168.1.X`).
- **No romper P16:** Los tests del backend (117 pass) deben seguir pasando. No modificar la API.
