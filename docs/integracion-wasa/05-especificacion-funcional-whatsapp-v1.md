# Especificacion Funcional - WhatsApp V1

Fecha: 2026-07-07

Estado: borrador base

Proveedor definido para V1:

- `Meta WhatsApp Cloud API` directa.

## 1. Proposito

Definir la primera version funcional del modulo de solicitudes de recogida por WhatsApp para Danhei, alineada con la arquitectura real del ecosistema actual.

## 2. Objetivo de negocio

Permitir que un cliente solicite una recogida desde WhatsApp de manera:

- rapida;
- estructurada;
- validada;
- trazable;
- integrada con el panel administrativo de Danhei.

## 3. Objetivo operativo

Reducir la captura manual por chat libre y transformar la solicitud en una entidad operativa clara dentro de Danhei.

## 4. Alcance V1

### Incluye

- solicitud de recogida por WhatsApp;
- solo clientes ya registrados en Danhei;
- validacion del cliente contra telefono WhatsApp configurado en su ficha;
- activacion individual del canal WhatsApp por cliente desde el panel admin;
- direccion guardada o nueva;
- captura estructurada de multiples paquetes dentro de una sola recogida;
- datos minimos de entrega por cada paquete;
- validacion de cobertura;
- seleccion de jornada disponible;
- captura de paquetes;
- seleccion de tipo de servicio;
- opcion de contraentrega;
- confirmacion final;
- creacion de recogida en API Danhei;
- visualizacion en admin;
- confirmacion al cliente.

### No incluye

- onboarding de clientes nuevos por WhatsApp;
- IA generativa abierta;
- automatizacion total de despacho;
- pricing avanzado en tiempo real;
- integracion de recaudo bancario;
- migracion inmediata del numero principal.

## 4.1 Prerrequisitos funcionales y tecnicos

Antes de salida productiva de V1, deben quedar cubiertos estos prerrequisitos:

- matriz real de versiones por componente;
- contrato API base del modulo `Pickups`;
- disciplina minima de envelopes de respuesta;
- idempotencia para confirmaciones y webhooks;
- trazabilidad por `correlation_id`;
- sandbox funcional antes del numero real.

## 5. Actores

- cliente registrado;
- asesor operativo;
- administrador;
- sistema WhatsApp/Meta;
- API Danhei.

## 6. Flujo principal V1

1. Cliente inicia conversacion.
2. Se le ofrece menu principal.
3. Elige `Solicitar recogida`.
4. El sistema valida que el telefono remitente corresponda al telefono WhatsApp configurado para un cliente existente en Danhei.
5. El sistema valida que el cliente tenga activo el canal `Recogidas por WhatsApp`.
6. Se captura o selecciona la direccion de recogida.
7. Se define la cantidad de paquetes.
8. Se capturan los datos de entrega de cada paquete.
9. Se validan cobertura, jornada, limites y reglas de riesgo.
10. Se presenta resumen final.
11. El cliente confirma.
12. La API crea el `PickupRequest`.
13. La API crea los paquetes o envios asociados.
14. El admin ve la nueva solicitud o su estado de revision.
15. El cliente recibe confirmacion o mensaje de revision.

## 7. Menu inicial recomendado

- `Solicitar recogida`
- `Rastrear paquete`
- `Hablar con un asesor`

## 7.1 Regla de activacion del flujo de recogida

Para V1, la activacion funcional del proceso debe ser:

- el cliente escribe al numero oficial de WhatsApp de Danhei;
- Danhei presenta el menu inicial;
- el cliente selecciona `Solicitar recogida`.

Esa opcion debe considerarse la frase u opcion oficial que inicia la toma del pedido.

## 7.2 Disparador tecnico real

Es importante dejarlo sin ambiguedad:

- `Solicitar recogida` es el disparador visible para el cliente;
- el disparador tecnico real del backend no es una palabra libre;
- la API crea la solicitud solo cuando recibe la respuesta confirmada del Flow `pickup_request`.

En otras palabras:

