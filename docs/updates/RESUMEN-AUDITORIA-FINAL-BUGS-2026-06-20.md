# Resumen final auditado — Bugs Danhei

Fecha: 2026-06-20  
Ramas usadas: `dev`  
Producción: `main` queda libre/intacta para despliegue controlado.

## Estado general

Se corrigieron y documentaron los bugs reportados en las capturas y notas operativas:

- App móvil repartidor: botones inferiores de parada respetan zona segura Android/iOS.
- Panel admin: estados visibles traducidos a español latino.
- Flujo piloto/panel: pedidos asignados a Juan/pilotos vuelven a aparecer aunque existan paradas históricas.
- Creación de pedidos: foto de paquete y Mercado Libre ya no bloquean creación.
- Formulario de pedidos: campos con títulos persistentes, no solo placeholders.
- Dashboard: métricas ya no quedan en cero cuando no hay registros del día pero sí actividad reciente.
- Usuarios piloto: no se permite crear acceso móvil sin vincular piloto operativo.
- Admin móvil: header, sidebar, modales, tarjetas y barra de acciones masivas respetan safe-area y botones táctiles.
- CI/e2e rutas: se recuperó flujo `Nueva ruta`, botón `Iniciar` y mocks necesarios.
- Base de datos: se agregó auditoría/reparación segura para vínculos usuario-piloto y paradas obsoletas.

## Commits principales

### P15 — App repartidor

- `b73b944` — `fix(mobile): respect safe area on stop actions`
- `450840b` — `docs(mobile): document iteration 1 safe area fix`
- `cc3102d` — `docs: trim iteration safe area notes`

### P16 — Admin web/API

- `0b1c479` — `fix(ops): localize statuses and preserve issue stops`
- `d798d8a` — `fix(ui): complete iteration 1 localization polish`
- `19e9c4b` — `fix(routes): recover stale pilot shipments`
- `10793b9` — `fix(shipments): harden creation with photos and marketplace`
- `2fe0bb3` — `fix(dashboard): show latest operational metrics`
- `43b594b` — `fix(users): require driver scope for pilot accounts`
- `009c1b3` — `fix(admin): improve mobile safe areas`
- `47e57a1` — `fix(routes): restore route creation flow`
- `7e3bf67` — `fix(operations): add integrity audit command`

## Validaciones ejecutadas

### Frontend admin

- `npx tsc --noEmit --incremental false`
- `npx eslint -- "src/app/(admin)/layout.tsx" "src/app/(admin)/pedidos/page.tsx"`
- `npx eslint -- "src/app/(admin)/rutas/page.tsx" "e2e/zones-routes-notifications.spec.ts" "e2e/support/mock-api.ts"`
- `CI=true npx playwright test e2e/routes.spec.ts e2e/zones-routes-notifications.spec.ts --project=chromium --reporter=list`

Resultado e2e: `11 passed`.

### API Laravel

- `php -l` en archivos modificados.
- `php artisan list operations`
- `phpunit tests/Feature/RouteTest.php tests/Feature/OperationalIntegrityCommandTest.php`

Resultado API final de la iteración BD: `13 tests`, `42 assertions`.

### App móvil repartidor

- `npm install`
- `npx tsc --noEmit --incremental false`

Resultado: TypeScript correcto después de instalar dependencias declaradas.

## Auditoría de omisiones

### Resuelto en código

- Safe-area móvil crítico.
- Estados en español.
- Desaparición de pedidos por rutas/paradas obsoletas.
- Creación de pedido con foto.
- Creación de pedido Mercado Libre.
- Form labels persistentes.
- Dashboard con fallback de actividad reciente.
- Usuario piloto sin `driver_id`.
- CI/e2e de rutas.
- Auditoría de datos históricos.

### Requiere acción operativa antes/después de deploy

1. Hacer backup de base de datos productiva.
2. Ejecutar auditoría sin reparar:

   ```bash
   php artisan operations:audit-integrity --json > storage/logs/operational-integrity-before.json
   ```

3. Revisar conflictos ambiguos reportados.
4. Ejecutar reparación segura solo si el reporte es entendible:

   ```bash
   php artisan operations:audit-integrity --fix --json > storage/logs/operational-integrity-after.json
   ```

5. Validar con un piloto real:
   - cerrar sesión;
   - iniciar sesión;
   - abrir pedidos;
   - crear pedido nuevo desde panel;
   - asignarlo al piloto;
   - crear/iniciar ruta si aplica.

## Riesgos restantes controlados

- `npm audit` en app móvil reporta vulnerabilidades de dependencias transitivas; no se ejecutó `npm audit fix --force` porque puede introducir cambios mayores.
- No se ejecutó reparación real en producción desde esta sesión.
- La vista de rutas recuperó creación básica; optimización manual avanzada sigue como mejora futura.
- El comando de auditoría no resuelve automáticamente duplicados ambiguos de usuarios por piloto; los reporta para decisión humana.

