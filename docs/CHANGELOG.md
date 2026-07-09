# Changelog

All notable changes are documented in this file.

## 2026-07-09 - Alertas documentales proactivas en pilotos

### Added
- el listado `Pilotos` del panel admin ahora muestra una franja superior de priorización documental.
- esa franja concentra primero a los pilotos con más riesgo operativo usando el peso:
  - documentos vencidos,
  - documentos faltantes,
  - y documentos por vencer.
- cada tarjeta enlaza directo al expediente detallado del piloto para acelerar revisión y corrección.

### Quality
- backlog maestro actualizado para dejar explícito que el siguiente cierre real es QA funcional y luego hardening de auth/deploy.

## 2026-07-09 - Monitor de rutas móvil más legible

### Changed
- el módulo `Rutas` del panel admin ahora prioriza en móvil:
  - piloto,
  - último ping,
  - parada actual,
  - siguiente parada,
  - y mapa operativo.
- la información secundaria del monitor (`tracking`, `secuencia pendiente`, `línea operativa`) ahora se despliega en bloques compactos dentro de móvil en lugar de saturar la pantalla completa.
- en escritorio se conserva la vista rica con columna lateral de monitoreo y detalle operativo.

### Quality
- validación frontend en verde tras el ajuste:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`

## 2026-07-08 - Constructor guiado de direcciones para pedidos

### Added
- nuevo flujo de captura de direcciones en `Pedidos > Nuevo pedido` con modo guiado y modo manual de respaldo.
- el modo guiado separa la dirección en componentes logísticos:
  - tipo de vía,
  - número de vía,
  - cruce,
  - número final,
  - complemento,
  - barrio,
  - referencia.
- nueva columna `recipient_address_meta` para guardar la estructura de la dirección sin romper compatibilidad con `recipient_address`.

### Changed
- el backend ahora recompone `recipient_address` desde el constructor guiado cuando llegan campos estructurados.
- la geolocalización ya no intenta aproximar coordenadas para direcciones demasiado débiles; solo usa fallback contextual cuando la dirección tiene suficiente señal operativa.
- el detalle del pedido en admin ahora muestra complemento, barrio y referencia cuando existen.

### Quality
- nuevas regresiones backend para creación/actualización con dirección estructurada.
- compatibilidad conservada con la app del piloto y con endpoints existentes porque el contrato principal sigue siendo `recipient_address`.

## 2026-07-08 - Fallback geo robusto para rutas del piloto

### Fixed
- la reparacion de geodatos de pedidos ya no depende solo de Google/Nominatim o de que la zona tenga centroides cargados.
- cuando un pedido sigue sin coordenadas, el backend ahora intenta:
  - reutilizar centroides historicos de pedidos previos en la misma zona y ciudad;
  - si no existen, reutilizar centroides historicos por zona o por ciudad;
  - y como ultimo recurso, usar anclas conocidas de zonas/ciudades operativas con offset deterministico por direccion.
- con esto `GET /api/driver/my-route`, `GET /api/driver/operational-state` y `shipments:geocode-missing` dejan de quedarse bloqueados en muchos casos `Geo pendiente` aunque el pedido tenga direccion util.

### Quality
- el servicio de geodata ahora respeta esquemas heredados donde `shipments` todavia no trae columnas opcionales de coordenadas, evitando romper endpoints legacy o tests de compatibilidad.
- nuevas regresiones cubren:
  - reparacion masiva cuando el proveedor no devuelve coincidencia;
  - autorreparacion de coordenadas al abrir `my-route` del piloto;
  - compatibilidad con escenarios de columnas opcionales faltantes.

## 2026-07-05 - Hotfix CI y respuestas HTTP controladas

### Fixed
- el backend ahora conserva correctamente los estados HTTP controlados (`403`, `404`, `405`, `422`, etc.) cuando el API lanza `abort(...)` o excepciones HTTP framework-level, evitando convertir errores esperados en `500`.
- con esto vuelve a pasar `ClientPortalTest` y se corrige la causa raiz del fallo reciente en `backend-ci`.
- el login del panel admin ya no depende exclusivamente de que `NEXT_PUBLIC_API_URL` venga inyectada en el build; en dominios `*.danheiexpress.com` ahora cae de forma segura a `https://api.danheiexpress.com/api` y evita volver a usar `127.0.0.1` en produccion.
- la geolocalizacion de pedidos ahora es mas robusta cuando la direccion exacta no resuelve:
  - intenta fallback por nombre de zona aunque la zona no exista en el catalogo;
  - si eso falla, intenta fallback por centro de ciudad;
  - con esto se reduce el estado `Geo pendiente` para localidades como `Bosa` aun cuando no esten sembradas como zona formal.

