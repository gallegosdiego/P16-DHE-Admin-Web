# Iteracion 38 - Configuracion movil admin

## Objetivo
- Mejorar la usabilidad movil del modulo `configuracion`, especialmente formularios y tarifas.

## Cambios aplicados
- Correccion del titulo del modulo a `Configuración`.
- Controles de tema reorganizados para apilar mejor en celular.
- Formularios de perfil y cambio de contraseña con:
  - etiquetas visibles,
  - campos mas altos,
  - acciones finales con mejor comportamiento movil.
- Bloque de empresa con inputs mas consistentes.
- `Tarifas`:
  - tarjetas moviles por zona,
  - tabla tradicional solo para `sm+`,
  - boton de guardar mejor alineado en movil.

## Validacion
- `npx eslint 'src/app/(admin)/configuracion/page.tsx'`
- `npm run typecheck`

## Auditoria breve
- Se elimina dependencia excesiva de placeholders.
- El modulo queda mas estable para futuras ampliaciones de configuración.
