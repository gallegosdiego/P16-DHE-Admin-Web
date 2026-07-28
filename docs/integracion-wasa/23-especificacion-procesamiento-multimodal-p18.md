# Especificacion de procesamiento multimodal para P18

**Fecha:** 28 de julio de 2026
**Estado:** Analisis y diseno funcional; no habilita produccion
**Relacionado:** [Plan del modulo P18 en el Panel Admin](./22-plan-modulo-p18-panel-admin-2026-07-28.md)
**Repositorio del lector:** [P18-DHE-WhatsApp-Reader](https://github.com/gallegosdiego/P18-DHE-WhatsApp-Reader)

## 1. Objetivo de negocio

El objetivo de P18 no es solamente almacenar conversaciones. El objetivo es
organizar todo lo que entre por WhatsApp y convertirlo en una lista operativa
de posibles ingresos de paquetes que el equipo pueda revisar desde el Panel
Admin.

La evolucion se hara por modalidades y no se activara todo al mismo tiempo:

1. Texto: captura, lectura, extraccion y organizacion de los datos.
2. Imagen: lectura de fotografias, etiquetas, comprobantes o capturas que
   complementen el texto.
3. Audio: descarga, transcripcion y extraccion de los datos hablados.

Cada modalidad debe poder ejecutarse con procesamiento local, mediante API o
quedar apagada. El resultado final debe ser independiente del proveedor para
que el Panel Admin reciba siempre el mismo contrato.

## 2. Interpretacion funcional

La pantalla P18 debe responder rapidamente estas preguntas:

- Que cliente o contacto esta solicitando el ingreso.
- Desde que chat y que remitente llego la informacion.
- Que paquete o paquetes se estan entregando a Danhei.
- Donde se recoge el paquete, si esa informacion fue enviada.
- A quien se entrega, con que nombre, celular y direccion.
- Cuantos paquetes son.
- Si existe contraentrega y por que valor solicitado.
- Que observaciones, evidencias, imagenes o audios respaldan los datos.
- Que campos faltan o son ambiguos.
- Que proveedor proceso cada dato y con que confianza.
- Que debe revisar un operador antes de llevarlo al dominio operativo.

La expresion `cliente que lo esta dando` se modelara con dos conceptos para
evitar ambiguedad:

1. **Cliente solicitante:** cuenta o empresa de Danhei asociada al chat.
2. **Remitente del mensaje:** persona o numero que escribio en WhatsApp.

Pueden ser la misma persona, pero no deben darse por equivalentes sin una
relacion configurada o una confirmacion humana.

Tambien se separaran:

- **Origen o recogida:** lugar donde Danhei recibe el paquete.
- **Entrega o destino:** lugar y persona a quien se entrega el paquete.

Esta separacion es necesaria porque una direccion recibida por WhatsApp puede
ser de recogida o de entrega. El sistema no debe adivinar cual es.

## 3. Hallazgos sobre la implementacion actual

P18 ya tiene una base util:

- captura idempotente por mensaje remoto;
- cifrado de cuerpo, remitente y multimedia;
- estados de procesamiento;
- tabla de ejecuciones y extracciones;
- resumen por chat, remitente, fecha, tipo y estado;
- procesamiento local con Ollama para texto e imagen;
- transcripcion local con el comando `whisper` para audio;
- reintentos y retencion.

Sin embargo, el codigo actual tiene cuatro limites que debemos resolver antes
de implementar la segunda y tercera fase:

### 3.1 El procesador es local y unico

`src/local-processor.js` devuelve `WAITING_LOCAL_PROCESSOR` si el procesamiento
local esta apagado. Todavia no existe un adaptador API ni una politica
`local -> fallback API`.

### 3.2 Texto, imagen y audio estan demasiado acoplados

El flujo actual usa Ollama para generar la extraccion final. En audio primero
transcribe con Whisper y luego usa Ollama, pero no conserva una arquitectura
de proveedores intercambiables ni una medicion separada de transcripcion,
OCR, vision y extraccion.

### 3.3 Existe una sola extraccion por mensaje

La tabla `extractions` tiene una restriccion unica por `message_id`. Eso sirve
para un resultado final, pero no permite comparar local contra API, guardar
versiones de modelo o conservar una salida rechazada y otra seleccionada.

### 3.4 Falta un caso de ingreso que una varios mensajes

Un cliente puede enviar en secuencia:

```text
Mensaje 1: texto con el nombre del destinatario
Mensaje 2: fotografia de la guia o paquete
Mensaje 3: audio con la direccion
```

Esos tres mensajes deben poder formar un solo caso de ingreso, sin perder la
evidencia individual. Una lista basada exclusivamente en mensajes duplicaria
la operacion o presentaria datos incompletos.

## 4. Pipeline recomendado

```text
Mensaje entrante
       |
       v
Captura y cifrado
       |
       v
Normalizacion de media
       |
       v
Clasificacion de modalidad
       |
       +--> Texto -----------+
       +--> Imagen ----------+--> Adaptador de proveedor
       `--> Audio -----------+        |
                                      v
                              Salida estructurada JSON
                                      |
                                      v
                             Validacion de esquema
                                      |
                                      v
                              Normalizacion de campos
                                      |
                                      v
                            Agrupacion en caso de ingreso
                                      |
                                      v
                             Reglas de completitud
                                      |
                                      v
                              PENDING_REVIEW en P18
                                      |
                                      v
                         Vista de Ingreso de paquetes en P16
```

La extraccion nunca ejecuta funciones de negocio. Solo propone datos y
conserva la evidencia de donde salio cada campo.

## 5. Modos de procesamiento

La configuracion debe ser independiente por modalidad. No debe existir un
unico interruptor que obligue a elegir local o API para todo el sistema.

### Modos

```text
local  -> usa solamente el motor local; si falla, queda pendiente
api    -> usa solamente el proveedor API habilitado
auto   -> intenta local y usa API solo bajo reglas de fallback
off    -> conserva la evidencia pero no procesa la modalidad
```

### Variables propuestas

```env
TEXT_PROCESSING_MODE=local
IMAGE_PROCESSING_MODE=local
AUDIO_TRANSCRIPTION_MODE=local
AUDIO_EXTRACTION_MODE=local

API_PROCESSOR_ENABLED=false
API_PROCESSOR_PROVIDER=openai
API_FALLBACK_ENABLED=false

LOCAL_TEXT_PROVIDER=ollama
LOCAL_VISION_PROVIDER=ollama
LOCAL_AUDIO_PROVIDER=faster-whisper
```

Los nombres pueden adaptarse al estilo del proyecto, pero el concepto debe
mantenerse: modalidad, proveedor, modelo y politica de fallback deben quedar
registrados por cada ejecucion.

### Reglas de fallback

El modo `auto` no debe enviar datos a la nube silenciosamente. Antes de usar
API debe cumplirse todo lo siguiente:

- `API_PROCESSOR_ENABLED=true`;
- la modalidad permite nube;
- existe una clave valida para el proveedor;
- el entorno permite datos reales;
- el motivo queda registrado como `LOCAL_UNAVAILABLE`, `LOCAL_TIMEOUT`,
  `LOCAL_INVALID_RESULT` o `LOW_CONFIDENCE`;
- se registra que la evidencia fue enviada a un tercero;
- la respuesta se valida con el mismo esquema que la salida local.

Si la API tambien falla, el caso permanece disponible para revision manual y
no se pierde el mensaje original.

## 6. Investigacion y recomendacion tecnica por modalidad

### 6.1 Texto

El texto normal es la primera fase y debe ser la mas estable.

**Local recomendado:** Ollama con un modelo de texto configurado para espanol
y salida JSON. El proyecto ya usa Ollama y debe conservarlo como primera
opcion cuando este disponible.

**API recomendada:** un proveedor que permita salida estructurada con esquema
JSON. OpenAI ofrece entrada de texto e imagen mediante Responses API y
Structured Outputs para restringir la respuesta al esquema definido. Gemini
tambien documenta salidas estructuradas y puede servir como segundo adaptador.

**Regla:** el extractor no debe recibir instrucciones para ejecutar acciones.
Solo debe identificar intencion, campos, valores y faltantes.

### 6.2 Imagen

Para imagenes no recomiendo depender solamente de una pregunta abierta a un
modelo vision. La ruta de calidad debe ser de dos capas:

1. **Calidad y normalizacion:** validar MIME, tamano, orientacion, resolucion,
   desenfoque y legibilidad; generar una copia de trabajo sin metadatos EXIF
   innecesarios.
2. **Lectura:** ejecutar OCR para texto visible y vision para interpretar el
   contexto del documento o fotografia; despues combinar ambos resultados en
   el extractor estructurado.

**Local:** Ollama soporta modelos de vision que reciben imagen y texto y su
   API recibe las imagenes como base64. Para OCR especializado conviene probar
   PaddleOCR 3.x, que ofrece PP-OCRv5 para reconocimiento y pipelines de
   estructura documental. La combinacion OCR + vision es mas auditable que
   pedirle a un unico modelo que invente una transcripcion de la imagen.

**API:** OpenAI Responses API acepta imagen por URL o base64 y permite pedir
   una salida estructurada; Gemini ofrece comprension de imagen y salidas
   estructuradas. La API debe ser un adaptador, no el contrato que consume el
   panel.

**Casos que deben distinguirse:**

- fotografia de etiqueta o guia;
- captura de pantalla de una conversacion;
- foto de paquete sin texto;
- documento con datos personales;
- imagen borrosa o cortada;
- varias imagenes del mismo caso.

Una imagen ilegible debe quedar como `NEEDS_REVIEW_IMAGE`, con el motivo,
no producir campos aparentemente validos.

### 6.3 Audio

El audio debe manejarse en dos pasos separados:

```text
Audio WhatsApp
       |
       v
Normalizacion y deteccion de voz
       |
       v
Transcripcion con segmentos y confianza
       |
       v
Extraccion de datos del ingreso
```

**Local recomendado:** evaluar `faster-whisper` como motor principal en vez
del comando Python original `whisper`. Su documentacion indica decodificacion
mediante PyAV sin exigir FFmpeg instalado en el sistema, soporte CPU con INT8,
GPU NVIDIA y filtro VAD para eliminar silencios. En equipos Windows donde se
prefiera un ejecutable autocontenido, `whisper.cpp` es una alternativa valida
con soporte CPU y aceleracion segun el hardware.

**API recomendada:** OpenAI documenta `/v1/audio/transcriptions` con
`gpt-4o-transcribe` y `gpt-4o-mini-transcribe`, idioma, prompt, formatos JSON o
texto y una variante con diarizacion. Gemini tambien puede analizar audio,
transcribir y producir salidas estructuradas.

**Para Danhei:** la diarizacion no es necesaria para un audio de un solo
remitente, pero si debe conservarse como opcion futura para audios con varias
personas o notas reenviadas.

**Reglas de audio:**

- no guardar solo la transcripcion; conservar el audio cifrado durante la
  retencion aprobada;
- guardar idioma detectado, duracion, segmentos, confianza y errores;
- tratar numeros, celulares, direcciones y valores COD como campos de alto
  riesgo de transcripcion;
- marcar para revision cualquier numero que no pase validacion de formato;
- no crear un ingreso solo porque el audio contenga palabras como `recogida`.

## 7. Comparacion de estrategias

| Estrategia | Ventaja | Riesgo o costo | Uso recomendado |
| --- | --- | --- | --- |
| Solo local | Privacidad y costo marginal bajo | Depende del equipo y la instalacion | Operacion normal cuando hay equipo disponible |
| Solo API | Calidad y disponibilidad mas uniforme | Costo, dependencia y salida de PII | Emergencia o pruebas controladas |
| Local con fallback API | Resiliencia y control de costo | Mayor complejidad y riesgo de envio silencioso | Recomendacion objetivo |
| API para transcribir + local para extraer | Reduce carga local de audio | El audio sale a nube | Solo si se aprueba por privacidad |
| Local OCR + API vision | Conserva OCR local y mejora casos dificiles | Dos motores y costo de imagen | Imagenes de baja calidad o documentos complejos |
| Dos motores en paralelo | Permite comparar calidad | Duplica costo/latencia | Benchmark y calibracion, no operacion permanente |

### Recomendacion

La arquitectura objetivo es **local primero con fallback API explicito**, pero la
primera entrega no debe activar el fallback hasta que exista:

- proveedor elegido;
- politica de datos aprobada;
- limites de gasto;
- pruebas con ejemplos reales anonimizados;
- registro de proveedor y modelo;
- borrado de archivos enviados al proveedor cuando corresponda.

Para el benchmark inicial se pueden comparar OpenAI y Gemini como adaptadores
API, sin acoplar el dominio a ninguno. La eleccion definitiva debe basarse en
calidad medida con mensajes reales de Danhei, costo por caso, latencia y
politica de tratamiento de datos, no solo en una demostracion.

## 8. Modelo de datos: mensaje, evidencia y caso

### 8.1 Mensaje

Representa lo que llego por WhatsApp y no debe alterarse por la interpretacion
del modelo.

```text
message
  id
  remote_id
  chat_id
  sender_id_hash
  received_at
  message_at
  message_type
  encrypted_body
  media_id
  content_hash
```

### 8.2 Ejecucion de procesamiento

Cada intento debe tener su propio registro:

```text
processing_run
  id
  message_id
  modality                 text | image | audio
  stage                    ocr | transcription | extraction | validation
  mode                     local | api
  provider                 ollama | paddleocr | faster-whisper | openai | gemini
  model
  prompt_version
  status
  fallback_reason
  latency_ms
  input_hash
  output_hash
  error_code
  started_at
  finished_at
```

No guardar claves, tokens, payloads completos ni contenido sin cifrar en esta
tabla.

### 8.3 Salida de procesamiento

En lugar de una sola fila indiscriminada por mensaje, debemos conservar:

```text
processing_output
  id
  message_id
  processing_run_id
  output_kind              ocr | transcript | extraction
  encrypted_content
  confidence
  validation_status
  selected_for_case
  created_at
```

Esto permite comparar local y API, seleccionar una salida y conservar la
trazabilidad sin perder la alternativa.

### 8.4 Caso de ingreso

El caso es la unidad que se muestra en la lista operativa del Panel Admin.

```text
intake_case
  id
  correlation_id
  chat_id
  sender_id_hash
  customer_id nullable
  customer_match_status
  status
  opened_at
  last_activity_at
  review_user_id nullable
  reviewed_at nullable
```

```text
intake_case_message
  intake_case_id
  message_id
  contribution_type       primary | supporting | clarification
  sequence
```

El caso puede reunir texto, imagen y audio dentro de una ventana configurable
del mismo chat. Si no existe evidencia suficiente para vincular mensajes, se
mantienen como casos separados para no mezclar clientes o pedidos.

## 9. Contrato canonico de ingreso de paquetes

El modelo debe separar datos extraidos, datos confirmados y datos inferidos.
Un dato inferido no puede convertirse automaticamente en dato operativo.

```json
{
  "source": "whatsapp_web_readonly",
  "case_id": "...",
  "correlation_id": "...",
  "status": "PENDING_REVIEW",
  "client": {
    "customer_id": null,
    "match_status": "PENDING_MATCH",
    "name": null,
    "company": null,
    "source_chat_id": "...",
    "sender_name": null,
    "sender_phone_masked": null
  },
  "pickup": {
    "address": null,
    "neighborhood": null,
    "city": null,
    "reference": null,
    "coordinates": null,
    "confidence": 0
  },
  "packages": [
    {
      "quantity": null,
      "description": null,
      "package_type": null,
      "weight_kg": null,
      "dimensions_cm": null,
      "evidence": []
    }
  ],
  "delivery": {
    "recipient_name": null,
    "recipient_phone": null,
    "address": null,
    "neighborhood": null,
    "city": null,
    "reference": null,
    "confidence": 0
  },
  "cod": {
    "requested": false,
    "amount": null,
    "currency": "COP",
    "confidence": 0
  },
  "observations": null,
  "intent": "pickup_request|other|unclear",
  "missing_required_fields": [],
  "field_provenance": [],
  "processing": {
    "modalities": [],
    "selected_provider": null,
    "selected_model": null,
    "overall_confidence": 0
  }
}
```

### Campos obligatorios de V1

Estos campos deben validarse antes de considerar el caso completo para
revision operativa:

- cliente solicitante o estado explicito `pendiente de identificar`;
- direccion y tipo de direccion: recogida o entrega;
- barrio o localidad cuando aplique;
- nombre del destinatario;
- celular del destinatario;
- cantidad de paquetes;
- COD si/no;
- valor COD cuando sea afirmativo;
- observaciones, aunque sea `sin observaciones`;
- evidencia de origen de cada dato.

### Campos recomendados para complementar

- ciudad y departamento;
- referencia de direccion;
- tipo de paquete;
- descripcion del contenido, sin clasificarlo automaticamente como sensible;
- peso y dimensiones si fueron suministrados;
- ventana o jornada solicitada;
- nombre y telefono del contacto que entrega;
- canal de confirmacion;
- estado de coincidencia con cliente Danhei;
- nivel de calidad de la imagen o audio;
- transcripcion y OCR disponibles para auditoria;
- lista de campos faltantes;
- motivo de revision manual.

## 10. Reglas de validacion

La IA extrae; las reglas del sistema validan.

### Cliente

- no vincular por nombre parecido;
- preferir `chat_id` de allowlist configurado en P18;
- permitir relacion manual chat -> cliente en el Panel Admin;
- mantener `PENDING_MATCH` si no existe una relacion aprobada.

### Telefonos

- normalizar a formato internacional cuando sea posible;
- conservar la evidencia original cifrada;
- marcar formatos incompletos o con baja confianza;
- no usar un telefono extraido como autorizacion de cliente.

### Direcciones

- separar texto original, direccion normalizada y geocodificacion;
- no afirmar cobertura desde P18;
- no convertir una direccion dudosa en coordenadas validas;
- enviar a revision si faltan ciudad, barrio o referencia necesaria.

### COD

- `requested_amount` es solamente valor solicitado;
- no crear `collected_amount`, `paid_amount` ni `settled_amount`;
- aplicar limites de formato y rango;
- revisar manualmente montos ambiguos, audios con numeros dudosos o imagenes
  parcialmente legibles.

### Confianza

La confianza general no debe ocultar un campo critico inseguro. Se requiere
confianza por campo:

```text
overall_confidence
client_confidence
pickup_address_confidence
delivery_confidence
recipient_phone_confidence
package_count_confidence
cod_amount_confidence
```

Un solo campo critico por debajo del umbral debe mantener el caso en revision,
aunque la confianza promedio sea alta.

## 11. Agrupacion de mensajes en casos

La agrupacion automatica debe ser conservadora.

### Senales permitidas

- mismo chat permitido;
- mismo remitente o relacion de remitente conocida;
- proximidad temporal configurable;
- coincidencia de intencion;
- continuidad semantica evidente;
- respuesta o complemento posterior sin contradiccion.

### Senales que no deben bastar por si solas

- mismo nombre escrito en dos chats;
- misma direccion sin confirmacion;
- mismo numero escrito en una imagen;
- similitud de texto producida por el modelo.

Cuando dos fuentes se contradigan, el caso debe mostrar ambas evidencias y
marcar `CONFLICTING_DATA`; no elegir silenciosamente el valor mas reciente.

## 12. Experiencia en el Panel Admin

La integracion P18 debe tener una vista propia, aunque el catalogo se encuentre
dentro de `Configuracion`.

### Vista 1: estado de integracion

Mostrar:

- lector conectado o requiere QR;
- ultimo mensaje capturado;
- ultimo procesamiento;
- procesadores local/API habilitados por modalidad;
- mensajes pendientes;
- casos pendientes de revision;
- fallos de procesamiento;
- advertencia de privacidad y solo lectura.

### Vista 2: Ingresos de paquetes

Esta debe ser la pantalla principal para operaciones. Cada fila muestra:

- fecha y hora;
- cliente solicitante o `pendiente de identificar`;
- remitente y chat enmascarados;
- cantidad de paquetes;
- destinatario;
- ciudad o barrio de entrega;
- COD solicitado;
- modalidad que aporto la informacion;
- confianza y campos faltantes;
- estado de revision.

Filtros:

- pendiente de revision;
- cliente;
- chat;
- fecha;
- texto, imagen o audio;
- con COD;
- con campos faltantes;
- conflicto de datos;
- proveedor utilizado;
- fallo o reintento pendiente.

### Vista 3: detalle del caso

Orden recomendado:

1. Encabezado: estado, cliente, fecha, origen del caso y correlacion.
2. Cliente solicitante: relacion aprobada, remitente y chat.
3. Paquete: cantidad, tipo, descripcion, peso y evidencias.
4. Recogida: direccion de origen y calidad del dato.
5. Entrega: destinatario, celular, direccion y barrio.
6. COD y observaciones.
7. Evidencias: texto, imagen, audio, OCR y transcripcion.
8. Procesamiento: proveedor, modelo, version, confianza, intentos y errores.
9. Campos faltantes o en conflicto.

No debe existir boton de `Aceptar recogida` en la primera fase P18. El detalle
puede permitir revisar o marcar informacion, pero la operacion formal debe
seguir el flujo propio de P16 cuando exista una exportacion aprobada.

## 13. Calidad y evaluacion

Antes de activar imagen o audio se necesita un conjunto de evaluacion de
mensajes reales anonimizados o capturados con autorizacion.

El conjunto debe incluir:

- textos completos, incompletos, con errores y con abreviaturas;
- imagenes nitidas, borrosas, inclinadas, oscuras y con varios campos;
- audios cortos, largos, con ruido, acento regional y numeros;
- casos con informacion repartida en varios mensajes;
- casos que no son solicitudes de recogida;
- mensajes contradictorios o duplicados.

### Metricas

- precision de intencion `pickup_request`;
- exactitud por campo obligatorio;
- tasa de campos alucinados o inventados;
- WER/CER de transcripcion de audio;
- exactitud OCR por caracteres y por campos;
- calidad de coincidencia de cliente;
- porcentaje de casos que requieren revision;
- latencia por modalidad;
- tasa de fallback a API;
- costo promedio por mensaje y por caso;
- porcentaje de errores reintentables y permanentes.

Se debe comparar local y API sobre el mismo conjunto. La meta inicial no es
aceptar automaticamente, sino medir que motor produce menos correcciones
humanas sin inventar informacion.

## 14. Seguridad y privacidad para el modo API

El modo API cambia la superficie de datos: texto, imagenes y audios pueden salir
del equipo local hacia un proveedor externo.

Antes de habilitarlo se necesita:

- proveedor aprobado y contrato de tratamiento revisado;
- finalidad documentada para texto, imagen y audio;
- permiso por ambiente para enviar datos a nube;
- claves separadas por ambiente y fuera de Git;
- limites de gasto y alertas;
- borrado o expiracion de archivos subidos cuando el proveedor lo permita;
- registro de proveedor y modelo por ejecucion;
- redaccion de logs y no inclusion de PII en prompts innecesarios;
- ruta para correccion, supresion y control de acceso.

En Colombia, la Ley 1581 de 2012 trata la recoleccion, almacenamiento, uso y
circulacion como tratamiento de datos personales y exige finalidad, libertad,
seguridad, acceso restringido y confidencialidad. La operacion debe alinearse
con la politica de tratamiento de Danhei y conservar evidencia del aviso y la
autorizacion aplicables. Esto es una condicion de cumplimiento, no un detalle
posterior de infraestructura.

P18 debe seguir usando numero y chats dedicados a Danhei. No se debe conectar
una cuenta personal ni capturar conversaciones que no hagan parte de la
finalidad informada.

## 15. Plan por fases

### Fase 0: contrato y medicion

- fijar el JSON canonico;
- definir campos obligatorios y tipos de direccion;
- crear casos de prueba anonimizados;
- agregar provenance y confianza por campo;
- definir `intake_case` y la relacion de varios mensajes;
- dejar todos los proveedores en `off` hasta aprobar la politica.

### Fase 1: texto

- separar interfaz `TextProcessor` de `LocalProcessor`;
- implementar local Ollama;
- implementar adaptador API elegido;
- implementar `local`, `api`, `auto` y `off`;
- validar JSON y guardar ejecuciones;
- mostrar la lista de ingresos de paquetes en P18/P16;
- no exportar a recogidas automaticamente.

### Fase 2: imagen

- normalizar imagen y validar calidad;
- agregar OCR local;
- combinar OCR con vision local;
- agregar vision API como fallback independiente;
- mostrar texto extraido, campos y evidencia original;
- marcar imagen ilegible o con conflicto.

### Fase 3: audio

- reemplazar o encapsular Whisper CLI mediante un adaptador;
- evaluar `faster-whisper` y, si conviene para Windows, `whisper.cpp`;
- normalizar OGG/Opus de WhatsApp;
- guardar segmentos y transcripcion cifrada;
- agregar transcripcion API como fallback;
- extraer datos de la transcripcion con el mismo contrato;
- medir numeros, direcciones y COD por separado.

### Fase 4: puente al Panel Admin

- exponer consultas P18 mediante BFF autenticado;
- mostrar lista y detalle de casos;
- aplicar permisos propios;
- no exponer P18 directamente al navegador remoto;
- dejar exportacion apagada.

### Fase 5: exportacion controlada

- solo despues de UAT y seguridad;
- exportar un caso con `source=whatsapp_web_readonly`;
- usar idempotencia por `correlation_id`;
- crear en P16 como `pending_review`;
- validar de nuevo cliente, direccion, cobertura, jornada y COD;
- impedir toda respuesta saliente de WhatsApp.

## 16. Preguntas que debemos cerrar

Estas preguntas afectan directamente el modelo de datos y no conviene
resolverlas con suposiciones:

1. Cuando dices `el cliente que lo esta dando`, te refieres a la empresa o
   cuenta Danhei que solicita el servicio, al numero que escribe o a ambos?
2. La `direccion` que llega por WhatsApp, es siempre la direccion de
   recogida, siempre la de entrega o puede ser cualquiera de las dos?
3. Un mensaje o caso puede contener varios paquetes para distintos
   destinatarios, o V1 tendra un solo destinatario por solicitud?
4. Los mensajes de texto, imagen y audio llegan juntos dentro de una misma
   conversacion para completar un pedido?
5. Para el fallback API, autorizas que texto, imagen y audio con datos
   personales salgan del computador local? Si la respuesta es si, prefieres
   comenzar comparando OpenAI, Gemini o ambos?
6. En que computador correra P18 y que hardware tiene: Windows, RAM,
   procesador y GPU? Esto define si audio local sera CPU o GPU y que modelo
   vision se puede usar.
7. El Panel Admin debe ser solo una bandeja de lectura y revision, o quieres
   que en una fase posterior un operador convierta manualmente el caso en una
   solicitud de recogida?
8. Cuanto tiempo deben conservarse texto, imagen, audio y transcripcion?
   Puede ser distinto para multimedia, contenido y metadatos.
9. Los chats permitidos seran grupos de pedidos, chats individuales con
   clientes o ambos?

## 17. Criterio de cierre de cada fase

Una fase no se considera terminada porque el modelo devuelva texto. Debe
cumplir todo lo siguiente:

- evidencia original conservada y cifrada;
- salida estructurada valida;
- proveedor, modelo y version trazables;
- campos obligatorios con validacion determinista;
- confianza por campo y lista de faltantes;
- no invencion silenciosa de datos;
- caso visible en el panel;
- reintento controlado;
- fallo local y API visible para operaciones;
- pruebas con ejemplos representativos;
- revision humana antes de cualquier impacto operativo.

## 18. Fuentes tecnicas consultadas

- [OpenAI Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Speech to text](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI GPT-4o Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe)
- [Ollama Vision](https://docs.ollama.com/capabilities/vision)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [PaddleOCR](https://paddlepaddle.github.io/PaddleOCR/main/en/index.html)
- [Gemini Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Gemini Audio understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Gemini Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Ley 1581 de 2012 - Funcion Publica](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)

Este documento complementa el plan de integracion P18. La siguiente actividad
de codigo debe empezar por la Fase 0 y no por conectar inmediatamente una API.