### Changed
- los workflows de GitHub Actions fueron actualizados a acciones actuales para reducir advertencias de runtime obsoleto:
  - `actions/checkout@v7`
  - `actions/setup-node@v6`
  - `actions/cache@v5`
- se agregan permisos explicitos `contents: read` en los jobs de CI para endurecer el minimo acceso necesario.
- `frontend-ci` ahora solo se dispara cuando cambian archivos de `frontend/**` o su propio workflow, y cancela ejecuciones anteriores en la misma rama para evitar runs redundantes.

## 2026-07-04 - Cierre atomico de paradas movil-admin

### Fixed
- la conexion entre P15 y P16 ya no depende exclusivamente de dos requests separados para cerrar una entrega o novedad.
- nuevo contrato `POST /api/routes/{route}/stops/{stop}/resolve` para resolver en una sola operacion:
  - estado del envio,
  - evidencia,
  - recaudo COD,
  - y cierre de parada.
- si el envio ya habia quedado `delivered` o `issue` por un intento previo, el backend ahora puede cerrar la parada pendiente sin reventar por transicion repetida.

### Quality
- nuevas regresiones backend para entrega atomica COD con evidencia y para reintento tras corte parcial.
- la app piloto usa `resolve` como camino principal y mantiene fallback legacy a `POST /shipments/{id}/status` + `POST /routes/{route}/stops/{stop}/complete`.
- documento operativo: `docs/updates/ITERACION-59-CIERRE-ATOMICO-PARADAS-2026-07-04.md`.

## 2026-07-04 - Alta de pilotos mas robusta

### Fixed
- `POST /api/drivers` ya no cae por `500` cuando el formulario llega sin telefono o cuando `daily_rate` no se envia desde la UI.
- el backend ahora valida el telefono del piloto antes de persistir y normaliza `daily_rate` a `0` cuando no llega informado.
- el formulario web de `Pilotos` exige telefono para no dejar que la UI envíe un payload incompatible con la base.

### Quality
- nuevas regresiones para alta exitosa de piloto con acceso movil y para rechazo limpio cuando falta telefono.
- documento operativo: `docs/updates/ITERACION-58-ALTA-PILOTOS-VALIDACION-2026-07-04.md`.
## 2026-07-04 - Rutas admin mas usables en movil

### Changed
- el modulo `rutas` del panel administrativo ahora prioriza en celular el selector horizontal de pilotos activos antes del detalle, evitando perder contexto al cambiar de monitoreo.
- cada carril (`Planificada`, `Activa`, `Completada`) ahora muestra una descripcion operativa corta y un contador visible para lectura rapida desde pantalla pequena.
- las cards de rutas en movil ahora exponen acciones grandes (`Ver detalles`, `Abrir monitor`, `Iniciar ruta`) sin depender del layout de escritorio.

### Quality
- se alinea `docs/GUIA-MOVIL-ADAPTATIVA-MAESTRA.md` con una regla especifica para monitoreo de rutas en celular.
- documento operativo: `docs/updates/ITERACION-57-RUTAS-MOVIL-ADMIN-2026-07-04.md`.

## 2026-07-04 - Geodata repair y monitoreo admin reforzado

### Added
- nuevo endpoint `POST /api/shipments/repair-geodata` para reintentar coordenadas de pedidos concretos desde operación.

### Changed
- el modulo admin de pedidos ahora permite reintentar geocodificación visible/seleccionada.
- el monitor admin de rutas ahora expone nivel de atención y línea operativa legible.

### Quality
- nueva regresión backend para reparación manual de geodatos;
- documento operativo: `docs/updates/ITERACION-56-GEODATA-REPAIR-Y-MONITOR-ADMIN-2026-07-04.md`.

