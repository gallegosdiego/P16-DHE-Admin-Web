# Iteracion 29 - adaptacion movil inicial del modulo rutas admin

Fecha: 2026-07-03

## Objetivo

Empezar a aterrizar la nueva `GUIA-MOVIL-ADAPTATIVA-MAESTRA` sobre el modulo `Rutas` del panel administrativo para que deje de comportarse como desktop comprimido en celular.

## Cambios aplicados

- El tablero de estados deja de depender de scroll horizontal en movil y pasa a una grilla apilada que solo usa 3 columnas en escritorio amplio.
- El bloque `Centro de monitoreo activo` prioriza en movil el monitor de la ruta enfocada antes del listado lateral de pilotos.
- Las acciones por tarjeta de ruta ahora se apilan mejor en pantallas angostas.
- En movil, cada tarjeta de ruta muestra una vista previa compacta de paradas en lugar de renderizar toda la lista completa comprimida.
- La lista completa de paradas queda visible desde `md` en adelante, donde la densidad visual ya es razonable.
- Se ajusta la redaccion del modulo para dejar claro que el tablero ya se esta tratando como vista adaptativa y no solo como columnas de escritorio.

## Impacto esperado

- menos fatiga visual en celular;
- mejor lectura del estado por ruta;
- menos scroll lateral;
- monitor activo con mayor prioridad visual;
- cards mas usables para operador movil.

## Validacion ejecutada

- `npm run typecheck`
- `npx eslint "src/app/(admin)/rutas/page.tsx"`

## Siguiente refinamiento recomendado

- QA visual real en celular del modulo `Rutas`;
- revisar si el listado `Pilotos en monitoreo` conviene pasar a tabs/cards resumidas en movil si el volumen operativo crece;
- seguir con `Pedidos` y `Dashboard` aplicando la misma guia maestra.
