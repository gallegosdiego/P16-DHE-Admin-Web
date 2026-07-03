# Iteracion 25 - Historial operativo piloto/admin - 2026-07-02

## Objetivo

Cerrar el vacio funcional donde el piloto solo podia ver el estado del dia actual y el panel administrativo solo podia analizar el presente operativo.

La necesidad operativa real era:

- que el piloto pudiera revisar jornadas anteriores;
- que administracion pudiera revisar que paquetes trabajo ese piloto en fechas pasadas;
- que la solucion no rompa el flujo principal de rutas ni el rendimiento movil.

## Formula aplicada

Se implemento una arquitectura de **historial por jornada** con dos niveles:

1. **Resumen por fecha**
   - fecha operativa;
   - cantidad de rutas de ese dia;
   - cantidad de paquetes;
   - entregados, pendientes y novedades;
   - COD cobrado;
   - ganancia del piloto.

2. **Detalle por fecha**
   - rutas de ese dia;
   - paquetes concretos trabajados;
   - direccion, estado, tipo de pago y ganancia por paquete.

Esta estructura evita cargar toda la historia completa en cada apertura y permite escalar mejor.

## Backend

Se agrego el servicio:

- `D:\DHE dev\P16-DHE-Admin-Web\api\app\Domain\Driver\Services\DriverHistoryService.php`

Responsabilidades:

- paginar jornadas historicas por piloto;
- consolidar resumen por `route_date`;
- consolidar tambien un `summary` historico global por piloto;
- entregar detalle de una jornada puntual;
- normalizar fechas entre SQLite/MySQL para no mezclar `YYYY-MM-DD` con `YYYY-MM-DD 00:00:00`.

Endpoints expuestos:

- piloto:
  - `GET /api/driver/history`
  - `GET /api/driver/history/{date}`
- admin:
  - `GET /api/drivers/{driver}/history`
  - `GET /api/drivers/{driver}/history/{date}`

Cobertura automatizada:

- `D:\DHE dev\P16-DHE-Admin-Web\api\tests\Feature\ScopedEndpointTest.php`

Se validan:

- resumen historico del piloto;
- detalle historico del piloto;
- resumen historico administrativo;
- detalle historico administrativo.

## Panel administrativo

Se agrego historial operativo al detalle del piloto:

- `D:\DHE dev\P16-DHE-Admin-Web\frontend\src\app\(admin)\conductores\[id]\page.tsx`
- `D:\DHE dev\P16-DHE-Admin-Web\frontend\src\app\(admin)\conductores\page.tsx`

Decision UX:

- **si** mantener el historial profundo dentro del detalle del piloto;
- **si** agregar acceso directo `Historial` desde la lista general de pilotos;
- **si** permitir abrir el detalle ya enfocado en la seccion historica.

Beneficios:

- menos ruido visual;
- mejor lectura por persona;
- analisis de desempeno por jornada sin salir del expediente del piloto.
- acceso directo desde la lista general de pilotos;
- filtros por jornada y filtros por paquete dentro del detalle.
- etiquetas operativas en espanol para estados de ruta y tipos de pago dentro del historial.

## App piloto

Se agrego acceso desde perfil:

- `D:\DHE dev\P15-DHE-App-Repartidor\app\(tabs)\perfil.tsx`
- `D:\DHE dev\P15-DHE-App-Repartidor\app\historial.tsx`

Decision UX:

- **no** agregar una nueva tab inferior;
- **si** abrir `Historial de paquetes` desde `Perfil`.

Motivo:

- la barra inferior ya concentra navegacion operativa;
- el historial es una consulta secundaria, no una accion de despacho en caliente.
- ademas, `Perfil` ahora muestra un resumen historico rapido para que el piloto descubra el modulo sin buscarlo.
- y la pantalla de historial ya soporta filtros por jornada, busqueda y filtrado por estado de paquete.
- tambien traduce a espanol visible los estados de ruta y los tipos de pago que antes podian salir crudos desde el backend.

## Validacion ejecutada

Backend:

- `php artisan test --filter=ScopedEndpointTest`

Frontend admin:

- `npm run typecheck`

App piloto:

- `npx tsc --noEmit`

Estado:

- validacion completa en codigo: **OK**

## Omisiones detectadas y corregidas durante la iteracion

1. **Normalizacion de fecha historica**
   - habia entornos devolviendo la fecha con hora;
   - se normalizo a `Y-m-d`.

2. **Orden de parametros en controlador admin**
   - el endpoint de detalle admin tenia firma incompatible con route model binding;
   - se corrigio para evitar `500`.

3. **Expansores de UI**
   - se ajusto el toggle de expansion para cargar detalle solo cuando corresponde.

## Siguiente bloque recomendado

El siguiente modulo natural es **documentacion del piloto**:

- licencia de conduccion;
- tarjeta de propiedad;
- SOAT;
- tecnomecanica;
- cedula frente;
- cedula respaldo.

Ubicacion recomendada:

- panel admin: dentro del detalle del piloto;
- app piloto: dentro de `Perfil`, en una seccion propia de documentos.

No se implemento todavia en esta iteracion; queda documentado como siguiente frente.
