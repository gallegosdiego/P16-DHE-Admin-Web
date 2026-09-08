# Certificados SSL de PHP para la geocodificación

## El síntoma

La detección de localidad no devuelve nada: ni Google ni Nominatim responden, y el sistema cae a sus respaldos
(centroide de zona, ancla estática) sin que nadie note que la geocodificación real nunca ocurrió.

## La causa

Cuando PHP hace peticiones HTTPS necesita un almacén de certificados raíz para validar la conexión. Si `php.ini`
no declara `curl.cainfo` ni `openssl.cafile`, cURL falla con:

```
cURL error 60: SSL certificate problem: unable to get local issuer certificate
```

En Windows esto es lo habitual: PHP no trae el almacén ni usa el del sistema operativo.

## La solución (máquina de desarrollo, Windows)

1. **Ubica tu `php.ini` real**, no lo supongas:

   ```bash
   php --ini
   ```

   En el PC de la oficina es `D:\php\php.ini`.

2. **Descarga el bundle oficial de curl.se** a una ruta permanente:

   ```bash
   New-Item -ItemType Directory -Force "D:\php\extras\ssl"; Invoke-WebRequest -Uri https://curl.se/ca/cacert.pem -OutFile "D:\php\extras\ssl\cacert.pem"
   ```

3. **Edita `php.ini`** y deja estas dos directivas sin el punto y coma inicial, con la ruta absoluta:

   ```ini
   [curl]
   curl.cainfo = "D:\php\extras\ssl\cacert.pem"

   [openssl]
   openssl.cafile="D:\php\extras\ssl\cacert.pem"
   ```

4. **Verifica** (debe imprimir `HTTPS OK`):

   ```bash
   php -r "$c=curl_init('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=Bogota');curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_USERAGENT=>'DanheiExpress/1.0',CURLOPT_TIMEOUT=>15]);$r=curl_exec($c);echo $r?'HTTPS OK':'HTTPS FAIL: '.curl_error($c);"
   ```

Si sigue fallando, revisa que la ruta del bundle exista y que estés editando el `php.ini` que reporta `php --ini`:
tener varios PHP instalados es la causa más frecuente de "lo configuré y no funciona".

## Producción (cPanel)

El servidor de producción usa su propio PHP con los certificados del sistema. Si allí la geocodificación devuelve
vacío, comprueba primero este mismo error consultando `/api/runtime-check` con una cuenta autorizada, antes de
suponer que el problema es la clave de API.

## Nota sobre el proveedor

Sin `GOOGLE_MAPS_API_KEY` el sistema usa Nominatim (OpenStreetMap), que **no entiende la nomenclatura colombiana**:
descarta el número de la cuadra y busca solo el nombre de la vía. Como en Bogotá hay una "Calle 19" en varias
localidades, devuelve cualquiera de ellas. Verificado el 7 de septiembre de 2026: `calle 19 # 10 22` (centro)
resuelve a **Fontibón**, a 12 km del destino real. Ver la orden de trabajo OT-A2 en P17.
