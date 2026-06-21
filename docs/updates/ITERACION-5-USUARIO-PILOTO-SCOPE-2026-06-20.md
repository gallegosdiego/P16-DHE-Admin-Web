# Iteración 5 — Usuario piloto sin alcance después de sesión

Fecha: 2026-06-20  
Rama: `dev`  
Alcance: usuarios, pilotos y scope móvil

## Bug auditado

Después de cerrar sesión o volver a iniciar sesión, un piloto podía quedar sin pedidos/rutas aunque el panel mostrara pedidos asignados. Una causa posible era que la cuenta `User` tuviera rol de piloto, pero no tuviera `driver_id` asociado.

## Diagnóstico

- El middleware `ScopeClient` solo asigna `_scoped_driver_id` si `users.driver_id` existe.
- `DriverController` ya creaba/reparaba bien el vínculo `drivers.user_id` ↔ `users.driver_id`.
- `UserController`, en cambio, permitía crear o editar usuarios con rol `driver` sin `driver_id`.
- La pantalla de usuarios tampoco ofrecía selector de piloto operativo para el rol `driver`.

## Corrección aplicada

### Backend

- `POST /api/users` y `PUT /api/users/{user}` ahora aceptan `driver_id`.
- Si el rol es `driver`/`conductor`, `driver_id` es obligatorio.
- Si el rol no es piloto, `driver_id` se limpia.
- Si el rol no es cliente, `client_id` se limpia.
- Al asociar un piloto:
  - se actualiza `users.driver_id`;
  - se actualiza `drivers.user_id`;
  - se limpian vínculos duplicados en otros usuarios.
- Para rol `driver`, se asignan roles equivalentes en guards `web` y `sanctum`.

### Frontend

- La pantalla `Usuarios` carga la lista de pilotos.
- Al seleccionar rol `driver`, muestra un selector obligatorio de piloto operativo.
- El payload de crear/editar usuario envía `driver_id`.

## Archivos modificados

- `api/app/Http/Controllers/Api/UserController.php`
- `api/tests/Feature/RbacExtendedTest.php`
- `frontend/src/app/(admin)/usuarios/page.tsx`
- `frontend/src/lib/types.ts`

## Pruebas agregadas

- No permite crear usuario `driver` sin `driver_id`.
- Permite crear usuario `driver` con `driver_id`, sincroniza `drivers.user_id`, login retorna `user.driver_id` y el scope móvil responde correctamente.

## Validación ejecutada

```bash
LOG_CHANNEL=null ./vendor/bin/phpunit --filter driver_user --do-not-cache-result tests/Feature/RbacExtendedTest.php
```

Resultado: 2 pruebas, 7 aserciones, OK.

```bash
npx tsc --noEmit --incremental false
npx eslint -- "src/app/(admin)/usuarios/page.tsx" "src/lib/types.ts"
```

Resultado: OK.

```bash
git diff --check
php -l api/app/Http/Controllers/Api/UserController.php
php -l api/tests/Feature/RbacExtendedTest.php
```

Resultado: OK.

## Autoauditoría de omisiones

- Esta iteración evita nuevas cuentas piloto sin alcance, pero no migra datos ya dañados en producción.
- Recomendación operativa: ejecutar una revisión SQL de usuarios con rol `driver` y `driver_id IS NULL`.
- Falta agregar una pantalla de diagnóstico administrativo que liste pilotos sin usuario, usuarios piloto sin `driver_id` y vínculos duplicados.

