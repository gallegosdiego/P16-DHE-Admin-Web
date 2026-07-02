# Pendientes maestros de plataformas

Fecha: 2026-07-01
Repos:
- `P16-DHE-Admin-Web`
- `P15-DHE-App-Repartidor`

## Actualizacion 2026-07-02

Desde la version operativa actual ya no deben tratarse como pendientes "puros" estos puntos:

- persistencia de metricas total/restante en `routes` - resuelto;
- persistencia de geometria `overview_polyline` + `route_legs` - resuelto;
- finalizacion de salida con devolucion de pendientes a bandeja - resuelto;
- reapertura/continuidad del mismo dia con nuevos paquetes - resuelto;
- observabilidad base de eventos operativos de ruta - implementada en backend.

Por tanto, el backlog vivo se concentra ahora sobre:

1. QA real en dispositivo y operacion completa;
2. geocodificacion consistente de pedidos;
3. visualizacion administrativa del recorrido del piloto;
4. endurecimiento de despliegue y auth del panel.

## Objetivo

Consolidar en un solo backlog los pendientes reales que faltan para cerrar:

- flujo piloto <-> panel admin,
- rutas inteligentes,
- mapa dentro de la app,
- estabilidad operativa,
- seguridad y despliegue.

Este documento reemplaza como referencia principal los pendientes dispersos y deja claro:

1. que ya esta resuelto,
2. que sigue abierto,
3. en que orden conviene terminarlo.

## Ya resuelto

No deben volver a entrar al backlog como pendientes abiertos:

- hotfix entrega COD desde `assigned_to_route`;
- hotfix endpoints piloto con columnas opcionales;
- hotfix `smart-route` cuando la ruta del dia ya estaba completada;
- `GET /api/driver/operational-state` con contrato unificado para la app piloto;
- `POST /api/driver/location` con monitoreo vivo base para panel administrativo;
- persistencia base de metricas total/restante de ruta en `routes`;
- visual base de la app piloto;
- bandeja de pedidos asignados sin enrutar;
- mapa nativo seguro con fallback;
- errores 500 con endpoint visible en la app;
- varios bugs de safe area y footer en Android;
- flujo base de rutas inteligentes y ampliacion de ruta del dia.

## Prioridad P0 - Cierre operativo

### 1. Cerrar QA funcional del estado operativo unificado

Problema:

- la unificacion ya esta implementada, pero falta validarla en build real con escenarios operativos completos;
- el mayor riesgo ahora ya no es el contrato, sino regresiones de flujo en dispositivo real.

Pendiente:

- validar Inicio, Pedidos y Mapa consumiendo `operational-state`;
- validar fallback legacy si el endpoint unificado falla;
- revisar reingreso de sesion, ruta reabierta y pedidos nuevos del mismo dia;
- probar monitoreo vivo desde piloto hacia panel admin.

Aceptacion:

- Inicio, Pedidos y Mapa renderizan consistente desde una sola fuente principal;
- la reapertura de jornada y los pedidos nuevos no desaparecen al reingresar;
- el panel refleja ubicacion viva reciente del piloto cuando la ruta esta activa.

### 2. Cerrar la version operativa del mapa dentro de la app

Problema:

- el mapa ya existe, pero todavia no es una experiencia completa de trabajo.

Pendiente:

- validar en build real la tarjeta operativa del mapa con:
  - km totales,
  - min totales,
  - km restantes,
  - min restantes,
  - parada actual,
  - siguiente parada;
- revisar comportamiento visual despues de varias entregas seguidas;
- decidir si la tarjeta final queda como banner superior o card inferior fija.

Aceptacion:

- el piloto puede crear una ruta con 8 paquetes;
- ve todos los puntos;
- ve metricas totales y restantes;
- al entregar una parada, el foco avanza solo.

### 3. Asegurar coordenadas confiables para todos los pedidos enroutables

Estado actual:

- parcialmente resuelto;
- los pedidos nuevos/actualizados ya pueden geocodificarse al crear o editar;
- existe filtro y resumen operativo para detectar faltantes;
- existe comando de backfill para historicos.

Problema:

- el mapa y la optimizacion dependen de `recipient_lat` y `recipient_lng`;
- sin coordenadas, parte del valor del mapa se pierde.

Pendiente:

- validar Google Maps Geocoding API en todos los entornos;
- ejecutar backfill inicial sobre historicos con `php artisan shipments:geocode-missing`;
- integrar el reporte de faltantes dentro del panel administrativo visible para operacion.

Aceptacion:

- los pedidos nuevos llegan con coordenadas validas;
- existe reporte claro de pedidos sin geodata;
- el mapa deja de degradarse por datos faltantes.

### 4. Sacar una build real de P15 y validar todo el flujo en celular

Problema:

- varios fixes ya estan en codigo, pero falta cerrar validacion final en dispositivo real.

Pendiente:

- compilar APK/Release actualizada;
- instalar en el movil piloto;
- validar:
  - login,
  - sincronizacion,
  - pedidos asignados,
  - crear ruta inteligente,
  - ampliar ruta del dia,
  - entregar varias paradas seguidas,
  - avance automatico a la siguiente parada,
  - mapa con metricas.