- escribir `recogida` por si solo no crea pedido;
- escribir `pedido` por si solo no crea pedido;
- escribir `solicitar recogida` como texto libre no crea pedido automaticamente en el estado actual;
- la creacion ocurre cuando el cliente entra al Flow y lo confirma.

## 7.3 Decision cerrada para V1

La decision oficial queda asi:

- nombre del boton o accion en el chat: `Solicitar recogida`
- nombre tecnico del Flow: `pickup_request`
- momento de creacion del `PickupRequest`: confirmacion exitosa del Flow

Si en una iteracion futura se quiere aceptar texto libre como detonante, eso debe implementarse como una capa adicional de enrutamiento conversacional, no como sustituto del Flow estructurado.

## 8. Experiencia cliente frecuente

Opciones recomendadas:

- `Repetir ultima recogida`
- `Recoger en direccion habitual`
- `Crear nueva recogida`
- `Hablar con operaciones`

## 8.1 Regla de identificacion del cliente

La V1 no atendera clientes nuevos.

Cada solicitud debera venir de un numero que exista previamente en Danhei como telefono habilitado para WhatsApp dentro de la ficha del cliente.

Esto implica:

- no basta cualquier telefono de contacto o movil historico;
- puede haber varios contactos autorizados por cliente;
- la habilitacion de esos contactos solo se administra desde panel administrativo;
- debe existir un campo o criterio explicito de `telefono_whatsapp` autorizado para esta integracion;
- si el numero no coincide con un cliente activo autorizado, no se crea recogida automatica.

## 8.2 Regla de activacion por cliente

No todos los clientes deben quedar habilitados automaticamente para esta integracion.

Cada cliente debe tener configurado en el panel un estado para `Recogidas por WhatsApp`.

Estados recomendados:

- `DISABLED`
- `PENDING_CONFIGURATION`
- `ACTIVE`
- `SUSPENDED`

Comportamiento:

- `DISABLED`: no inicia automatizacion; el caso pasa a atencion manual.
- `PENDING_CONFIGURATION`: no crea recogidas automaticas hasta completar configuracion.
- `ACTIVE`: puede operar normalmente segun permisos y limites.
- `SUSPENDED`: bloquea nuevas solicitudes automaticas, pero conserva historial y configuracion.

La validacion del estado debe repetirse justo antes de crear el `PickupRequest`.

## 8.3 Regla de autorizacion por cuenta

El telefono de WhatsApp identifica al contacto, pero no concede por si solo control total de la cuenta.

La V1 debe operar con:

- telefono identificado;
- cliente existente;
- contacto autorizado para esa cuenta;
- permisos por cuenta.

Permisos iniciales recomendados:

- `CREATE_PICKUP`
- `VIEW_OWN_PICKUPS`
- `USE_SAVED_ADDRESSES`
- `CREATE_COD_SHIPMENT`
- `CANCEL_UNASSIGNED_PICKUP`

El OTP no debe pedirse en cada recogida.

Solo debe usarse como validacion reforzada en escenarios de mayor riesgo, por ejemplo:

- vinculacion de numero nuevo;
- cambio de numero autorizado;
- accion sensible;
- comportamiento anomalo.

## 9. Pantallas funcionales del Flow

### Pantalla 1 - Cuenta y origen de recogida

Campos:

- cliente o cuenta bajo la que opera;
- direccion o direccion guardada;
- complemento;
- barrio;
- nombre de contacto;
- telefono;
- instrucciones al piloto.

### Pantalla 2 - Cantidad de paquetes

Campos:

- cantidad de paquetes;
- observaciones generales.

### Pantalla 3 - Datos por paquete

Se repite una vez por cada paquete capturado.

Campos minimos obligatorios por paquete:

- nombre del destinatario;
- telefono del destinatario;
- direccion de entrega;
- complemento opcional;
- si tiene cobro contraentrega;
- valor a cobrar si aplica.

Campos opcionales o de riesgo:

- tipo o categoria;
- tamano aproximado;
- peso aproximado;
- fragil;
- condicion especial.

