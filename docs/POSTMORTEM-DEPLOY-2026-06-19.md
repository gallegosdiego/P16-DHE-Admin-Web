# Postmortem: Falla de Deploy y Eliminación de Pedidos
**Fecha:** 19 de junio de 2026  
**Duración del incidente:** ~2 horas (7:00 AM – 9:58 AM CST)  
**Severidad:** Alta — funcionalidad de producción rota  
**Autor:** Documentación generada durante la sesión de debugging

---

## Resumen Ejecutivo

La eliminación de pedidos en el panel admin (`admin.danheiexpress.com/pedidos`) mostraba el error:
```
"No se pudo eliminar: The route api/shipment/7/delete could not be found."
```

La causa raíz fue un **deploy que nunca funcionó correctamente**, lo que provocó que el código del servidor estuviera desactualizado y la cache de rutas de Laravel no incluyera las rutas de eliminación.

---

## Línea de Tiempo

| Hora | Evento |
|------|--------|
| ~07:00 | Se agregan rutas DELETE y POST fallback para eliminación de pedidos (commits `cb82f46`, `7549966`, `99203cb`) |
| ~07:06 | Push a GitHub con changelog y features nuevos |
| 08:46 | Se intenta forzar re-deploy con commit vacío (`35d382c`) |
| 08:56 | Fix de lint (`5b626fb`) — CI seguía fallando por `<img>` y `setState-in-effect` |
| 09:01 | **Descubrimiento #1:** `.cpanel.yml` usaba `export DEPLOYPATH=...` que no persiste entre tareas. Fix: paths literales (`0ca5752`) |
| 09:05 | **Descubrimiento #2:** Secrets de GitHub Actions (`CPANEL_USER`, `CPANEL_HOST`, `CPANEL_API_TOKEN`) nunca fueron configurados (`eebf459`) |
| 09:28 | **Descubrimiento #3:** `CPANEL_HOST` estaba mal (`hxx41` vs `host41`) |
| 09:37 | **Descubrimiento #4:** openresty proxy devolvía 415 sin `Content-Type` header. Fix: agregar headers JSON (`0a28491`) |
| 09:40 | Deploy automático funciona ✅ pero rutas siguen sin aparecer |
| 09:50 | **Descubrimiento #5:** El deploy copia archivos pero la cache de rutas del servidor seguía vieja (opcache PHP) |
| 09:58 | Script `cache-clear.php` limpia cache de rutas. **Eliminación funciona** ✅ |

---

## Causa Raíz (Root Cause)

Se identificaron **5 fallas encadenadas**:

### Falla 1: `.cpanel.yml` con variables de shell (CRÍTICA)

```yaml
# ❌ ANTES — Cada tarea corre en su propio shell aislado
- export DEPLOYPATH=/home/danheiex/api.danheiexpress.com
- /bin/cp -R api/. $DEPLOYPATH/          # ← $DEPLOYPATH es "" (vacío!)
- cd $DEPLOYPATH && php artisan route:cache  # ← cd "" = cd $HOME
```

**Por qué falló:** cPanel ejecuta cada línea de `.cpanel.yml` en un proceso shell independiente. La variable `DEPLOYPATH` solo existía en el shell de la línea 1 y era invisible para todas las demás.

**Impacto:** Todas las tareas de deploy (copiar código, composer install, migraciones, route:cache) fallaban silenciosamente o ejecutaban en el directorio equivocado.

```yaml
# ✅ DESPUÉS — Path literal en cada línea
- /bin/cp -R api/. /home/danheiex/api.danheiexpress.com/
- cd /home/danheiex/api.danheiexpress.com && php artisan route:cache
```

### Falla 2: Secrets de GitHub Actions nunca configurados

Los 3 secrets necesarios para el deploy automático (`CPANEL_USER`, `CPANEL_HOST`, `CPANEL_API_TOKEN`) no existían en el repositorio. El workflow `deploy-api.yml` fallaba inmediatamente sin explicación.

### Falla 3: Hostname incorrecto

El hostname del servidor cPanel es `host41.latinoamericahosting.com`, pero se había documentado como `hxx41`. Error de lectura de la URL.

### Falla 4: Autenticación y headers para cPanel API

El proxy openresty delante de cPanel requiere:
- Header `Content-Type: application/json`
- Header `Accept: application/json`

