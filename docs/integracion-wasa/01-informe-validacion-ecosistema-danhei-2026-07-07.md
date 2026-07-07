# Informe De Validacion Del Ecosistema Danhei

Fecha de corte: 7 de julio de 2026

## 1. Resumen ejecutivo

El ecosistema Danhei esta operativo en su nucleo principal y la arquitectura general es coherente:

- `P13` expone la cara publica y el rastreo.
- `P14` cubre el autoservicio del cliente.
- `P15` resuelve la operacion del piloto en movilidad.
- `P16/frontend` centraliza administracion, monitoreo y finanzas.
- `P16/api` es el backend comun para web, movil y tracking publico.

La evidencia local y productiva confirma que:

- `www.danheiexpress.com` responde `200`.
- `portal.danheiexpress.com` responde `200` en `/login`.
- `admin.danheiexpress.com` responde `200` en `/login`.
- `api.danheiexpress.com/api/health` responde `200`.
- `api.danheiexpress.com/api/deploy-check` responde `200` y reporta `status=ok`, `total_routes=141`, `runtime_blockers=[]`.

El sistema si funciona como plataforma integrada, pero tiene cuatro focos de mejora importantes:

1. El rastreo publico de `P13` quedo desalineado del contrato real del API.
2. El smoke local del admin no esta completamente estable en `next dev`.
3. La seguridad HTTP del API productivo no refleja el hardening definido en la documentacion.
4. La observabilidad y la documentacion de versiones estan algo por detras del estado real del sistema.

## 2. Inventario funcional

### P13 - Landing publica

Funcion:

- Marketing, captacion y confianza comercial.
- Publicacion de servicios, cobertura, legales y contacto.
- Rastreo publico por guia.

Estado validado:

- Sitio publico en linea y respondiendo `200`.
- Arquitectura estatica simple y de bajo costo operativo.
- Integra con el API publico para tracking.

### P14 - Portal cliente

Funcion:

- Login de cliente.
- Dashboard de actividad.
- Consulta de envios.
- Creacion de envios.
- Vista financiera.
- Perfil y direcciones.
- Rastreo publico desde la misma app.

Estado validado:

- `npm run build` exitoso.
- Dominio productivo responde `200` en `/login`.
- Consume `Bearer token` contra la API comun.

### P15 - App repartidor

Funcion:

- Login del piloto.
- Estado operativo unificado del dia.
- Ruta activa, pedidos asignados y jornada.
- Tracking en foreground y background.
- Entrega con evidencia y COD.
- Historial y expediente documental.

Estado validado:

- `npx tsc --noEmit --incremental false` exitoso.
- Hay evidencia de APKs generados hasta `4.2.18` en `dist/` y `android/app/build/outputs/apk/release/`.
- El README sigue declarando `4.2.13`, pero `package.json` ya va en `4.2.18`.
- La propia documentacion sigue marcando pendiente el QA completo en dispositivo fisico.

### P16 - Admin web

Funcion:

- Dashboard operativo.
- Gestion de pedidos, rutas, clientes, pilotos y usuarios.
- Monitoreo vivo de rutas.
- Finanzas, COD, gastos, nomina y reportes.
- Auditoria y configuracion.

Estado validado:

- `npm run lint` exitoso.
- `npm run typecheck` exitoso.
- `npm run build` fue exitoso antes de ejecutar smoke E2E local.
- Dominio productivo responde `200` en `/login`.
- Smoke Playwright: `3/4` pruebas pasan; falla la navegacion a `/usuarios` en modo local `next dev`.

### P16 - API Laravel

Funcion:

- Auth unificada.
- RBAC y scopes por tipo de usuario.
- Dominio operativo de envios, rutas y pilotos.
- Geocodificacion, optimizacion y tracking vivo.
- Portal cliente.
- Finanzas, COD, pagos y reportes.
- Tracking publico.

Estado validado:

- `php artisan test tests/Feature/AuthTest.php tests/Feature/ClientPortalTest.php tests/Feature/RouteTest.php tests/Feature/FinancialTest.php` paso con `51` pruebas y `208` aserciones.
- `api/health` productivo responde `200`.
- `api/deploy-check` productivo reporta esquema y rutas criticas presentes.
- La corrida completa de `php artisan test` no alcanzo a terminar dentro de `244s`, por lo que la suite total necesita mas tiempo o particionarse en CI.

## 3. Arquitectura actual y relaciones

