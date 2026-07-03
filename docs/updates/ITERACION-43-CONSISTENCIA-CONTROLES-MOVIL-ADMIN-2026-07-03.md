# Iteración 43 - Consistencia de controles móvil admin

Fecha: 2026-07-03

## Objetivo
- Homogeneizar buscadores y acciones principales que aún estaban más compactos de lo deseado en móvil.

## Cambios aplicados
- `clientes`: buscador y CTAs principales subidos a altura táctil consistente.
- `pedidos`: buscador y botón principal ajustados a `min-h-11`.
- `usuarios`: input de búsqueda y filtro de rol normalizados a `h-11`.
- Corrección menor de copy en `clientes`.

## Validación
- `npx eslint 'src/app/(admin)/clientes/page.tsx' 'src/app/(admin)/pedidos/page.tsx' 'src/app/(admin)/usuarios/page.tsx'`
- `npm run typecheck`

## Resultado esperado
- Menor variación visual entre módulos.
- Mejor ergonomía táctil en la cabecera de listados.
