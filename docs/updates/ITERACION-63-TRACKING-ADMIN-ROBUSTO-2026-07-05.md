# Iteracion 63 - tracking admin mas robusto y realista

## Objetivo

Hacer que el modulo `Rutas` del panel administrativo interprete mejor la ubicacion viva del piloto sin marcar como rota una ruta que en realidad sigue reportando dentro del comportamiento normal del celular.

## Hallazgo

La app piloto hoy reporta ubicacion en dos ritmos distintos:

- foreground: alrededor de cada `45s`;
- background: alrededor de `120s` a `180s+`, dependiendo del sistema operativo, bateria y permisos.

Sin embargo, el panel administrativo trataba casi todo lo que no fuera `<= 180s` como situacion degradada y lo mostraba con mensajes demasiado severos.

Eso generaba dos efectos:

1. rutas que se veian "pendientes" o "sin ubicacion viva" cuando en realidad tenian una señal reciente;
2. priorizacion visual ruidosa en el centro de monitoreo.

## Cambios implementados

### Backend

#### `api/app/Http/Controllers/Api/RouteController.php`

La frescura del tracking ahora tiene tres niveles reales:

- `live`: hasta `180s`;
- `recent`: de `181s` a `600s`;
- `stale`: mas de `600s`.

Con esto el panel recibe una semantica mas cercana a la operacion real de Android y del tracking en segundo plano.

### Frontend admin

#### `frontend/src/lib/types.ts`

Se amplio el contrato de `DriverLocationSnapshot.freshness` para aceptar:

- `live`
- `recent`
- `stale`

#### `frontend/src/app/(admin)/rutas/page.tsx`

Se reorganizo la lectura operativa del tracking:

- `Señal reciente` ahora se muestra como un estado intermedio sano pero vigilado;
- `Ubicación vencida` queda reservada para pings realmente antiguos;
- `Sin ubicación` queda solo para ausencia real de coordenadas.

Tambien se mejoro el resumen superior:

- ya no se usa una sola bolsa de "sin ubicacion viva";
- ahora se separa:
  - sin señal;
  - vencidas;
  - recientes.

Esto reduce falsos rojos y ayuda a que operaciones lea mejor el tablero.

## Pruebas ejecutadas

- `php artisan test --filter=RouteTest --do-not-cache-result`
- `php artisan test --filter=ScopedEndpointTest --do-not-cache-result`
- `npm run lint`
- `npm run typecheck`

## Impacto esperado

- menos falsos positivos en monitoreo vivo;
- lectura mas clara del estado real del piloto;
- menor sensacion de que la geolocalizacion "se rompio" cuando solo hubo un retraso normal de ping;
- mejor priorizacion de rutas realmente criticas.

## QA recomendado

1. piloto con app abierta en foreground;
2. piloto con app en background;
3. revisar en panel que el chip cambie de:
   - `Ping vivo`
   - a `Señal reciente`
   - y solo despues a `Ubicación vencida`;
4. confirmar que una ruta con señal reciente no se vea como perdida;
5. confirmar que la tarjeta del monitor siga mostrando:
   - parada actual;
   - siguiente parada;
   - trazo;
   - resumen de atención.
