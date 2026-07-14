# Alineación visual del entorno operativo

Fecha: 2026-07-14

## Objetivo

Corregir la interfaz incorporada con los flujos de recogidas, recepción, sedes y control operativo para que conserve la identidad gráfica existente de Danhei y cumpla la guía móvil adaptativa del panel administrativo.

## Criterios aplicados

- El magenta Danhei (`primary`) vuelve a ser el color de la acción principal y de la orientación de navegación.
- Verde, azul, naranja y rojo se reservan para estados semánticos: éxito, ruta/en curso, pendiente y novedad.
- Las superficies usan fondo blanco, borde sutil, sombra corta y radio consistente de `12px` (`rounded-xl`).
- Cada pantalla mantiene una acción dominante; las acciones secundarias se presentan con borde.
- Todos los campos tienen etiqueta visible, foco accesible y altura táctil mínima de 44px.
- En móvil, formularios, acciones y fichas se apilan en una sola columna sin anchos mínimos que produzcan desplazamiento horizontal.
- En escritorio, las columnas se habilitan progresivamente desde los breakpoints `md` y `lg`.
- Se mantiene el modo oscuro mediante las variables y superficies ya usadas por el panel.

## Pantallas actualizadas

- `/recogidas`: cabecera, navegación operativa, métricas y tarjetas de solicitudes.
- `/recogidas/nueva`: selección de forma de ingreso, datos de contacto y primer paquete.
- `/recogidas/tareas`: asignación a piloto o recolector y traspaso de custodia. Se eliminó un bloque duplicado de asignación.
- `/recogidas/recepcion`: responsable, avance de recepción y conciliación de lotes.
- `/operacion`: métricas, registro de devoluciones y listado auditable.
- `/configuracion/sedes`: alta y catálogo de sedes operativas.

## Componentes compartidos

Se agregó `frontend/src/components/operations-ui.tsx` para centralizar:

- encabezados operativos;
- tarjetas y métricas;
- campos y estilos de controles;
- botones primarios y secundarios;
- estados, avisos y vacíos.

Esto evita que cada módulo replique estilos incompatibles y permite mantener la interfaz desde un único punto.

## Alcance funcional

La modificación es de interfaz y experiencia de usuario. No cambia contratos de API, modelos financieros, conciliaciones, migraciones, permisos ni reglas de negocio. Los flujos de WhatsApp y Nequi mantienen sus compuertas actuales.

## Validación

- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado sin advertencias.
- `npm run build`: aprobado con Next.js 16.2.6.

La revisión de QA debe priorizar móvil y escritorio en las seis rutas listadas, confirmando que la información real de cada ambiente se presenta sin desbordamientos.
