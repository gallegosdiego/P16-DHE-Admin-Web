# Integracion De WhatsApp En El Ecosistema Danhei

Fecha: 2026-07-07

## 1. Objetivo

Definir la arquitectura funcional, tecnica y de infraestructura para integrar WhatsApp como canal formal de entrada de solicitudes de recogida en Danhei, sin romper la operacion actual y manteniendo a la API de Danhei como fuente unica de verdad.

Este documento toma como insumo:

- la propuesta funcional compartida por negocio;
- la validacion real del ecosistema Danhei;
- la arquitectura actual publicada de `P13`, `P14`, `P15` y `P16`.

## 2. Conclusion ejecutiva

La integracion con WhatsApp **si tiene sentido y alto potencial** para Danhei.

No debe implementarse como un chatbot lineal de preguntas una por una. Debe implementarse como un canal estructurado de captura y confirmacion de solicitudes, usando:

- WhatsApp Business Platform;
- WhatsApp Flows para formularios estructurados;
- webhooks hacia la API Danhei;
- un nuevo modulo de `Recogidas` dentro de `P16/api` y `P16/frontend`.

La idea correcta no es:

`WhatsApp = sistema`

La idea correcta es:

`WhatsApp = canal de entrada`

`API Danhei = nucleo operativo`

## 3. Ajuste importante a la propuesta original

La vision de negocio es buena, pero algunos supuestos tecnicos del texto original **no coinciden con el estado real actual de Danhei**.

### Estado real hoy

- Backend actual: `Laravel 13`
- Frontend admin: `Next.js 16`
- Frontend portal: `Next.js 16`
- Base de datos productiva observada: `MySQL`
- Infra actual: `Vercel + cPanel/LiteSpeed`
- Auth: `Sanctum Bearer`
- Roles: `Spatie Permission`
- Realtime: no hay evidencia de `Reverb` activo en produccion hoy

### Implicacion

La integracion de WhatsApp debe diseñarse sobre **la arquitectura actual real**, no sobre una futura arquitectura ideal.

Por tanto:

- el documento asume `MySQL`, no `PostgreSQL`;
- el documento asume `Next.js 16`, no `Next.js 15`;
- el documento no depende de `Reverb` para la primera version;
- la primera version puede vivir dentro de `P16/api` y `P16/frontend`.

## 4. Principios de diseño

1. `API first`: toda la logica operativa vive en Danhei, no en Meta.
2. `Canal desacoplado`: WhatsApp es solo un origen de solicitudes.
3. `No IA en V1`: la primera version debe ser determinista.
4. `Idempotencia obligatoria`: una confirmacion nunca puede crear dos recogidas.
5. `Validacion server-side`: ningun dato del Flow se considera confiable por si solo.
6. `Cobertura y capacidad en tiempo real`: el cliente solo debe ver opciones realmente disponibles.
7. `Cliente frecuente primero`: direcciones guardadas y repeticion de flujos deben ser prioridad.
8. `Escalamiento humano nativo`: debe existir salida clara a asesor/operaciones.
9. `Observabilidad`: cada mensaje, estado y error debe quedar trazable.
10. `Privacidad por diseño`: nombres, telefonos y direcciones deben tratarse como datos sensibles operativos.

## 5. Valor esperado para Danhei

La integracion agrega valor en cinco frentes:

- reduce trabajo manual de captura;
- baja errores de digitacion en direccion, jornada y recaudo;
- acelera la solicitud de recogidas para clientes frecuentes;
- crea una cola estructurada de nuevas recogidas en admin;
- prepara a Danhei para nuevos canales futuros usando el mismo nucleo.

## 6. Alcance recomendado de la V1

### Incluido en V1

- inicio por WhatsApp con menu estructurado;
- opcion `Solicitar recogida`;
- identificacion por numero de telefono;
- cliente nuevo vs cliente frecuente;
- seleccion de direccion guardada o direccion nueva;
- validacion de cobertura;
- seleccion de jornada disponible;
- captura de cantidad de paquetes y tipo aproximado;
- opcion de servicio con o sin contraentrega;
- confirmacion final;
- creacion automatica de solicitud de recogida en API Danhei;
- visualizacion en un nuevo modulo `Recogidas` del admin;
- confirmacion automatica al cliente;
- escalamiento a asesor humano.

