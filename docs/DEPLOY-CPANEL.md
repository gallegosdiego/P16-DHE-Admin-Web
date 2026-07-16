# Deploy cPanel - API Danhei

## Estado actual

El deploy del API en cPanel es manual. No hay workflow de GitHub Actions para desplegar el backend.

## Flujo seguro

1. Hacer `git push origin main` desde la maquina local.
2. Entrar a cPanel.
3. Abrir Git Version Control.
4. Seleccionar `P16-DHE-Admin-Web`.
5. Presionar `Actualizar desde remoto`.
6. Confirmar que el `HEAD Commit` sea el commit esperado.
7. Presionar `Desplegar commit HEAD`.
8. Validar `https://api.danheiexpress.com/api/deploy-check`.

## Que hace `.cpanel.yml`

Ejecuta solo acciones acotadas:

```bash
/bin/mkdir -p /home/danheiex/api.danheiexpress.com
/bin/cp -R api/. /home/danheiex/api.danheiexpress.com/
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-public-storage-link.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-cod-schema.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-driver-mobile-geo-schema.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-driver-documents-schema.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-route-day-index.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_11_180000_create_operational_foundation_tables.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_11_181000_create_idempotency_records_table.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_12_150000_create_reconciliation_ledgers.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_12_170000_create_route_task_stops_table.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_15_100000_add_assigned_user_to_operational_tasks.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php artisan migrate --force --path=database/migrations/2026_07_15_101000_register_intake_permissions.php
```

`scripts/repair-public-storage-link.php`, `scripts/repair-cod-schema.php`, `scripts/repair-driver-mobile-geo-schema.php`, `scripts/repair-driver-documents-schema.php` y `scripts/repair-route-day-index.php` son idempotentes: crean el symlink `public/storage` y directorios de archivos publicos, agregan columnas faltantes o alinean el indice compuesto esperado para continuidad de rutas del mismo dia.

No ejecuta:

- `composer install`
- migraciones generales: el deploy solo ejecuta las seis migraciones aditivas de recogidas, operaciones, conciliación e ingreso unificado listadas arriba.
- `php artisan optimize:clear`
- `php artisan route:cache`
- `php artisan db:seed`

## Base de datos

El parche COD se ejecuta durante `Desplegar commit HEAD`. Si cPanel reporta error en el deploy, revisar la salida del deploy y validar despues con:

```text
https://api.danheiexpress.com/api/deploy-check
```

Para COD, el valor esperado es:

```json
"cod_collection_ready": true
```

Para mapa app piloto / geocodificacion, el valor esperado es:

```json
"driver_mobile_runtime_ready": true,
"shipment_geodata_runtime_ready": true,
"shipment_geocoding_fallback_enabled": true
```

Para expediente documental de pilotos, los valores esperados son:

```json
"driver_document_ready": true,
"driver_document_expiry_ready": true
```

Para continuidad de varias rutas o reapertura en el mismo dia, el valor esperado es:

```json
"route_day_index_optimized": true
```

Si `shipment_geodata_runtime_ready` sale `false`, revisar:

- columnas `recipient_lat`, `recipient_lng`, `geocoded_at`;
- columna `intake_photo`;
- despliegue manual realmente ejecutado.

Si `driver_document_ready` o `driver_document_expiry_ready` salen `false`, revisar:

- que cPanel haya ejecutado `repair-public-storage-link.php`;
- que cPanel haya ejecutado `repair-driver-documents-schema.php`;
- que `public/storage` apunte a `storage/app/public`;
- que la tabla `drivers` exista y el deploy copie la carpeta `api/` completa.

Si `route_day_index_optimized` sale `false`, revisar:

- que cPanel haya ejecutado `repair-route-day-index.php`;
- que la base no conserve el indice unico heredado `driver_id + route_date`.

## Paso operativo para la API key

`GOOGLE_MAPS_API_KEY` ya no es obligatoria para activar el mapa del piloto.

Si el deploy deja las columnas listas pero `google_maps_geocoding_configured` sigue en `false`:

1. Entrar a cPanel.
2. Abrir **File Manager**.
3. Editar `/home/danheiex/api.danheiexpress.com/.env`.
4. Agregar o corregir:

```dotenv
GOOGLE_MAPS_API_KEY=tu_api_key_real
SHIPMENT_DEFAULT_CITY=Bogota
```

5. Guardar.
6. Volver a abrir `https://api.danheiexpress.com/api/deploy-check`.

El resultado esperado es:

```json
"services": {
  "google_maps_geocoding_configured": true
}
```

Sin API key, el backend usa fallback de geocodificación con Nominatim y, si una dirección sigue sin resolver, usa centro aproximado de la zona cuando la zona tenga caja geográfica.

## Nota operativa

No volver a agregar reparadores temporales dentro de `api/public` ni rutas publicas. Cualquier parche de esquema debe ser idempotente, especifico y ejecutado solo por el deploy manual de cPanel.
