# Deploy cPanel - API Danhei

## Requisitos del hosting
- PHP 8.2 o superior.
- MySQL 8.x o MariaDB compatible.
- Extensiones PHP: `pdo_mysql`, `mbstring`, `openssl`, `bcmath`, `tokenizer`, `ctype`, `json`, `xml`, `fileinfo`.
- Acceso a Git Version Control y Terminal en cPanel.

## Estructura recomendada
```text
/home/danheiex/
├── api.danheiexpress.com/        (document root del subdominio)
├── laravel_app/                  (app Laravel desplegada)
└── repositories/P16-DHE-Admin-Web/ (repo gestionado por cPanel)
```

## Configuración de BD MySQL (crítico)
Crear la base con `utf8mb4` y `utf8mb4_unicode_ci` para evitar errores de latin1 y acentos:

```sql
CREATE DATABASE danheiex_production
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Validar al final:
```sql
SHOW CREATE DATABASE danheiex_production;
```

## Variables de entorno
1. Copiar `api/.env.production.example` a `/home/danheiex/laravel_app/.env`.
2. Ajustar credenciales reales de MySQL.
3. Generar APP_KEY:
```bash
cd /home/danheiex/laravel_app
php artisan key:generate
```
4. Configurar `MASTER_PASSWORD` solo para ejecución inicial de `ProductionSeeder`.

## Configuración Git + cPanel
1. Registrar repositorio en cPanel (branch `main`).
2. Guardar `.cpanel.yml` en raíz del repo.
3. Confirmar que el task copie solo `api/` hacia `/home/danheiex/laravel_app`.

## Configurar document root de API
El subdominio `api.danheiexpress.com` debe apuntar a:
`/home/danheiex/laravel_app/public`

Si cPanel no permite apuntar directo, usar symlink:
```bash
ln -sfn /home/danheiex/laravel_app/public /home/danheiex/api.danheiexpress.com
```

## Storage link y permisos
```bash
cd /home/danheiex/laravel_app
php artisan storage:link
chmod -R ug+rwx storage bootstrap/cache
```

## Primer deploy
Con push a `main`, cPanel ejecuta `.cpanel.yml`:
- copia `api/`
- instala dependencias composer
- limpia y regenera caches
- corre migraciones forzadas

Después del deploy:
```bash
cd /home/danheiex/laravel_app
php artisan about
php artisan migrate:status
```

## Seeder de producción (manual, una vez)
No se ejecuta en `.cpanel.yml` para evitar demo data:
```bash
cd /home/danheiex/laravel_app
php artisan db:seed --class=ProductionSeeder --force
```

## Monitoreo y logs
- Log principal: `storage/logs/laravel.log`
- Revisar errores:
```bash
tail -n 200 storage/logs/laravel.log
```

## Rollback
```bash
cd /home/danheiex/laravel_app
php artisan migrate:rollback --step=1 --force
php artisan optimize:clear
```

Si el rollback no basta, volver al commit previo y redeployar desde cPanel Git.

## Comandos útiles en cPanel Terminal
```bash
cd /home/danheiex/laravel_app
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force
php artisan db:seed --class=ProductionSeeder --force
```
