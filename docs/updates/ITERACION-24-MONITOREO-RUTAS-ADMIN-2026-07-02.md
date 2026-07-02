# Iteracion 24 - reorganizacion del monitoreo de rutas en panel admin

Fecha: 2026-07-02

## Problema detectado

El modulo `Rutas` mezclaba dos responsabilidades distintas dentro del mismo tablero:

1. gestionar el estado de las rutas (`planificada`, `activa`, `completada`);
2. monitorear en vivo al piloto y su recorrido.

Eso hacia que la columna central (`Activa`) se sintiera desordenada:

- el tracking dependia de expandir una tarjeta dentro del kanban;
- el mapa quedaba visualmente comprimido;
- el seguimiento del piloto no tenia una zona propia ni jerarquia operativa clara;
- el usuario debia “descubrir” el monitoreo en lugar de verlo como el foco principal.

## Mejora implementada

Se separo el seguimiento en vivo del kanban y se creo un bloque superior dedicado:

- **Centro de monitoreo activo**
  - lista lateral de pilotos/rutas activas;
  - seleccion de la ruta activa a observar;
  - panel principal con mapa, trazo, estado de geo, parada actual, siguiente parada y metricas.

Mientras tanto, el tablero de tres columnas se conserva para gestion operativa:

- `Planificada`
- `Activa`
- `Completada`

Pero la columna `Activa` ahora deja de cargar el peso visual del monitoreo completo.

## Beneficio operativo

- el despachador identifica mas rapido que piloto observar;
- el tracking en vivo tiene jerarquia propia;
- el kanban vuelve a servir para control de estado, no para cargar todo el detalle de seguimiento;
- la navegacion mental entre “ver estado” y “monitorear movimiento” queda mucho mas clara.

## Pendiente siguiente recomendado

Para la siguiente iteracion conviene reforzar este mismo modulo con:

1. filtro explicito por salud de tracking (`sin ubicacion`, `geo incompleta`, `trazo aproximado`);
2. timestamp visible de ultima sincronizacion del panel;
3. accion rapida para abrir detalle de parada actual o centrar mapa;
4. si el negocio lo confirma, una vista futura de “torre de control” a pantalla completa para multiples pilotos.
