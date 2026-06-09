# PENDIENTES — Danhei Express Ecosystem
## Última actualización: 9 Junio 2026, 01:36 AM (Bogotá)

---

## PRIORIDAD 1 — Pruebas de Integración P15 ↔ P16

### Login real desde la app móvil
- [ ] Probar login con `piloto@danheiexpress.com` / `Piloto2026!` desde la app en dispositivo Android
- [ ] Verificar que la ruta del día cargue correctamente con datos reales
- [ ] Probar cambio de estado de parada (pendiente → completada)
- [ ] Probar registro de novedad en una parada
- [ ] Probar recaudo COD (contra entrega)
- [ ] Verificar que el logout funcione correctamente y limpie el token

### Crear piloto desde el admin y probar en la app
- [ ] Desde admin.danheiexpress.com → "Nuevo piloto" → crear con email y contraseña
- [ ] Iniciar sesión en la app con las credenciales recién creadas
- [ ] Verificar que el piloto vea solo SUS rutas asignadas

---

## PRIORIDAD 2 — Funcionalidades Pendientes del Admin (P16)

### Usuarios y papelera general
- [ ] Agregar opción de eliminar usuarios (clientes) desde la página de Usuarios
- [ ] Crear papelera general o por sección (usuarios eliminados)
- [ ] Revisar que la papelera de pilotos funcione en producción

### Asignación de rutas
- [ ] Verificar que al crear una ruta y asignar paradas a un piloto, el piloto las vea en la app
- [ ] Probar el flujo completo: crear envío → asignar a ruta → piloto lo ve en la app → entrega → actualiza estado

### Permisos
- [ ] Agregar permiso `drivers.delete` al rol de administrador en la BD de producción
- [ ] Verificar que los roles y permisos de Spatie estén correctos en MySQL (producción)

---

## PRIORIDAD 3 — Deploy Producción Completo

### Backend API (cPanel)
- [ ] Ejecutar `php artisan migrate --force` en producción para crear columna `driver_id` en users
- [ ] Verificar que el endpoint `POST /api/drivers` funcione en producción (crea Driver + User)
- [ ] Verificar endpoints de papelera: `DELETE /drivers/{id}`, `GET /drivers-trashed`, `POST /drivers/{id}/restore`

### App Repartidor (P15) — Build Android
- [ ] Configurar `API_URL` de producción (`https://api.danheiexpress.com/api`)
- [ ] EAS Build: `eas build --platform android --profile production`
- [ ] Generar APK para distribución
- [ ] Probar APK con backend de producción

---

## PRIORIDAD 4 — Polish Visual

### App Repartidor (P15)
- [ ] Verificar legibilidad del tema claro en dispositivo físico Android
- [ ] Ajustar contraste si es necesario (textos grises vs. fondo blanco)
- [ ] Probar en diferentes tamaños de pantalla

### Admin Web (P16)
- [ ] Considerar renombrar la URL `/conductores` a `/pilotos` (requiere cambiar carpeta de Next.js)
- [ ] Actualizar textos financieros de "Costo conductores" a "Costo pilotos" en reportes
- [ ] Verificar que la página de detalle de piloto (`/conductores/[id]`) también diga "Piloto"

---

## PRIORIDAD 5 — Decisiones Pendientes del CEO

- [ ] Implementación de Invoice (facturación formal)
- [ ] Canal de recordatorios para gastos fijos
- [ ] Impresión de guías con QR
- [ ] Configuración de límite COD por repartidor
- [ ] Generación de PDF de factura

---

## Datos Técnicos Rápidos

| Componente | Estado | URL |
|---|---|---|
| API Backend | ✅ Corriendo (dev) | `http://127.0.0.1:8000/api` |
| Admin Panel (P16) | ✅ Vercel (prod) | `https://admin.danheiexpress.com` |
| App Repartidor (P15) | ✅ Expo dev | `http://localhost:8081` |
| Landing Page (P13) | ✅ Live | `https://www.danheiexpress.com` |

### Credenciales de prueba
- **Admin:** (las que ya tienes en la app web)
- **Piloto:** `piloto@danheiexpress.com` / `Piloto2026!`

### Repos GitHub
- P15: `gallegosdiego/P15-DHE-App-Repartidor-`
- P16: `gallegosdiego/P16-DHE-Admin-Web`
