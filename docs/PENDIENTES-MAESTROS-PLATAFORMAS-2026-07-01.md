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

Adicionalmente, desde la Iteracion 20 queda mitigado un hueco importante de geodatos:

- pedidos sin `recipient_city` ya no dependen del default tardio de SQL para intentar geocodificacion;
- apertura/creacion/optimizacion de rutas ahora intenta autorreparar coordenadas faltantes;
- el comando `shipments:geocode-missing` ahora cubre mejor legados sin geo.

Por tanto, el backlog vivo se concentra ahora sobre:

1. deploy manual productivo de la version actual;
2. QA real en dispositivo y operacion completa;
3. validacion productiva final de visualizacion administrativa del recorrido del piloto;
4. endurecimiento de despliegue y auth del panel.

## Actualizacion 2026-07-08

Se cierra otro hueco importante del bloque de mapas/geolocalizacion:

- la reparacion de coordenadas ya no depende exclusivamente del proveedor externo;
- si Google/Nominatim no ubican el pedido, backend intenta centroides historicos de la misma zona/ciudad;
- si tampoco hay historia suficiente, cae a anclas conocidas de zonas/ciudades operativas con offset deterministico por direccion;
- `my-route`, `operational-state` y `shipments:geocode-missing` comparten ahora esa misma estrategia.

Impacto:

- baja el volumen real de pedidos en `Geo pendiente`;
- el mapa del piloto tiene mucha menos probabilidad de quedar vacio por falta total de coordenadas;
- el pendiente operativo ya no es “conseguir cualquier coordenada”, sino validar en QA si la aproximacion es suficientemente util para navegacion real.

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

Estado actual:

- el mapa ya existe y la base tecnica ya quedo cerrada;
- muestra puntos, metricas y foco operativo;
- si falta Google API key, backend usa geocodificacion fallback;
- si una direccion sigue ambigua y la zona tiene caja geografica, usa centro de zona.

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

- mayormente resuelto a nivel codigo;
- los pedidos nuevos/actualizados ya pueden geocodificarse al crear o editar;
- si falta `recipient_city`, backend ahora intenta resolverla desde la zona o ciudad por defecto antes de geocodificar;
- al abrir/crear/optimizar rutas el backend intenta reparar geodatos faltantes;
- existe filtro, resumen operativo y comando de backfill para historicos.

Problema:

- el mapa y la optimizacion dependen de `recipient_lat` y `recipient_lng`;
- sin coordenadas, parte del valor del mapa se pierde;
- aun hay que confirmar en produccion que zonas y datos legacy queden consistentes.

Pendiente:

- validar en produccion el fallback de geocodificacion ya desplegado;
- ejecutar backfill inicial sobre historicos legacy solo si despues del deploy siguen apareciendo rutas viejas sin geo;
- verificar en produccion que el reporte de faltantes del panel refleje bien los pedidos reales y ayude a limpiar el backlog geo.

Aceptacion:

- los pedidos nuevos llegan con coordenadas validas;
- existe reporte claro de pedidos sin geodata;
- el mapa solo degrada en casos de datos realmente insuficientes.

### 4. Sacar una build real de P15 y validar todo el flujo en celular

Problema:

- varios fixes ya estan en codigo, pero falta cerrar validacion final en dispositivo real.

Pendiente:

- validar la APK/Release actual instalada;
- reinstalar solo si el celular sigue en una build vieja;
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

Estado actual:

- el panel admin ya distingue `Ruta vial real` vs `Trazo aproximado`;
- la pantalla de rutas ya resume cuantas rutas activas siguen en modo aproximado.

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

Estado actual:

- ya existe el comando `php artisan operations:audit-integrity`;
- ya tiene cobertura automatizada en `api/tests/Feature/OperationalIntegrityCommandTest.php`;
- el hueco real ya no es "crear la auditoria", sino operativizarla y revisar su salida en produccion.

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

La mejor siguiente accion es:

- desplegar `P16` actual en cPanel,
- verificar `deploy-check`,
- y cerrar QA real del contrato unificado en dispositivo.

Ese paso ya no abre mas frente tecnico nuevo y nos deja viendo solo entorno, datos y QA real.

## Actualizacion 2026-07-04 - robustez P15 <-> P16

Desde los commits:

- `cf3b1a0` en `P16-DHE-Admin-Web`
- `263b004` y `5fcf66d` en `P15-DHE-App-Repartidor`

quedan cerrados ademas estos puntos:

- cierre atomico de parada entre movil y backend;
- tolerancia a reintentos cuando el envio ya quedo `delivered` o `issue` pero la parada seguia pendiente;
- build Android `4.2.16` lista para QA;
- documentacion del contrato nuevo `POST /api/routes/{route}/stops/{stop}/resolve`.

## Backlog vivo real despues de la iteracion 59

### P0 - Cierre operativo inmediato

1. **QA real de la build `4.2.16`**
   - validar entrega simple;
   - entrega COD;
   - novedad;
   - cierre de ultima parada;
   - finalizar ruta con devolucion de pendientes;
   - continuidad del mismo dia con paquetes nuevos.

2. **Verificacion productiva de geocodificacion**
   - confirmar en produccion que pedidos nuevos creados/editados desde panel queden con `recipient_lat` y `recipient_lng`;
   - usar el panel y `repair-geodata` solo como respaldo, no como rutina normal.

3. **Confirmacion final de tracking admin**
   - revisar que el monitor del panel refleje:
     - ultima ubicacion,
     - frescura del ping,
     - parada actual,
     - siguiente parada,
     - trazo aproximado o vial segun el caso.

### P1 - Producto operativo

4. **Definir la siguiente fase del mapa**
   - opcion A: mantener el modelo hibrido actual como producto estable;
   - opcion B: construir navegacion mas embebida dentro de la app;
   - decision pendiente de costo/beneficio y complejidad operativa.

5. **Mejorar el modulo admin de rutas en movil**
   - seguir adaptando jerarquia visual;
   - reducir saturacion en la columna de monitoreo;
   - priorizar lectura rapida del estado del piloto.

6. **Alertas documentales proactivas**
   - proximos vencimientos;
   - recordatorios operativos;
   - panel de seguimiento documental.

### P2 - Calidad de plataforma

7. **Formalizar release QA de Android**
   - dejar convención estable de versionado;
   - dejar siempre la APK vigente en `dist`;
   - opcional: documentar checklist release + smoke test antes de entregar.

8. **Seguir endureciendo auth y deploy**
   - auth del panel;
   - verificacion mas estricta de runtime productivo;
   - observabilidad operativa.