### Pantalla 4 - Jornada y reglas operativas

Opciones:

- primera jornada;
- segunda jornada;
- proxima disponible;
- siguiente dia operativo.

### Pantalla 5 - Confirmacion

Debe mostrar:

- datos de recogida;
- cantidad de paquetes;
- resumen por paquete;
- jornada;
- COD total solicitado si aplica.

## 9.1 Modelo funcional de la solicitud

La V1 no debe asumir:

`1 recogida = 1 paquete`

La estructura correcta es:

`1 PickupRequest -> N paquetes o envios`

Cada paquete debe conservar sus propios datos minimos de entrega.

## 9.2 Datos minimos requeridos

### Datos de recogida

- direccion donde recoger;
- nombre del contacto que entrega;
- telefono del contacto;
- cantidad de paquetes;
- jornada solicitada;
- observaciones.

### Datos por paquete

- nombre del destinatario;
- direccion de entrega;
- complemento;
- telefono del destinatario;
- si tiene cobro;
- valor a cobrar.

### Datos generados por el sistema

- numero de guia;
- codigo QR o identificador escaneable;
- estado;
- cliente remitente;
- source `whatsapp`;
- fecha y trazabilidad.

## 10. Reglas funcionales clave

### Regla 1

No se crea ninguna operacion hasta que el cliente confirme.

### Regla 2

La direccion debe validarse contra cobertura.

### Regla 3

La jornada solo puede elegirse entre opciones realmente disponibles.

### Regla 4

La misma confirmacion no puede crear dos recogidas.

### Regla 5

WhatsApp no reemplaza la fuente de verdad de Danhei.

### Regla 6

La integracion de WhatsApp debe consumir contratos API formales y no respuestas ad hoc por canal.

### Regla 7

Toda solicitud confirmada debe quedar correlacionada con identificadores tecnicos trazables de punta a punta.

### Regla 8

La V1 solo permite solicitudes provenientes de clientes registrados cuyo numero remitente coincida con el numero habilitado para WhatsApp en Danhei.

### Regla 9

El backend solo puede crear solicitudes automaticas si el cliente tiene `Recogidas por WhatsApp` en estado `ACTIVE`.

### Regla 10

La recogida debe modelarse como un `PickupRequest` con multiples paquetes o envios asociados, cada uno con sus propios datos minimos de entrega.

### Regla 11

`pending_review` pertenece al dominio de solicitudes, pero no debe considerarse una recogida operativa.

Mientras una solicitud este en `pending_review`:

- no consume capacidad confirmada;
- no entra en asignacion;
- no aparece como lista para piloto;
- no impacta rutas activas;
- no activa transiciones financieras.

### Regla 12

Los limites de COD y de paquetes deben poder configurarse por cliente desde el panel administrativo y no quedar codificados rigidamente para todos por igual.

## 11. Estados funcionales de recogida

- `draft`
- `pending_review`
- `needs_customer_input`
- `submitted`
- `accepted`
- `ready_for_assignment`
- `assigned`
- `driver_on_the_way`
- `partially_picked_up`
- `picked_up`
- `not_picked_up`
- `cancelled`

## 11.1 Semantica de estados clave

- `draft`: el cliente aun esta diligenciando el Flow.
- `pending_review`: el cliente ya confirmo, pero existe una condicion que impide aceptacion automatica.
- `needs_customer_input`: Danhei solicito informacion adicional al cliente.
- `submitted`: la solicitud supero validaciones automaticas y ya puede entrar a revision final o aceptacion.
- `accepted`: Danhei la acepta operacionalmente.
- `ready_for_assignment`: ya puede pasar al proceso normal de asignacion.

## 12. Validaciones

- telefono valido;
- direccion de recogida con contexto suficiente;
- direccion de entrega con contexto suficiente por paquete;
- cobertura permitida;
- jornada disponible;
- cantidad de paquetes valida;
- COD dentro de reglas permitidas.

## 12.1 Reglas operativas iniciales

### Cobertura

La V1 debe usar la cobertura operativa actual de Danhei:

- Bogota urbana, excluyendo Sumapaz;
- Soacha;
- Mosquera;
- Funza;
- Madrid;
- Cota;
- Chia;
- Cajica;
- Zipaquira.

La cobertura no debe estar hardcodeada en el Flow. Debe consultarse desde backend.

Estados recomendados:

- `IN_COVERAGE`
- `NEAR_BOUNDARY`
- `OUT_OF_COVERAGE`
- `UNRESOLVED`

### Paquetes

- `1 a 5 paquetes`: automatico;
- `6 a 20 paquetes`: `pending_review`;
- `mas de 20 paquetes`: atencion empresarial, no flujo automatico normal.

Estos limites deben poder ajustarse por cliente.

### COD

La V1 si debe soportar COD, pero como valor solicitado:

- guardar `requested_cod_amount`;
- nunca marcar `collected_amount`, `paid_amount` o `settled_amount` desde WhatsApp.

Limites recomendados:

- `0 a 500000` por paquete: automatico;
- `500001 a 1000000` por paquete: `pending_review`;
- `mas de 1000000` por paquete: no automatico en V1;
- `maximo total automatico por recogida: 2000000`.

Estos limites deben poder ajustarse por cliente.

### Horarios

- el canal WhatsApp recibe solicitudes `24/7`;
- primera jornada: solicitudes confirmadas antes de `12:00 m.`, sujetas a capacidad;
- segunda jornada: solicitudes confirmadas antes de `6:00 p. m.`, sujetas a capacidad;
- despues de `6:00 p. m.`: siguiente dia operativo.

## 13. Casos especiales

- cliente fuera de cobertura;
- jornada sin disponibilidad;
- direccion con geocodificacion dudosa;
- doble confirmacion;
- error temporal del webhook;
- cliente que desea hablar con humano.

## 13.1 Manejo de casos dudosos

Cuando la solicitud llegue con informacion insuficiente, inconsistente o no validable automaticamente, no se debe crear una recogida directa.

Debe crearse o mantenerse un estado de:

- `pending_review`

Objetivo operativo:

- permitir que el equipo Danhei pida nuevamente los datos faltantes;
- permitir asistencia manual por despachador;
- evitar que una solicitud incompleta entre al flujo operativo como si estuviera validada.

Ejemplos iniciales de `pending_review`:

- direccion cerca del limite de cobertura;
- direccion ambigua;
- geocodificacion de baja confianza;
- exceso de COD permitido;
- telefono no asociado correctamente al cliente autorizado;
- datos obligatorios incompletos;
- mas de 5 paquetes;
- paquete especial o condicion especial;
- posible duplicado;
- cliente suspendido o en configuracion incompleta.

## 13.2 Contacto no autorizado

Si el cliente existe y tiene el modulo activo, pero el numero remitente no corresponde a un contacto autorizado:

- no se crea `PickupRequest`;
- no se crea caso operativo en `pending_review`;
- se genera una solicitud de vinculacion separada para revision administrativa.

Este flujo no debe mezclarse con la bandeja de solicitudes dudosas.

## 13.3 Dos bandejas administrativas

El panel debe separar:

- bandeja de revision de solicitudes;
- bandeja de solicitudes de vinculacion de contactos.

### Bandeja de revision de solicitudes

Casos como:

- direccion ambigua;
- cobertura no concluyente;
- exceso de COD;
- exceso de paquetes;
- datos inconsistentes;
- duplicados potenciales.

### Bandeja de vinculacion

Casos como:

- telefono desconocido;
- nuevo empleado de un cliente;
- numero que intenta operar una cuenta existente sin autorizacion.

## 14. Respuesta del sistema al cliente

Mensajes minimos:

- solicitud recibida;
- recogida confirmada;
- recogida en validacion manual;
- solicitud pendiente por revision;
- entrega confirmada;
- fuera de cobertura;
- jornada no disponible;
- error temporal y reintento.

## 14.1 Estados visibles para cliente por WhatsApp

