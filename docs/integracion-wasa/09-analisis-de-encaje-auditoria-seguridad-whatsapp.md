# Analisis De Encaje - Auditoria De Seguridad WhatsApp

Fecha: 2026-07-07

## 1. Conclusion ejecutiva

Si, la auditoria encaja muy bien con Danhei y no solo es util: es necesaria.

La auditoria no contradice la arquitectura que ya venimos definiendo. La refuerza y la vuelve mas segura. Su tesis central es correcta:

`WhatsApp no debe operar directamente el dominio interno de Danhei.`

La integracion debe construirse como un borde de seguridad nuevo del ecosistema:

`Meta / WhatsApp -> adaptador publico controlado -> inbox -> cola -> dominio Recogidas -> panel admin / piloto`

Ese enfoque es coherente con el estado real del sistema actual y con la decision de usar `P16/api` como nucleo de orquestacion.

## 2. Lo que la auditoria acierta de forma directa

Los siguientes puntos quedan ratificados como correctos y necesarios:

- separar el webhook publico del dominio operativo;
- verificar firma criptografica de Meta antes de procesar;
- usar inbox + cola antes de tocar reglas de negocio;
- imponer idempotencia real en base de datos;
- no usar el numero de WhatsApp como autorizacion total;
- recalcular en servidor cobertura, precio, COD, ventana y capacidad;
- separar solicitud operativa de estados financieros;
- exigir trazabilidad completa con `correlation_id`.

En terminos de arquitectura, este documento de seguridad encaja mejor como una capa obligatoria sobre la propuesta funcional y tecnica ya creada, no como un documento alterno.

## 3. Hallazgos confirmados contra el entorno y el codigo

### F-01 confirmado - `deploy-check` publico

Se valido el 2026-07-07 que:

- `https://api.danheiexpress.com/api/deploy-check` responde `200`;
- el endpoint sigue siendo publico;
- la respuesta expone informacion interna operativa y estructural.

En codigo, la ruta existe sin autenticacion en [api.php](../../api/routes/api.php).

Esto confirma que la prioridad `P0` planteada por la auditoria es correcta:

`cerrar /api/deploy-check antes del rollout productivo`

### Riesgo de documentos de pilotos - parcialmente confirmado y urgente

No se demostro aun que un documento concreto de piloto sea descargable por URL publica, pero si se confirmo que el diseno actual apunta en esa direccion:

- el disco `public` usa `storage/app/public` y visibilidad publica en [filesystems.php](../../api/config/filesystems.php);
- el helper convierte archivos a URLs publicas `/storage/...` en [PublicAssetUrl.php](../../api/app/Support/PublicAssetUrl.php);
- los documentos del piloto se guardan en `drivers/documents` sobre el disco `public` en [DriverController.php](../../api/app/Http/Controllers/Api/DriverController.php);
- la prueba automatizada espera precisamente una URL publica `/storage/drivers/documents/...` en [ScopedEndpointTest.php](../../api/tests/Feature/ScopedEndpointTest.php).

Adicionalmente, consultar la raiz `https://api.danheiexpress.com/storage` devolvio `403`, lo cual sugiere que no hay listado abierto en ese punto exacto, pero eso no alcanza para cerrar el riesgo. Todavia hace falta una prueba dirigida con un archivo real o con una URL conocida.

Conclusion:

`el hallazgo F-10 no esta totalmente probado, pero si esta tecnicamente bien fundado y debe tratarse como auditoria urgente`

## 4. Puntos que deben matizarse

La auditoria esta bien enfocada, pero hay dos matices utiles para priorizar mejor:

### Headers HTTP

La observacion sobre headers es valida, pero no es el principal bloqueo para WhatsApp.

En este proyecto tienen mucha mas prioridad:

- autenticidad del webhook;
- aislamiento del adaptador publico;
- autorizacion por cliente y objeto;
- idempotencia;
- proteccion de documentos;
- secretos y rotacion;
- rate limiting operativo.

### Estado actual del sistema

La auditoria no describe un sistema comprometido. Describe un sistema que puede soportar la integracion, pero que todavia necesita endurecimiento antes de exponer un canal externo transaccional como WhatsApp.

## 5. Como encaja esto con la arquitectura ya definida

La auditoria debe incorporarse como criterio de diseno en estos documentos ya existentes:

- [02-whatsapp-integracion-arquitectura-2026-07-07.md](./02-whatsapp-integracion-arquitectura-2026-07-07.md)
- [05-especificacion-funcional-whatsapp-v1.md](./05-especificacion-funcional-whatsapp-v1.md)
- [07-decisiones-arquitectonicas-y-prioridades-whatsapp.md](./07-decisiones-arquitectonicas-y-prioridades-whatsapp.md)

Interpretacion recomendada:

- `02` define la forma tecnica general;
- `05` define el comportamiento funcional de V1;
- `07` define decisiones y orden de ejecucion;
- `08` conserva el insumo bruto de seguridad;
- `09` convierte esa auditoria en criterio de encaje, prioridad y accion para Danhei.

## 6. Decisiones que quedan elevadas a obligatorias

Para continuar correctamente con Wasa, estas decisiones ya no deberian quedar como recomendacion blanda:

1. El webhook de WhatsApp debe ser solo una capa de ingesta.
2. Toda accion de negocio debe pasar por un `WebhookInbox` y por una cola.
3. La entidad `Pickup` o `PickupRequest` no puede crearse directamente desde el controlador publico.
4. Debe existir idempotencia persistente con llaves `UNIQUE`.
5. Debe existir validacion de firma `X-Hub-Signature-256`.
6. Debe existir autorizacion por cliente, por objeto y por tipo de accion.
7. Los documentos de pilotos deben revisarse y, si hoy salen por `public`, migrarse a acceso privado controlado.
8. `deploy-check` debe salir de la superficie publica.

## 7. Priorizacion recomendada para Danhei

### P0 - Inmediato

- cerrar `deploy-check` en produccion;
- auditar acceso real a documentos de pilotos;
- definir el `WebhookInbox` como patron obligatorio;
- definir llaves de idempotencia y replay protection;
- separar claramente `requested_cod_amount` de estados financieros reales.

### P1 - Antes de sandbox integrado

- implementar validacion de firma de Meta;
- montar cola de procesamiento;
- definir limites por `wa_id`, cliente y ventana temporal;
- fijar trazabilidad minima con `correlation_id`;
- redactar politicas de logs y secretos.

### P2 - Antes de produccion

- pruebas de replay;
- pruebas BOLA/BFLA;
- pruebas de carga y abuso;
- alertas por fallos de firma y creacion masiva;
- runbook operativo y de incidentes.

## 8. Decision final sobre si esto se necesita

Si, lo necesitamos.

No como un documento opcional de compliance, sino como una condicion de arquitectura para que la integracion WhatsApp no debilite el ecosistema Danhei.

La auditoria confirma algo importante:

`Danhei si puede integrar WhatsApp, pero debe hacerlo como integracion segura, no como formulario conectado directo al core operativo.`
