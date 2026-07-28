# Plan funcional del modulo P18 en el Panel Admin

**Fecha:** 28 de julio de 2026
**Estado:** Planificacion tecnica; no habilita integracion productiva
**Repositorios:** `P16-DHE-Admin-Web` y `P18-DHE-WhatsApp-Reader`

## 1. Decision de arquitectura

P18 se incorporara al Panel Admin como una integracion provisional de lectura,
separada de la integracion oficial `WhatsApp Cloud API (Meta)`.

La existencia de P18 no debe cambiar, activar ni reutilizar:

- el webhook oficial de Meta;
- los tokens, secretos o banderas de `whatsapp_pickups`;
- la vinculacion de contactos autorizados de clientes;
- las reglas que crean, aceptan, asignan o liquidan operaciones;
- el envio de mensajes por WhatsApp.

La frontera aprobada queda asi:

```text
P16 Panel Admin
|
|-- WhatsApp Cloud API (oficial)
|   |-- webhook Meta
|   |-- contactos autorizados
|   |-- solicitudes de recogida V1
|   `-- permanece aislada y desactivada hasta autorizacion
|
`-- WhatsApp Web Reader P18 (provisional)
    |-- captura local mediante QR
    |-- solo mensajes entrantes
    |-- procesamiento local de texto, imagen y audio
    |-- agrupacion y revision de evidencia
    `-- no crea recogidas ni envia mensajes
```

P16 continuara siendo el propietario del dominio operativo. P18 sera el
propietario temporal de la evidencia capturada desde WhatsApp Web hasta que
exista una exportacion controlada y aprobada.

## 2. Estado real que debemos respetar

En P16, la administracion oficial de WhatsApp vive actualmente dentro de
`frontend/src/app/(admin)/configuracion/page.tsx` y utiliza, entre otros,
`WhatsAppLinkRequestsPanel`. Sus rutas estan protegidas por
`whatsapp_pickups.admin_ui_enabled` y permisos `settings.view` o
`settings.edit`.

En el codigo actual no existe una pantalla independiente de primer nivel
llamada `Integraciones`; existe la entrada `Configuracion` del panel y dentro
de ella el bloque oficial de WhatsApp. Por tanto, la primera iteracion debe
crear un submodulo claramente separado, sin mover ni reescribir el bloque
oficial.

P18 ya dispone de un servicio local y una interfaz propia en
`http://127.0.0.1:3018`, con:

- estado de la sesion QR;
- chats permitidos;
- resumen por chat, remitente, dia, tipo y estado;
- filtros por fecha, chat, remitente, texto, tipo y procesamiento;
- evidencia de mensajes y multimedia bajo demanda;
- procesamiento local de texto, imagen y audio;
- almacenamiento SQLite y multimedia cifrada;
- sin importacion historica inicial;
- sin ruta de salida a WhatsApp.

## 3. Nombre y experiencia de usuario

Los nombres deben impedir que un operador confunda ambos canales.

### Integracion oficial

```text
WhatsApp Cloud API (oficial)
Canal Meta para solicitudes autorizadas de recogida
Estado: separado / pendiente de habilitacion
```

### Integracion provisional

```text
WhatsApp Web Reader P18
Lector provisional, solo lectura, para organizar conversaciones entrantes
Estado: local / conectado / requiere QR / error
```

El modulo P18 debe mostrar siempre una alerta visual permanente:

> Este lector solo captura y organiza mensajes. No envia mensajes ni crea
> recogidas automaticamente.

No se debe utilizar el termino `Cloud API`, `Webhook Meta`, `contacto
autorizado` o `solicitud de recogida` para describir una captura P18. La
extraccion de datos es una propuesta para revision humana, no una orden de
negocio.

## 4. Topologia por fases

### Fase A: modulo visible y operacion local

Objetivo: integrar la navegacion y el contexto sin exponer P18 a Internet.

