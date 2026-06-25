# Deploy cPanel - API Danhei

## Estado actual

El deploy del API en cPanel es manual. No hay workflow de GitHub Actions para desplegar el backend y `.cpanel.yml` queda reducido a copia de archivos.

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

Solo ejecuta:

```bash
/bin/mkdir -p /home/danheiex/api.danheiexpress.com
/bin/cp -R api/. /home/danheiex/api.danheiexpress.com/
```

No ejecuta:

- `composer install`
- `php artisan migrate --force`
- `php artisan optimize:clear`
- `php artisan route:cache`
- `php artisan db:seed`
- scripts de reparacion de esquema

## Base de datos

Los cambios de base de datos deben aplicarse como operacion separada y verificada. Si cPanel no tiene Terminal, usar la herramienta disponible del hosting, por ejemplo phpMyAdmin, y validar despues con:

```text
https://api.danheiexpress.com/api/deploy-check
```

Para COD, el valor esperado es:

```json
"cod_collection_ready": true
```

## Nota operativa

No volver a agregar reparadores temporales de deploy dentro de `api/public`, rutas publicas o comandos ejecutados por `.cpanel.yml` sin una ventana de mantenimiento clara. Ese tipo de automatismo ya causo ambiguedad entre codigo desplegado y esquema real de produccion.