### Flujo principal

`P13/P14/P15/P16 frontend -> P16 API -> MySQL + storage`

### Relacion entre componentes

- `P13` usa la API publica para rastreo y deriva leads a WhatsApp.
- `P14` usa la API autenticada para dashboard, envios, perfil y finanzas del cliente.
- `P15` usa la API autenticada del piloto y depende fuertemente de `driver/operational-state`, rutas y tracking.
- `P16/frontend` usa la misma API para operar toda la empresa.
- `P16/api` es el centro de gravedad del ecosistema: autentica, aplica permisos, persiste datos y expone contratos para web y movil.

### Capas tecnicas

- Capa publica: `P13`
- Capa cliente B2B/B2C: `P14`
- Capa operativa movil: `P15`
- Capa administrativa y financiera: `P16/frontend`
- Capa de dominio y datos: `P16/api`

## 4. Infraestructura y ambientes

### Produccion observada

- `P13`: cPanel / hosting estatico.
- `P14`: Vercel.
- `P16/frontend`: Vercel.
- `P16/api`: cPanel + LiteSpeed.
- Base de datos productiva: MySQL.

### Desarrollo y QA local

- `P14` y `P16/frontend`: Next.js 16 + React 19.
- `P15`: Expo / React Native.
- `P16/api`: Laravel 13 + PHP 8.3.
- Pruebas backend: SQLite en memoria segun `phpunit.xml`.

### Variables y runtime

- Web: `NEXT_PUBLIC_API_URL`
- Movil: `EXPO_PUBLIC_API_BASE_URL`
- API: `APP_*`, `DB_*`, `CORS_ALLOWED_ORIGINS`, `GOOGLE_MAPS_API_KEY` opcional

## 5. Evidencia de validacion

### Validacion productiva real

- `https://www.danheiexpress.com/` -> `200 OK`
- `https://portal.danheiexpress.com/login` -> `200 OK`
- `https://admin.danheiexpress.com/login` -> `200 OK`
- `https://api.danheiexpress.com/api/health` -> `200 OK`
- `https://api.danheiexpress.com/api/deploy-check` -> `200 OK`

### Validacion local

- `P14`: build OK
- `P15`: typecheck OK
- `P16/frontend`: lint OK, typecheck OK, build OK inicialmente
- `P16/frontend`: smoke E2E parcial, `3/4`
- `P16/api`: pruebas representativas OK

## 6. Hallazgos clave

### Hallazgo 1 - Rastreo publico desalineado entre P13 y API

Severidad: alta

Evidencia:

- `P13` espera una respuesta plana en [tracking.html](D:\DHE dev\P13-DHE-Landing-Page-\tracking.html:323) y usa `s.status`, `s.events`, `s.recipient_address` en [tracking.html](D:\DHE dev\P13-DHE-Landing-Page-\tracking.html:374).
- La API real devuelve `{ found, shipment, timeline }` en [TrackingController.php](../../api/app/Http/Controllers/Api/TrackingController.php).

Impacto:

- El tracking publico puede fallar o renderizar datos incompletos cuando la API devuelve un envio real.
- Es un problema de integracion cruzada entre la capa publica y el backend.

### Hallazgo 2 - Inestabilidad del admin local en `next dev`

Severidad: media-alta

Evidencia:

- El smoke Playwright falla al entrar a `/usuarios` con `404`.
- Luego del smoke, `next build` empezo a fallar por corrupcion en `.next/dev/types/routes.d.ts`, mientras `.next/types/routes.d.ts` mantiene el mapa correcto de rutas.

Lectura tecnica:

- Esto parece mas un problema de artefactos/caching dev de Next 16 en Windows que un fallo claro del codigo de `src/app/(admin)/usuarios/page.tsx`.
- Aun asi, afecta la confiabilidad de QA local y de CI si se reciclan caches.

### Hallazgo 3 - Hardening HTTP incompleto en el API productivo

Severidad: alta

Evidencia productiva:

- `portal` y `admin` si exponen `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS` y `CSP`.
- `api.danheiexpress.com/api/health` no expone `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS` ni `CSP`.

Impacto:

- La documentacion de hardening no esta reflejada de forma consistente en la capa API.
- Hay brecha entre arquitectura de seguridad declarada e implementacion real.

### Hallazgo 4 - CSP productiva web todavia permite `127.0.0.1`

Severidad: media

Evidencia:

