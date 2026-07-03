# Iteracion 36 - Metricas movil admin

## Objetivo
- Alinear `metricas` con el resto de vistas admin adaptadas para celular y unificar lenguaje visible en español.

## Cambios aplicados
- Ajuste de textos visibles:
  - `Tasa de error`
  - `Tiempo promedio entrega`
  - `Alertas básicas`
  - mensajes de carga vacía y error con acentos correctos
- Reajuste de la grilla KPI superior a `lg:grid-cols-4` para mejorar equilibrio en pantallas intermedias y móviles grandes.
- Conservación de la estructura analítica simple del módulo sin meter complejidad innecesaria.

## Validacion
- `npx eslint 'src/app/(admin)/metricas/page.tsx'`
- `npm run typecheck`

## Auditoria breve
- El módulo ya queda consistente en tono, idioma y jerarquía con las vistas admin móviles trabajadas hoy.
- No fue necesario un rediseño profundo porque la estructura base ya era razonablemente compacta.
