# Manual Maestro de Infraestructura, Seguridad y Operaciones
## Sistema de Logística y Distribución — Danhei Express (DHE)
**Versión:** 1.0  
**Arquitecto:** Popus  
**Ejecutor:** Antigravity  
**Estado:** PRODUCCIÓN-READY  

---

## 1. Arquitectura Global y Flujo de Datos

El ecosistema de **Danhei Express (DHE)** está diseñado bajo una arquitectura distribuida y desacoplada, utilizando servicios administrados para el Frontend y servidores dedicados para el Backend y base de datos.

### 1.1 Diagrama de Arquitectura Global (Mermaid)

El siguiente diagrama detalla cómo interactúan los distintos componentes del ecosistema, los límites de seguridad (HTTPS/SSL), y el flujo de los datos desde las aplicaciones cliente/conductor hasta la base de datos MySQL en cPanel.

```mermaid
graph TD
    %% Clientes e Interfaces
    subgraph Interfaces ["Interfaces de Usuario"]
        P13["P13 - Landing Page<br/>(HTML/CSS/JS Estático)<br/>cPanel HTTPS"]
        P14["P14 - Portal Cliente<br/>(Next.js 16 + TWv4)<br/>Vercel HTTPS"]
        P16["P16 - Panel Admin<br/>(Next.js 16 + TWv4)<br/>Vercel HTTPS"]
        P15["P15 - App Repartidor<br/>(React Native / Expo)<br/>Dispositivo Android"]
    end

    %% Capa de Red e Infraestructura
    subgraph Red ["Capa de Red y Enrutamiento"]
        DNS["DNS Zone Editor<br/>(cPanel Zone Manager)"]
        VercelDNS["Vercel CNAME Target<br/>(cname.vercel-dns.com)"]
        SSL["AutoSSL cPanel / Vercel Edge SSL"]
    end

    %% Backend y Base de Datos
    subgraph Backend ["Servidor de Aplicación (cPanel H1)"]
        API["Laravel 13 API Backend<br/>(api.danheiexpress.com)"]
        CORS["CORS Policy Middleware<br/>(Origins Whitelist)"]
        Sanctum["Sanctum Bearer Auth<br/>(Tokens de Acceso)"]
        MySQL[("MySQL Database<br/>(danhei_prod)")]
    end

    %% Relaciones de Enrutamiento DNS
    P13 -.->|Desplegado en| DNS
    P14 -->|CNAME CNAME| VercelDNS
    P16 -->|CNAME CNAME| VercelDNS
    VercelDNS -.->|Enruta a| DNS

    %% Flujos de Datos y Autenticación
    P14 ====>|HTTPS Requests + Bearer Token| CORS
    P16 ====>|HTTPS Requests + Bearer Token| CORS
    P15 ====>|HTTPS Requests + Bearer Token| CORS
    
    CORS --> Sanctum
    Sanctum --> API
    API <===>|Lectura/Escritura (PDO)| MySQL

    %% Estilos Visuales
    style P13 fill:#2a2a3e,stroke:#ff8616,stroke-width:2px,color:#fff
    style P14 fill:#2a2a3e,stroke:#d1007f,stroke-width:2px,color:#fff
    style P16 fill:#2a2a3e,stroke:#1f86ff,stroke-width:2px,color:#fff
    style P15 fill:#2a2a3e,stroke:#12a85f,stroke-width:2px,color:#fff
    style API fill:#1a1a2e,stroke:#e72256,stroke-width:2px,color:#fff
    style MySQL fill:#1a1a2e,stroke:#12a85f,stroke-width:2px,color:#fff
```

---

## 2. Requisitos de Sistema y Entornos

Para garantizar el correcto funcionamiento del ecosistema, cada entorno de ejecución debe cumplir estrictamente con la siguiente matriz de versiones y configuraciones de sistema.

### 2.1 Matriz de Versiones de Software