```text
Operador autenticado en P16
        |
        `--> Modulo P18: estado, alcance y boton "Abrir lector local"
                         |
                         `--> P18 en 127.0.0.1:3018
```

En esta fase P16 no debe fingir que conoce el estado de un P18 instalado en
otro computador. Si el lector no esta en la misma maquina, el panel debe
mostrar `Estado remoto no configurado` y no `Conectado`.

El boton puede abrir la interfaz local en una nueva pestana cuando el operador
esta trabajando en el mismo equipo. No se debe usar un iframe como sustituto
de autenticacion ni publicar el puerto 3018.

### Fase B: puente privado de consulta

Objetivo: permitir que P16 muestre datos P18 de forma autenticada y
multiusuario.

```text
Navegador
   |
   | sesion normal de P16
   v
P16 API / BFF
   |
   | HTTPS privado + secreto separado + timeout
   v
P18 Reader Service
   |
   `--> SQLite y media cifrada
```

Reglas del puente:

- el navegador nunca llama directamente a P18;
- P18 no comparte base de datos con P16;
- P18 no recibe el bearer token del usuario de P16;
- la autenticacion servicio a servicio usa secreto propio y rotado;
- el servicio P18 no queda expuesto publicamente;
- el BFF aplica permisos, paginacion, limites y auditoria;
- un error de P18 se presenta como `No disponible`, nunca como datos vacios
  ambiguos;
- los tiempos de espera y reintentos deben ser cortos para no bloquear P16.

### Fase C: exportacion controlada

No forma parte de la primera entrega. Cuando se autorice, P18 enviara un
contrato normalizado a un endpoint de staging de P16.

```text
Mensaje P18
    |
    v
Extraccion local
    |
    v
Revision humana
    |
    v
Exportacion idempotente
    |
    v
