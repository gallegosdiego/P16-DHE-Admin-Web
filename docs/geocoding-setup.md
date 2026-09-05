# Configuración de Certificados SSL de PHP para Geocodificación

## Diagnóstico y Causa Raíz
Cuando PHP realiza peticiones HTTPS (por ejemplo a Google Maps Geocoding API o a Nominatim de OpenStreetMap), requiere un almacén de certificados CA raíz confiables para validar la conexión TLS/SSL. Si las directivas `curl.cainfo` y `openssl.cafile` no están configuradas en `php.ini`, cURL arroja el error:

```
cURL error 60: SSL certificate problem: unable to get local issuer certificate
```

## Solución Aplicada

1. **Descargar el bundle CA oficial de curl.se**:
   - Descargar `https://curl.se/ca/cacert.pem`
   - Guardarlo en una ruta permanente, ej: `C:\php\extras\ssl\cacert.pem`.

2. **Configurar `php.ini`**:
   Editar el archivo `C:\php\php.ini` y agregar/descomentar:
   ```ini
   [curl]
   curl.cainfo = "C:\php\extras\ssl\cacert.pem"

   [openssl]
   openssl.cafile = "C:\php\extras\ssl\cacert.pem"
   ```

3. **Verificación**:
   Ejecutar en terminal:
   ```bash
   php -r "echo file_get_contents('https://nominatim.openstreetmap.org/search?format=json&q=Bogota', false, stream_context_create(['http' => ['header' => 'User-Agent: DanheiExpress/1.0']])) ? 'HTTPS OK' : 'HTTPS FAIL';"
   ```
