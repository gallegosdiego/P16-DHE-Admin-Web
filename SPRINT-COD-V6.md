# Sprint Cod V6 — Deploy Producción + Fase 4 Optimización

## ⚖️ LEY DE SECUENCIA (PERMANENTE)

**NO EXISTE EL TIEMPO EN ESTE ECOSISTEMA.** Solo existe la secuencia de producción por calidad.

## Meta

Desplegar el ecosistema completo a producción (P16 Admin + API, P14 Portal Cliente, P15 App Repartidor) y ejecutar la Fase 4 del roadmap: automatizaciones, analítica avanzada y hardening final. Este sprint tiene **4 bloques**.

---

## BLOQUE 1: Deploy API + Admin a Producción (cPanel)

### Objetivo
Seguir `docs/DEPLOY-CPANEL.md` ya creado y ejecutar el deploy real.

### Tareas
1. Crear BD MySQL en cPanel (`danheiex_production`, `utf8mb4_unicode_ci`)
2. Configurar subdominio `api.danheiexpress.com` → symlink a `laravel_app/public`
3. Clonar repo P16 en cPanel y configurar deploy automático
4. Configurar `.env` de producción con credenciales reales
5. Ejecutar `php artisan migrate --force` + `ProductionSeeder`
6. Verificar que los 76 endpoints responden correctamente
7. Configurar SSL (Let's Encrypt via cPanel)
8. Deploy frontend P16 a Vercel (o export estático a subdominio `admin.danheiexpress.com`)
9. Smoke test completo: login → dashboard → CRUD → financiero → reportes

### DoD
```
[ ] API respondiendo en https://api.danheiexpress.com
[ ] Admin respondiendo en https://admin.danheiexpress.com
[ ] SSL activo en ambos subdominios
[ ] Login funcional con cuenta superadmin real
[ ] Smoke test 10/10 flujos OK en producción
```

---

## BLOQUE 2: Deploy P14 Portal Cliente

### Tareas
1. Deploy P14 a Vercel o export estático
2. Configurar `NEXT_PUBLIC_API_URL` apuntando a API de producción
3. Subdominio `portal.danheiexpress.com` o `clientes.danheiexpress.com`
4. Crear primer cliente real en producción
5. Smoke test: login → dashboard → envíos → rastreo → finanzas → perfil

### DoD
```
[ ] Portal respondiendo en producción
[ ] Login cliente funcional
[ ] Rastreo público accesible sin auth
```

---

## BLOQUE 3: Publicación P15 App Repartidor

### Tareas
1. Configurar `API_URL` de producción en P15
2. Build con `eas build` para Android (APK para distribución interna)
3. Configurar `app.json` con datos de producción (nombre, ícono, splash)
4. Generar APK firmado
5. Distribuir a conductores vía enlace directo o EAS Update
6. Smoke test en dispositivo real: login → ruta → entrega → COD → novedad

### DoD
```
[ ] APK generado y funcional
[ ] Login conductor funcional contra API producción
[ ] Flujo completo de entrega probado en dispositivo real
```

---

## BLOQUE 4: Fase 4 — Optimización y Automatizaciones

### 4.1 Automatizaciones
- Notificación automática al cliente cuando su envío cambia de estado (webhook o polling)
- Alerta al admin cuando un envío lleva >48h sin movimiento
- Resumen diario automático por email al admin (envíos del día, recaudo, novedades)

### 4.2 Analítica Avanzada
- Dashboard de tendencias semanales/mensuales en P16
- Gráfica de envíos por zona
- Ranking de conductores por rendimiento
- Tasa de éxito de entrega (delivered vs issue+returned)

### 4.3 Integraciones Externas
- WhatsApp Business API para notificaciones al cliente
- Pasarela de pagos para clientes post-venta
- Exportación a Excel/PDF mejorada

### 4.4 Hardening Final
- Rate limiting en todos los endpoints públicos
- Logs de acceso estructurados
- Backups automáticos de BD
- Monitoreo de uptime
- Documentación OpenAPI/Swagger

### DoD
```
[ ] Al menos 2 automatizaciones implementadas
[ ] Dashboard de tendencias funcional
[ ] Hardening de seguridad completo
[ ] Documentación API actualizada
```

---

## Orden de Ejecución

```
1. BLOQUE 1 → Deploy API + Admin (producción)
2. BLOQUE 2 → Deploy Portal Cliente
3. BLOQUE 3 → Publicar App Repartidor
4. BLOQUE 4 → Optimizaciones Fase 4
```
