# Integracion Wasa - Contexto Maestro

Esta carpeta centraliza el contexto de trabajo para la integracion de WhatsApp en Danhei dentro del repositorio versionado.

## Objetivo

Tener en un solo lugar:

- la idea de negocio original;
- los informes de validacion del ecosistema;
- la arquitectura propuesta de la integracion;
- la especificacion funcional inicial;
- el analisis critico y de seguridad;
- la documentacion base de infraestructura y arquitectura del sistema actual.

## Contenido

- [00-propuesta-base-whatsapp.txt](./00-propuesta-base-whatsapp.txt)
  Texto base con la vision funcional y operativa de la integracion por WhatsApp.

- [01-informe-validacion-ecosistema-danhei-2026-07-07.md](./01-informe-validacion-ecosistema-danhei-2026-07-07.md)
  Informe de validacion del ecosistema actual de Danhei, estado operativo, arquitectura, infraestructura y hallazgos.

- [02-whatsapp-integracion-arquitectura-2026-07-07.md](./02-whatsapp-integracion-arquitectura-2026-07-07.md)
  Documento tecnico de arquitectura para la integracion de WhatsApp aterrizado a la realidad actual de Danhei.

- [03-infraestructura-maestra-dhe.md](./03-infraestructura-maestra-dhe.md)
  Documento base de infraestructura, despliegue, seguridad y operacion del ecosistema Danhei.

- [04-p16-architecture.md](./04-p16-architecture.md)
  Arquitectura actual del backend/admin `P16`, que sera el nucleo principal de la integracion.

- [05-especificacion-funcional-whatsapp-v1.md](./05-especificacion-funcional-whatsapp-v1.md)
  Borrador base de la especificacion funcional de la V1 del modulo de recogidas por WhatsApp.

- [06-analisis-critico-whatsapp-y-arquitectura.txt](./06-analisis-critico-whatsapp-y-arquitectura.txt)
  Comentario critico adicional sobre prioridades, contratos API, seguridad, observabilidad y rollout.

- [07-decisiones-arquitectonicas-y-prioridades-whatsapp.md](./07-decisiones-arquitectonicas-y-prioridades-whatsapp.md)
  Sintesis accionable del analisis critico convertida en decisiones y priorizacion para la iniciativa.

- [08-auditoria-seguridad-whatsapp.txt](./08-auditoria-seguridad-whatsapp.txt)
  Auditoria de seguridad enfocada en la futura integracion WhatsApp -> Recogidas -> API -> Admin -> Piloto.

- [09-analisis-de-encaje-auditoria-seguridad-whatsapp.md](./09-analisis-de-encaje-auditoria-seguridad-whatsapp.md)
  Analisis de encaje de la auditoria de seguridad contra el codigo y el entorno real de Danhei, con prioridades accionables.

- [10-evaluacion-proveedor-whatsapp-cloud-api-vs-bsp.md](./10-evaluacion-proveedor-whatsapp-cloud-api-vs-bsp.md)
  Evaluacion actualizada del proveedor recomendado para Danhei, comparando Meta Cloud API directa contra BSPs.

- [11-contrato-api-pickups-v1.md](./11-contrato-api-pickups-v1.md)
  Contrato API inicial para webhooks, Flows, modulo `Pickups`, configuracion por cliente y bandejas administrativas.

- [12-modelo-de-datos-whatsapp-pickups-v1.md](./12-modelo-de-datos-whatsapp-pickups-v1.md)
  Modelo de datos recomendado para configuracion por cliente, contactos autorizados, inbox de WhatsApp, solicitudes y revision manual.

- [13-backlog-tecnico-implementacion-wasa-p0-p1-p2.md](./13-backlog-tecnico-implementacion-wasa-p0-p1-p2.md)
  Backlog tecnico ejecutable organizado por prioridades `P0`, `P1` y `P2`.

- [14-whatsapp-saliente-y-trazabilidad-operativa.md](./14-whatsapp-saliente-y-trazabilidad-operativa.md)
  Estado actual del envio saliente por WhatsApp, trazabilidad de mensajes y lineamientos de configuracion por entorno.

## Recomendacion de uso

Los siguientes documentos que creemos para esta iniciativa deberian guardarse aqui tambien:

- plan de despliegue;
- pruebas UAT;
- runbook operativo;
- decisiones de sandbox, staging y produccion.

## Ruta sugerida de trabajo

1. Confirmar alcance de V1.
2. Definir especificacion funcional detallada.
3. Disenar tablas y endpoints.
4. Disenar modulo `Recogidas` en admin.
5. Disenar integracion `WhatsApp` en API.
6. Preparar sandbox y rollout controlado.