P16 intake -> pending_review
```

La exportacion nunca debe crear directamente un envio aceptado, asignar un
piloto, cambiar un COD conciliado ni enviar respuesta al cliente.

## 5. Alcance funcional del modulo P18

### 5.1 Catalogo de integraciones

La pantalla `Integraciones` o su subruta dentro de `Configuracion` debe
presentar dos tarjetas independientes:

1. `WhatsApp Cloud API (oficial)` con su estado y acceso al flujo existente.
2. `WhatsApp Web Reader P18` con estado provisional y acceso a lectura.

Cada tarjeta debe tener su propia bandera, permisos, estado, ayuda y enlaces.
No debe existir un selector que permita cambiar de proveedor y terminar
enviando credenciales P18 a la configuracion Meta.

### 5.2 Resumen operativo P18

El resumen del modulo debe mostrar, como minimo:

- estado de sesion: `STOPPED`, `QR_REQUIRED`, `AUTHENTICATING`, `READY`,
  `DEGRADED` o `ERROR`;
- fecha de ultima captura y fecha de ultimo procesamiento;
- cantidad de chats en allowlist;
- mensajes capturados en la ventana seleccionada;
- mensajes pendientes de procesamiento;
- mensajes pendientes de revision;
- fallos reintentables;
- estado del procesador local de texto, imagen y audio;
- espacio disponible y proxima retencion, sin exponer rutas sensibles.

Si no existe puente privado, el panel solo mostrara los datos que realmente
pueda verificar. El enlace local debe distinguirse de un estado obtenido por
la API.

### 5.3 Bandeja de lectura

La bandeja debe conservar el modelo que ya existe en P18 y permitir:

- agrupar por chat;
- agrupar por remitente;
- agrupar por dia en `America/Bogota`;
- agrupar por tipo de mensaje;
- agrupar por estado de procesamiento;
- filtrar por rango de fechas;
- filtrar por chat permitido;
- filtrar por remitente o busqueda textual;
- filtrar por `text`, `image`, `audio`, `document` o `video`;
- filtrar por `CAPTURED`, `PROCESSING`, `PROCESSED`, `PENDING_REVIEW` o
  `FAILED_RETRYABLE`;
- abrir el detalle de un mensaje y su extraccion;
- abrir multimedia solamente bajo demanda y con autorizacion.

El limite visible debe mantenerse paginado. El resumen no debe cargar el
archivo multimedia ni entregar el payload completo de WhatsApp.

### 5.4 Revision humana

La V1 de P16 no debe tener boton `Crear recogida` dentro de la bandeja P18.
La pantalla debe presentar:

- datos extraidos;
- confianza de la extraccion;
- campos faltantes o ambiguos;
- chat y remitente de origen;
- fecha y hora local;
- estado `pending_review`;
- enlace o flujo posterior definido por operaciones.

Si mas adelante se habilita exportacion, el operador debera confirmar la
revision y P16 volvera a validar cliente, direccion, cobertura, jornada,
limites, permisos e idempotencia antes de crear una solicitud.

### 5.5 Operacion del lector

En la primera version, P16 solo mostrara estado y enlace al lector local.
`Conectar`, `desconectar`, cambiar allowlist, ejecutar retencion y reintentar
procesamiento permanecen en P18 local hasta definir permisos y auditoria.

Si se agregan acciones al panel en una fase posterior, cada una necesitara:

- permiso especifico;
- confirmacion explicita;
- registro de auditoria;
- proteccion CSRF;
- respuesta idempotente;
- mensaje claro de impacto operativo.

## 6. Contrato de consulta propuesto

El BFF de P16 puede exponer rutas propias, sin reutilizar las rutas oficiales
de Meta:

```text
GET /api/integrations/whatsapp-reader/status
GET /api/integrations/whatsapp-reader/summary
GET /api/integrations/whatsapp-reader/messages
GET /api/integrations/whatsapp-reader/messages/{message}
GET /api/integrations/whatsapp-reader/media/{media}
```

Las rutas deben quedar detras de autenticacion P16 y de una bandera propia.
P18 continuara ofreciendo sus rutas locales para su propia interfaz.

Cada respuesta de consulta debe incluir un contrato estable con campos
equivalentes a:

```json
{
  "source": "whatsapp_web_readonly",
  "reader_version": "...",
  "correlation_id": "...",
  "external_message_id": "...",
  "chat": { "id": "...", "name": "...", "type": "..." },
  "sender": { "id_hash": "...", "display_name": "..." },
  "event_at": "...",
  "received_at": "...",
  "message_type": "text",
  "processing_status": "PENDING_REVIEW",
  "extraction": {
    "intent": "pickup_request",
    "confidence": 0.0,
    "fields": {}
  },
  "media": { "available": false }
}
```

El contrato no debe exponer por defecto telefono completo, documento de
identidad, direccion completa, contenido sin cifrar ni credenciales de
WhatsApp. Los datos personales necesarios para la revision se entregan solo a
usuarios autorizados y no se escriben en logs.

## 7. Identidad y vinculacion

Una conversacion permitida en P18 no equivale a un cliente autorizado de P16.
La allowlist responde a la pregunta `que chat podemos leer`; la vinculacion
de cliente responde a `a que cuenta pertenece la informacion`.

En V1:

- P18 conserva su allowlist local;
- P16 muestra el chat y el remitente como `pendiente de identificar` cuando no
  exista relacion confiable;
- no se asigna automaticamente un cliente por nombre o telefono extraido;
- no se reutilizan `CustomerWhatsAppContact` ni sus permisos para autorizar
  lectura P18;
- cualquier vinculacion futura debe aprobarse desde administracion y quedar
  auditada.

## 8. Permisos, banderas y auditoria

### Permisos recomendados

Crear permisos propios evita que `settings.edit` de la integracion oficial
controle una sesion QR:

```text
integrations.whatsapp_reader.view
integrations.whatsapp_reader.manage
integrations.whatsapp_reader.review
integrations.whatsapp_reader.export
```

Recomendacion inicial:

- `view`: Admin y Operaciones autorizadas;
- `manage`: solo Administrador de plataforma;
- `review`: Operaciones autorizadas;
- `export`: desactivado para todos hasta la fase C.

### Banderas independientes

```text
P18_READER_ENABLED=false
P18_READER_UI_ENABLED=false
P18_READER_BRIDGE_ENABLED=false
P18_READER_EXPORT_ENABLED=false
```

El nombre exacto puede adaptarse al sistema de configuracion, pero las
banderas oficiales `whatsapp_pickups.inbound_enabled`,
`whatsapp_pickups.outbound_enabled` y `whatsapp_pickups.admin_ui_enabled` no
se deben reutilizar ni cambiar como parte de P18.

### Auditoria minima

Registrar, sin contenido personal:

- usuario que visualiza o ejecuta una accion administrativa;
- accion y resultado;
- `correlation_id` o identificador interno;
- version del contrato y del lector;
- fecha y hora en Bogota/UTC;
- codigo de error si aplica.

No registrar tokens, claves, audio, imagenes, direcciones completas ni el
payload bruto de WhatsApp.

## 9. Ambientes e infraestructura

### Local

- P18 en el computador de operaciones;
- puerto limitado a `127.0.0.1`;
- sesion QR, SQLite, multimedia cifrada y modelos locales en el equipo;
- P16 local puede mostrar la tarjeta y abrir el lector;
- datos reales solo con autorizacion interna y politica de retencion definida.

### Staging

- P18 en una maquina o servicio privado separado;
- P16 utiliza un mock o un puente HTTPS autenticado;
- no se usa la base ni los secretos productivos;
- se prueban caidas, expiracion de secreto, duplicados y datos incompletos;
- exportacion apuntando exclusivamente a staging y siempre a
  `pending_review`.

### Produccion

P18 no se publica como API abierta. Solo se habilita el puente despues de
cerrar las pruebas de seguridad, privacidad, retencion, permisos y operacion.
La integracion oficial Meta y P18 deben conservar ambientes, credenciales,
logs y banderas separados.

## 10. Criterios de aceptacion

### Separacion

- Al abrir P18 no se ejecutan rutas de webhook Meta ni se cargan credenciales
  oficiales.
- Desactivar `P18_READER_UI_ENABLED` oculta el modulo sin afectar el panel
  oficial.
- Las pruebas existentes de contactos, vinculaciones y recogidas oficiales
  continúan pasando.

### Lectura y organizacion

- Un operador autorizado puede ver estado, resumen, filtros y agrupaciones.
- Chat, remitente, dia local, tipo y estado se conservan en cada consulta.
- Un mensaje de texto, imagen o audio queda distinguible y trazable al mismo
  `correlation_id`.
- La multimedia no se carga automaticamente y se protege bajo demanda.

### Seguridad

- El navegador no puede conectarse directamente a P18 en la fase B.
- El puente rechaza solicitudes sin autenticacion propia o fuera de la red
  permitida.
- Se aplican permisos P16, paginacion, limites y timeouts.
- No aparecen secretos ni PII innecesaria en logs, errores o URL.
- El estado `READY` solo se muestra cuando P18 lo confirma realmente.

### No automatizacion peligrosa

- P18 no envia mensajes en ningun caso.
- P18 no crea recogidas automaticamente.
- No se puede convertir una extraccion en `accepted` sin revision y
  validacion completa del dominio P16.
- El COD extraido se trata como dato solicitado, nunca como dinero recibido o
  conciliado.

### Operacion y calidad visual

- El panel diferencia visualmente oficial/provisional y muestra el alcance.
- Tiene estados de carga, vacio, error, desconectado y sin permiso.
- Funciona en escritorio y movil sin ocultar filtros o acciones esenciales.
- La perdida temporal de P18 no bloquea el resto del Panel Admin.

## 11. Pruebas requeridas antes de habilitar cada fase

### P16

- feature flag y permiso: visible/oculto/denegado;
- contrato del BFF con P18 disponible, caido, lento y con respuesta invalida;
- filtros, paginacion, agrupaciones y timezone Bogota;
- enmascaramiento de PII;
- regresion de rutas oficiales Meta y recogidas;
- auditoria de consultas y acciones administrativas.

### P18

- QR requerido, sesion lista, desconexion y error;
- captura idempotente de texto, imagen y audio;
- reintentos y estados de procesamiento;
- cifrado y lectura autorizada de multimedia;
- retencion y limpieza;
- defensa contra cualquier llamada de salida.

### UAT operacional

1. Vincular el telefono por QR en el equipo autorizado.
2. Recibir un texto, una imagen y un audio desde un chat permitido.
3. Confirmar que cada elemento aparece una sola vez.
4. Filtrar por chat, remitente, fecha, tipo y estado.
5. Revisar la extraccion y los campos faltantes.
6. Apagar P18 y confirmar que P16 sigue operativo y muestra `No disponible`.
7. Confirmar que no se envio ningun mensaje.

## 12. Orden de implementacion

1. Aprobar este alcance y los cinco criterios de acceso, ambiente, permisos,
   revision y retencion.
2. Crear el catalogo visual de integraciones en P16 sin cambiar el panel
   oficial.
3. Agregar banderas y permisos propios de P18, con valor cerrado por defecto.
4. Crear el modulo P18 de estado y enlace local.
5. Definir y probar el contrato de consulta P16-P18 con un mock.
6. Implementar el BFF privado y la bandeja de lectura paginada.
7. Ejecutar pruebas de seguridad, regresion y UAT.
8. Evaluar exportacion manual a `pending_review`; no habilitarla por defecto.
9. Documentar runbook, retencion, recuperacion y retiro de P18 cuando Meta
   este disponible.

## 13. Decisiones que quedan cerradas para iniciar

Con base en el estado actual, la recomendacion de trabajo es:

| Decision | Recomendacion V1 |
| --- | --- |
| Proveedor | P18 separado; no modifica Meta Cloud API |
| Usuarios | Admin y Operaciones autorizadas |
| Ubicacion | P18 local en equipo de operaciones |
| Vista P16 | Tarjeta, estado y enlace local; datos remotos solo con puente |
| Fuente de verdad | P18 para evidencia, P16 para operaciones |
| Allowlist | Administrada localmente en P18 |
| Vinculacion a cliente | Manual y posterior; nunca por inferencia automatica |
| Acciones P16 | Lectura solamente en la primera fase |
| Exportacion | Desactivada; futuro `pending_review` |
| Mensajeria | Cero mensajes salientes |
| Historico | No importar historico en V1 |
| Integracion oficial | Sin cambios y con sus banderas independientes |

La retencion exacta de texto, multimedia y metadatos debe aprobarse antes de
usar datos reales. No se debe dejar como una decision implicita del codigo.

## 14. Definition of done

La funcionalidad P18 se considerara lista para una prueba controlada cuando:

- el modulo aparece separado del oficial y respeta permisos;
- el estado mostrado coincide con el lector real;
- la consulta funciona mediante contrato autenticado o se limita claramente al
  enlace local;
- filtros, agrupaciones y multimedia bajo demanda estan verificados;
- no existe camino de envio ni de creacion automatica de recogidas;
- logs y auditoria no filtran PII ni secretos;
- P16 y la integracion oficial pasan regresion;
- existe runbook de QR, caidas, retencion, respaldo y retiro;
- el equipo de operaciones firma la prueba UAT;
- exportacion permanece desactivada hasta una aprobacion independiente.

Este documento es el criterio base para la siguiente iteracion de codigo. No
se debe implementar el puente ni agregar botones operativos hasta aprobar las
decisiones de la tabla anterior.