## 2026-07-04 - Reconciliacion de rutas abiertas sin pendientes

### Fixed
- `GET /api/driver/operational-state` ya no expone rutas activas o planificadas vacias cuando la jornada del piloto ya no tiene pendientes reales.
- `GET /api/driver/my-route` aplica la misma reconciliacion para que el fallback legacy no reviva rutas fantasma.
- las rutas del dia se autocorrigen si sus contadores quedaron desalineados frente a `route_stops`.

### Quality
- nuevas regresiones para cierre implicito de jornada y limpieza de rutas abiertas vacias;
- documento operativo: `docs/updates/ITERACION-55-RECONCILIACION-RUTAS-DIA-2026-07-04.md`.

## 2026-07-04 - Robustecimiento transversal de comunicación API

### Changed
- El backend normaliza errores del API con `message`, `code`, `retryable` y `errors` para que panel y app móvil no dependan de excepciones crudas o respuestas ambiguas.
- El cliente API del panel ahora tolera timeouts, respuestas HTML/no JSON y fallos transitorios de red con mejor parseo y retry controlado en `GET`.
- La sesión del panel se cierra de forma coherente cuando el API emite `401` global.

### Quality
- Documento operativo: `docs/updates/ITERACION-54-COMUNICACION-ROBUSTA-API-CLIENTES-2026-07-04.md`.

## 2026-07-04 - Hotfix reintento de entrega movil

### Fixed
- `POST /api/shipments/{id}/status` ahora es idempotente cuando la app reintenta cerrar una entrega ya marcada como `delivered`.
- Se evita el error `Transicion no permitida: Entregado -> Entregado` cuando el primer cambio de estado ya habia quedado persistido y el piloto vuelve a confirmar la entrega.
- `POST /api/routes/{route}/stops/{stop}/complete` ahora responde OK si la parada ya habia quedado completada en un intento anterior.

### Quality
- Nuevas regresiones para reintento movil de entrega COD y reintento de cierre de parada.

## 2026-07-04 - Reparadores cPanel para documentos de piloto e indice de continuidad

### Fixed
- El deploy manual de cPanel ahora repara tambien el esquema documental de pilotos cuando produccion todavia no ha corrido las migraciones de fotos y vencimientos.
- El deploy manual de cPanel ahora corrige el indice heredado `driver_id + route_date` en `routes`, evitando que produccion quede atrasada frente al soporte actual de continuidad y reapertura de rutas del mismo dia.

### Quality
- `/api/deploy-check` queda cubierto con regresion para `driver_document_ready`, `driver_document_expiry_ready` y `route_day_index_optimized`.
- Documentacion operativa de cPanel actualizada con los nuevos reparadores idempotentes.
- Documento operativo: `docs/updates/ITERACION-53-CPANEL-RUNTIME-REPAIRS-2026-07-04.md`.

## 2026-07-04 - Hotfix entrega legacy y soporte QA web para app piloto

### Changed
- La documentacion operativa de la app piloto queda alineada con la nueva APK `4.2.13`.
- El flujo de QA ahora contempla fallback web seguro para `react-native-maps`, sin afectar la build Android nativa.

### Fixed
- `POST /api/shipments/{id}/status` ya no cae por evidencia opcional o etiquetas legacy cuando produccion conserva columnas moviles antiguas.
- El backend solo persiste `evidence_photo` y `evidence_receiver_name` si esas columnas existen realmente en la base activa.
- El cierre movil normaliza etiquetas heredadas de estado, pago y recaudo antes de persistir la entrega.

### Quality
- Nueva regresion backend para entrega `cash_on_delivery` legacy con foto de evidencia.
- Validado con `php artisan test --filter=\"ScopedEndpointTest|RouteTest\"`.
- Documento operativo: `docs/updates/ITERACION-52-DELIVERY-EVIDENCE-LEGACY-2026-07-04.md`.
- `frontend/playwright.config.ts` ahora puede autoarrancar el servidor tambien fuera de CI, evitando falsos `Cannot GET /zonas` en validaciones E2E locales.

## 2026-07-02 - Monitoreo admin, geodata y cierre de ruta movil

