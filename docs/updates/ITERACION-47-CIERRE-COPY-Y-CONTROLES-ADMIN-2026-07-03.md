# Iteración 47 · Cierre de copy y controles admin móvil

Fecha: 2026-07-03

## Objetivo

Cerrar residuos de copy, caracteres rotos y tamaños inconsistentes en los módulos administrativos más usados en móvil.

## Archivos ajustados

- `frontend/src/app/(admin)/page.tsx`
- `frontend/src/app/(admin)/reportes/page.tsx`
- `frontend/src/app/(admin)/rutas/page.tsx`
- `frontend/src/app/(admin)/configuracion/page.tsx`
- `frontend/src/app/(admin)/pedidos/page.tsx`

## Cambios realizados

### Dashboard

- Corrección de tildes en mensajes de período y estado de conexión.
- Ajuste de títulos visibles: “Distribución por estado”, “Actualización automática”, “Sin conexión”.

### Reportes

- Corrección de copy visible en tarjetas por piloto: “envíos”.

### Rutas

- Corrección de copy visible en la cabecera: “Última actualización”, “Esperando primera sincronización”.
- Homologación del `select` de filtro de piloto a `h-11` para mantener consistencia móvil.

### Configuración

- Normalización de los `inputs` de la tabla de tarifas de escritorio a `h-11`, `rounded-lg`, `px-3`.
- Normalización de los campos de solo lectura del bloque “Sistema de guías” a `h-11`.

### Pedidos

- Corrección de copy roto en encabezados de tabla y formulario.
- Normalización del `fieldControlClass` global a `h-11`.
- Ajuste del input de carga de foto a `h-11`.
- Limpieza de textos visibles en acciones y placeholders.

## Validación

- `npx eslint "src/app/(admin)/page.tsx" "src/app/(admin)/reportes/page.tsx" "src/app/(admin)/rutas/page.tsx" "src/app/(admin)/configuracion/page.tsx" "src/app/(admin)/pedidos/page.tsx"`
- `npm run typecheck`

## Resultado

Queda cerrado el bloque de consistencia visual/copy para dashboard, reportes, rutas, configuración y pedidos dentro del panel administrativo.
