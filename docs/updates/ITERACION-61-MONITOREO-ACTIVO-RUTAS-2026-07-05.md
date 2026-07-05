# Iteracion 61 - priorizacion del monitoreo activo de rutas

## Objetivo

Mejorar el modulo `Rutas` del panel administrativo para que la operacion vea primero lo urgente y lea mejor el tracking del piloto sin depender de interpretacion manual.

## Cambios aplicados

### 1. Priorizacion real de rutas activas

Las rutas activas ya no se muestran solo en el orden crudo recibido.  
Ahora se ordenan por puntaje operativo considerando:

- falta de senal del piloto;
- ubicacion vencida;
- paradas pendientes sin coordenadas;
- novedades activas;
- cantidad de pendientes.

Con esto, la ruta con mayor riesgo sube primero al centro de monitoreo.

### 2. Resumen ejecutivo del monitor activo

El bloque superior del monitor ahora muestra conteos rapidos de:

- rutas criticas;
- rutas en atencion;
- rutas estables;
- rutas sin tracking vivo;
- rutas con geodata incompleta.

### 3. Lectura mas clara del tracking del piloto

En la tarjeta de monitoreo y en el listado lateral de pilotos:

- se usa una presentacion consistente de frescura (`Ping vivo`, `Ubicacion vencida`, `Sin senal`);
- se muestra hora absoluta del ultimo reporte;
- la tarjeta del piloto incluye mejor contexto temporal del ping.

### 4. Menos recargas innecesarias

El filtro de piloto ya no dispara recargas completas del modulo.  
La data se carga una vez y el filtro opera localmente sobre el estado actual.

## Validacion ejecutada

- `npm run lint` en `frontend`
- `npm run typecheck` en `frontend`

## Impacto esperado

- mejor lectura operativa en escritorio y movil;
- menos tiempo para detectar al piloto con problema real;
- foco automatico mas util en la ruta activa prioritaria;
- menos ruido de red al cambiar filtros del panel.