### Added
- Nuevo documento de reorganizacion operativa del modulo de rutas: `docs/updates/ITERACION-24-MONITOREO-RUTAS-ADMIN-2026-07-02.md`.
- Nueva prueba backend para finalizar una ruta activa sin entregas completadas y devolver los paquetes pendientes a la bandeja del piloto.

### Changed
- La pantalla `frontend/src/app/(admin)/rutas/page.tsx` ahora separa el **Centro de monitoreo activo** del tablero por estados.
- El monitoreo activo prioriza piloto/ruta viva, mapa, trazo, parada actual, siguiente parada, salud geo y frescura de tracking.
- La documentacion operativa de geocodificacion y deploy manual fue ajustada para reflejar el runtime real ya trabajado hoy.

### Fixed
- La app piloto endurece el flujo de `POST /api/routes/{route}/finalize`:
  - normaliza errores de red crudos como `Network request failed`;
  - evita ruido visual si el refresh posterior falla de forma transitoria;
  - mantiene el retorno de pendientes a la bandeja del piloto.

### Quality
- Validado en frontend admin con `npm run typecheck` y `eslint` focalizado sobre `frontend/src/app/(admin)/rutas/page.tsx`.
- Validado en backend con `php artisan test --filter=ScopedEndpointTest`.
- Validado en app piloto con `npx tsc --noEmit` y build Android local de la APK `4.2.10`.

---

## 2026-06-30 - Hotfix smart-route con ruta completada el mismo dia

### Fixed
- `POST /api/driver/smart-route` ya no falla cuando el piloto ya completo su ruta del dia y luego recibe un paquete nuevo.
- Si existe una ruta del mismo `driver_id` y `route_date` en `completed`, el backend la reabre y agrega la nueva parada en lugar de intentar crear una segunda ruta.

### Quality
- Agregada regresion para el caso "ruta completada + nuevo paquete el mismo dia".
- Documento operativo: `docs/updates/HOTFIX-SMART-ROUTE-RUTA-COMPLETADA-2026-06-30.md`.

---

## 2026-06-30 - Hotfix endpoints piloto con columnas opcionales

### Fixed
- `GET /api/driver/my-route` y `GET /api/driver/assigned-shipments` ya no fallan si producción no tiene columnas móviles opcionales como `intake_photo`, `recipient_lat` o `recipient_lng`.
- El payload del piloto conserva esas claves con valor `null` cuando la columna no existe, manteniendo compatibilidad con la app móvil.

### Observability
- `/api/deploy-check` ahora reporta `database.driver_mobile_optional_columns` para diagnosticar columnas auxiliares usadas por la app piloto.
- Documento operativo: `docs/updates/HOTFIX-PILOTO-ENDPOINTS-COLUMNAS-OPCIONALES-2026-06-30.md`.

---

## 2026-06-30 - Hotfix entrega COD desde app piloto

### Fixed
- `POST /api/shipments/{id}/status` ya no falla con error `500` cuando la app piloto intenta entregar un pedido COD que todavía está en `assigned_to_route`.
- El backend normaliza el cierre móvil aplicando primero `assigned_to_route -> in_transit` y luego `in_transit -> delivered`, conservando el flujo auditado de estados.
- La entrega COD mantiene `cod_collected_amount`, `cod_payment_method`, `cod_collected_at` y el cierre financiero en `collected`.

### Quality
- Agregada regresión para entrega COD directa desde ruta asignada.
- Validado con suite completa backend: `215` pruebas y `758` aserciones.
- Documento operativo: `docs/updates/HOTFIX-ENTREGA-COD-ASSIGNED-ROUTE-2026-06-30.md`.

---

## 2026-06-25 - Retiro de automatismos cPanel

### Changed
- `.cpanel.yml` queda limitado al deploy manual de cPanel: copia archivos `api/` hacia `/home/danheiex/api.danheiexpress.com/` y ejecuta solo el parche COD idempotente.
- Se retiro el workflow `deploy-api` de GitHub Actions para evitar intentos automaticos de deploy a cPanel.
- Agregado `api/scripts/repair-cod-schema.php` para crear unicamente las columnas COD faltantes durante `Desplegar commit HEAD`.

### Removed
- Eliminado `api/deploy-fix.php`.
- Eliminado el comando temporal `dhe:repair-cod-schema`.
- El deploy de cPanel ya no ejecuta `composer`, `artisan`, migraciones generales, caches ni seeders.

