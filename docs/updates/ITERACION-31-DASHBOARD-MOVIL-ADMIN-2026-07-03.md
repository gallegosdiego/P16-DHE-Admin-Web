# Iteracion 31 - adaptacion movil inicial del dashboard admin

Fecha: 2026-07-03

## Objetivo

Mejorar la experiencia movil del `Dashboard` del panel administrativo para que la pantalla priorice resumen, finanzas y acciones rapidas antes de empujar al usuario por una lectura larga de escritorio.

## Cambios aplicados

- El encabezado superior ahora se apila mejor en movil y deja el estado de conexion + boton de actualizar en una disposicion mas limpia.
- Las metricas principales suavizan su grilla para pantallas angostas.
- El bloque `Financiero` gana prioridad visual en movil frente a la distribucion larga por estados.
- El bloque `Acciones rapidas` pasa a mostrarse antes que `Ultimos 5 envios` en movil para acelerar operacion.
- `Ultimos 5 envios` ahora muestra un poco mas de contexto operativo:
  - piloto,
  - tiempo relativo,
  - direccion,
  - zona.
- La seccion `Actividad por hora` ajusta mejor su separacion interna en movil.

## Impacto esperado

- mejor lectura inicial del dashboard desde celular;
- acceso mas rapido a acciones claves;
- menos sensacion de panel desktop comprimido;
- contexto mas util en la lista de envios recientes.

## Validacion ejecutada

- `npm run typecheck`
- `npx eslint "src/app/(admin)/page.tsx"`

## Siguiente refinamiento recomendado

- QA visual real en movil del dashboard;
- evaluar si conviene convertir `Actividad por hora` en una version aun mas compacta para pantallas muy pequeñas;
- continuar con `Pilotos` como siguiente modulo prioritario de adaptacion.
