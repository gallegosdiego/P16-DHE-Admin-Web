# Iteracion 54 - Robustecimiento de comunicacion API, panel y app piloto

Fecha: 2026-07-04

## Objetivo

Reducir errores fragiles entre backend, panel web y app movil cuando ocurren:

- reintentos de usuario;
- respuestas HTML/no JSON desde infraestructura intermedia;
- timeouts o fallos transitorios de red;
- excepciones de negocio no normalizadas;
- fallos parciales al refrescar estado operativo del piloto.

## Backend

- `api/bootstrap/app.php`
  - ahora normaliza excepciones del API a JSON consistente con:
    - `message`
    - `code`
    - `retryable`
    - `errors` cuando aplica
  - cubre:
    - `ValidationException`
    - `AuthenticationException`
    - `AuthorizationException`
    - `InvalidArgumentException`
    - `ModelNotFoundException`
    - `NotFoundHttpException`
    - `MethodNotAllowedHttpException`
    - fallback `Throwable`

## App piloto

- `lib/api.ts`
  - nuevo parseo tolerante para respuestas vacias, texto plano o HTML;
  - timeout por request;
  - retry controlado para `GET` y operaciones explicitamente idempotentes;
  - errores mas claros para timeout, red, auth y validacion.

- `lib/route-context.tsx`
  - si falla el refresh operativo y tambien fallan los fallbacks legacy, conserva el ultimo snapshot valido en memoria;
  - evita que la app quede en blanco por una falla transitoria de comunicacion.

## Panel web

- `frontend/src/lib/api.ts`
  - timeout por request;
  - retry controlado en `GET`;
  - parseo robusto de HTML/no JSON;
  - mensajes coherentes para auth, permisos, validacion y red.

- `frontend/src/lib/auth.tsx`
  - ahora escucha expiracion global de sesion emitida por el cliente API.

## Validacion esperada

- errores de negocio devuelven `422` en JSON, no `500` ambiguo;
- respuestas HTML accidentales de proxy/cPanel/LiteSpeed ya no rompen el parseo del cliente;
- el piloto conserva la ultima ruta cargada si hay una caida transitoria de red;
- panel y app muestran mensajes mas utiles y menos ruido tecnico.
