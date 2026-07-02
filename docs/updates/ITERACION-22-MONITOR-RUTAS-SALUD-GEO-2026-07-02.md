# Iteracion 22 - monitor de rutas con salud geo y ubicacion viva

Fecha: 2026-07-02
Repositorio: `P16-DHE-Admin-Web`

## Objetivo

Hacer que la pantalla administrativa de rutas no solo muestre el mapa, sino tambien el estado operativo de salud de cada ruta:

- rutas con paradas sin coordenadas;
- rutas activas sin ubicacion viva;
- rutas activas con trazo aproximado.

## Cambios implementados

### 1. Resumen superior de salud de rutas

La pantalla:

- `frontend/src/app/(admin)/rutas/page.tsx`

ahora muestra un resumen con:

- rutas filtradas;
- rutas activas;
- rutas con geo incompleta;
- rutas sin ubicacion viva;
- rutas con trazo aproximado.

### 2. Alertas por ruta

Cada tarjeta de ruta ahora expone badges operativos para detectar rapidamente:

- `X sin geo`
- `Sin ubicacion viva`
- `Ubicacion vencida`
- `Trazo aproximado`

### 3. Detalle expandido mas explicito

En el monitoreo expandido de una ruta, cuando hay paradas pendientes sin coordenadas, ahora aparece una alerta con los codigos afectados para que operacion pueda:

- corregir pedido;
- revisar geocodificacion;
- evitar culpar a la app piloto cuando el problema real es de data.

## Impacto esperado

Con esta iteracion, el panel administrativo ya ayuda a responder preguntas operativas clave:

1. por que una ruta no se ve completa en mapa;
2. si el piloto dejo de reportar ubicacion;
3. si el trazo visible es real por calles o solo aproximado.

## Validacion ejecutada

Frontend:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Resultado:

- todo aprobado.

## Pendiente que sigue vivo

Sigue pendiente validar en produccion real:

- que las rutas activas con geo reparada bajen en el contador `Con geo incompleta`;
- que la ubicacion viva del piloto entre con frescura `live` durante operacion real;
- que el seguimiento administrativo refleje correctamente la jornada completa del piloto.
