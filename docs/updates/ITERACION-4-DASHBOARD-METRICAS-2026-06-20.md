# Iteración 4 — Dashboard con métricas en cero

Fecha: 2026-06-20  
Rama: `dev`  
Alcance: API dashboard y vista principal del panel administrativo

## Bug auditado

El dashboard podía mostrar `0` en la distribución por estado aunque la pantalla de pedidos sí tuviera pedidos visibles.

## Diagnóstico

El endpoint `GET /api/dashboard` calculaba las métricas usando únicamente:

```php
whereDate('created_at', now()->toDateString())
```

Si no había pedidos creados durante el día actual, pero sí existían pedidos operativos creados en la última jornada de trabajo, el dashboard quedaba visualmente en cero. Esto explicaba el comportamiento observado de “ayer funcionaba y hoy ya no”.

## Corrección aplicada

- Si existen pedidos creados hoy, el dashboard sigue mostrando el día actual.
- Si hoy no tiene pedidos, el dashboard cae a la última fecha con actividad registrada.
- La respuesta ahora incluye metadatos:
  - `today.scope`: `today` o `latest_activity`;
  - `today.scope_date`: fecha usada para las métricas.
- El frontend muestra un texto explicativo cuando está usando última actividad.
- La distribución agrupa estados previos a ruta para no perder pedidos `confirmed`, `pickup_scheduled`, `picked_up`, `in_warehouse` o `assigned_to_route`.

## Archivos modificados

- `api/app/Http/Controllers/Api/ShipmentController.php`
- `api/tests/Feature/ShipmentTest.php`
- `frontend/src/app/(admin)/page.tsx`
- `frontend/src/lib/types.ts`

## Pruebas agregadas

- Dashboard cae a `latest_activity` cuando hoy no tiene pedidos creados.
- El total, estado `registered`, fecha de alcance y revenue del periodo se calculan correctamente.

## Validación ejecutada

```bash
LOG_CHANNEL=null ./vendor/bin/phpunit --filter dashboard --do-not-cache-result tests/Feature/ShipmentTest.php
```

Resultado: 2 pruebas, 18 aserciones, OK.

```bash
npx tsc --noEmit --incremental false
npx eslint -- "src/app/(admin)/page.tsx" "src/lib/types.ts"
```

Resultado: OK.

```bash
git diff --check
php -l api/app/Http/Controllers/Api/ShipmentController.php
php -l api/tests/Feature/ShipmentTest.php
```

Resultado: OK.

## Autoauditoría de omisiones

- El dashboard hourly todavía usa estrictamente el día actual; si se requiere, una iteración posterior puede aplicar el mismo `scope_date`.
- El nombre interno `today_revenue` se conserva por compatibilidad, aunque ahora representa el periodo operativo mostrado cuando `scope = latest_activity`.
- Falta validación visual en móvil real del layout completo del dashboard.