| Componente | Framework / Runtime | Versión Mínima | Versión Recomendada | Administrador de Paquetes / Despliegue |
| :--- | :--- | :--- | :--- | :--- |
| **API Backend** | Laravel Framework | `13.0.0` | `13.8.0` | Composer `2.6+` / PHP `8.2.0+` |
| **Landing Page (P13)** | HTML Estático | HTML5 / CSS3 / ES6 | N/A | Despliegue vía cPanel File Manager / Git |
| **Portal Cliente (P14)** | Next.js (Turbopack) | `16.0.0` | `16.2.6` | npm `10.x` / Node.js `20.x` / Vercel |
| **Panel Admin (P16)** | Next.js (Turbopack) | `16.0.0` | `16.2.6` | npm `10.x` / Node.js `20.x` / Vercel |
| **App Repartidor (P15)** | React Native (Expo) | Expo `~54.0.33` | Expo `~54.0.33` | npm `10.x` / React Native `0.76+` / EAS Build |

### 2.2 Requisitos y Extensiones de PHP (cPanel)

El entorno del servidor cPanel H1 debe tener habilitadas obligatoriamente las siguientes extensiones de PHP en la versión **PHP 8.2 o superior**:

*   `pdo_mysql` (Para conexión a base de datos de producción)
*   `openssl` y `tokenizer` (Para cifrado de datos y funcionamiento de Laravel)
*   `mbstring` (Para manipulación de strings multibyte)
*   `xml` y `ctype` (Para parsing de datos y requests)
*   `json` (Para codificación de payloads de la API)
*   `bcmath` (Para cálculos matemáticos de alta precisión en el Módulo Financiero)
*   `fileinfo` (Para verificación de tipos en carga de archivos e imágenes de evidencia)

### 2.3 Configuraciones Recomendadas en `php.ini` (cPanel)

```ini
max_execution_time = 60
memory_limit = 256M
upload_max_filesize = 10M
post_max_size = 12M
max_input_vars = 2000
```

---

## 3. Transición de Base de Datos y Auditoría SQLite → MySQL

Dado que el desarrollo local (`DEV`) utiliza **SQLite** por su ligereza y facilidad de pruebas, y producción (`PROD`) utiliza **MySQL**, es obligatorio auditar y compatibilizar las consultas SQL crudas (`raw queries`) para evitar fallos de sintaxis en el despliegue final.

### 3.1 Matriz de Compatibilidad SQL

| Operación | Sintaxis SQLite | Sintaxis MySQL | Sintaxis Compatible (Recomendada) |
| :--- | :--- | :--- | :--- |
| **Reemplazo de Nulos** | `IFNULL(columna, 0)` | `IFNULL(columna, 0)` | `COALESCE(columna, 0)` (Soportado por ambos) |
| **Formateo de Fechas** | `strftime('%Y-%m', created_at)` | `DATE_FORMAT(created_at, '%Y-%m')` | Usar Helper `DbCompat::dateFormat()` |
| **Fecha/Hora Actual** | `datetime('now')` | `NOW()` | Usar Helper `DbCompat::now()` o `now()` de Eloquent |
| **Concatenación** | `nombre \|\| ' ' \|\| apellido` | `CONCAT(nombre, ' ', apellido)` | Usar Helper `DbCompat::concat()` |
| **Conversión de Tipo** | `CAST(columna AS TEXT)` | `CAST(columna AS CHAR)` | Usar Eloquent casting en los Modelos Laravel |

### 3.2 Implementación del Helper de Compatibilidad (`DbCompat.php`)

Para consultas raw en reportería o estadísticas avanzadas, se debe implementar este helper centralizado en el API backend:

```php
<?php

namespace App\Helpers;

use Illuminate\Support\Facades\DB;

class DbCompat
{
    public static function dateFormat(string $column, string $format): string
    {
        if (DB::getDriverName() === 'sqlite') {
            return "strftime('{$format}', {$column})";
        }
        
        // Conversión básica de placeholders SQLite a MySQL
        $mysqlFormat = str_replace(
            ['%Y', '%m', '%d', '%H', '%M', '%S'],
            ['%Y', '%m', '%d', '%H', '%i', '%S'],
            $format
        );
        return "DATE_FORMAT({$column}, '{$mysqlFormat}')";
    }

    public static function now(): string
    {
        return DB::getDriverName() === 'sqlite' ? "datetime('now')" : 'NOW()';
    }

    public static function concat(string ...$parts): string
    {
        if (DB::getDriverName() === 'sqlite') {
            return implode(" || ", $parts);
        }
        return "CONCAT(" . implode(", ", $parts) . ")";
    }
}
```

### 3.3 Lista de Control de Auditoría en Controladores