La V1 debe simplificar los estados internos de Danhei a un set corto y entendible para el cliente:

- `request_received`: solicitud recibida;
- `pending_review`: pendiente por revision;
- `accepted`: aceptada;
- `delivery_confirmed`: entrega confirmada.

Regla:

- `delivery_confirmed` no sale del dominio `PickupRequest`;
- debe activarse a partir del estado `delivered` del `Shipment` asociado.

## 15. Admin V1

Modulo:

- `Recogidas`

Funciones:

- ver nuevas solicitudes;
- filtrar por estado;
- validar;
- solicitar correccion de datos;
- derivar a despachador para asistencia;
- asignar;
- contactar al cliente;
- cancelar;
- dejar trazabilidad.

## 15.2 Acciones administrativas sobre `pending_review`

Acciones recomendadas:

- `aprobar`
- `corregir`
- `solicitar_informacion`
- `rechazar`

### Aprobar

Antes de aprobar, el backend debe revalidar:

- cliente activo;
- contacto autorizado;
- cobertura;
- jornada;
- limites COD;
- cantidad de paquetes;
- duplicados.

No debe existir una aprobacion ciega que fuerce datos desactualizados.

### Corregir

El administrador puede ajustar campos permitidos, por ejemplo:

- direccion normalizada;
- municipio;
- ubicacion;
- jornada;
- clasificacion del paquete.

Todo ajuste debe quedar auditado.

### Solicitar informacion

El administrador puede pedir datos adicionales al cliente.

Transicion recomendada:

- `pending_review -> needs_customer_input -> revalidate`

### Rechazar

Debe exigir motivo, por ejemplo:

- `OUT_OF_COVERAGE`
- `COD_NOT_ALLOWED`
- `UNAUTHORIZED_GOODS`
- `INVALID_INFORMATION`
- `DUPLICATE`
- `CUSTOM_REASON`

## 15.1 Configuracion admin por cliente

Dentro del panel debe existir una configuracion por cliente para `Recogidas por WhatsApp`.

Elementos recomendados:

- estado del canal;
- contactos autorizados;
- permisos por contacto;
- COD habilitado;
- limite automatico de paquetes;
- limite automatico COD;
- limite de revision manual de paquetes;
- limite de revision manual COD;
- jornadas permitidas;
- auditoria de activacion, suspension y cambios.

La validacion de estado `ACTIVE` debe ocurrir:

- al iniciar el flujo;
- al confirmar la solicitud.

## 16. Indicadores V1

- recogidas por WhatsApp por dia;
- tasa de confirmacion;
- abandonos por paso;
- errores por cobertura;
- errores por jornada;
- tiempos desde solicitud hasta validacion;
- tiempos desde validacion hasta asignacion.

## 16.1 Trazabilidad minima requerida

Cada recogida de WhatsApp debe poder rastrearse con:

- `correlation_id`
- `source`
- `external_message_id`
- `flow_submission_id`
- `pickup_id`
- `customer_id`

## 17. Dependencias funcionales

- modulo de clientes;
- direcciones;
- zonas;
- cobertura;
- notificaciones;
- auditoria;
- autenticacion admin.

## 18. Riesgos V1

- direccion mala;
- cobertura mal clasificada;
- duplicado por reintento;
- fricciones con numero real;
- saturacion operativa;
- datos incompletos.

## 19. Criterio de exito

La V1 sera exitosa si:

- el cliente puede pedir una recogida sin asistencia manual en la mayoria de casos;
- la solicitud entra clara al admin;
- no se duplican recogidas;
- el equipo operativo reduce captura manual;
- el flujo es util para clientes frecuentes.

## 20. Pendiente para siguiente iteracion

Este documento debe enriquecerse con:

- matriz de versiones operativas;
- campos exactos del modelo;
- contratos API finales;
- estados y transiciones detalladas;
- mockups del admin;
- mensajes finales del Flow;
- reglas exactas de capacidad y cobertura;
- politica de errores y envelopes de respuesta;
- estrategia de correlation IDs y observabilidad.
