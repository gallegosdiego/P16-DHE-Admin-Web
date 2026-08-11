# Reconciliación del historial de migraciones — 11 de agosto de 2026

**Contexto:** la tabla `migrations` de producción tiene 29 filas; el repositorio tiene 40 archivos. Las 11 ausentes se dividen en dos casos, y **cada uno exige un tratamiento distinto**. Aplicar `migrate --force` sin esta reconciliación rompe el despliegue.

Diagnóstico completo en [`RUTA_REMEDIACION_ECOSISTEMA_DANHEI.md`](../../RUTA_REMEDIACION_ECOSISTEMA_DANHEI.md), punto P2.3.

---

## Requisito previo

**El respaldo verificado de P0.1 debe existir.** Este es el primer paso de toda la ruta que escribe en producción.

---

## Paso 1 — Registrar las 6 migraciones ya materializadas

Estas seis tienen su esquema **completo** en producción, creado por los `repair-*.php` fuera del sistema de migraciones. Ejecutarlas fallaría con `Duplicate column name`; hay que registrarlas sin ejecutarlas.

Verificado columna por columna contra `information_schema` el 11/08/2026.

Pegar en **phpMyAdmin → `danheiex_danhei_prod` → pestaña SQL**:

```sql
INSERT INTO `migrations` (`migration`, `batch`)
SELECT nuevas.m, nuevas.b FROM (
    SELECT '2026_06_19_050000_add_coordinates_to_shipments'                AS m, 10 AS b
    UNION ALL SELECT '2026_06_25_010000_add_cod_collection_fields_to_shipments',      10
    UNION ALL SELECT '2026_07_01_180000_add_route_metric_columns_to_routes_table',    10
    UNION ALL SELECT '2026_07_01_190000_add_route_geometry_columns_to_routes_table',  10
    UNION ALL SELECT '2026_07_02_210000_add_document_columns_to_drivers_table',       10
    UNION ALL SELECT '2026_07_02_230000_add_document_expiry_columns_to_drivers_table', 10
) AS nuevas
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT `migration` FROM `migrations`) AS existentes
    WHERE existentes.`migration` = nuevas.m
);
```

**Es idempotente**: volver a ejecutarlo no duplica filas. Solo escribe en `migrations`; no toca ninguna tabla de datos.

**Verificación:** debe reportar 6 filas insertadas, y esta consulta debe devolver **35**:

```sql
SELECT COUNT(*) AS total FROM migrations;
```

---

## Paso 2 — Ejecutar las 5 restantes

Estas **no** están aplicadas, o lo están a medias. Se ejecutan de verdad, vía despliegue.

| Migración | Qué falta | Efecto al aplicarla |
|---|---|---|
| `2026_06_18_040000_add_intake_photo_and_mercado_libre` | el `ENUM` de `payment_type` | **Arregla Mercado Libre Flex** |
| `2026_07_01_160000_add_live_location_columns_to_drivers_table` | el índice `last_location_updated_at` | Rendimiento del seguimiento |
| `2026_07_01_200000_allow_multiple_routes_per_driver_per_day` | quitar el índice único | Un piloto podrá tener 2 rutas/día |
| `2026_07_07_130000_create_whatsapp_pickup_foundation_tables` | las 8 tablas | Habilita la integración WhatsApp |
| `2026_07_08_190000_add_recipient_address_meta_to_shipments_table` | la columna | **Revive la dirección estructurada** |

Las tres primeras fueron blindadas con guardas de idempotencia en el commit `30d9a45`; las dos últimas ya las traían.

> **Orden obligatorio en M07.** La primera versión eliminaba el índice único antes de crear el de reemplazo y **fallaba en producción**:
>
> ```
> ERROR 1553: Cannot drop index 'routes_driver_id_route_date_unique':
>             needed in a foreign key constraint
> ```
>
> La clave foránea `routes_driver_id_foreign` se apoya en ese índice porque `driver_id` es su columna más a la izquierda, e InnoDB rechaza eliminarlo mientras sea el único capaz de sostenerla. La migración crea ahora el índice normal **primero**. Detectado en el ensayo contra copia real; no es reproducible en SQLite.

**Requisito:** el despliegue debe dejar de usar la lista blanca `--path` y pasar a `Artisan::call('migrate', ['--force' => true])`. **Este cambio solo se hace después del Paso 1.**

**Verificación final:** `SELECT COUNT(*) FROM migrations;` debe devolver **40**.

---

## Comprobaciones de resultado

```sql
-- 1. El ENUM ya acepta Mercado Libre (esperado: incluye 'mercado_libre' y sigue NOT NULL)
SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'payment_type';

-- 2. El indice unico de rutas desaparecio (esperado: 0 filas con tipo UNICO)
SELECT INDEX_NAME, NON_UNIQUE
  FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routes'
   AND COLUMN_NAME IN ('driver_id','route_date') AND INDEX_NAME <> 'PRIMARY';

-- 3. La direccion estructurada ya se puede guardar (esperado: 1 fila)
SELECT COLUMN_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipments'
   AND COLUMN_NAME = 'recipient_address_meta';
```

**Prueba funcional obligatoria:** crear un pedido con tipo de pago **Mercado Libre** desde el panel. Debe guardarse sin error.

---

## Ensayo ejecutado — 11 de agosto de 2026

Procedimiento validado de punta a punta contra una **copia real de producción**: dump del 11/08 restaurado en MariaDB 10.11.18 (la misma versión que el servidor), en contenedor Docker.

| Comprobación | Resultado |
|---|---|
| `payment_type` | `enum(...,'mercado_libre')`, `IS_NULLABLE = NO`, default `'cash_on_delivery'` ✅ |
| Índices de `routes` | único eliminado, `routes_driver_id_route_date_index` presente ✅ |
| `recipient_address_meta` | creada ✅ |
| Tablas WhatsApp | 8 de 8 ✅ |
| `migrations` | 40 ✅ |
| **Datos reales** | 60 clientes, 14 pilotos, 16 usuarios — **intactos** ✅ |

Pruebas funcionales sobre la copia (dentro de transacción, revertidas):

- envío con `payment_type = 'mercado_libre'` → **guardado**;
- dos rutas para el mismo piloto el mismo día → **2 creadas**.

El ensayo detectó el error 1553 descrito arriba, que habría abortado el despliegue en producción **dejando M01 y M04 aplicadas y M07, M10 y M11 sin aplicar** — es decir, reproduciendo el mismo estado a medias que esta reconciliación viene a corregir. Y con el `exit(0)` del despliegue, cPanel lo habría reportado como éxito.

---

## Paso 3 — Retirar los reparadores

Reconciliado el historial, `repair-cod-schema.php`, `repair-driver-mobile-geo-schema.php` y `repair-driver-documents-schema.php` dejan de tener función: existían únicamente para compensar las migraciones que no corrían. Sacarlos del despliegue cierra el hallazgo A5 sin trabajo adicional.

`repair-route-day-index.php` nunca llegó a invocarse; se elimina.

---

## Nota de diseño, fuera del alcance de esta reconciliación

`client_payment_types.payment_type` también se creó sin `mercado_libre` (migración del 29/07/2026), pero `ClientController` valida `billing_types.*` como `in:cash_on_delivery,post_sale,prepaid`, así que **el hueco no es alcanzable** y no constituye un fallo activo.

Queda la decisión de producto: ¿debe Mercado Libre ser una preferencia de pago asignable a un cliente? Si la respuesta es sí, requiere su propia migración y ampliar la validación.
