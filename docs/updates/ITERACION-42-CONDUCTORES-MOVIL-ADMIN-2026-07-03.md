# Iteración 42 - Conductores móvil admin

Fecha: 2026-07-03

## Objetivo
- Reducir deuda visual y de usabilidad móvil en el módulo `Conductores`.

## Cambios aplicados
- Reorganicé la cabecera de filtros y acciones para evitar botones comprimidos en celular.
- Subí controles principales a `h-11` para mejorar toque y consistencia con el resto del admin.
- Convertí tarjetas de piloto a un formato más limpio y con mejor lectura en móvil.
- Ajusté la papelera para que los ítems y el botón de restaurar no se rompan en pantallas pequeñas.
- Mejoré el modal de crear/editar piloto con acciones apilables y campos táctiles más cómodos.
- Normalicé textos visibles (`Vehículo`, `Teléfono`, `Resumen del día`, `contraseña`) para eliminar inconsistencias.

## Validación
- `npx eslint 'src/app/(admin)/conductores/page.tsx'`
- `npm run typecheck`

## Resultado esperado
- Gestión de pilotos más cómoda desde teléfono.
- Menos fricción en formularios operativos.
- Menos ruido visual y menos riesgo de errores de lectura.