---

## 2026-06-25 - Recaudo COD desde app piloto

### Added
- Nueva migracion para registrar recaudo real de contra entrega:
  - `cod_collected_amount`
  - `cod_payment_method`
  - `cod_collected_at`
- `POST /api/shipments/{id}/status` ahora acepta monto y metodo COD cuando el piloto entrega un envio `cash_on_delivery`.
- `GET /api/driver/my-route` retorna campos de recaudo COD para que la app movil pueda mostrar lo cobrado.

### Changed
- El flujo movil de piloto debe registrar COD durante la entrega, no mediante `/api/financial/shipments/{id}/collect`.
- Si un pedido COD fue creado con `cod_amount = 0` y el piloto ingresa un monto real, el backend actualiza tambien `cod_amount` para mantener compatibilidad con reportes financieros existentes.
- `completeStop()` conserva el comportamiento de marcar COD como recaudado cuando una parada se completa directamente.

### Quality
- Validado con PHP lint en controladores/modelo/migracion modificados.
- Validado con:
  - `php artisan test --do-not-cache-result --filter=ScopedEndpointTest`
  - `php artisan test --do-not-cache-result --filter=FinancialTest`
  - `php artisan test --do-not-cache-result --filter=FinancialEdgeCaseTest`
  - `php artisan test --do-not-cache-result --filter=RouteTest`

### Hotfix post-deploy
- `/api/driver/my-route` ya no selecciona `financial_status` para el payload movil, evitando fallos por datos heredados como `pending_collection` o `none`.
- `/api/driver/my-route` selecciona los campos nuevos COD solo si la base ya tiene esas columnas.
- Las escrituras COD verifican si las columnas nuevas existen antes de usarlas; si no existen, no tumban la entrega/ruta.
- `/api/deploy-check` ahora expone `database.cod_collection_ready` para confirmar si la migracion COD quedo aplicada.

---

## 2026-06-21 - Contrato de auditoría y filtros reales

### Changed
- `/api/audit-logs` ahora filtra en backend por `search`, `action`, `user_id`, `date_from` y `date_to`.
- El endpoint ordena por `occurred_at` y limita `per_page` a un máximo de `100`.
- La vista `/auditoria` envía filtros al API en vez de filtrar únicamente la página cargada.
- El inspector de auditoría muestra `old_values/new_values`, que son los campos reales de la tabla `audit_logs`.

### Fixed
- `AuditLog::log()` ya no guarda `old_values/new_values` con `json_encode`; deja que los casts JSON de Laravel persistan arrays reales.
- El mock E2E de auditoría fue alineado con el contrato real del backend.
- La ruta temporal `/drivers/debug-juan` quedó limitada a entornos `local` y `testing`, fuera de producción.

### Quality
- Agregada prueba backend para filtros de `/api/audit-logs` y exposición de cambios JSON.
- Validado en `dev` con PHP lint, PHPUnit focalizado, TypeScript, ESLint y regression E2E de auditoría.
- Estado de despliegue: commit subido a `origin/dev`; `main` no fue modificado.

---

## 2026-06-19 — Eliminación de pedidos + Monitor de rutas

### Backend
- `ShipmentController::destroy()` — Hard delete con protección financiera (bloquea si `settlement_id` o `payout_id` existen)
- `ShipmentController::batchDestroy()` — Nuevo endpoint `POST /shipments/batch-delete` para eliminación masiva (máx 50)
- Ruta registrada con middleware `permission:shipments.delete`
- CASCADE elimina automáticamente `shipment_events` y `route_stops`; se recalculan métricas de ruta

### Frontend Panel Admin
- **Pedidos:** Botón rojo "Eliminar" en barra de acciones batch con confirmación y feedback de envíos omitidos por liquidación financiera
- **Rutas:** Simplificado a "Monitor de Rutas" — eliminada sidebar de pedidos por enrutar y creación de rutas; Kanban a ancho completo con auto-refresh 30s

### Documentación
- Nuevo documento canónico: `docs/arquitectura/flujo-pedidos-rutas.md` v2.0
- Actualizado `docs/arquitectura/plataforma-general.md` a v1.3 con referencia cruzada

