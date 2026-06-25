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
```

`scripts/repair-cod-schema.php` es idempotente: solo agrega las columnas COD si faltan y no modifica pedidos existentes.

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

## Nota operativa

No volver a agregar reparadores temporales dentro de `api/public` ni rutas publicas. Cualquier parche de esquema debe ser idempotente, especifico y ejecutado solo por el deploy manual de cPanel.
