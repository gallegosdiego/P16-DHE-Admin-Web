# Investigacion profesional: organizacion y control de WhatsApp para Danhei

Fecha de corte: 2026-07-27  
Alcance: Meta WhatsApp Business Platform, Meta Cloud API, P16 Admin/API, clientes autorizados y operacion colombiana.  
Estado: decision de organizacion y ruta de habilitacion.

## 1. Veredicto ejecutivo

Danhei no necesita comprar una insignia de `Meta Verified` ni contratar un BSP para comenzar el desarrollo tecnico. La integracion puede organizarse sobre `Meta WhatsApp Cloud API` directa, que es la opcion mas coherente con una sola experiencia de recogidas, un unico backend P16 y la necesidad de conservar control sobre datos, permisos, webhooks y trazabilidad.

La verificacion empresarial rechazada no debe ignorarse ni tratarse como un detalle visual. La cuenta debe considerarse con capacidad limitada hasta que Meta muestre claramente que el WABA, el numero y la aplicacion tienen habilitacion suficiente para el uso previsto. No se debe prometer a clientes reales una disponibilidad productiva amplia con base solamente en el numero de prueba o en un token temporal.

La estrategia recomendada es:

```text
Gobernanza de Meta
        |
        v
Prueba tecnica con WABA y numero de test
        |
        v
Preparacion y apelacion de la verificacion
        |
        v
Numero de produccion dedicado
        |
        v
Piloto cerrado con clientes y contactos autorizados
        |
        v
Escalamiento gradual
```

## 2. Que significa realmente "cuenta certificada"

En las conversaciones de negocio se mezclan varias cosas distintas. Para Danhei deben administrarse como estados separados:

| Concepto | Que demuestra | Es requisito para iniciar el desarrollo | Decision Danhei |
| --- | --- | --- | --- |
| Meta Verified | Suscripcion o insignia y beneficios de soporte/proteccion, segun disponibilidad | No | No comprarlo como solucion tecnica |
| Business Verification | Revision de la identidad legal del Business Portfolio | No para el primer laboratorio tecnico, pero puede afectar limites, elegibilidad y escalamiento | Prepararla y reintentarlo con evidencia consistente |
| Official Business Account | Reconocimiento adicional de cuenta oficial/notable | No para V1 | No es objetivo de la primera etapa |
| Verificacion del numero | Codigo SMS o llamada que prueba control del telefono | Si para registrar un numero propio en Cloud API | Usar un numero que Danhei controle directamente |
| App Review/permisos | Revisa determinados permisos y casos de uso de Meta | Depende de la operacion y permisos solicitados | Solicitar solo lo que realmente use la V1 |