Antes de realizar el merge a la rama `main`, audite obligatoriamente los siguientes archivos buscando la cadena `DB::raw` o `whereRaw` para validar compatibilidad:
*   `app/Http/Controllers/ShipmentController.php` (Queries de dashboards e indicadores horarios)
*   `app/Http/Controllers/FinancialController.php` (Liquidación de conductores y cobros COD)
*   `app/Http/Controllers/ReportController.php` (Estadísticas generales y generación de reportes)

---

## 4. Matriz Maestra de Variables de Entorno (.env)

Todas las variables de configuración deben ser inyectadas a través del entorno de ejecución. Nunca almacene secretos ni tokens en el código fuente.

### 4.1 Variables del Backend (API - Laravel)

| Variable | Tipo / Ejemplo | Requerida en | Propósito |
| :--- | :--- | :--- | :--- |
| `APP_NAME` | String (`Danhei Express API`) | Todos | Nombre de la aplicación |
| `APP_ENV` | `production` \| `local` | Todos | Determina el nivel de debug y manejo de excepciones |
| `APP_KEY` | String (Base64) | Todos | Llave de cifrado de la aplicación (32 bytes) |
| `APP_DEBUG` | `false` | Producción | **Debe ser false** en producción para evitar fugas de información |
| `APP_URL` | `https://api.danheiexpress.com` | Todos | URL base pública de la API |
| `DB_CONNECTION` | `mysql` | Producción | Driver de base de datos |
| `DB_HOST` | `127.0.0.1` | Producción | Servidor de base de datos MySQL de cPanel |
| `DB_PORT` | `3306` | Producción | Puerto del servidor MySQL |
| `DB_DATABASE` | `danhei_prod` | Producción | Nombre de la base de datos |
| `DB_USERNAME` | `danhei_user` | Producción | Usuario con privilegios de lectura/escritura |
| `DB_PASSWORD` | *Secreto* | Producción | Contraseña del usuario MySQL |
| `CORS_ALLOWED_ORIGINS` | `https://admin.danheiexpress.com,https://portal.danheiexpress.com` | Producción | Orígenes permitidos (CORS) |
| `ADMIN_INITIAL_PASSWORD` | *Secreto* | Producción | Contraseña inicial autogenerada del Superadmin |

### 4.2 Variables de los Frontends (Next.js - P14 / P16)

| Variable | Tipo / Ejemplo | Requerida en | Propósito |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `https://api.danheiexpress.com/api` | Compilación / Runtime | URL de comunicación con los endpoints de la API |

---

## 5. Playbook de Hardening y Seguridad

La seguridad del ecosistema es crítica, especialmente al manejar información confidencial de clientes e información financiera de cobros contra entrega (COD).

### 5.1 Directiva de Cabeceras (HTTP Security Headers)

Tanto el API (cPanel) como las aplicaciones Web (Vercel) deben emitir estrictamente los siguientes headers de seguridad en cada respuesta HTTP:

*   **`X-Frame-Options: DENY`**: Evita ataques de Clickjacking impidiendo que la aplicación sea embebida en iframes externos.
*   **`X-Content-Type-Options: nosniff`**: Previene al navegador de interpretar archivos basados en su tipo MIME detectado, mitigando ataques de inyección de código.
*   **`Referrer-Policy: strict-origin-when-cross-origin`**: Protege la privacidad de las URLs de origen al navegar externamente.
*   **`Permissions-Policy`**: Restringe el acceso a hardware no utilizado:
    ```http
    camera=(), microphone=(), geolocation=()
    ```
*   **`Strict-Transport-Security`**: Fuerza el uso exclusivo de HTTPS:
    ```http
    max-age=63072000; includeSubDomains; preload
    ```
*   **`Content-Security-Policy (CSP)`**: Define las fuentes confiables de scripts, estilos e imágenes para evitar Cross-Site Scripting (XSS).

### 5.2 Implementación en Vercel (`vercel.json` para P14/P16)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://api.danheiexpress.com; connect-src 'self' https://api.danheiexpress.com https://www.google-analytics.com;"
        }
      ]
    }
  ]
}
```

### 5.3 Redirección y Hardening en cPanel API (`api/.htaccess`)

Para asegurar que todo el tráfico vaya a HTTPS y al directorio `/public` de Laravel de manera transparente, implemente el siguiente archivo en el directorio raíz de la API (`/home/usuario/api.danheiexpress.com/.htaccess`):

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
    
    RewriteRule ^(.*)$ public/$1 [L]
</IfModule>

# Deshabilitar firmas del servidor y navegación de directorios
ServerSignature Off
Options -Indexes

# Headers de Seguridad
Header set X-Frame-Options "DENY"
Header set X-Content-Type-Options "nosniff"
Header set Referrer-Policy "strict-origin-when-cross-origin"
Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
Header set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
```

