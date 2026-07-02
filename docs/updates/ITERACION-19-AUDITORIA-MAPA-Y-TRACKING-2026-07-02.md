# Iteracion 19 - auditoria mapa app y tracking admin

## Resumen ejecutivo

Se audito el flujo completo entre:

- app piloto;
- backend de rutas;
- panel administrativo.

La conclusion es:

1. el seguimiento base del piloto en panel administrativo **ya funciona**;
2. el mapa interno de la app **ya esta implementado**, pero depende de coordenadas validas y del build correcto del APK;
3. el panel admin ahora puede mostrar un mapa geografico real con OpenStreetMap, overlay de ruta y posicion viva del piloto.

## Estado real del tracking en panel admin

El panel administrativo ya consume la ubicacion viva del piloto a traves de:

- `POST /api/driver/location`
- `GET /api/routes`

La pantalla `frontend/src/app/(admin)/rutas/page.tsx`:

- refresca automaticamente cada 30 segundos;
- muestra frescura de ubicacion;
- muestra piloto, parada actual y siguiente parada;
- ya puede abrir un mapa geografico real embebido con OpenStreetMap, overlay de ruta, puntos de entrega y posicion viva del piloto.

## Estado real del mapa en la app piloto

La pantalla `P15-DHE-App-Repartidor/app/(tabs)/mapa.tsx` ya renderiza:

- `react-native-maps`;
- marcadores;
- polilinea general;
- tramo actual;
- resumen de distancia y duracion;
- foco en la siguiente parada.

### Cuando se ve mapa real

El mapa puede verse correctamente cuando coinciden estas condiciones:

1. existe una ruta navegable;
2. al menos una parada tiene `recipient_lat` y `recipient_lng`;
3. el APK instalado tiene enlazado el modulo nativo de mapas;
4. si hay geometria de Google Routes, la polilinea se dibuja sobre calles reales.

### Cuando no se ve el mapa

La app cae intencionalmente a un modo seguro cuando:

- no hay ruta;
- la ruta no tiene coordenadas;
- el modulo nativo del mapa no inicia.

Ese comportamiento evita cierres de la app, pero hace que el piloto vea secuencia/listado en vez del mapa.

## Cuello de botella principal detectado

El principal bloqueo actual del mapa no es la UI sino la data:

- pedidos historicos o nuevos sin `recipient_lat` y `recipient_lng`;
- necesidad de geocodificacion consistente en backend;
- dependencia del build correcto del APK para `react-native-maps`.

## Siguiente nivel recomendado

Para cerrar la experiencia completa faltaria:

1. backfill de coordenadas en produccion para pedidos existentes;
2. QA real del APK instalado en dispositivo;
3. validar en produccion la carga del iframe de OpenStreetMap y el overlay geodesico de la ruta.
