# Danhei Express — Arquitectura y Despliegue

> **Última actualización:** 25 junio 2026
> **Autor:** Equipo Danhei Express

---

## Visión General

Danhei Express tiene **4 componentes** distribuidos en **3 plataformas** diferentes:

```
┌─────────────────────────────────────────────────────────────────┐
│                        GITHUB                                   │
│  gallegosdiego/P16-DHE-Admin-Web     (monorepo: api/ + frontend/)│
│  gallegosdiego/P15-DHE-App-Repartidor (app móvil piloto)        │
└──────────┬──────────────────────┬───────────────────────────────┘
           │                      │
     ┌─────▼──────┐        ┌─────▼──────┐
     │   VERCEL   │        │   CPANEL   │
     │  (auto)    │        │  (manual)  │
     │            │        │            │
     │ Frontend   │        │ API Laravel│
     │ Next.js    │───────►│ LiteSpeed  │
     │            │  API   │            │
     └────────────┘ calls  │ Landing    │
                           └─────▲──────┘
                                 │ API calls
                           ┌─────┴──────┐
                           │   CELULAR  │
                           │  APK v2.1  │
                           └────────────┘
```

---

## Componentes

### 1. API Backend (Laravel 11 + PHP)

| Campo | Valor |
|-------|-------|
| **Repo** | `P16-DHE-Admin-Web` → carpeta `api/` |
| **Hosting** | cPanel / LiteSpeed |
| **IP Servidor** | `148.113.221.17` |
| **URL Producción** | `https://api.danheiexpress.com` |
| **cPanel URL** | `https://api.danheiexpress.com:2083` |
| **Usuario cPanel** | `danheiex` |
| **Document Root** | `/home/danheiex/api.danheiexpress.com` |
| **Base de datos** | MySQL (producción) / SQLite (desarrollo) |
| **Auth** | Laravel Sanctum (Bearer tokens) |
| **Deploy** | ⚠️ **MANUAL** vía cPanel Git Version Control |

#### Cómo hacer deploy del backend

1. Hacer `git push origin main` desde tu PC
2. Entrar a **https://api.danheiexpress.com:2083**
3. Ir a **Git Version Control** → **P16-DHE-Admin-Web**
4. Clic en **"Extraer o desplegar"**
5. Clic en **"Actualizar desde remoto"** (esperar)
6. Clic en **"Desplegar commit HEAD"** (esperar)
7. Validar `https://api.danheiexpress.com/api/deploy-check`

El deploy de cPanel queda en modo conservador (`.cpanel.yml`):
```
1. Copia api/ -> /home/danheiex/api.danheiexpress.com/
2. Ejecuta scripts/repair-cod-schema.php para crear columnas COD faltantes
3. Ejecuta scripts/repair-driver-mobile-geo-schema.php para crear columnas moviles/geograficas faltantes
```

No ejecuta `composer`, migraciones generales, seeders ni caches. El unico parche legado en el deploy es:

- `repair-cod-schema.php`: agrega columnas COD faltantes.
- `repair-driver-mobile-geo-schema.php`: agrega columnas `intake_photo`, `recipient_lat`, `recipient_lng` y `geocoded_at` si faltan.

> ⚠️ **IMPORTANTE**: El document root es `/home/danheiex/api.danheiexpress.com`, **NO** `/home/danheiex/laravel_app`. Si se cambia, el deploy no hace nada.

---

### 2. Admin Frontend (Next.js 15)

| Campo | Valor |
|-------|-------|
| **Repo** | `P16-DHE-Admin-Web` → carpeta `frontend/` |
| **Hosting** | Vercel |
| **Deploy** | ✅ **AUTOMÁTICO** con cada push a `main` |
| **CI** | GitHub Actions: lint → typecheck → build → e2e |
| **API endpoint** | `https://api.danheiexpress.com` (configurado en CSP de `vercel.json`) |

#### Cómo hacer deploy del frontend

