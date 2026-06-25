# Parche manual COD - 2026-06-25

## Contexto

El backend ya tiene el codigo para registrar recaudo contra entrega desde la app piloto, pero produccion reporta:

```json
"cod_collection_ready": false
```

Eso significa que a la tabla `shipments` le faltan estas columnas:

- `cod_collected_amount`
- `cod_payment_method`
- `cod_collected_at`

Como cPanel no tiene Terminal y el deploy ya no ejecuta migraciones automaticas, este cambio debe aplicarse manualmente desde phpMyAdmin.

## Base de datos

Entrar a phpMyAdmin y seleccionar la base de datos de produccion del API antes de ejecutar SQL.

## SQL recomendado

Ejecutar estas sentencias una por una:

```sql
ALTER TABLE shipments
  ADD COLUMN cod_collected_amount DECIMAL(12, 0) NULL AFTER cod_amount;

ALTER TABLE shipments
  ADD COLUMN cod_payment_method VARCHAR(40) NULL AFTER cod_collected_amount;

ALTER TABLE shipments
  ADD COLUMN cod_collected_at TIMESTAMP NULL AFTER cod_payment_method;
```

## Si alguna columna ya existe

Si phpMyAdmin responde `Duplicate column name`, no repetir esa sentencia. Continuar con las columnas que falten.

## Validacion

Despues de aplicar el SQL, abrir:

```text
https://api.danheiexpress.com/api/deploy-check
```

El resultado esperado es:

```json
"cod_collection_ready": true
```

## Opcional: registrar migracion Laravel

Solo despues de confirmar que las tres columnas existen, se puede registrar la migracion como aplicada:

```sql
INSERT INTO migrations (migration, batch)
SELECT
  '2026_06_25_010000_add_cod_collection_fields_to_shipments',
  COALESCE((SELECT MAX(batch) FROM migrations), 0) + 1
WHERE NOT EXISTS (
  SELECT 1
  FROM migrations
  WHERE migration = '2026_06_25_010000_add_cod_collection_fields_to_shipments'
);
```

Este paso es opcional porque la migracion Laravel tambien es defensiva: si alguna vez se ejecuta `php artisan migrate`, no deberia volver a crear columnas existentes.