### Excluido de V1

- IA generativa libre;
- cotizacion compleja en tiempo real por reglas avanzadas;
- asignacion automatica completa de piloto;
- integracion directa con pasarelas de pago;
- migracion inmediata del numero productivo actual.

## 7. Arquitectura objetivo

### Flujo maestro

```text
Cliente
  |
  v
WhatsApp
  |
  v
WhatsApp Flow / mensajes interactivos
  |
  v
Meta Webhook + Flow Data Exchange
  |
  v
P16 API (Laravel 13)
  |
  +--> Validacion de contacto / cliente
  +--> Validacion de direccion y cobertura
  +--> Validacion de jornada y capacidad
  +--> Validacion de paquetes y COD
  +--> Creacion de solicitud de recogida
  +--> Auditoria y mensajeria saliente
  |
  v
MySQL
  |
  +--> P16 Admin / Recogidas
  +--> P14 Portal cliente
  +--> P15 Operacion movil futura
```

### Regla central

La solicitud nace en WhatsApp, pero la operacion existe solo cuando:

- fue validada por Danhei;
- se persistio en la base de datos;
- y se le asigno un identificador propio de Danhei.

## 8. Ubicacion del modulo en el ecosistema

### Donde vive la logica

La integracion debe vivir principalmente en `P16-DHE-Admin-Web/api`.

### Donde se visualiza

La operacion y monitoreo deben vivir en `P16-DHE-Admin-Web/frontend`.

### Donde impacta indirectamente

- `P13`: podra dirigir al canal WhatsApp estructurado.
- `P14`: podra mostrar recogidas originadas por WhatsApp al cliente autenticado.
- `P15`: en fases futuras podria reflejar recogidas asignadas a pilotos.

## 9. Modulos recomendados dentro de P16/api

```text
app/
  Domain/
    Pickup/
    Customer/
    Shipment/
    Shared/
  Integrations/
    WhatsApp/
```

### Dominio `Pickup`

Responsabilidad:

- modelar la solicitud de recogida;
- paquetes asociados;
- estados;
- reglas de confirmacion;
- capacidad por jornada;
- transicion a pedido/envio cuando aplique.

### Dominio `Integrations/WhatsApp`

Responsabilidad:

- webhooks entrantes;
- mensajes y estados Meta;
- contactos WhatsApp;
- sesiones de interaccion;
- submissions de Flows;
- envio de respuestas y plantillas.

## 10. Modulos recomendados dentro de P16/frontend

Crear un modulo nuevo:

`/recogidas`

### Vistas minimas

- bandeja de recogidas;
- detalle de recogida;
- validacion operativa;
- asignacion manual;
- contacto rapido con cliente;
- filtros por estado, jornada, zona y origen.

### Estados operativos recomendados

- `new`
- `validating`
- `confirmed`
- `pending_assignment`
- `assigned`
- `driver_on_the_way`
- `partially_picked_up`
- `picked_up`
- `not_picked_up`
- `cancelled`

## 11. Modelo de datos recomendado

### `pickup_requests`

```text
id
pickup_code
customer_id nullable
source
status
pickup_address_id
contact_name
contact_phone
pickup_window_code
pickup_window_label
package_count
service_type
cod_expected_total
special_instructions
coverage_status
coverage_zone_id nullable
requested_at
confirmed_at nullable
created_by_channel
created_at
updated_at
```

### `pickup_packages`

```text
id
pickup_request_id
package_index
package_type
approx_weight_kg nullable
size_code nullable
fragile
declared_value nullable
cod_amount nullable
destination_address_id nullable
recipient_name nullable
recipient_phone nullable
notes nullable
created_at
updated_at
```

### `whatsapp_contacts`

```text
id
customer_id nullable
wa_id
phone
display_name nullable
last_interaction_at nullable
is_blocked
created_at
updated_at
```

