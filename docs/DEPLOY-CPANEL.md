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
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-cod-schema.php
cd /home/danheiex/api.danheiexpress.com && /usr/local/bin/php scripts/repair-driver-mobile-geo-schema.php
```

`scripts/repair-cod-schema.php` y `scripts/repair-driver-mobile-geo-schema.php` son idempotentes: solo agregan columnas faltantes y no modifican pedidos existentes.

No ejecuta:

- `composer install`
- `php artisan migrate --force`
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

Si `shipment_geodata_runtime_ready` sale `false`, revisar:

- columnas `recipient_lat`, `recipient_lng`, `geocoded_at`;
- columna `intake_photo`;
- despliegue manual realmente ejecutado.

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
