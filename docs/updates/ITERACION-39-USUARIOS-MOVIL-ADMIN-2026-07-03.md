# Iteracion 39 - Usuarios movil admin

## Objetivo
- Hacer mas usable `usuarios` en celular, especialmente listado, modal y papelera.

## Cambios aplicados
- KPI superior con grilla mas flexible.
- Tarjetas moviles de usuarios mas ricas:
  - mejor jerarquia visual,
  - bloque de permisos/fecha,
  - acciones tactiles en grilla.
- Modal de crear/editar con campos mas altos y pie de acciones mas estable.
- Papelera con items apilables y boton de restaurar mas accesible en movil.

## Validacion
- `npx eslint 'src/app/(admin)/usuarios/page.tsx'`
- `npm run typecheck`

## Auditoria breve
- El modulo ya no depende de una tabla comprimida para ser operativo en celular.
- Se conserva el modo tabla para escritorio, pero la experiencia movil queda mucho mas clara.