### `whatsapp_messages`

```text
id
whatsapp_contact_id nullable
meta_message_id unique
direction
message_type
delivery_status nullable
related_entity_type nullable
related_entity_id nullable
payload_json
received_at nullable
sent_at nullable
created_at
updated_at
```

### `whatsapp_flow_submissions`

```text
id
submission_id unique
flow_id
whatsapp_contact_id nullable
customer_id nullable
pickup_request_id nullable
status
payload_json
processed_at nullable
created_at
updated_at
```

### `pickup_events`

```text
id
pickup_request_id
event_type
old_values_json nullable
new_values_json nullable
actor_type
actor_id nullable
occurred_at
created_at
```

## 12. Reutilizacion de estructuras existentes

Danhei ya tiene piezas reutilizables:

- clientes;
- direcciones de clientes;
- zonas;
- geodatos de envios;
- estados operativos;
- notificaciones;
- auditoria.

### Decision recomendada

No duplicar logica si ya existe.

La integracion debe reutilizar:

- catalogo de clientes;
- direcciones guardadas;
- zonas operativas;
- reglas de cobertura;
- normalizacion de direcciones;
- auditoria existente.

## 13. Flujos de negocio recomendados

### Flujo A - Cliente nuevo solicita recogida

1. Escribe por WhatsApp.
2. El canal lo clasifica como contacto no asociado.
3. Se ofrece `Solicitar recogida`.
4. El Flow captura direccion, contacto, paquetes, servicio y jornada.
5. La API valida cobertura y capacidad.
6. El cliente confirma.
7. Se crea `pickup_request`.
8. Se responde con confirmacion y codigo.
9. Aparece en admin como `new`.

### Flujo B - Cliente frecuente

1. Escribe `Recogida`.
2. Se reconoce el numero.
3. Se ofrecen opciones:
   - repetir ultima recogida;
   - usar direccion habitual;
   - crear nueva.
4. El cliente confirma con pocos pasos.
5. La API crea la solicitud.

### Flujo C - Cliente quiere recogida y guia completa

1. El cliente entra por WhatsApp.
2. El Flow permite elegir `solo recogida` o `crear envio`.
3. Si elige `crear envio`, se capturan destinatario y COD.
4. El backend puede:
   - crear solo la recogida en V1;
   - o crear recogida + shipment en V2.

### Recomendacion para V1

Separar claramente:

- `recogida simple`
- `recogida con datos completos de envio`

Pero no forzar la creacion automatica de guia en todos los casos desde el dia uno.

## 14. Integracion con direccion, cobertura y geocodificacion

Este es uno de los puntos de mayor valor para Danhei.

### Regla

La direccion nunca debe quedar como texto libre sin enriquecer.

### Pipeline recomendado

1. recibir direccion cruda;
2. normalizar texto;
3. geocodificar;
4. determinar ciudad/localidad/municipio;
5. cruzar contra zona operativa;
6. calcular `coverage_status`;
7. guardar `confidence_score`.

### Aterrizado a Danhei hoy

Como la produccion actual corre con fallback `Nominatim` y no con Google Maps configurado, la V1 debe:

- soportar geocodificacion con fallback;
- registrar confianza de geocodificacion;
- permitir revision manual en admin;
- no bloquear toda la operacion si la direccion es parcialmente usable.

### Recomendacion de infraestructura

Para WhatsApp, conviene activar un proveedor de geocodificacion mas estable antes del rollout masivo, porque la calidad de direccion impacta directamente la promesa operacional.

## 15. Jornadas y capacidad

La jornada no debe ser texto libre.

Debe salir de un servicio central del backend.

### Servicio recomendado

`PickupWindowAvailabilityService`

Responsabilidad:

- conocer franjas disponibles;
- cruzar zona + fecha + capacidad;
- devolver solo opciones mostrables;
- cerrar opciones cuando la capacidad se agota.

### Respuesta esperada

