# Iteracion 33 - Clientes movil admin

## Objetivo
- Adaptar `clientes` para lectura y operacion comoda en celular sin depender de tablas comprimidas ni placeholders como unica referencia.

## Cambios aplicados
- Reorganizacion de KPI superiores a una grilla mas flexible para pantallas estrechas.
- Rediseño de tarjetas moviles de clientes con:
  - bloque principal mas legible,
  - resumen de envios y deuda,
  - acciones en grilla tactil.
- Mejora del modal de crear/editar:
  - etiquetas visibles por campo,
  - alturas tactiles consistentes,
  - acciones inferiores mas estables en movil.
- Mejora del modal detalle:
  - resumen financiero responsive,
  - listado de envios con tarjetas moviles y tabla solo para pantallas medianas o mayores,
  - direcciones convertidas a tarjetas legibles.

## Validacion
- `npx eslint 'src/app/(admin)/clientes/page.tsx'`
- `npm run typecheck`

## Auditoria breve
- Se elimino dependencia fuerte de tablas en movil.
- Se mejoro continuidad visual con otras vistas admin adaptadas hoy.
- Queda pendiente seguir la misma guia en modulos restantes (`clientes` ya queda alineado con la guia movil maestra).