**No necesitas hacer nada.** Vercel detecta cada push a `main` y despliega automáticamente en ~60 segundos.

#### Verificacion minima post-deploy del frontend

- Abrir `https://admin.danheiexpress.com/login`.
- Confirmar que el login renderiza y no muestra `Error de conexi�n con auth API.` al intentar autenticar.
- Confirmar que la API de produccion responde:
  - `https://api.danheiexpress.com/api/deploy-check`
  - `POST https://api.danheiexpress.com/api/login`
- Si la API responde bien pero el frontend sigue mostrando error de conexion:
  - revisar que el build publicado no haya quedado apuntando a `127.0.0.1:8000/api`;
  - probar en ventana incognito o limpiar cache del navegador movil;
  - confirmar que el deploy ya incluya el hotfix `fix(auth): harden production api base resolution`.

---

### 3. Landing Page

| Campo | Valor |
|-------|-------|
| **Repo** | `P13-DHE-Landing-Page-` |
| **Hosting** | cPanel / LiteSpeed (mismo servidor) |
| **URL** | `https://danheiexpress.com` |
| **Document Root** | `/home/danheiex/public_html` |
| **Deploy** | Manual vía cPanel Git Version Control |

---

### 4. App Piloto (React Native / Expo)

| Campo | Valor |
|-------|-------|
| **Repo** | `P15-DHE-App-Repartidor` |
| **Framework** | Expo SDK 54 + React Native |
| **API (dev)** | `http://127.0.0.1:8000/api` |
| **API (prod)** | `https://api.danheiexpress.com/api` |
| **APK actual** | `DanheiExpress-v2.1.0.apk` (60.78 MB) |
| **Deploy** | Build manual con `gradlew assembleRelease` |

#### Cómo generar un nuevo APK

```bash
cd P15-DHE-App-Repartidor
npx expo prebuild --clean
cd android
./gradlew assembleRelease
# APK en: android/app/build/outputs/apk/release/
```

---

## Dominios en cPanel

| Dominio | Raíz del documento | Uso |
|---------|-------------------|-----|
| `danheiexpress.com` (principal) | `/home/danheiex/public_html` | Landing page |
| `api.danheiexpress.com` | `/home/danheiex/api.danheiexpress.com` | API Laravel |

---

## Repos Git en cPanel

| Repositorio | Ruta en servidor | Repo remoto |
|-------------|-----------------|-------------|
| P13-DHE-Landing-Page- | `/home/danheiex/repositories/P13-DHE-Landing-Page-` | GitHub |
| P16-DHE-Admin-Web | `/home/danheiex/repositories/P16-DHE-Admin-Web` | GitHub |

> **Nota**: Los repos se clonan en `/repositories/` y el `.cpanel.yml` copia los archivos necesarios a la carpeta del dominio.

---

## Flujo de Deploy Completo

```
                    git push origin main
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
      ┌──────────────┐         ┌──────────────┐
      │    VERCEL     │         │    GITHUB    │
      │  auto-deploy  │         │   (código)   │
      │  frontend/    │         └──────┬───────┘
      │  ~60 seg      │                │
      └──────────────┘       Tú entras a cPanel
                                       │
                              ┌────────▼────────┐
                              │  Git Version    │
                              │  Control        │
                              │                 │
                              │ 1. Actualizar   │
                              │    desde remoto │
                              │                 │
                              │ 2. Desplegar    │
                              │    commit HEAD  │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  .cpanel.yml    │
                              │                 │
                              │ cp api/ → dominio│
                              │ parche COD      │
                              │ sin migraciones │
                              │ sin seeders     │
                              └─────────────────┘
```

---

## Restricciones del Servidor

### LiteSpeed NO parsea JSON body

El servidor LiteSpeed **no procesa** `Content-Type: application/json` en el body de requests POST/PUT. Todo debe enviarse como **FormData** (multipart/form-data).

