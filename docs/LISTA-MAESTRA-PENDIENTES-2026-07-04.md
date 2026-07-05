# Lista maestra de pendientes - 2026-07-04

Repos relacionados:

- `P16-DHE-Admin-Web`
- `P15-DHE-App-Repartidor`

## Ya cerrado hoy

- contrato unificado `GET /api/driver/operational-state`;
- continuidad de ruta del mismo dia;
- geodata repair desde panel;
- monitoreo base de rutas admin;
- alta de pilotos mas robusta;
- cierre atomico de paradas con `POST /api/routes/{route}/stops/{stop}/resolve`;
- build Android `4.2.17` lista para QA;
- validacion estricta de pares `recipient_lat` + `recipient_lng`;
- normalizacion de coordenadas huerfanas en `repair-geodata`;
- normalizacion robusta de direccion/zona/ciudad antes de geocodificar;
- formulario web de pedidos con sugerencias de zonas y ciudad autocompletada por zona;
- tracking background del piloto con timeout y retry corto.

## Pendientes actuales priorizados

### Critico

1. **QA final de la build `4.2.17`**
   - entrega normal;
   - entrega COD;
   - novedad;
   - cierre de ultima parada;
   - finalizar ruta y devolver pendientes;
   - continuidad del dia con pedidos nuevos.

2. **Verificar geocodificacion real de pedidos nuevos en produccion**
   - confirmar que desde el panel los pedidos nazcan con `recipient_lat` y `recipient_lng`;
   - confirmar que los casos sin match entren como faltantes reparables, no como pares partidos;
   - usar `repair-geodata` solo para rezagos o legados;
   - confirmar que la normalizacion nueva absorba variantes como:
     - `Bogotá` / `Bogota`;
     - `cl`, `cll`, `cra`, `kr`, `diag`, `tv`;
     - direccion con zona/ciudad repetidas;
     - direccion con apartamento/oficina.

3. **Verificar tracking real del piloto en admin**
   - ping vivo;
   - frescura;
   - parada actual;
   - siguiente parada;
   - trazado mostrado.

### Importante

4. **Definir siguiente fase del mapa**
   - mantener modelo hibrido;
   - o pasar a navegacion mas embebida tipo Google Maps.

5. **Seguir optimizando el modulo `Rutas` del panel**
   - escritorio;
   - movil;
   - lectura rapida del monitoreo;
   - ampliar siguiente capa con timeline historico y trazado reciente.

6. **Alertas documentales proactivas**
   - vencimientos;
   - avisos;
   - panel preventivo.

### Mejora

7. **Formalizar pipeline de release QA Android**
   - versionado;
   - APK vigente en `dist`;
   - checklist release.

8. **Seguir endureciendo plataforma**
   - auth del panel;
   - deploy-check mas estricto;
   - observabilidad de produccion;
   - metricas visibles de frescura del tracking background.

## Orden recomendado

1. deploy web de `P16`;
2. instalar APK `4.2.17`;
3. cerrar QA critico;
4. revisar geodata + tracking admin;
5. luego decidir la siguiente fase del mapa.

## Criterio de cierre

Podemos decir que esta fase queda cerrada cuando:

- piloto entrega y registra novedades sin estados partidos;
- admin ve tracking y parada actual de forma confiable;
- pedidos nuevos llegan con coordenadas validas;
- las direcciones sucias o redundantes se limpian antes de geocodificar;
- la app `4.2.16` pasa QA real.
