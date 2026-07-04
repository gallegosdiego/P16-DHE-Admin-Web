# Iteracion 57 - rutas admin movil

Fecha: 2026-07-04
Modulo: `frontend/src/app/(admin)/rutas/page.tsx`
Objetivo: volver mas utilizable el monitoreo de rutas del panel administrativo en celular sin romper la lectura de escritorio.

## Problema observado

La vista de `rutas` en celular seguia heredando demasiado del layout desktop:

- el selector de pilotos activos competia con el detalle principal;
- las acciones quedaban pequenas o escondidas segun el breakpoint;
- el tablero de estados no explicaba el proposito operativo de cada carril;
- el monitoreo activo no ayudaba a cambiar rapido entre pilotos cuando se trabajaba desde telefono.

## Cambios aplicados

### 1. Selector movil de pilotos en monitoreo

- el bloque `Pilotos en monitoreo` ahora se muestra primero en celular;
- los pilotos activos se presentan en scroll horizontal tactil;
- cada tarjeta resume:
  - piloto / ruta,
  - zona,
  - frescura de tracking,
  - pendientes / novedades / geo incompleta,
  - parada actual,
  - ultimo ping.

Resultado: operacion puede cambiar de piloto sin bajar por toda la pantalla ni perder el foco del monitoreo.

### 2. Tablero de estados mas legible

- cada carril ahora muestra:
  - nombre del estado,
  - descripcion corta,
  - contador visible.

Resultado: desde movil se entiende mas rapido para que sirve cada columna.

### 3. Acciones tactiles por ruta

- en movil cada card de ruta expone botones grandes:
  - `Ver detalles`,
  - `Abrir monitor`,
  - `Iniciar ruta` cuando aplica.
- las acciones desktop secundarias quedan reservadas para `sm+`.

Resultado: se reduce error de toque y ya no dependemos de micro-botones heredados del layout de escritorio.

## Validacion ejecutada

- `npm run typecheck`
- `npx eslint "src/app/(admin)/rutas/page.tsx"`

## Impacto esperado

- mejor continuidad operativa desde telefono;
- menor friccion para monitorear varios pilotos vivos;
- base mas consistente para seguir refinando el modulo de rutas y tracking administrativo.