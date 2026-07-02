# Iteracion 21 - panel operativo de geodatos en pedidos

Fecha: 2026-07-02
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Reducir el riesgo operativo de crear o enrutar pedidos sin coordenadas validas, dando visibilidad directa dentro del panel administrativo.

## Cambios implementados

### 1. Resumen geografico en pedidos

La pantalla:

- `frontend/src/app/(admin)/pedidos/page.tsx`

ahora consume:

- `GET /api/shipments/geo-summary`

y muestra:

- porcentaje de cobertura geografica;
- cantidad con coordenadas;
- cantidad sin coordenadas;
- cantidad en geocodificacion pendiente;
- muestra reciente de pedidos sin geo.

### 2. Indicadores por pedido

En listado desktop y movil se agrego visibilidad de:

- ciudad;
- estado de geodatos (`Geo pendiente` o `Sin coordenadas`).

Esto permite detectar pedidos problematicos antes de:

- crear ruta inteligente;
- abrir el mapa del piloto;
- agregar nuevas paradas a la jornada.

### 3. Formulario con ciudad explicita

El formulario de alta de pedidos ahora incluye:

- `recipient_city`

con valor inicial `Bogota`, editable por operacion.

Esto reduce dependencia del fallback automatico del backend y mejora casos de ciudades/municipios fuera de la configuracion por defecto.

### 4. Resumen compatible con busqueda

`ShipmentController::geoSummary()` ahora acepta `search`, alineando el resumen con el mismo texto de filtro operativo que usa la tabla.

## Validacion ejecutada

Backend:

- `php artisan test --filter="ShipmentTest"`

Frontend:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Resultado:

- todo aprobado.

## Impacto esperado

Con esta iteracion, operacion ya puede:

1. detectar pedidos sin geo antes de enrutar;
2. corregir ciudad en pedidos nuevos desde el panel;
3. reducir casos donde el piloto vea una ruta sin mapa por falta de coordenadas.

## Pendiente que sigue vivo

Sigue pendiente validar en produccion real:

- que los pedidos legacy se reparen al abrir ruta o via backfill;
- que la cobertura geografica suba despues del deploy;
- que la API key y las zonas productivas sigan consistentes.
