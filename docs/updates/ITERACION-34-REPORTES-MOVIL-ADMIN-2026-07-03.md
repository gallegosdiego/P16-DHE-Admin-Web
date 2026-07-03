# Iteracion 34 - Reportes movil admin

## Objetivo
- Hacer usable `reportes` en celular, especialmente filtros y resumen por piloto.

## Cambios aplicados
- Reorden de filtros superiores a grilla adaptable.
- Inputs de fecha y botones con ancho y altura consistentes para tacto.
- Ajuste de tarjetas KPI para que no queden apretadas en pantallas angostas.
- Nuevo resumen por piloto en movil mediante tarjetas:
  - nombre,
  - volumen,
  - entregados,
  - efectividad,
  - ingresos,
  - ganancia.
- Tabla completa de pilotos se conserva para `md+`.
- Normalizacion de textos visibles del modulo.

## Validacion
- `npx eslint 'src/app/(admin)/reportes/page.tsx'`
- `npm run typecheck`

## Auditoria breve
- El modulo ya no obliga scroll horizontal para la lectura principal en celular.
- Se mantuvo la tabla desktop sin degradar la experiencia grande.
- La jerarquia visual queda mas consistente con dashboard, rutas, pedidos y pilotos.