### 5.4 Políticas de Acceso (CORS)

La API backend bloquea cualquier petición que no proceda de los dominios explícitamente listados. En el archivo `api/config/cors.php`, asegúrese de no usar comodines (`*`) en producción:

```php
'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'https://admin.danheiexpress.com,https://portal.danheiexpress.com')),
```

---

## 6. Guía Unificada de Despliegue (cPanel + Vercel)

Siga este orden estricto de despliegue para evitar inconsistencias en el ecosistema.

### 6.1 Paso 1: Configurar Subdominio y SSL en cPanel

1.  Ingrese al cPanel de `danheiexpress.com`.
2.  Vaya a **Dominios > Dominios** y haga clic en **Create A New Domain**.
3.  Configure el subdominio de la API:
    *   **Domain**: `api.danheiexpress.com`
    *   **Document Root**: `/home/usuario/api.danheiexpress.com`
4.  Vaya a **Seguridad > SSL/TLS Status**. Seleccione `api.danheiexpress.com` y haga clic en **Run AutoSSL**. Espere a que el certificado se autogenere (indicador verde).

### 6.2 Paso 2: Crear Base de Datos y Cargar API

1.  Vaya a **Bases de Datos > MySQL Database Wizard**.
2.  Cree la base de datos `danhei_prod`.
3.  Cree el usuario `danhei_user`, genere una contraseña segura y anótela.
4.  Asocie el usuario a la base de datos otorgando **TODOS LOS PRIVILEGIOS**.
5.  Empaquete el API local excluyendo `vendor` y `node_modules` en un archivo ZIP.
6.  Suba el ZIP vía **File Manager** a `/home/usuario/api.danheiexpress.com/` y descomprímalo allí.
7.  Asegúrese de mover o crear el archivo `.env` configurado con las credenciales de base de datos MySQL y la variable `APP_ENV=production`.
8.  Abra una terminal SSH en cPanel, navegue al directorio y ejecute:
    ```bash
    composer install --no-dev --optimize-autoloader
    php artisan key:generate
    php artisan migrate --force
    php artisan db:seed --class=ProductionSeeder --force
    php artisan config:cache
    php artisan route:cache
    ```

### 6.3 Paso 3: Configurar Zona DNS en cPanel

1.  Vaya a **Dominios > Zone Editor**.
2.  Haga clic en **Manage** al lado de `danheiexpress.com`.
3.  Agregue los siguientes registros CNAME para enrutar los subdominios de Vercel:
    *   **Name**: `admin.danheiexpress.com.` | **Type**: `CNAME` | **Record**: `cname.vercel-dns.com.`
    *   **Name**: `portal.danheiexpress.com.` | **Type**: `CNAME` | **Record**: `cname.vercel-dns.com.`

### 6.4 Paso 4: Despliegue de P14 y P16 en Vercel

1.  En el Dashboard de Vercel, importe los repositorios `P14-DHE-app-Cliente-` y `P16-DHE-Admin-Web`.
2.  Configure las opciones de compilación:
    *   **Framework Preset**: `Next.js`
    *   **Root Directory**: `p14-cliente-web` (para P14) y `frontend` (para P16)
3.  Configure las Variables de Entorno en Vercel Settings:
    *   `NEXT_PUBLIC_API_URL` = `https://api.danheiexpress.com/api`
4.  Agregue los dominios personalizados en la pestaña **Settings > Domains**:
    *   `portal.danheiexpress.com` (para el Portal del Cliente)
    *   `admin.danheiexpress.com` (para el Panel de Administración)
5.  Haga clic en **Deploy**. Vercel detectará el registro DNS CNAME y generará automáticamente los certificados SSL.

---

## 7. Runbook de Respaldos (Backup) y Recuperación

El resguardo de la información financiera y operativa es vital para el cumplimiento legal y la continuidad de las operaciones.

### 7.1 Script Automatizado de Respaldo (`backup.sh`)