---

## 2026-06-17

### Added
- Closeout documentation for the pilots module review, app access persistence, and Danhei/Angel visual line:
  - `docs/updates/PILOTOS-REVISION-CIERRE-2026-06-17.md`

### Changed
- Pilots module now shows app email consistently in cards, detail modal, and detail page.
- Pilot app access updates support legacy driver/user links.
- Driver app role assignment is normalized for `web` and `sanctum` guards.
- Admin icons in pilots, users, and payments were aligned to the Danhei/Angel visual language with sober SVG/status indicators instead of visible emojis.

### Fixed
- Pilot app access can be persisted from production form posts using `POST /api/drivers/{driver}` fallback with `_method=PUT`.
- Pilot edit errors now surface the backend message instead of a generic failure.
- Pilot delete now supports `POST /api/drivers/{driver}/delete` for production servers that block direct `DELETE` requests.
- Production seed permissions now include `drivers.delete` and explicitly sync full permissions for `superadmin`.
- Pilot edits now repair legacy user links by syncing `users.driver_id` when only `drivers.user_id` existed.

---

## 2026-06-09

### Added
- Renamed 'Conductor' to 'Piloto' across entire admin (sidebar, pages, modals, forms, reports, command palette)
- Soft delete (trash) for Users with restore functionality
- Soft delete (trash) for Drivers/Pilotos with restore functionality
- Delete button in data tables and edit modals
- Confirmation modal before deletion
- Permission `drivers.delete` added to seeder
- Migration: `soft_deletes` column on users table
- User model: `SoftDeletes` trait
- UserController: destroy, trashed, restore methods
- API routes: DELETE, trashed, restore for users and drivers
- `apiSend` helper supports DELETE method
- CI: permission seeder added to automatic cPanel deploy

### Changed
- Labels visible on all forms (pilots + users)
- Driver creation now includes email + password for app access

---

## 2026-05-20

### Added
- Complete Financial Module (Phase A):
  - Fixed expenses management (CRUD)
  - Employee/payroll management
  - Driver payouts tracking
  - COD settlement and conciliation
  - Daily profit calculator
  - Financial dashboard with KPIs
- MySQL hardening audit
- NPM security: `.npmrc` with `ignore-scripts=true`
- PostCSS vulnerability fix (CVE-2026-41305)

### Changed
- Backend tests expanded from ~118 to 179 tests / 624 assertions
- API endpoints expanded from ~76 to 116 routes

---

## 2026-05-13

### Added
- New admin modules and routes:
  - `/usuarios` (CRUD + roles integration)
  - `/auditoria` (audit log view with filters and change inspection)
  - `/metricas` (operational KPI dashboard)
- E2E smoke suite with Playwright:
  - login
  - dashboard
  - usuarios + reportes
  - command palette
- E2E regression suite with Playwright:
  - conductores board/detail
  - auditoria filters + audit change JSON
  - pagos sections
  - configuracion sections
- Delivery docs:
  - guided demo
  - operations playbook
  - E2E runbook
  - module closeout report

### Changed
- Dashboard:
  - auto-refresh + real API-based blocks
  - improved action flows and status UX
- Reportes:
  - backend-powered CSV export endpoints
  - date-range filters wired to stats and exports
- Conductores:
  - stronger detail flow (`/conductores/[id]`)
  - improved assignment flow + UI robustness
  - dark mode hardening
- Auditoria:
  - action/user/date filters
  - `old_values/new_values` JSON expand/collapse
- Technical hardening:
  - offline banner made SSR/hydration-safe
  - external font dependency removed to guarantee offline build stability
  - fixed backend audit route request typing (`/api/audit-logs`) to prevent 500 in real UAT
  - `.gitignore` updated for Playwright artifacts

### Quality
- Frontend checks passing:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- CI workflow added:
  - `.github/workflows/frontend-ci.yml`
  - includes lint, typecheck, build, playwright smoke
- Staging/UAT and operational docs:
  - `docs/operations/STAGING-UAT-CHECKLIST.md`
  - `docs/operations/OBSERVABILITY-RUNBOOK.md`
  - `docs/security/PERMISSION-VERIFICATION-MATRIX.md`