```
❌ MAL:
fetch('/api/login', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})

✅ BIEN:
const formData = new FormData();
formData.append('email', email);
formData.append('password', password);
fetch('/api/login', {
  headers: { Accept: 'application/json' },
  body: formData
})
```

Para **PUT** se usa method spoofing de Laravel:
```
formData.append('_method', 'PUT');
fetch('/api/resource/1', { method: 'POST', body: formData })
```

Para **DELETE** no se envía body.

### SSH deshabilitado

El acceso SSH al servidor está **bloqueado** (puertos 22, 222, 2222, 2200). Solo se puede gestionar via cPanel web (puerto 2083).

---

## Entornos

### Desarrollo local

```bash
# Backend (Laravel)
cd P16-DHE-Admin-Web/api
php artisan serve                    # http://127.0.0.1:8000

# Frontend (Next.js)
cd P16-DHE-Admin-Web/frontend
npm run dev                          # http://localhost:3000

# App piloto (Expo)
cd P15-DHE-App-Repartidor
npx expo start                       # Expo DevTools
```

### Producción

| Servicio | URL |
|----------|-----|
| API | `https://api.danheiexpress.com/api` |
| Admin | Vercel (ver URL en dashboard de Vercel) |
| Landing | `https://danheiexpress.com` |
| App | APK instalado en celular |

---

## Credenciales y Secrets

No hay secrets activos para deploy automatico a cPanel. El backend se despliega manualmente desde Git Version Control de cPanel.

### Variables de entorno del backend (`.env` en producción)

El archivo `.env` de producción está en `/home/danheiex/api.danheiexpress.com/.env` y **NO se sobreescribe** con el deploy (no está en git). Contiene:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `DB_CONNECTION=mysql`
- `GOOGLE_MAPS_API_KEY=...`
- `SHIPMENT_DEFAULT_CITY=Bogota`
- `SHIPMENT_GEOCODER_USER_AGENT=Danhei Express/1.0` (opcional)
- Credenciales de MySQL, Mail, etc.

> ⚠️ **NUNCA** subir el `.env` de producción a GitHub.

---

## Checklist de Problemas Comunes

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "Credenciales incorrectas" al login | Backend no recibe datos (JSON en LiteSpeed) | Enviar FormData, no JSON |
| Deploy no actualiza la API | Path incorrecto en `.cpanel.yml` | Verificar que DEPLOYPATH = `/home/danheiex/api.danheiexpress.com` |
| Deploy no actualiza la API | No se hizo deploy en cPanel | Entrar a cPanel → Git → Actualizar → Desplegar |
| Frontend no se actualiza | — | Se actualiza solo con push (Vercel). Esperar ~60s |
| Piloto no puede loguearse | No tiene cuenta User vinculada | Recrear piloto desde admin (el código nuevo crea Driver + User) |
| Rutas nuevas no funcionan en prod | Cache vieja u opcache del hosting | Validar manualmente en cPanel; el deploy ya no ejecuta `route:cache` automáticamente |
| `422 Unprocessable Entity` | Campos requeridos no llegan | Verificar que FormData incluye todos los campos |

### Validacion COD post-deploy

Despues de desplegar cambios del API para la app piloto, abrir:

```text
https://api.danheiexpress.com/api/deploy-check
```

Para el flujo COD, `database.cod_collection_ready` debe ser `true`. Si aparece `false`, el codigo ya puede estar actualizado, pero falta aplicar el cambio de base de datos como paso operativo separado.

Para el mapa del piloto:

- `database.driver_mobile_runtime_ready` debe ser `true`;
- `database.shipment_geodata_runtime_ready` debe ser `true`;
- `services.shipment_geocoding_fallback_enabled` debe ser `true`.

`GOOGLE_MAPS_API_KEY` mejora precision y trazado Google, pero ya no bloquea la activacion base del mapa porque existe fallback de geocodificacion sin credenciales y respaldo por centro de zona.