Sin estos, devuelve HTTP 415 (Unsupported Media Type). Además, la autenticación correcta para API tokens de cPanel es:
```
Authorization: cpanel usuario:TOKEN
```
No HTTP Basic Auth (`-u usuario:token`).

### Falla 5: Cache de PHP (opcache)

Incluso con los archivos correctos en el servidor, PHP seguía sirviendo la versión vieja de los archivos por el opcache. Fue necesario limpiar la cache de rutas de Laravel (`route:clear` + `route:cache`) para que las nuevas rutas fueran reconocidas.

---

## Archivos Modificados

### `.cpanel.yml`
- Eliminadas variables `export DEPLOYPATH`
- Todas las rutas ahora usan el path literal `/home/danheiex/api.danheiexpress.com`
- Eliminada referencia a `deploy-fix.php` (archivo borrado)

### `.github/workflows/deploy-api.yml`
- Agregada validación de secrets con mensajes claros de cuál falta
- Cambiada autenticación de `-u` (Basic) a `Authorization: cpanel user:token`
- Agregados headers `Content-Type` y `Accept` para evitar 415
- Agregado fallback de auth (intenta header primero, luego basic)
- Agregado `workflow_dispatch` para poder ejecutar manualmente
- Mejorado error reporting con respuestas HTTP visibles en el log

### `.github/workflows/frontend-ci.yml` (sin cambios)
Los errores de lint se corrigieron en los archivos fuente:

### `frontend/src/app/(admin)/layout.tsx`
- `<img>` del logo reemplazado por `<Image>` de `next/image` (mejor LCP)
- Agregado `import Image from "next/image"`

### `frontend/src/app/(admin)/pedidos/page.tsx`
- `eslint-disable` para `<img>` con blob URL (no se puede usar `next/image` con `URL.createObjectURL`)

### `frontend/src/app/(admin)/rutas/page.tsx`
- `eslint-disable` para `react-hooks/set-state-in-effect` (patrón estándar de data-fetching)

---

## Medidas Preventivas

### 1. Regla para `.cpanel.yml`
> **NUNCA usar `export` para definir variables en `.cpanel.yml`.** Cada tarea corre en un shell aislado. Usar paths literales siempre.

### 2. Health check post-deploy
El workflow `deploy-api.yml` ya incluye un health check que verifica `api.danheiexpress.com/api/health` después de cada deploy.

### 3. Checklist de deploy manual
Si necesitas hacer deploy manual desde cPanel:
1. cPanel → Control de versión de Git → P16-DHE-Admin-Web
2. "Actualizar desde remoto" (git pull)
3. "Desplegar commit HEAD" (ejecuta `.cpanel.yml`)
4. Verificar: `https://api.danheiexpress.com/api/health`

### 4. Si las rutas no funcionan en producción
```
Problema: "The route X could not be found"
Solución: Limpiar cache de rutas
```

Pasos:
1. Ir a cPanel → Administrador de Archivos
2. Navegar a `api.danheiexpress.com/public/`
3. Crear archivo temporal `cache-clear.php` con:
```php
<?php
require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
Artisan::call('route:clear');
Artisan::call('route:cache');
echo json_encode(['ok' => true, 'output' => Artisan::output()]);
```
4. Abrir `https://api.danheiexpress.com/cache-clear.php` en el navegador
5. **BORRAR el archivo inmediatamente después**

### 5. Secrets de GitHub
Los siguientes secrets deben existir en GitHub → Settings → Secrets → Actions:

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `CPANEL_USER` | `danheiex` | Usuario de cPanel |
| `CPANEL_HOST` | `host41.latinoamericahosting.com` | Hostname del servidor (sin https, sin :2083) |
| `CPANEL_API_TOKEN` | *(token de API)* | Creado en cPanel → Seguridad → API Tokens |

---

## Lecciones Aprendidas

1. **Nunca asumir que el deploy funciona** — Verificar siempre que los archivos nuevos existen en producción.
2. **Variables de shell no persisten entre tareas** de `.cpanel.yml` — Este es un "gotcha" documentado de cPanel pero fácil de pasar por alto.
3. **El opcache de PHP** puede servir código viejo incluso después de actualizar archivos — siempre limpiar cache de Laravel después de un deploy.
4. **Configurar secrets antes de crear workflows** — Un workflow sin secrets falla sin dar información útil.
5. **Hostnames exactos** — `host41` ≠ `hxx41`. Copiar/pegar de la barra de dirección, nunca escribir de memoria.
