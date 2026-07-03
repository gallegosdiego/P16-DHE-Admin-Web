# Iteracion 28 - historial, geodatos y monitoreo coherente

Fecha: 2026-07-03

## Objetivo

Consolidar la coherencia entre backend, panel administrativo y app piloto en tres frentes:

1. historial operativo del piloto;
2. geodatos utilizables para mapa y trazado de ruta;
3. monitoreo admin con semantica correcta de pendientes vs novedades.

## Backend

### Historial operativo

- Se fortalece el servicio `DriverHistoryService` para resumir historial sin hidratar innecesariamente toda la jornada.
- Se exponen endpoints y estructuras para que admin y piloto consulten jornadas anteriores y paquetes trabajados.

### Geodatos

- `GeocodingService` ahora intenta primero:
  - `direccion + zona + ciudad + Colombia`
  - y luego `direccion + ciudad + Colombia`
- `Shipment` pasa `recipient_zone` al flujo de geocodificacion.
- `ShipmentGeodataService` incorpora fallback aproximado usando `zona + ciudad` cuando la zona no trae bounds configurados.
- Se corrigen pruebas para cubrir la nueva firma y el nuevo orden de fallbacks.

### Ruta del dia / semantica operativa

- `driverRouteDayPayload()` ahora calcula `pending_stops` solo con paradas `pending`.
- Las paradas en `issue` dejan de contaminar el conteo operativo de pendientes.
- Esto alinea backend con la logica consumida por app piloto y panel.

## Frontend admin

- Se actualiza el detalle de conductores con historial operativo y etiquetas en espanol claro.
- Se actualiza `print-receipt` para reutilizar etiquetas de tipo de cobro consistentes.
- Se fortalece el modulo `Rutas`:
  - polling silencioso,
  - preservacion del ultimo estado valido,
  - timestamp de ultima sincronizacion,
  - conteo separado de pendientes y novedades.

## Validacion ejecutada

- `php artisan test tests/Feature/ShipmentTest.php tests/Feature/GeocodeMissingShipmentsCommandTest.php tests/Feature/GeocodingServiceTest.php tests/Feature/ScopedEndpointTest.php`
- `npm run typecheck`
- `npx eslint "src/app/(admin)/conductores/[id]/page.tsx"`
- `npx eslint "src/components/print-receipt.tsx"`
- `npx eslint "src/app/(admin)/rutas/page.tsx"`

## QA sugerido

1. Crear pedido con direccion + zona y confirmar que backend repone coordenadas.
2. Abrir una ruta en la app piloto y validar que el mapa ya puede pintar las paradas.
3. Revisar `Rutas` en admin y confirmar que:
   - pendientes,
   - novedades,
   - ultima sincronizacion,
   - y siguiente parada
   se muestran de forma coherente.
4. Revisar el detalle de un piloto y validar historial + documentos.

## Despliegue

- El panel/backend se publica por **deploy manual en cPanel**.
- La app piloto requiere **APK nueva** para cambios nativos/distribuidos por build.
