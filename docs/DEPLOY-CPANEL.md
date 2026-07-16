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
8. Validar `https://api.danheiexpress.com/api/health`.
9. Iniciar sesión con una cuenta QA autorizada y validar `GET /api/runtime-check`.

## Que hace `.cpanel.yml`

Ejecuta dos acciones acotadas:

```bash
/bin/mkdir -p /home/danheiex/api.danheiexpress.com
/bin/bash api/scripts/deploy-cpanel-release.sh /home/danheiex/api.danheiexpress.com
```

`scripts/deploy-cpanel-release.sh` trabaja desde el checkout que cPanel acaba de
actualizar y aplica una estrategia **esquema primero, código después**:

1. identifica y registra el commit exacto que cPanel intenta desplegar;
2. valida que el runtime existente conserve `.env`, `artisan`, `vendor` y el
   bootstrap de Laravel;
3. copia únicamente las migraciones críticas de ingreso al runtime estable;
4. ejecuta y verifica el esquema operativo y los permisos de ingreso antes de
   copiar controladores, modelos o rutas nuevas;
5. si falta una tabla o columna crítica, termina con error y deja intacto el
   código publicado anteriormente;
6. solo después copia `api/` y delega las tareas posteriores a
   `scripts/deploy-cpanel.sh`.

`scripts/deploy-cpanel.sh` ejecuta después, en orden:

1. limpieza de caché;
2. fundación crítica e independiente de sedes, solicitudes y paquetes;
3. seis migraciones operativas para tareas, idempotencia, conciliación y permisos;
4. garantía y verificación exhaustiva del esquema de ingreso;
5. reparaciones heredadas de almacenamiento, COD, geodatos y documentos;
6. dos migraciones financieras;
7. migración opcional y aislada de WhatsApp, después de completar el núcleo;
8. optimización no bloqueante del índice diario de rutas.

Las tareas normales tienen un límite de 90 segundos, cada migración un límite de 240 segundos y el despliegue completo un límite de 900 segundos. También bloquea intentos simultáneos cuando `flock` está disponible.

El orquestador conserva un solo bloqueo y un solo flujo de registro durante
todas las fases. La salida queda tanto en el registro nativo de cPanel como en:

```text
/home/danheiex/api.danheiexpress.com/storage/logs/deploy-cpanel.log
```

Al terminar correctamente también escribe:

```text
/home/danheiex/api.danheiexpress.com/storage/logs/deploy-cpanel.last-success
```

Ese archivo contiene el commit exacto, la fecha y `status=success`. Si el commit
no coincide con el `HEAD Commit` esperado, el código correcto no fue el que
cPanel desplegó.

`scripts/repair-public-storage-link.php`, `scripts/repair-cod-schema.php`, `scripts/repair-driver-mobile-geo-schema.php`, `scripts/repair-driver-documents-schema.php`, `scripts/repair-operational-intake-schema.php` y `scripts/repair-route-day-index.php` son idempotentes: crean el symlink `public/storage` y directorios de archivos públicos, agregan columnas faltantes o alinean el índice compuesto esperado para continuidad de rutas del mismo día.

La fundación `2026_07_16_140000_create_core_pickup_foundation.php` es tolerante a tablas ya existentes. Esto permite completar una base parcial —por ejemplo, cuando las sedes existen pero todavía faltan solicitudes, paquetes, tareas y custodia— sin borrar datos maestros. El verificador también vuelve a registrar los permisos `intakes.*` y `shipments.direct_create` cuando la tabla de migraciones indica éxito pero alguna fila fue eliminada. La migración de WhatsApp queda como paso opcional: un fallo de esa integración restringida se registra, pero no impide construir el núcleo de ingresos.

La reparación del índice diario de rutas se ejecuta al final. Si MySQL mantiene un bloqueo activo, esa optimización se aplaza y queda registrada como advertencia, pero ya no impide aplicar el esquema requerido por ingresos, guías y finanzas.

No ejecuta:

- `composer install`
- migraciones generales: el deploy solo ejecuta las migraciones explícitas y
  aditivas de recogidas, operaciones, conciliación, ingreso unificado y
  controles financieros listadas arriba.
- `php artisan route:cache`
- `php artisan db:seed`

## Si cPanel queda mostrando "en curso"

1. No volver a presionar `Desplegar commit HEAD`: un segundo intento puede quedar en cola.
2. Confirmar que el `HEAD Commit` mostrado por cPanel coincide con el commit esperado en GitHub. Si no coincide, primero usar `Actualizar desde remoto`.
3. Esperar como máximo 15 minutos con el ejecutor actual. Si una etapa crítica se bloquea, terminará con error y dejará su nombre en `storage/logs/deploy-cpanel.log`.
4. En **Administrador de archivos**, activar la visualización de archivos ocultos y revisar:

```text
/home/danheiex/.cpanel/logs/vc_*_git_deploy.log
/home/danheiex/.cpanel/logs/user_task_runner.log
/home/danheiex/api.danheiexpress.com/storage/logs/deploy-cpanel.log
/home/danheiex/api.danheiexpress.com/storage/logs/deploy-cpanel.last-success
```

5. Buscar al final del log `Danhei API cPanel deploy FAILED`. Ese bloque informa
   el commit, la fase exacta y el código de salida. No volver a probar el panel
   hasta que exista un marcador `last-success` del commit esperado.
6. Si la pantalla conserva el indicador después de que el registro ya terminó, recargar la página de Git Version Control. En ese caso el proceso terminó y lo congelado es el estado visual de cPanel.

## Base de datos

El parche COD se ejecuta durante `Desplegar commit HEAD`. Si cPanel reporta error en el deploy, revisar la salida del deploy. La comprobación detallada de esquema está protegida y requiere una cuenta con `settings.view`:

```text
GET https://api.danheiexpress.com/api/runtime-check
Authorization: Bearer <token QA>
```

`/api/deploy-check` solo existe en ambientes `local` y `testing`; un `404` público en producción es el resultado seguro esperado.

Para COD, el valor esperado es:

```json
"cod_collection_ready": true
```

Para mapa app piloto / geocodificacion, el valor esperado es:

```json
"driver_mobile_runtime_ready": true,
"shipment_geodata_runtime_ready": true,
"shipment_geocoding_runtime_ready": true,
"google_maps_geocoding_optional": true,
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

Para el ingreso unificado de paquetes, los valores esperados son:

```json
"operational_intake_ready": true,
"operational_task_columns": {
  "pickup_request_id": true,
  "service_location_id": true,
  "assigned_user_id": true
}
```

Si `operational_intake_ready` sale `false`, el endpoint responde HTTP 503 con
`status: RUNTIME_BLOCKED`. Con el flujo `schema-first`, ese resultado después de
un despliegue indica que el despliegue no terminó o que cPanel ejecutó otro
commit. No intentar registrar o recibir paquetes hasta:

1. comparar `HEAD Commit` con `commit=` en `deploy-cpanel.last-success`;
2. revisar la fase `FAILED` de `deploy-cpanel.log`;
3. confirmar `operational_intake_tables`, `operational_intake_columns`,
   `pickup_request_operational_columns` y `operational_task_columns`.

Para reglas financieras y trazabilidad de tarifas, los valores esperados son:

```json
"financial_rate_earning_columns": {
  "rate_rule_id": true,
  "standard_amount": true,
  "rate_snapshot_json": true
},
"financial_rate_rules_ready": true
```

Para comprobantes, reversos y apertura histórica:

```json
"financial_receipts_ready": true,
"financial_opening_ready": true
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

Si `financial_rate_rules_ready` sale `false`, revisar:

- que cPanel haya ejecutado la migracion `2026_07_16_120000_create_financial_rate_rules.php`;
- que existan la tabla `financial_rate_rules` y las columnas de regla, tarifa estandar y snapshot en `driver_service_earnings`;
- que el deploy haya terminado sin errores antes de probar `/configuracion`.

Si `financial_receipts_ready` o `financial_opening_ready` salen `false`, revisar:

- que cPanel haya ejecutado `2026_07_16_130000_add_financial_receipts_reversals_and_opening.php`;
- que los tres movimientos tengan columnas de saldo, tipo, reverso y aprobación;
- que exista `financial_opening_entries` y las relaciones `opening_entry_id`.

## Paso operativo para la API key

`GOOGLE_MAPS_API_KEY` ya no es obligatoria para activar el mapa del piloto.

Si el deploy deja las columnas listas pero `google_maps_geocoding_configured` sigue en `false`, eso no bloquea la operación mientras `shipment_geocoding_runtime_ready` siga en `true` y el proveedor sea `nominatim_fallback`. Solo hace falta tocar `.env` si quieres cambiar del fallback a Google Maps:

1. Entrar a cPanel.
2. Abrir **File Manager**.
3. Editar `/home/danheiex/api.danheiexpress.com/.env`.
4. Agregar o corregir:

```dotenv
GOOGLE_MAPS_API_KEY=tu_api_key_real
SHIPMENT_DEFAULT_CITY=Bogota
```

5. Guardar.
6. Volver a consultar `GET /api/runtime-check` con una cuenta autorizada.

El resultado esperado es:

```json
"services": {
  "google_maps_geocoding_configured": true
}
```

Sin API key, el backend usa fallback de geocodificación con Nominatim y, si una dirección sigue sin resolver, usa centro aproximado de la zona cuando la zona tenga caja geográfica.

## Nota operativa

No volver a agregar reparadores temporales dentro de `api/public` ni rutas publicas. Cualquier parche de esquema debe ser idempotente, especifico y ejecutado solo por el deploy manual de cPanel.