La documentacion oficial de la API de Meta indica que el punto de partida tecnico requiere un `Meta business portfolio`, un `WhatsApp Business Account (WABA)` y un numero empresarial. La misma documentacion distingue los tokens de usuario de los tokens de System User, y recomienda estos ultimos para evitar depender de tokens temporales de corta duracion: [coleccion oficial de Meta para WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

La insignia `Meta Verified` es otra oferta. Meta la describe como una suscripcion con insignia, soporte y proteccion de suplantacion, no como el mecanismo tecnico que crea el WABA o autoriza el webhook: [explicacion oficial de Meta Verified para empresas](https://about.fb.com/news/2024/06/new-ai-tools-meta-verified-and-more-for-businesses-on-whatsapp/) y [ayuda oficial sobre documentos de verificacion](https://www.facebook.com/help/243868559497297/).

## 3. Estado real de Danhei

### 3.1 Lo que ya existe en P16

El repositorio `P16-DHE-Admin-Web` ya contiene la base de aplicacion para recibir, validar, procesar y observar eventos de WhatsApp:

- `GET/POST /api/integrations/whatsapp/webhook`.
- validacion de firma `X-Hub-Signature-256` usando el body original y `META_APP_SECRET`.
- inbox de webhooks, deduplicacion, procesamiento en cola y estados.
- vinculacion de clientes con uno o varios contactos autorizados desde el panel.
- permisos por contacto, incluyendo `CREATE_PICKUP`.
- estados de cliente: solicitud recibida, pendiente de revision, aceptada y entrega confirmada.
- mensajes salientes auditados en `whatsapp_messages`.
- controles de habilitacion por entorno mediante `WHATSAPP_INBOUND_ENABLED`, `WHATSAPP_OUTBOUND_ENABLED` y `WHATSAPP_ADMIN_UI_ENABLED`.

Referencias del codigo actual:

- [rutas publicas y protegidas](../../api/routes/api.php).
- [cliente de Meta Cloud API](../../api/app/Integrations/WhatsApp/Services/MetaCloudWhatsAppClient.php).
- [extraccion de respuestas nfm_reply](../../api/app/Integrations/WhatsApp/Services/MetaFlowMessageExtractor.php).
- [notificaciones de ciclo de vida](../../api/app/Integrations/WhatsApp/Services/PickupWhatsAppNotifier.php).
- [variables de entorno de referencia](../../api/.env.example).

### 3.2 Lo que no existe todavia

La configuracion real de Meta no esta completa. En el archivo local de referencia las variables de Meta estan vacias, por lo que el sistema no puede enviar ni recibir mensajes reales hasta que se cree la cuenta, se obtengan los activos y se carguen secretos en el entorno correcto.

Tambien hay una diferencia importante entre la arquitectura documentada y el recorrido completo del usuario:

1. El backend ya sabe interpretar un `nfm_reply` de un Flow.
2. El cliente `MetaCloudWhatsAppClient` actual solo envia mensajes de texto.
3. No se encontro implementado el envio del mensaje interactivo que abre el Flow publicado.
4. No se encontro una capa completa de enrutamiento de texto que reciba `Solicitar recogida`, valide el contacto y envie el Flow.

Por tanto, la integracion no debe declararse terminada solamente porque el webhook exista. Falta cerrar la apertura del Flow y probar el recorrido real:

```text
Mensaje del cliente
    -> validar contacto autorizado
    -> responder con boton/Flow
    -> cliente confirma datos
    -> llega nfm_reply
    -> validar reglas Danhei
    -> crear solicitud o pendiente_revision
```

La coleccion oficial de Meta muestra el formato del mensaje `interactive` para abrir un Flow publicado: [Send Published Flow by Name](https://www.postman.com/meta/whatsapp-business-platform/request/56fec8h/send-published-flow-by-name). Esto se convierte en un pendiente tecnico P0 antes del piloto.

### 3.3 Seguridad ya encaminada y puntos que deben comprobarse

El codigo actual restringe `/api/deploy-check` al entorno `local/testing`. Falta verificar que esa restriccion este en el commit y despliegue que atiende la URL publica, porque el informe anterior detecto una exposicion en produccion.

La auditoria de documentos de pilotos continua siendo un gate independiente. La respuesta de `deploy-check` ha incluido campos de documentos y estado de almacenamiento; eso no demuestra por si solo que exista una URL publica, pero obliga a comprobarlo fisicamente antes de usar el mismo entorno para datos de clientes.

## 4. Arquitectura de cuentas recomendada

### 4.1 Topologia de propiedad

```text
Cuenta personal real del propietario/admin de Danhei
                    |
                    v
          Meta Business Portfolio
          "Danhei Express"
                    |
        +-----------+------------+
        |                        |
        v                        v
 WABA de pruebas           WABA de produccion
 Meta test assets          Propiedad de Danhei
        |                        |
 Numero de test             Numero oficial dedicado
        |                        |
        +-----------+------------+
                    v
             Meta Developer App
          "Danhei WhatsApp Integration"
                    |
                    v
            System User + token
                    |
                    v
       API P16 / webhook / cola / MySQL
```

### 4.2 Reglas de propiedad

- El Business Portfolio debe pertenecer a Danhei, no a un desarrollador, empleado o proveedor.
- La aplicacion debe estar asociada al portfolio correcto.
- El WABA de produccion debe ser propiedad de Danhei. Un BSP no debe convertirse en el propietario irreversible del activo.
- El numero oficial debe ser controlado por Danhei mediante una SIM o linea empresarial con acceso a SMS o llamada de verificacion.
- Deben existir dos administradores internos con MFA. Ninguna cuenta individual debe ser el unico punto de recuperacion.
- El correo de contacto de la app debe ser institucional y estar bajo control de Danhei.
- Las credenciales tecnicas deben vivir en secretos del entorno, no en el panel, la base de datos, el frontend, el APK, GitHub ni logs.

### 4.3 Inventario minimo que debe conservar Danhei

Crear un registro interno de activos, sin guardar tokens en texto plano:

| Activo | Identificador que se conserva | Responsable | Donde se consulta |
| --- | --- | --- | --- |
| Business Portfolio | Business ID | Administrador de negocio | Meta Business Suite |
| App | App ID y App Secret | Responsable tecnico | Meta for Developers y secret manager |
| WABA | WABA ID | Administrador de negocio | WhatsApp Manager |
| Numero | Phone Number ID y telefono | Operaciones/TI | WhatsApp Manager |
| Token | Huella, fecha de emision y vencimiento | Responsable tecnico | Secret manager |
| Webhook | URL, ambiente y fecha de prueba | Responsable tecnico | P16 y Meta |
| Flow | Flow ID, nombre tecnico, version y estado | Producto/TI | WhatsApp Manager |
| Templates | nombre, categoria, idioma, estado | Operaciones/TI | WhatsApp Manager |
| PIN | Custodio y procedimiento de recuperacion | Dos custodios internos | Boveda de secretos |

## 5. Como operar despues de un rechazo de verificacion

### 5.1 Lo que no debemos hacer

- Crear muchos Business Portfolios para intentar esquivar el rechazo.
- Cambiar el nombre legal por la marca sin documentar la relacion entre ambos.
- Usar documentos editados, capturas, logos, facturas informales o datos que no coincidan.
- Poner el portfolio a nombre del desarrollador para que el desarrollo avance.
- Comprar una insignia pensando que reemplaza la verificacion empresarial.
- Contratar un BSP unicamente para saltarse controles de Meta.
- Conectar el numero principal de atencion sin un plan de migracion y recuperacion.

### 5.2 Ruta profesional de recuperacion

1. Abrir el `Security Center` y guardar el motivo exacto del rechazo, el estado, la fecha y el activo afectado.
2. Identificar si el rechazo fue del Business Portfolio, del nombre visible, del numero, de la aplicacion, de un permiso o de la calidad de la cuenta.
3. Congelar los datos de identidad que se volveran a enviar: razon social, direccion, telefono, dominio, correo y datos tributarios.
4. Alinear el nombre legal del portfolio con los documentos oficiales. Si `Danhei Express` es la marca y existe otra razon social, el sitio web debe explicar claramente la relacion.
5. Preparar documentos legibles, vigentes y completos que Meta acepte para el tipo de entidad y pais que muestre el formulario. La ayuda oficial de Meta recalca que los documentos deben ser claros, completos y no estar alterados: [documentos para verificar una empresa](https://www.facebook.com/help/243868559497297/).
6. Revisar que el sitio web publico tenga HTTPS, contacto, politica de privacidad, razon social o identificacion de la empresa y una descripcion coherente del servicio.
7. Presentar una sola apelacion o nuevo intento con informacion consistente y guardar evidencia del envio.
8. Si el motivo sigue siendo ambiguo, usar el canal de soporte de Meta y enviar Business ID, WABA ID, App ID y captura del rechazo, nunca tokens.

La verificacion no se debe convertir en un bloqueo para seguir desarrollando, pero tampoco se debe ocultar como riesgo. La prueba de concepto puede avanzar con activos de test; la salida productiva debe quedar condicionada a lo que Meta permita expresamente en el portfolio de Danhei.

### 5.3 Si Danhei todavia no tiene entidad formal documentable

No se debe inventar una identidad empresarial. En ese caso el camino seguro es:

- mantener el desarrollo con el WABA y numero de prueba de Meta;
- no poner clientes reales en la lista de pruebas;
- usar datos ficticios o datos controlados de administradores;
- preparar la documentacion legal y de privacidad antes de solicitar produccion;
- evaluar un piloto manual fuera de WhatsApp automatizado mientras se resuelve la elegibilidad.

## 6. Separacion de ambientes

| Ambiente | Activos Meta | Numero | Usuarios | Configuracion P16 | Objetivo |
| --- | --- | --- | --- | --- | --- |
| Local | Sin credenciales reales o token temporal aislado | Meta test si aplica | Equipo tecnico | inbound/outbound desactivados por defecto | Tests unitarios y de contrato |
| Staging | WABA/app de prueba | Numero de test o linea de staging | Allowlist pequena | webhook publico, cola y outbound controlado | Prueba punta a punta |
| Piloto | WABA de produccion, sujeto a habilitacion de Meta | Numero dedicado de Danhei | Clientes previamente autorizados | limites estrictos y aprobacion manual | Validar operacion real |
| Produccion | Activos definitivos | Numero oficial | Clientes autorizados por panel | observabilidad, alertas, backups y rollback | Operacion estable |

Regla recomendada: no reutilizar el mismo token, verify token, Flow, numero ni URL entre staging y produccion. Si el presupuesto solo permite un numero adicional, se mantiene el numero de prueba de Meta para desarrollo y se reserva el numero oficial para el piloto cuando los gates esten cerrados.

## 7. Estrategia de numeros

### 7.1 Numero de prueba

Se usa para probar el API, el webhook, los templates, los Flows y la trazabilidad. La consola de Meta puede exigir que los destinatarios de prueba se agreguen y verifiquen explicitamente. Es un laboratorio, no el canal que se debe anunciar a clientes.

### 7.2 Numero de staging

Es la opcion mas limpia si Danhei quiere probar conversaciones completas sin contaminar el numero oficial. Debe tener:

- linea controlada por Danhei;
- responsable de custodiar SMS/llamadas y el PIN;
- nombre visible coherente;
- WABA y configuracion separada;
- lista de numeros de prueba;
- mecanismo de apagado inmediato.

### 7.3 Numero de produccion

Debe ser una linea dedicada y no la linea personal de un empleado. Antes de registrarla:

- confirmar si hoy esta activa en WhatsApp Messenger o WhatsApp Business App;
- documentar los chats y la operacion que podrian verse afectados;
- decidir si se migra o se adquiere una nueva linea;
- confirmar el procedimiento de recuperacion;
- registrar el numero y activar la verificacion en dos pasos.

La documentacion tecnica de Meta indica que el registro del numero verifica la propiedad por SMS o llamada y establece un PIN de seis digitos para la verificacion en dos pasos: [registro de numeros en la coleccion oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration).

## 8. Credenciales y permisos

### 8.1 Variables esperadas por P16

```env
META_APP_ID=
META_APP_SECRET=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_API_BASE_URL=https://graph.facebook.com
WHATSAPP_CLOUD_API_VERSION=<version vigente confirmada en Meta>
WHATSAPP_INBOUND_ENABLED=false
WHATSAPP_OUTBOUND_ENABLED=false
WHATSAPP_ADMIN_UI_ENABLED=false
FLOW_PRIVATE_KEY=
FLOW_PRIVATE_KEY_PASSWORD=
```

### 8.2 Regla de cada secreto

- `META_APP_ID`: identificador de la app; se mantiene en configuracion del backend, nunca en el frontend si no es necesario.
- `META_APP_SECRET`: secreto para validar firmas; solo backend.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: identificador interno del WABA.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del numero emisor.
- `WHATSAPP_ACCESS_TOKEN`: token de servicio; nunca en Git, base de datos, navegador ni logs.
- `WHATSAPP_VERIFY_TOKEN`: secreto propio de Danhei para el challenge inicial del webhook.
- `FLOW_PRIVATE_KEY`: solo si se habilita un Flow con intercambio de datos cifrado; nunca se documenta su valor.

La API oficial de Meta soporta tokens de usuario y de System User. Los tokens de usuario del panel son de corta duracion; para un backend se debe usar un token de System User con los permisos minimos, rotarlo y documentar su ciclo de vida. La referencia oficial enumera como permisos principales `whatsapp_business_management` y `whatsapp_business_messaging`: [access tokens y permisos en la documentacion oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

### 8.3 No confundir autorizacion de Meta con autorizacion de clientes

Hay dos capas distintas:

```text
Meta autoriza a P16 a operar el numero de Danhei
Danhei autoriza que un contacto de un cliente solicite recogidas
```

El token de Meta no decide que cliente puede crear una recogida. Esa decision debe continuar en las tablas y permisos de P16. El numero de WhatsApp del cliente se usa como identidad de contacto y la autorizacion se administra desde el panel, como ya esta previsto en la V1.

## 9. Conexion tecnica en el orden correcto

### Fase A - Fundacion de Meta

1. Crear o confirmar el Business Portfolio de Danhei.
2. Agregar un segundo administrador y activar MFA.
3. Crear una app de tipo Business y agregar el producto WhatsApp.
4. Conservar App ID, App Secret, WABA ID, Phone Number ID y token temporal de prueba.
5. Confirmar el estado de verificacion y guardar el motivo del rechazo sin reintentar a ciegas.

### Fase B - Webhook

1. Publicar P16 bajo HTTPS.
2. Cargar `META_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` en staging.
3. Registrar `GET/POST /api/integrations/whatsapp/webhook`.
4. Completar el challenge `GET`.
5. Suscribir la app al WABA; la coleccion oficial de Meta muestra el endpoint `/{WABA-ID}/subscribed_apps`, que es necesario para recibir notificaciones del WABA: [suscripcion de la app al WABA](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).
6. Probar firma invalida, firma valida, duplicado, reintento y evento de estado.

### Fase C - Mensajeria controlada

1. Enviar el template de prueba de Meta al destinatario autorizado.
2. Confirmar `accepted/sent/delivered/read`.
3. Verificar la ventana de servicio iniciada por el cliente.
4. Crear y publicar el Flow `pickup_request` en Meta.
5. Implementar en P16 el mensaje interactivo que abre el Flow.
6. Procesar `nfm_reply` con validacion server-side.
7. Crear `PickupRequest` o `pending_review`, nunca una operacion confirmada directamente desde el payload.

### Fase D - Operacion

1. Crear el contacto del cliente desde el panel.
2. Asignar `CREATE_PICKUP` solo a contactos autorizados.
3. Probar numero no autorizado, cliente suspendido y permiso revocado.
4. Probar cobertura faltante, direccion ambigua, exceso de COD y duplicado.
5. Aprobar o pedir datos desde admin.
6. Confirmar que la respuesta al cliente no revele datos de otro cliente.

## 10. Reglas de mensajes, plantillas y costos

La politica de Meta exige consentimiento opt-in para contactar personas y obliga a respetar solicitudes de bloqueo o baja. Tambien distingue la ventana de servicio de 24 horas: dentro de ella se puede responder sin template; fuera de ella se debe iniciar con un template aprobado. La politica exige ademas una ruta clara de escalamiento humano: [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).

Para Danhei V1:

- el cliente inicia la conversacion o pulsa `Solicitar recogida`;
- la respuesta inmediata se trata como servicio y se limita al proceso de la recogida;
- las notificaciones de solicitud, revision, aceptacion y entrega se clasifican con producto/operaciones y se validan en WhatsApp Manager;
- no se deben enviar campanas de marketing desde esta integracion;
- toda respuesta fuera de la ventana de 24 horas debe usar template aprobado;
- se debe presupuestar por mensaje entregado y por categoria, no por mensaje simplemente enviado. La pagina oficial de precios indica que Meta cobra cuando el mensaje es entregado, que las tarifas dependen del mercado y categoria, y que la ventana de servicio tiene tratamiento diferente: [precios oficiales de WhatsApp Business Platform](https://whatsappbusiness.com/products/platform-pricing/).

No se fijan valores monetarios en este documento porque Meta los presenta de forma dinamica por mercado y categoria. Antes del piloto se debe capturar la tabla vigente para Colombia y construir un presupuesto con volumen real de solicitudes y estados.

## 11. Proteccion de datos en Colombia

La integracion tratara datos personales: telefono WhatsApp, nombre, direccion, barrio, datos del destinatario, ubicacion y eventualmente valor contraentrega. La Ley 1581 de 2012 exige finalidad informada, autorizacion previa cuando corresponda, calidad, acceso restringido y mecanismos para que el titular conozca, actualice, rectifique o solicite la supresion de sus datos: [Ley 1581 de 2012 en SUIN-Juriscol](https://www.suin-juriscol.gov.co/viewDocument.asp?ruta=Leyes%2F1684507).

La SIC ha reconocido expresamente que el tratamiento de datos realizado mediante WhatsApp en Colombia queda sometido a las reglas nacionales de proteccion de datos: [SIC sobre WhatsApp y proteccion de datos en Colombia](https://www.sic.gov.co/international-community/sic-instructs-whatsapp-comply-national-data-protection-regulations).

Controles requeridos para Danhei:

- politica de tratamiento de datos y aviso de privacidad accesibles;
- finalidad explicita para gestionar recogidas y notificar su estado;
- registro de evidencia de autorizacion/opt-in cuando Danhei inicie mensajes;
- mecanismo de baja y bloqueo;
- retencion definida para mensajes, direcciones y payloads;
- minimizacion de datos en logs;
- acceso por rol en el panel;
- no pedir por WhatsApp numeros completos de tarjeta, cuentas bancarias o identificaciones innecesarias;
- no copiar conversaciones de un cliente a otro;
- evaluar con asesor juridico la aplicacion del RNBD y los acuerdos con proveedores de nube.

La politica de WhatsApp tambien prohibe pedir ciertos identificadores financieros o de identidad por el canal y exige que el negocio asegure los consentimientos y avisos exigidos por la ley aplicable. La automatizacion debe mantener una salida visible a un despachador o soporte humano.

## 12. Controles de seguridad de produccion

### Gates P0 antes de clientes reales

- `/api/deploy-check` no expuesto en produccion y verificacion mediante curl desde Internet.
- acceso real a documentos de pilotos auditado; no se aceptan URLs publicas adivinables.
- Business Portfolio con dos admins y MFA.
- WABA y numero propiedad de Danhei.
- token de System User con permisos minimos y plan de rotacion.
- webhook HTTPS con challenge y firma validada.
- suscripcion de la app al WABA confirmada.
- inbox e idempotencia comprobadas con pruebas concurrentes.
- rate limiting por contacto, cliente y ventana de tiempo.
- logs con `correlation_id`, sin tokens, direcciones completas ni documentos.
- `WHATSAPP_OUTBOUND_ENABLED` desactivado hasta completar smoke test.
- templates y ventana de 24 horas probados.

### Gates P1 antes del piloto

- Flow publicado y apertura interactiva implementada.
- pruebas de `nfm_reply`, replay, payload manipulado y Flow incompleto.
- reglas de direccion, cobertura, jornada y COD recalculadas en backend.
- `pending_review` visible y operable por despachador.
- mensajes de cliente no autorizado sin creacion de recogida.
- retries con backoff y cola funcionando.
- alertas para firma invalida, abuso, error de Meta y saturacion.
- documentacion de rollback y de rotacion de secretos.

### Gates P2 antes del despliegue completo

- pruebas BOLA/BFLA sobre clientes, contactos y recogidas.
- prueba de restauracion de base de datos.
- version de Graph API confirmada y registrada; el repositorio usa hoy `v23.0` como valor de referencia, por lo que debe revisarse contra la version vigente de Meta antes del primer despliegue real.
- tablero de calidad del numero, errores y entregabilidad.
- revision periodica de politicas, templates y precios.

## 13. Evaluacion de Meta Cloud API directa frente a BSP

| Criterio | Meta Cloud API directa | BSP |
| --- | --- | --- |
| Control del WABA y numero | Alto si Danhei es propietario | Depende del contrato y onboarding |
| Control tecnico | Alto; webhook, Flow, templates y token propios | Parte del control queda en el proveedor |
| Tiempo inicial | Mas configuracion manual | Puede simplificar el onboarding |
| Costo | Tarifa Meta y costos de infraestructura | Tarifa Meta mas margen o plan del BSP |
| Dependencia | Meta + infraestructura Danhei | Meta + BSP + infraestructura Danhei |
| Soporte de verificacion | No garantiza aprobacion | El BSP puede ayudar, pero no sustituye las politicas de Meta |
| Encaje con P16 | Muy bueno para una sola integracion | Util si se necesita bandeja multiagente lista o soporte especializado |

Decision: iniciar con Meta Cloud API directa. Solo evaluar un BSP si Meta impide tecnicamente el onboarding directo, si se necesita soporte contractual especializado o si el costo de construir la capa operativa supera el valor del control. Si se elige BSP, Danhei debe exigir propiedad del WABA/numero, exportacion de datos, procedimiento de salida, SLA, tratamiento de datos, acceso a templates y que el proveedor no conserve la unica credencial administrativa.

## 14. Backlog de cierre ordenado

### Ahora: organizar la cuenta

1. Confirmar el administrador propietario de Danhei.
2. Crear o limpiar el Business Portfolio con datos legales consistentes.
3. Agregar segundo administrador y MFA.
4. Abrir el motivo del rechazo de verificacion y archivarlo.
5. Crear/confirmar la app y el WABA de prueba.
6. Conservar los identificadores sin publicar secretos.

### Despues: hacer funcionar el laboratorio

1. Obtener URL HTTPS de staging.
2. Cargar credenciales de prueba en el secret manager.
3. Configurar y suscribir el webhook.
4. Enviar y recibir el mensaje de prueba.
5. Implementar envio del Flow publicado.
6. Ejecutar prueba de recogida con un contacto autorizado.

### Antes de anunciarlo

1. Reintentar verificacion con expediente corregido.
2. Reservar o adquirir numero dedicado de produccion.
3. Configurar WABA y token de produccion separados.
4. Validar templates, privacidad, opt-in y escalamiento humano.
5. Ejecutar piloto con limite de clientes y aprobacion manual.

## 15. Primer paso recomendado para el propietario

El primer paso no es pegar un token en el `.env`. Es crear la base de propiedad y control:

1. Entrar a [Meta Business Suite](https://business.facebook.com/) con una cuenta personal real del responsable legal o administrativo de Danhei.
2. Crear o seleccionar un unico Business Portfolio para Danhei.
3. Confirmar que el nombre, direccion, telefono, dominio y correo representen a la entidad real.
4. Agregar un segundo administrador interno y activar MFA en ambas cuentas.
5. Ir al `Security Center`, guardar el motivo exacto del rechazo y no volver a enviar documentos hasta alinear la informacion.
6. Abrir [Meta for Developers](https://developers.facebook.com/apps/), crear/seleccionar la app de Danhei y agregar WhatsApp.
7. Detenerse en el panel `WhatsApp > API Setup` y conservar solamente estos identificadores: App ID, WABA ID y Phone Number ID. El token temporal se usara solo para laboratorio y no se guardara en Git.

Este paso deja organizada la propiedad sin comprometer el numero oficial ni exponer secretos. A partir de ahi se puede configurar staging y hacer la primera prueba real de webhook.

## 16. Decisiones cerradas para Danhei

- Proveedor: Meta WhatsApp Cloud API directa.
- V1: solo solicitudes de recogida.
- Usuarios: solo clientes existentes en Danhei.
- Contactos: uno o varios por cliente, habilitados unicamente desde el panel.
- Ambiguedad, falta de cobertura, datos faltantes o exceso de COD: `pending_review`, nunca creacion confirmada.
- Estados visibles: solicitud recibida, pendiente de revision, aceptada y entrega confirmada.
- WhatsApp no autoriza cambios financieros ni decide que el COD fue recibido.
- El webhook publico no crea operaciones directamente.
- El Flow es el formulario estructurado; el texto libre no debe crear recogidas por si solo.
- La cuenta Meta, el numero, los secretos y el expediente de verificacion deben pertenecer a Danhei.

## 17. Limitaciones y criterio de honestidad

Meta cambia nombres de pantallas, limites, categorias, precios y requisitos por pais, cuenta y fecha. Este documento fija una arquitectura y un procedimiento de control, pero no puede garantizar que Meta apruebe una verificacion ni que un portfolio rechazado tenga inmediatamente acceso productivo. La decision final de habilitacion debe basarse en el estado visible del Business Portfolio, WABA, numero y app de Danhei el dia del despliegue.

La siguiente validacion practica debe hacerse con datos reales de la cuenta, nunca enviando al equipo tecnico el token, el App Secret, el PIN ni documentos personales por chat.
