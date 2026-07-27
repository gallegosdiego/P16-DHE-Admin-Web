# Incidente Meta: WABA restringida durante el onboarding

Fecha: 2026-07-27
Codigo visible: `#2655121: WBxP--1012175845-802965330`
Estado: bloqueado por Meta, pendiente de diagnostico en Business Support Home.
Impacto: no se puede continuar con la operacion seleccionada sobre la cuenta de WhatsApp Business.

## 1. Mensaje recibido

```text
No se puede continuar con esta operacion porque tu cuenta de WhatsApp Business
esta restringida en este momento. Para continuar, selecciona otra cuenta de
WhatsApp Business o ve a Inicio de ayuda para empresas y resuelve los problemas
con tu cuenta.
```

## 2. Interpretacion correcta

Este no es un error de Laravel, P16, el webhook ni el token de Danhei. Es una respuesta del sistema de Meta durante una operacion de administracion u onboarding de WhatsApp.

El texto confirma que Meta ha marcado como restringido al menos uno de estos niveles:

```text
Business Portfolio
       |
       +-- WABA seleccionada
       |       |
       |       +-- Numero de WhatsApp
       |
       +-- App o permisos relacionados
```

El codigo `2655121` y el identificador `WBxP--...` no tienen una explicacion publica suficiente para determinar por si solos el motivo exacto. La causa real se debe leer en el activo afectado dentro de:

- `Business Support Home`.
- `Account Quality`.
- `Business Settings > Accounts > WhatsApp Accounts`.
- `WhatsApp Manager > Phone numbers`.
- `Support Inbox` y el correo del administrador.

La interpretacion mas probable, por el texto y el momento de onboarding, es una restriccion de la WABA o del portfolio que la contiene. Esto es una inferencia operativa, no una decodificacion oficial del numero de error.

## 3. Causas posibles que deben diferenciarse

No se debe enviar una apelacion diciendo que fue por una causa que Meta aun no ha confirmado. Las hipotesis se investigan en este orden:

### A. Restriccion de identidad o verificacion

- Business Verification rechazada, incompleta o inconsistente.
- Nombre legal, direccion, telefono, dominio o correo que no coinciden.
- Marca `Danhei Express` sin relacion visible con la razon social.
- Documentos ilegibles, vencidos o no aceptados.
- Administrador que no demuestra relacion con la empresa.

### B. Restriccion del WABA

- WABA creado automaticamente durante un intento anterior y marcado como restringido.
- Mas de un WABA creado para la misma empresa durante pruebas.
- WABA no asociado correctamente con la app o el portfolio.
- Estado de calidad, integridad o cumplimiento pendiente.

### C. Restriccion del numero

- Numero ya activo en WhatsApp Messenger o WhatsApp Business App.
- Numero usado anteriormente con otro proveedor o WABA.
- Fallo o limite en la verificacion SMS/voz.
- Numero o perfil con antecedentes de calidad negativa.

### D. Restriccion de integridad o politicas

- Actividad automatizada o repetitiva que Meta considere sospechosa.
- Multiples intentos de crear, borrar o cambiar activos en poco tiempo.
- Perfil administrador incompleto o con limitaciones.
- Comunicaciones no autorizadas, reportes, bloqueos o spam en activos relacionados.
- Incumplimiento de las politicas de WhatsApp Business.

### E. Restriccion administrativa o de facturacion

- Solicitud de informacion adicional.
- Problema de metodo de pago o facturacion, si Meta lo indica explicitamente.
- Permisos insuficientes del administrador que intenta completar el proceso.

No hay evidencia suficiente para afirmar que Danhei haya cometido spam o una infraccion. El mensaje solo prueba que la cuenta esta restringida para esa operacion.

## 4. Acciones prohibidas mientras se diagnostica

- No crear otro Business Portfolio para evadir la restriccion.
- No crear varias WABA de prueba en cadena.
- No cambiar los datos legales para intentar pasar el formulario.
- No subir documentos editados, logos o capturas como si fueran documentos oficiales.
- No entregar el token, App Secret, PIN o documentos a terceros.
- No registrar el numero oficial en un BSP antes de entender el activo restringido.
- No cambiar repetidamente de administrador, dispositivo, red o pais.
- No copiar un token de otra empresa al backend de Danhei.