- El `connect-src` productivo del admin incluye `http://127.0.0.1:8000` en [frontend/vercel.json](../../frontend/vercel.json).

Impacto:

- No rompe la plataforma, pero deja politica de seguridad mas permisiva de lo necesario en produccion.

### Hallazgo 5 - Geocodificacion productiva sin Google Maps

Severidad: media

Evidencia productiva:

- `api/deploy-check` reporta `google_maps_geocoding_configured=false`.
- La plataforma opera con `shipment_geocoding_provider=nominatim_fallback`.

Impacto:

- La operacion sigue funcionando, pero con menor precision potencial y mayor dependencia de fallback.
- Esto afecta especialmente `P15` y `P16/rutas`.

### Hallazgo 6 - Optimizacion de indice de rutas pendiente

Severidad: media

Evidencia productiva:

- `api/deploy-check` reporta `route_day_index_optimized=false`.
- El estado expone aun el indice unico `routes_driver_id_route_date_unique`.

Impacto:

- La continuidad del dia esta resuelta por logica de aplicacion, pero el modelo de datos todavia no quedo plenamente optimizado para ese caso.
- Es deuda tecnica en el corazon operativo de `P15` y `P16`.

### Hallazgo 7 - Versionado y documentacion desalineados

Severidad: media

Evidencia:

- El README de `P15` sigue en `4.2.13` en [README.md](D:\DHE dev\P15-DHE-App-Repartidor\README.md:5).
- El `package.json` ya reporta `4.2.18` en [package.json](D:\DHE dev\P15-DHE-App-Repartidor\package.json:3).

Impacto:

- Complica soporte, QA y cierre de cambios.
- Dificulta saber que APK, contrato y release estan realmente vigentes.

## 7. Conclusiones por ambiente

### Produccion

- La plataforma esta publicada y responde.
- La API productiva esta viva y con chequeo interno positivo.
- El ecosistema no esta caido; esta operacional.

### Desarrollo

- La base local es usable y en general compila.
- El frontend admin necesita estabilizar su ciclo de smoke/cache.

### QA

- Backend con buena cobertura representativa.
- Frontend admin con smoke parcial.
- Movil con evidencia de build, pero todavia sin UAT fisico cerrado.

## 8. Prioridades de mejora

### Prioridad 1 - Corregir integracion de tracking publico

- Alinear `P13/tracking.html` con el contrato actual del API.
- O exponer respuesta backward-compatible desde `TrackingController`.

### Prioridad 2 - Endurecer seguridad productiva del API

- Aplicar headers HTTP al dominio `api`.
- Verificar HSTS, XFO, XCTO, Referrer-Policy y CSP desde cPanel/LiteSpeed.

### Prioridad 3 - Estabilizar QA del admin

- Limpiar estrategia de cache `.next/dev`.
- Ejecutar Playwright en `next start` o limpiar `.next` antes de correr smoke.
- Confirmar por que `/usuarios` cae a `404` en dev aunque la ruta existe en build.

### Prioridad 4 - Cerrar brechas de geodatos y rutas

- Decidir si Google Maps sera opcional permanente o si se activara en produccion.
- Resolver la optimizacion del indice de rutas por jornada.

### Prioridad 5 - Cerrar gobernanza de versiones

- Sincronizar `README`, changelog, APK vigente y docs de QA.
- Publicar una matriz maestra de versiones por modulo.

## 9. Recomendacion arquitectonica

Arquitectura recomendada a conservar:

- `P13` como borde publico y SEO.
- `P14` como portal autenticado de cliente.
- `P15` como canal operativo movil.
- `P16/frontend` como cockpit administrativo.
- `P16/api` como backend unico y dominio comun.

Arquitectura recomendada a reforzar:

- Contratos API versionados o al menos documentados con compatibilidad.
- Observabilidad de integraciones entre `P13`, `P14`, `P15` y `P16`.
- CI separado por modulo: `portal`, `admin`, `api`, `movil`.
- Runbooks de release con version unica por entrega.

## 10. Veredicto final

Danhei ya tiene una arquitectura real de plataforma, no de prototipos aislados. El backend comun, el portal, la app movil y el panel administrativo estan efectivamente conectados y con evidencia de operacion. El siguiente salto no es rehacer el ecosistema, sino endurecer integracion, seguridad, QA automatizado y disciplina de release para convertir una operacion funcional en una operacion confiable y escalable.