Aceptacion:

- flujo completo piloto del dia funciona sin errores manuales de recuperacion.

## Prioridad P1 - Solidez de producto

### 5. Convertir la ruta visual en ruta vial real

Problema:

- hoy la `Polyline` une puntos, pero no representa calles reales.

Pendiente:

- devolver `overview_polyline` real desde backend;
- soportar tambien `active_leg_polyline`;
- usar Google Routes API o proveedor equivalente para geometria vial.

Aceptacion:

- el mapa muestra ruta real por calles;
- el piloto entiende mejor el recorrido.

### 6. Guardar y versionar la optimizacion de ruta

Estado actual:

- resuelto en su base tecnica;
- hoy ya se persisten en backend distancia, duracion, origen de optimizacion, origen geografico y geometria por tramos.

Pendiente:

- validar estas columnas en todos los entornos productivos;
- enriquecer reportes operativos que las consumen;
- decidir si se versiona historicamente cada reoptimizacion o solo se conserva snapshot vigente.

Aceptacion:

- al cerrar y abrir la app, la ruta mantiene resumen y contexto;
- admin y app pueden reutilizar el snapshot persistido.

### 7. Recalculo inteligente de ruta restante

Estado actual:

- parcialmente resuelto;
- ya existen `remaining_distance_*` y `remaining_duration_*`;
- la app ya muestra total/restante y el foco avanza a la siguiente parada.

Pendiente:

- recalcular despues de cada entrega;
- opcionalmente reoptimizar solo pendientes.
- endurecer el caso multi-salida del mismo dia cuando se quiera ver restante a nivel `route_day`.

Aceptacion:

- el piloto siempre ve lo que falta, no solo el total original.

### 8. Auditar y automatizar consistencia de rutas

Problema:

- `total_stops`, `completed_stops`, stops huerfanos y rutas vacias pueden volver a desalinearse.

Pendiente:

- programar auditoria operativa recurrente;
- registrar reporte antes y despues de reparaciones;
- definir politica para:
  - rutas vacias,
  - stops huerfanos,
  - envios asignados sin visibilidad.

Aceptacion:

- el equipo puede detectar inconsistencias antes de que se vuelvan bugs visibles.

## Prioridad P2 - Plataforma y seguridad

### 9. Endurecer autenticacion del panel admin

Problema:

- el admin aun tiene deuda tecnica de auth en navegador.

Pendiente:

- decidir BFF Next o cookies HttpOnly/Sanctum;
- expirar y revocar tokens correctamente;
- revisar CSP/XSS;
- validar login/logout/sesion expirada con pruebas.

Aceptacion:

- el token del admin no depende de `localStorage` como fuente principal.

### 10. Endurecer despliegue y verificacion de produccion

Problema:

- el deploy sigue dependiendo de pasos manuales y tolerancia excesiva a fallos.

Pendiente:

- hacer mas estricto `.cpanel.yml` en pasos criticos;
- resolver definitivamente el tema Imunify/WAF para health checks;
- agregar verificacion mas rica en `deploy-check`.

Aceptacion:

- un deploy malo falla de forma visible;
- un deploy bueno se confirma con una sola prueba canonica.

### 11. Observabilidad de rutas y mapa

Estado actual:

- parcialmente resuelto;
- ya existen eventos estructurados de backend para sincronizacion de jornada, optimizacion, salto por falta de geodata, completado de parada, desasignacion y finalizacion.

Pendiente:

- convertir estos eventos en tablero o consulta operativa rapida;
- definir alarmas o reportes operativos minimos;
- correlacionar logs con QA real del piloto y el panel admin.

Aceptacion:

- cuando algo falle, se sabe rapidamente si fue datos, API, geocodificacion o app.

## Orden recomendado de ejecucion

### Ola 1

- `operational-state`
- mapa operativo v1
- geocodificacion
- build y QA en celular

### Ola 2

- persistencia de optimizacion
- ruta restante
- auditoria automatizada de consistencia

### Ola 3

- polilinea vial real
- ETAs por tramo
- observabilidad de rutas y mapa

### Ola 4

- auth hardening admin
- deploy mas estricto

## Criterio de cierre total

Podemos considerar "cerrados todos los pendientes principales" cuando:

1. el piloto recibe pedidos asignados y siempre entiende su estado;
2. puede crear o ampliar ruta sin errores del dia completado;
3. el mapa muestra ruta util dentro de la app con metricas claras;
4. al entregar una parada, avanza a la siguiente sin confusion;
5. los pedidos nuevos llegan con coordenadas o quedan visiblemente marcados;
6. la base se audita sola para evitar desalineaciones;
7. el despliegue y la observabilidad dejan de depender de intuicion manual.

## Siguiente accion recomendada

La mejor siguiente implementacion es:

- persistir resumen de ruta total/restante,
- reforzar la tarjeta operativa del mapa en la app,
- y cerrar QA real del contrato unificado en dispositivo.

Ese paso reduce la mayor cantidad de deuda funcional con el mejor retorno.