La politica de Meta permite limitar o retirar el acceso cuando detecta incumplimientos, feedback negativo o mensajeria no autorizada; tambien exige que las empresas respeten opt-in y opt-out. [Politica oficial de WhatsApp Business Messaging](https://whatsappbusiness.com/policy/)

## 5. Procedimiento de recuperacion

### Paso 1: capturar evidencia

El administrador propietario debe guardar:

- captura completa del mensaje;
- fecha y hora;
- URL y pantalla exacta donde aparece;
- nombre del Business Portfolio seleccionado;
- nombre y WABA ID de la cuenta seleccionada;
- App ID, si la operacion viene de Meta for Developers;
- Phone Number ID y telefono, si ya aparecen;
- texto exacto de cualquier alerta en `Account Quality`;
- historial de la verificacion rechazada.

No guardar tokens ni PIN en la captura.

### Paso 2: revisar el activo restringido

Entrar con el administrador real de Danhei al enlace que muestra Meta:

- [Business Support Home](https://business.facebook.com/business-support-home/2425467934638337/1300482025517298/?source=link)

Buscar el activo con estado `Restricted`, `Disabled`, `Needs attention` o equivalente y abrir `What you can do`, `See details` o `Request review`.

Revisar tambien:

1. `Business Settings > Business info`.
2. `Business Settings > Security Center`.
3. `Business Settings > Accounts > WhatsApp Accounts`.
4. `WhatsApp Manager > Account quality`.
5. `WhatsApp Manager > Phone numbers`.
6. `Support Inbox`.

Facebook describe `Account Status` como el lugar donde se ven restricciones del perfil y de los activos administrados; si la interfaz de Business Support Home cambia, esa pantalla ayuda a separar una restriccion del administrador de una restriccion del WABA. [Ayuda oficial sobre Account Status](https://www.facebook.com/help/1392616391875085/)

### Paso 3: clasificar el bloqueo

Registrar una sola de estas clasificaciones:

| Hallazgo | Significado | Accion |
| --- | --- | --- |
| Portfolio restringido | Puede afectar todos sus WABA y numeros | Resolver portfolio antes de crear activos |
| WABA restringida | El portfolio puede seguir sano | Solicitar revision de esa WABA |
| Numero restringido | WABA puede estar disponible | Revisar propiedad, migracion y calidad del numero |
| App/permisos restringidos | Meta Developer limita la app o permiso | Revisar configuracion y solicitud de revision |
| Verificacion rechazada sin restriccion adicional | Identidad no aprobada, pero activo puede existir | Corregir expediente y confirmar limites |
| Sin detalle ni boton de revision | Caso no autodiagnosticable | Abrir soporte con evidencia completa |

### Paso 4: corregir datos antes de apelar

Antes de pulsar `Request review`:

- usar el nombre legal exacto de Danhei;
- verificar que la direccion sea la oficial;
- revisar telefono y correo institucional;
- publicar una pagina web HTTPS con contacto y politica de privacidad;
- explicar que `Danhei Express` es la marca, si la razon social es diferente;
- confirmar que el administrador tiene control real de la empresa;
- eliminar duplicados obvios solo si Meta ofrece esa accion, sin borrar el portfolio principal;
- activar MFA para todos los administradores.

La ayuda de Meta indica que los documentos de verificacion deben ser claros, completos, vigentes y no alterados: [documentos aceptados para verificar una empresa](https://www.facebook.com/help/243868559497297/).

### Paso 5: solicitar revision

Usar la opcion oficial de revision. Si no aparece, abrir el caso desde Business Support Home con el administrador propietario.

Texto sugerido para la revision:

```text
Solicito la revision de la restriccion aplicada a la cuenta de WhatsApp Business
de Danhei.

Danhei utilizara WhatsApp Business Platform exclusivamente para recibir
solicitudes de recogida de clientes ya registrados y previamente autorizados.
No se enviaran campanas masivas ni mensajes a contactos sin opt-in.

La integracion sera propia, mediante Meta Cloud API y un backend seguro. Las
solicitudes quedaran sujetas a validacion, revision manual, limites por cliente
y trazabilidad. No se procesaran pagos ni se confirmara recaudo por WhatsApp.

Business Portfolio ID: [ID]
WABA ID: [ID]
App ID: [ID]
Phone Number ID: [ID, si existe]
Telefono: [numero, si aplica]

La restriccion aparece durante: [paso exacto]. Adjuntamos captura y documentos
que acreditan la identidad y operacion de Danhei.
Solicitamos indicar el activo afectado y los pasos concretos para corregirlo.
```

No incluir en el caso:

- `WHATSAPP_ACCESS_TOKEN`;
- `META_APP_SECRET`;
- `WHATSAPP_VERIFY_TOKEN`;
- PIN de dos pasos;
- claves privadas;
- contrasenas.

### Paso 6: esperar la decision

Despues de enviar la revision:

- no repetir el onboarding varias veces;
- no crear portfolios alternos;
- no cambiar todos los datos de identidad;
- revisar diariamente Support Home y el correo del administrador;
- guardar numero de caso y respuestas de Meta.

Si Meta muestra una restriccion permanente o no ofrece revision, la solucion no puede implementarse desde P16. Solo Meta puede retirar esa marca. En ese escenario se debe escalar el caso con el Business ID, WABA ID, App ID, codigo de error y evidencia.

## 6. Que puede continuar en Danhei

Mientras Meta resuelve el bloqueo:

- continuar con desarrollo local usando `WHATSAPP_INBOUND_ENABLED=false` y `WHATSAPP_OUTBOUND_ENABLED=false`;
- ejecutar pruebas de webhook con fixtures firmados;
- validar clientes y contactos autorizados desde el panel;
- terminar el envio del Flow `pickup_request`;
- preparar templates y politica de privacidad;
- no cargar credenciales de otra cuenta;
- no conectar clientes reales.

La documentacion oficial de Cloud API separa los activos del portfolio, WABA, numero y app; por eso cambiar solo el token no corrige una WABA restringida. [Coleccion oficial de Meta para Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

## 7. Criterio para elegir una cuenta alternativa

El mensaje invita a seleccionar otra cuenta, pero no se debe aceptar automaticamente.

Solo se puede usar otra WABA si:

- pertenece legalmente a Danhei;
- aparece como activa y sin alertas;
- esta dentro del portfolio correcto;
- tiene un numero de prueba o dedicado bajo control de Danhei;
- tiene una app asociada de forma coherente;
- Meta permite la operacion desde esa cuenta.

No se debe seleccionar una WABA de un proveedor o de otra empresa para poner en produccion el canal de Danhei. Eso romperia la propiedad, trazabilidad y recuperacion del sistema.

## 8. Relacion con la arquitectura P16

El bloqueo actual impide obtener o activar los activos Meta, pero no demuestra un fallo del backend. El orden correcto es:

```text
Resolver restriccion Meta
        |
        v
Obtener WABA, Phone Number ID y token valido
        |
        v
Cargar secretos en staging
        |
        v
Configurar webhook y suscripcion al WABA
        |
        v
Abrir Flow y recibir nfm_reply
        |
        v
Crear solicitud Danhei
```

No se debe cambiar el codigo para saltar la restriccion. Un endpoint P16 no puede desbloquear un activo de Meta.

## 9. Criterio de salida del incidente

El incidente queda resuelto cuando:

- Business Support Home muestra el activo sin restriccion;
- la WABA se puede seleccionar en el onboarding;
- el numero puede verificarse por SMS o llamada;
- el numero tiene registro en dos pasos;
- la app puede suscribirse al WABA;
- el webhook recibe eventos de prueba;
- el token de System User funciona con permisos minimos;
- no existen alertas pendientes en Account Quality.

La documentacion de Meta indica que el registro de un numero requiere comprobar su propiedad y establecer la verificacion en dos pasos; la restriccion debe resolverse antes de llegar a ese punto. [Registro oficial del numero para Cloud API](https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration)

## 10. Decision actual de Danhei

```text
Produccion: NO-GO mientras la WABA o el portfolio este restringido.
Desarrollo local: GO.
Laboratorio Meta: GO solo con un activo de prueba que Meta muestre como activo.
Crear otra cuenta para evadir la restriccion: NO.
Abrir revision oficial: GO.
Contratar BSP como atajo: NO por ahora.
```

La restriccion debe resolverse en Meta y documentarse con evidencia. Despues de eso continuamos con la conexion real de P16.
