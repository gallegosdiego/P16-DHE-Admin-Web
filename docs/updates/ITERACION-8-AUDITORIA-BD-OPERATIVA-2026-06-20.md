# Iteración 8 — Auditoría y reparación segura de datos operativos

Fecha: 2026-06-20  
Repositorio: `P16-DHE-Admin-Web`  
Rama: `dev`

## Problema observado

Después de cerrar sesión o reasignar pedidos, algunos pilotos podían quedar sin pedidos visibles aunque el panel mostrara envíos asociados. También existía riesgo de que rutas/paradas históricas siguieran bloqueando paquetes en flujos nuevos.

## Causa raíz cubierta

Los fixes previos corrigieron creación y consulta, pero podían quedar datos históricos inconsistentes:

- Usuarios con rol `driver`/`conductor` sin `users.driver_id`.
- Pilotos con `drivers.user_id` pero usuario sin vínculo inverso.
- Usuarios con `users.driver_id` pero piloto sin `drivers.user_id`.
- Más de un usuario apuntando al mismo piloto.
- `route_stops` históricas o completadas bloqueando paquetes activos.
- Contadores `routes.total_stops` / `routes.completed_stops` desfasados.

## Solución aplicada

### Comando Artisan

Se agregó:

```bash
php artisan operations:audit-integrity
```

Modo JSON para guardar evidencia:

```bash
php artisan operations:audit-integrity --json
```

Modo reparación segura:

```bash
php artisan operations:audit-integrity --fix --json
```

El comando por defecto solo audita. Con `--fix` aplica únicamente reparaciones de baja ambigüedad:

- Completa `users.driver_id` si `drivers.user_id` identifica inequívocamente al usuario.
- Completa `drivers.user_id` si `users.driver_id` identifica inequívocamente al piloto.
- Elimina `route_stops` obsoletas que no pertenecen a una ruta abierta de la fecha operativa.
- Recalcula contadores de rutas afectadas.

No repara automáticamente conflictos ambiguos como usuarios duplicados para un mismo piloto; los reporta para revisión manual.

### Endpoint de paquetes enrutables

Se corrigió `/api/routes/routable-shipments` para que:

- no oculte paquetes con paradas históricas/completadas;
- excluya solo paquetes que ya están en una ruta abierta del día;
- incluya paquetes sin piloto cuando se filtra por un piloto operativo, permitiendo que el panel los asigne al crear ruta.

## Archivos modificados

- `api/app/Console/Commands/AuditOperationalIntegrityCommand.php`
- `api/app/Http/Controllers/Api/RouteController.php`
- `api/tests/Feature/OperationalIntegrityCommandTest.php`
- `api/tests/Feature/RouteTest.php`

## Validación ejecutada

- `php -l app/Console/Commands/AuditOperationalIntegrityCommand.php`
- `php -l app/Http/Controllers/Api/RouteController.php`
- `php -l tests/Feature/OperationalIntegrityCommandTest.php`
- `php -l tests/Feature/RouteTest.php`
- `php artisan list operations`
- `phpunit --filter OperationalIntegrity tests/Feature/OperationalIntegrityCommandTest.php`
- `phpunit --filter routable_shipments tests/Feature/RouteTest.php`
- `phpunit tests/Feature/RouteTest.php tests/Feature/OperationalIntegrityCommandTest.php`
- `git diff --check`

Resultado: `13 tests`, `42 assertions`, todo correcto.

## Procedimiento recomendado en producción

1. Hacer backup de base de datos.
2. Ejecutar auditoría sin reparación:

   ```bash
   php artisan operations:audit-integrity --json > storage/logs/operational-integrity-before.json
   ```

3. Revisar conflictos ambiguos:
   - `duplicate_users_per_driver`
   - vínculos cruzados no repairable
4. Si el reporte solo muestra reparaciones seguras, ejecutar:

   ```bash
   php artisan operations:audit-integrity --fix --json > storage/logs/operational-integrity-after.json
   ```

5. Validar en panel:
   - usuario piloto vinculado;
   - pedidos visibles en app móvil;
   - `/rutas` muestra paquetes disponibles para crear ruta.

## Auditoría propia de la iteración

### Omisiones encontradas

- No se ejecutó contra producción desde esta máquina.
- No se agregó endpoint HTTP para auditoría porque sería riesgoso exponer reparación de datos vía panel sin permisos/confirmaciones adicionales.
- El comando no intenta decidir automáticamente cuál usuario conservar si hay duplicados por piloto.

### Mejoras recomendadas siguientes

- Agregar una vista administrativa de “Salud operativa” solo lectura.
- Crear un backup automático antes de `--fix` si el entorno productivo lo permite.
- Añadir alerta diaria si aparecen nuevas inconsistencias.

