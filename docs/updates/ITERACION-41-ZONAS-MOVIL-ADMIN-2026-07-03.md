# Iteración 41 - Zonas móvil admin

Fecha: 2026-07-03

## Objetivo
- Mejorar el módulo `Zonas` para uso móvil dentro del panel administrativo.

## Cambios aplicados
- Reorganicé la calculadora de precio en vivo con labels visibles y controles más altos para pantallas táctiles.
- Convertí cada zona en una tarjeta más legible, mostrando ciudad, orden, precio base y descripción sin saturar el encabezado.
- Reorganicé las acciones de cada zona en una grilla móvil para evitar botones comprimidos.
- Amplié el detalle de reglas tarifarias con metadatos visibles en tarjeta.
- Mejoré el formulario para crear reglas con labels y controles consistentes.
- Rehice el modal de crear/editar zona con labels superiores, campos `h-11` y footer adaptado a móvil.
- Ajusté textos visibles al usuario para dejar el flujo más consistente en español.

## Validación
- `npx eslint 'src/app/(admin)/zonas/page.tsx'`
- `npm run typecheck`

## Resultado esperado
- El módulo de zonas se usa con menos fricción en celular.
- Los formularios dejan de depender de placeholders.
- La gestión de reglas tarifarias queda más clara en pantallas pequeñas.