```json
[
  {
    "code": "today_am",
    "label": "Primera jornada",
    "available": true
  },
  {
    "code": "today_pm",
    "label": "Segunda jornada",
    "available": false
  }
]
```

## 16. Mensajeria y asincronia

### Problema

La integracion con WhatsApp produce eventos entrantes y salientes que no conviene manejar completamente en forma sincronica.

### Estado actual

El ambiente productivo de Danhei viene orientado a `QUEUE_CONNECTION=sync`.

### Riesgo

Para WhatsApp esto es insuficiente si queremos:

- reintentos;
- desacoplar envio de confirmaciones;
- manejar errores transitorios;
- procesar webhooks sin latencia alta.

### Recomendacion

Para la integracion de WhatsApp, habilitar cola asincronica real.

Orden recomendado:

1. `database queue` como MVP si se mantiene cPanel;
2. cron/worker controlado para procesar jobs;
3. evaluar `Redis + worker persistente` o mover jobs a un runtime mas robusto si el volumen crece.

### Jobs recomendados

- `ProcessInboundWhatsAppMessage`
- `ProcessWhatsAppFlowSubmission`
- `SendWhatsAppConfirmation`
- `SendWhatsAppStatusNotification`
- `RetryFailedWhatsAppDelivery`

## 17. Seguridad

### Controles minimos

- verificacion del webhook de Meta;
- validacion de firma si aplica al flujo elegido;
- secretos fuera del codigo;
- rotacion de tokens;
- rate limiting por endpoint;
- payload logging redacted;
- idempotencia por `meta_message_id` y `submission_id`;
- auditoria por cambio de estado;
- trazabilidad de actor.

### Datos sensibles

Tratar como datos sensibles operativos:

- telefono;
- direccion;
- nombre de remitente;
- nombre de destinatario;
- recaudo esperado;
- historial de interacciones.

### Recomendacion legal-operativa

Antes de salir a produccion, revisar:

- politica de tratamiento de datos;
- consentimiento en el Flow;
- texto de finalidad;
- retention policy;
- control de acceso interno.

Esto no sustituye revision legal formal.

## 18. Idempotencia y duplicados

Este punto es critico.

### Riesgo real

Si Meta reintenta un evento o si el cliente pulsa dos veces confirmar, Danhei no puede crear dos recogidas.

### Controles obligatorios

- `meta_message_id` unico;
- `submission_id` unico;
- transaccion DB para la creacion;
- llave de idempotencia por confirmacion;
- estado de procesamiento en `whatsapp_flow_submissions`.

### Regla de negocio

Una misma submission debe producir:

- una sola recogida;
- o una respuesta idempotente indicando que ya fue creada.

## 19. Observabilidad

### Debe medirse

- webhooks recibidos;
- webhooks invalidos;
- submissions procesadas;
- submissions fallidas;
- tiempo de geocodificacion;
- tiempo de validacion de cobertura;
- tiempo de confirmacion;
- mensajes salientes exitosos/fallidos;
- recogidas creadas por canal;
- conversion de menu a recogida confirmada.

### Recomendacion

Crear dashboard operativo minimo:

- total de recogidas WhatsApp hoy;
- conversion por Flow;
- zonas con mas solicitudes;
- errores de geocodificacion;
- errores de jornada;
- mensajes no entregados.

## 20. Numero actual de Danhei

### Regla de rollout

No tocar el numero productivo actual al inicio.

### Camino recomendado

1. numero de prueba / sandbox;
2. webhook funcional;
3. Flow funcional;
4. backend funcional;
5. modulo admin funcional;
6. pruebas integrales;
7. evaluacion de onboarding del numero actual;
8. migracion o coexistencia si la ruta oficial vigente lo permite.

### Decision

El numero actual se toca solo despues de validar:

- impacto operativo;
- limitaciones del onboarding;
- riesgo sobre dispositivos vinculados;
- continuidad del canal comercial.

## 21. Realtime en el admin

La propuesta original sugiere `Reverb`, pero hoy no hay evidencia de que Danhei lo tenga ya operativo.

### Recomendacion

V1:

- actualizacion por polling corto o refresh automatico;
- toast local al crear nuevas recogidas;
- filtros y contador de nuevas.

V2:

- evaluar websockets/realtime formal si el volumen lo justifica.

Esto evita introducir complejidad innecesaria en la primera entrega.

## 22. Endpoints recomendados

### Integracion WhatsApp

- `GET /api/integrations/whatsapp/webhook`
- `POST /api/integrations/whatsapp/webhook`
- `POST /api/integrations/whatsapp/flows/data-exchange`

### Recogidas

- `GET /api/pickups`
- `GET /api/pickups/{id}`
- `POST /api/pickups`
- `POST /api/pickups/{id}/validate`
- `POST /api/pickups/{id}/assign`
- `POST /api/pickups/{id}/cancel`
- `POST /api/pickups/{id}/mark-picked-up`

### Servicios auxiliares

- `POST /api/pickups/coverage-check`
- `GET /api/pickups/windows/availability`
- `GET /api/whatsapp/contacts/{waId}/context`

## 23. Fases de implementacion

### Fase 0 - Diseño y preparación

- definir modelo de datos;
- definir estados;
- definir consentimientos;
- definir textos y UX del Flow;
- preparar numero sandbox.

### Fase 1 - Backend base

- tablas nuevas;
- webhook;
- idempotencia;
- modulo `Pickup`;
- modulo `Integrations/WhatsApp`;
- servicios de cobertura y jornada.

### Fase 2 - Admin

- modulo `Recogidas`;
- filtros;
- detalle;
- validacion;
- asignacion;
- contacto rapido.

### Fase 3 - Flow V1

- cliente nuevo;
- cliente frecuente;
- direccion guardada;
- jornada;
- paquetes;
- confirmacion.

### Fase 4 - Piloto controlado

- numero de prueba;
- 1 o 2 clientes reales;
- 1 zona;
- jornadas limitadas;
- observacion intensiva.

### Fase 5 - Escalamiento

- usar numero real o coexistencia;
- mas zonas;
- analitica;
- automatizaciones adicionales.

## 24. Riesgos principales

- mala calidad de geocodificacion;
- duplicados por reintento;
- saturacion del admin si no se modela `Recogidas` aparte;
- dependencia excesiva del numero actual sin sandbox;
- cola sin asincronia real;
- errores legales por consentimiento insuficiente;
- exceso de complejidad si se intenta crear guia completa en V1 para todos los casos.

## 25. Decisiones recomendadas

### Decisiones que recomiendo aprobar desde ya

1. WhatsApp sera canal de entrada, no fuente de verdad.
2. La V1 se enfocara en `Recogidas`, no en IA conversacional.
3. Se creara un modulo nuevo `Pickup`.
4. Se creara un modulo nuevo `Integrations/WhatsApp`.
5. Se usara sandbox antes del numero real.
6. Se implementara idempotencia como requisito no negociable.
7. La cola debe pasar a modo asincronico para esta integracion.
8. El admin tendra un modulo dedicado `Recogidas`.

### Decisiones que deben quedar abiertas

1. proveedor final de geocodificacion en produccion;
2. uso de Reverb o polling en admin;
3. coexistencia o migracion del numero actual;
4. si V1 crea solo recogidas o tambien guias completas en ciertos casos.

## 26. Veredicto final

La propuesta es correcta como direccion estrategica y puede convertirse en uno de los canales mas valiosos de Danhei.

Pero la implementacion correcta no es "pegar WhatsApp al panel".

La implementacion correcta es:

- crear un dominio de `Recogidas`;
- tratar WhatsApp como canal estructurado;
- mantener la API de Danhei como nucleo;
- y desplegarlo por fases, con sandbox, idempotencia y observabilidad.

## 27. Siguiente paso recomendado

El siguiente paso correcto no es programar de inmediato.

Es producir una segunda capa de documento:

`especificacion funcional + contrato API + modelo de tablas + pantallas admin + estados exactos del Flow`

Ese documento debe servir como backlog de implementacion para `P16/api`, `P16/frontend` y la configuracion de WhatsApp.
