# Especificacion Funcional - WhatsApp V1

Fecha: 2026-07-07

Estado: borrador base

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
- direccion guardada o nueva;
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
5. Se captura o selecciona direccion de recogida.
6. Se validan cobertura y zona.
7. Se capturan datos de paquetes.
8. Se selecciona servicio.
9. Se selecciona jornada disponible.
10. Se presenta resumen final.
11. El cliente confirma.
12. La API crea la recogida.
13. El admin ve la nueva recogida.
14. El cliente recibe confirmacion.

## 7. Menu inicial recomendado

- `Solicitar recogida`
- `Rastrear paquete`
- `Hablar con un asesor`

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
- debe existir un campo o criterio explicito de `telefono_whatsapp` autorizado para esta integracion;
- si el numero no coincide con un cliente activo autorizado, no se crea recogida automatica.

## 9. Pantallas funcionales del Flow

### Pantalla 1 - Origen de recogida

Campos:

- direccion o direccion guardada;
- complemento;
- barrio;
- nombre de contacto;
- telefono;
- instrucciones al piloto.

### Pantalla 2 - Paquetes

Campos:

- cantidad de paquetes;
- tipo por paquete;
- tamano aproximado;
- peso aproximado;
- fragil;
- condicion especial.

### Pantalla 3 - Destino opcional

Escenarios:

- solo recogida;
- recogida con datos completos del envio.

### Pantalla 4 - Servicio

Opciones:

- servicio hoy;
- paqueteria;
- contraentrega.

Si es contraentrega:

- valor a recaudar.

### Pantalla 5 - Jornada

Opciones dinamicas solo si estan disponibles:

- primera jornada;
- segunda jornada;
- proxima disponible;
- programar para manana.

### Pantalla 6 - Confirmacion

Debe mostrar:

- direccion;
- contacto;
- cantidad de paquetes;
- servicio;
- jornada;
- COD si aplica.

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

## 11. Estados funcionales de recogida

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

## 12. Validaciones

- telefono valido;
- direccion con contexto suficiente;
- cobertura permitida;
- jornada disponible;
- cantidad de paquetes valida;
- COD dentro de reglas permitidas.

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

- falta cobertura confirmada;
- direccion ambigua;
- geocodificacion de baja confianza;
- exceso de COD permitido;
- telefono no asociado correctamente al cliente autorizado;
- datos obligatorios incompletos.

## 14. Respuesta del sistema al cliente

Mensajes minimos:

- solicitud recibida;
- recogida confirmada;
- recogida en validacion manual;
- solicitud pendiente por revision;
- fuera de cobertura;
- jornada no disponible;
- error temporal y reintento.

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
