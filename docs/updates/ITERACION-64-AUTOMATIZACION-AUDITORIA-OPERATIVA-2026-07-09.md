# Iteracion 64 - Automatizacion de auditoria operativa

Fecha: 2026-07-09
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Cerrar uno de los pendientes importantes que seguia abierto aunque ya existian piezas sueltas:

- auditar consistencia de rutas;
- reparar desviaciones comunes;
- dejar evidencia antes/despues;
- y encender la automatizacion operativa real.

## Cambios aplicados

### 1. `operations:audit-integrity` con evidencia persistida

El comando backend ahora soporta:

- `--store-report`
- `--report-path=...`

Cuando corre con `--fix`, produce:

- `before_summary`
- `before_issues`
- `fixed`
- `after_summary`
- `issues` finales

Y opcionalmente guarda el JSON en:

`storage/app/operations/integrity/<fecha>/audit-<hora>-fix.json`

### 2. Scheduler operativo ampliado

Se activaron estas tareas en `api/routes/console.php`:

- `drivers:sync-document-alerts` cada 30 minutos
- `shipments:geocode-missing --limit=50 --json` cada hora
- `operations:audit-integrity --fix --json --store-report` cada 30 minutos

Logs:

- `storage/logs/drivers-sync-document-alerts.log`
- `storage/logs/shipments-geocode-missing.log`
- `storage/logs/operations-audit-integrity.log`

### 3. Cobertura automatizada

Se agrego una regresion que valida:

- generacion de reporte `before/after`
- persistencia del JSON
- y conteo de reparaciones aplicadas

## Validacion ejecutada

- `php artisan test --filter=OperationalIntegrityCommandTest`
- `php artisan test --filter=GeocodeMissingShipmentsCommandTest`
- `php artisan schedule:list`

## Resultado

Queda mucho mejor cerrado el pendiente de consistencia operativa:

- ya no dependemos de ejecutar auditorias manuales para detectar stops huerfanos;
- geocoding pendiente recibe backfill horario;
- y operaciones tiene trazabilidad concreta cuando el sistema autorepara.

## Pendiente que sigue vivo

- confirmar en produccion que el cron del servidor esta activo;
- revisar QA real de los JSON generados en `storage/app/operations/integrity/`;
- seguir bajando `Geo pendiente` desde calidad de captura de direcciones y datos reales.
