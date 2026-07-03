# Iteracion 30 - adaptacion movil inicial del modulo pedidos admin

Fecha: 2026-07-03

## Objetivo

Aplicar la `GUIA-MOVIL-ADAPTATIVA-MAESTRA` al modulo `Pedidos` del panel administrativo para que en celular la operacion sea legible, tocable y coherente sin depender de una tabla desktop comprimida.

## Cambios aplicados

- Las metricas superiores y el bloque de cobertura geografica se suavizan mejor para pantallas angostas.
- Las cards moviles de pedidos se reorganizan con jerarquia operativa:
  - codigo + estado,
  - cliente y telefono,
  - bloque de entrega,
  - bloque de pago,
  - bloque de operacion,
  - asignacion de piloto,
  - acciones.
- La vista movil recupera la capacidad de **asignar piloto** directamente desde la card, sin obligar al usuario a pasar por escritorio.
- Las acciones moviles dejan de competir en una fila de 3 botones pequeños y pasan a una grilla mas clara:
  - `Detalle`
  - accion principal de estado
  - `Eliminar` en ancho completo
- La barra fija de acciones masivas se ordena mejor para movil con controles a ancho completo antes de volver a layout flexible en pantallas mayores.

## Impacto esperado

- lectura mas clara por pedido;
- menos saturacion visual;
- mejor operacion con una mano;
- recuperacion de funciones clave en movil;
- menor dependencia del layout desktop.

## Validacion ejecutada

- `npm run typecheck`
- `npx eslint "src/app/(admin)/pedidos/page.tsx"`

## Siguiente refinamiento recomendado

- QA visual real en movil del modulo `Pedidos`;
- revisar si los tabs de filtro deben pasar a un contenedor scrollable mas compacto cuando existan mas estados;
- continuar con `Dashboard` y `Pilotos` usando la misma guia maestra.
