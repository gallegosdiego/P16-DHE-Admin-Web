# PENDIENTES — Danhei Express Ecosystem

> **Estado: histórico.** Lista de sesión reemplazada por [ROADMAP-ACTIVO.md](./ROADMAP-ACTIVO.md).
## Última actualización: 10 Junio 2026, 09:05 PM (Bogotá)

---

## ✅ COMPLETADO — Sesión 9-10 Junio

### P15 (App Repartidor)
- [x] Migración tema oscuro → claro
- [x] Conexión al backend real Laravel (eliminado mock completo)
- [x] Login con credenciales reales (Sanctum Bearer token)
- [x] Fix logout, teléfono, login duplicado, WhatsApp
- [x] Pushed a GitHub

### P16 (Admin Web)
- [x] Renombrado "Conductor" → "PILOTO" en **todo** el admin (pagos, pedidos, rutas, reportes, sidebar, detalle, command palette)
- [x] Crear piloto con email + contraseña para acceso a la app
- [x] Labels visibles en todos los formularios (pilotos + usuarios)
- [x] Eliminar pilotos con papelera + restaurar
- [x] Eliminar usuarios con papelera + restaurar
- [x] Botón eliminar en tabla + en modal de edición
- [x] Modal de confirmación antes de eliminar
- [x] Permiso `drivers.delete` agregado al seeder
- [x] Migration `soft_deletes` para tabla users
- [x] User model con `SoftDeletes` trait
- [x] UserController: destroy, trashed, restore
- [x] API routes: DELETE, trashed, restore para users y drivers
- [x] `apiSend` soporta método DELETE
- [x] Build Next.js verificado sin errores
- [x] Pushed a GitHub

### Integración verificada (local)
- [x] Login endpoint compatible con P15
- [x] `/me` endpoint devuelve estructura correcta
- [x] `my-route` filtra por driver_id + fecha actual
- [x] Cambio de estado de envíos funcional
- [x] Novedades/issue soportado

---

## PRIORIDAD 1 — Pendientes para siguiente sesión

### Deploy producción backend
- [ ] Subir archivos API actualizados a cPanel
- [ ] Ejecutar `php artisan migrate --force` en producción
- [ ] Ejecutar `php artisan db:seed --class=RolesAndPermissionsSeeder --force` para crear permiso `drivers.delete`
- [ ] Verificar endpoints en producción:
  - `POST /api/drivers` (crear piloto con usuario)
  - `DELETE /api/drivers/{id}` (papelera piloto)
  - `DELETE /api/users/{id}` (papelera usuario)
  - `GET /api/drivers-trashed` / `GET /api/users-trashed`
  - `POST /api/drivers/{id}/restore` / `POST /api/users/{id}/restore`

### Build APK Android (P15)
- [ ] Configurar `API_URL` de producción (`https://api.danheiexpress.com/api`)
- [ ] EAS Build: `eas build --platform android --profile production`
- [ ] Generar APK para distribución
- [ ] Probar APK con backend de producción

---

## PRIORIDAD 2 — Pruebas de integración (requieren producción)

### Login real desde la app móvil
- [ ] Probar login con `piloto@danheiexpress.com` / `Piloto2026!` desde APK
- [ ] Verificar que la ruta del día cargue con datos reales
- [ ] Probar cambio de estado de parada (pendiente → completada)
- [ ] Probar registro de novedad en una parada
- [ ] Probar recaudo COD
- [ ] Verificar logout funcional

### Flujo completo admin → app
- [ ] Crear piloto desde admin → iniciar sesión en la app → verificar que vea sus rutas
- [ ] Crear envío → asignar a ruta → piloto lo ve en la app → entrega → actualiza estado

---

## PRIORIDAD 3 — Polish Visual

### App Repartidor (P15)
- [ ] Verificar legibilidad del tema claro en dispositivo físico Android
- [ ] Ajustar contraste si es necesario
- [ ] Probar en diferentes tamaños de pantalla

### Admin Web (P16)
- [ ] Considerar renombrar la URL `/conductores` a `/pilotos` (requiere cambiar carpeta Next.js)

---

## PRIORIDAD 4 — Decisiones Pendientes del CEO

- [ ] Implementación de Invoice (facturación formal)
- [ ] Canal de recordatorios para gastos fijos
- [ ] Impresión de guías con QR
- [ ] Configuración de límite COD por repartidor
- [ ] Generación de PDF de factura

---

## Datos Técnicos Rápidos

| Componente | Estado | URL |
|---|---|---|
| API Backend | ✅ Dev corriendo | `http://127.0.0.1:8000/api` |
| Admin Panel (P16) | ✅ Vercel (prod) | `https://admin.danheiexpress.com` |
| App Repartidor (P15) | ✅ Expo dev | `http://localhost:8081` |
| Landing Page (P13) | ✅ Live | `https://www.danheiexpress.com` |

### Credenciales de prueba
- **Admin:** (las que ya tienes en la app web)
- **Piloto:** `piloto@danheiexpress.com` / `Piloto2026!`

### Repos GitHub
- P15: `gallegosdiego/P15-DHE-App-Repartidor-`
- P16: `gallegosdiego/P16-DHE-Admin-Web`

### Último commit P16
- `0c9ea72` — feat: papelera usuarios, renombrar conductor a piloto en todo el admin