Cree el siguiente script en el directorio `/home/usuario/scripts/db_backup.sh` en cPanel:

```bash
#!/bin/bash

# Configuración
DB_USER="danhei_user"
DB_PASS="TU_PASSWORD_AQUI"
DB_NAME="danhei_prod"
BACKUP_DIR="/home/usuario/backups/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Crear directorio si no existe
mkdir -p "$BACKUP_DIR"

# Ejecutar volcado
mysqldump -u "$DB_USER" -p"$DB_PASS" --single-transaction --quick "$DB_NAME" | gzip > "$BACKUP_DIR/danhei_$DATE.sql.gz"

# Nivel de éxito
if [ $? -eq 0 ]; then
    echo "[$(date)] Respaldo de Base de Datos exitoso." >> "$BACKUP_DIR/backup.log"
else
    echo "[$(date)] ERROR al realizar respaldo." >> "$BACKUP_DIR/backup.log"
fi

# Eliminar respaldos antiguos de más de 7 días
find "$BACKUP_DIR" -type f -name "danhei_*.sql.gz" -mtime +$RETENTION_DAYS -delete
```

### 7.2 Programación en Cron (cPanel)

1.  Ingrese a cPanel > **Avanzado > Cron Jobs**.
2.  Cree una tarea programada para ejecutarse diariamente a las **3:00 AM** (hora de menor tráfico):
    *   **Minute**: `0`
    *   **Hour**: `3`
    *   **Day**: `*`
    *   **Month**: `*`
    *   **Weekday**: `*`
    *   **Command**: `/bin/bash /home/usuario/scripts/db_backup.sh >/dev/null 2>&1`

### 7.3 Procedimiento de Restauración ante Fallos

En caso de corrupción de datos o desastre, siga este procedimiento para restaurar el último respaldo:

1.  Localice el archivo de respaldo comprimido en `/home/usuario/backups/mysql/`.
2.  Descomprima el archivo SQL:
    ```bash
    gunzip -c /home/usuario/backups/mysql/danhei_YYYYMMDD_HHMMSS.sql.gz > restore.sql
    ```
3.  Proceda a inyectar el archivo SQL en la base de datos de producción (Advertencia: esto sobreescribirá todos los datos actuales):
    ```bash
    mysql -u danhei_user -p danhei_prod < restore.sql
    ```
4.  Elimine el archivo temporal `restore.sql` por motivos de seguridad:
    ```bash
    rm restore.sql
    ```

---

## 8. Observabilidad y Monitoreo

### 8.1 Endpoint de Diagnóstico (`/api/health`)

El backend de Laravel cuenta con un endpoint público optimizado y rápido para monitorear la salud del sistema. Este endpoint verifica la conexión con la base de datos MySQL activa:

```php
// api/routes/api.php
Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
        return response()->json([
            'status' => 'ok',
            'database' => 'connected',
            'timestamp' => now()->toIso8601String()
        ], 200);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => 'Base de datos no disponible.',
            'timestamp' => now()->toIso8601String()
        ], 500);
    }
});
```

### 8.2 Logging y Auditoría Financiera

Cualquier cambio financiero (registro de cobro COD, confirmación de recaudo o liquidación de conductores) emite un registro en el log diario de Laravel localizado en `api/storage/logs/laravel.log`:

```php
Log::channel('daily')->info('Financial Action Triggered', [
    'action' => 'settle_batch',
    'triggered_by' => auth()->id(),
    'client_ip' => request()->ip(),
    'payload' => request()->except(['password', 'token']),
    'timestamp' => now()
]);
```

### 8.3 Configuración de UptimeRobot

Para recibir notificaciones inmediatas en caso de caída, configure 4 monitores en su cuenta de UptimeRobot utilizando el tipo de monitor **HTTPS**:

1.  **Monitor API**: `https://api.danheiexpress.com/api/health` (Intervalo: 5 min)
2.  **Monitor Admin**: `https://admin.danheiexpress.com` (Intervalo: 5 min)
3.  **Monitor Portal Cliente**: `https://portal.danheiexpress.com` (Intervalo: 5 min)
4.  **Monitor Landing Page**: `https://www.danheiexpress.com` (Intervalo: 5 min)

---
**Manual Consolidado y Validado de acuerdo con la Ley de Secuencia de la Plataforma DHE.**
