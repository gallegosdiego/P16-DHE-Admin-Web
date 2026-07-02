# Iteracion 23 - deploy manual cPanel con esquema geo y runtime blockers

Fecha: 2026-07-02
Repositorio: `P16-DHE-Admin-Web`

## Hallazgo clave

Se verifico produccion real en:

- `https://api.danheiexpress.com/api/deploy-check`

y el estado reportado fue:

- `driver_mobile_optional_columns.intake_photo = false`
- `geocoding_columns.recipient_lat = false`
- `geocoding_columns.recipient_lng = false`
- `geocoding_columns.geocoded_at = false`
- `services.google_maps_geocoding_configured = false`

Conclusión:

la ruta del piloto seguia mostrando `Ruta sin coordenadas` no porque la app estuviera mal, sino porque produccion no tenia:

1. columnas geo en `shipments`;
2. configuracion de `GOOGLE_MAPS_API_KEY`.

## Correccion implementada

### 1. Reparador idempotente para esquema movil/geo

Se creo:

- `api/scripts/repair-driver-mobile-geo-schema.php`

Este script agrega si faltan:

- `intake_photo`
- `recipient_lat`
- `recipient_lng`
- `geocoded_at`

### 2. Integracion al deploy manual de cPanel

Se actualizo:

- `.cpanel.yml`

para que `Desplegar commit HEAD` ejecute:

1. `repair-cod-schema.php`
2. `repair-driver-mobile-geo-schema.php`

sin volver el deploy automatico fuera del flujo manual de cPanel.

### 3. `deploy-check` mas claro

Ahora `GET /api/deploy-check` expone:

- `database.driver_mobile_runtime_ready`
- `database.shipment_geodata_runtime_ready`
- `runtime_blockers`

Esto permite ver de inmediato si el mapa del piloto esta bloqueado por:

- columnas faltantes;
- falta de `GOOGLE_MAPS_API_KEY`.

## Validacion esperada despues del deploy

Despues de desplegar manualmente en cPanel, el resultado esperado en:

- `https://api.danheiexpress.com/api/deploy-check`

es:

```json
"driver_mobile_runtime_ready": true,
"shipment_geodata_runtime_ready": true,
"runtime_blockers": []
```

## Cierre de la brecha operativa

Se elimino la dependencia dura de `GOOGLE_MAPS_API_KEY` para activar mapa piloto:

- si existe API key, se usa Google Geocoding;
- si no existe, el backend usa fallback con Nominatim;
- si la direccion sigue sin resolver pero la zona tiene caja geografica, usa el centro de la zona.

Con esto, el deploy manual ya no queda bloqueado por una variable externa para que el piloto pueda ver coordenadas en la mayoria de casos operativos.

## Endurecimiento adicional

El reparador de esquema quedo reforzado para no depender ciegamente de columnas ancla al usar `after(...)`.

Esto reduce riesgo de fallo si algun entorno viejo tuviera diferencias menores en el orden de columnas de `shipments`.
