# Decisiones Arquitectonicas Y Prioridades - WhatsApp

Fecha: 2026-07-07

## 1. Lectura ejecutiva del analisis critico

El analisis adicional confirma que la direccion general ya tomada es correcta:

- Danhei si esta listo para integrar WhatsApp;
- la integracion debe entrar por `P16/api`;
- no hace falta reconstruir la plataforma;
- pero antes del rollout se deben endurecer contratos, seguridad y trazabilidad.

## 2. Decisiones que quedan ratificadas

### Decision 1

WhatsApp no se conecta al panel administrativo.

Se conecta a:

`WhatsApp -> P16 API -> modulo Recogidas -> Admin -> Piloto`

### Decision 2

WhatsApp no sera la fuente de verdad.

La fuente de verdad sigue siendo:

`P16/api + base de datos`

### Decision 3

La V1 no sera un chatbot libre.

La V1 sera:

- estructurada;
- determinista;
- validada;
- con confirmacion explicita.

### Decision 4

No se migra la base de datos a PostgreSQL como condicion para WhatsApp.

La integracion se desarrollara sobre el estado productivo real actual:

- `Laravel 13`
- `MySQL`
- `Next.js 16`

## 3. Cambios de prioridad respecto al informe inicial

La nueva priorizacion recomendada queda asi:

### Prioridad 0 - Congelar estado actual

- version real de cada modulo;
- commit desplegado;
- APK vigente;
- esquema DB actual;
- variables clave del entorno.

### Prioridad 1 - Disciplina de contratos API

No basta con arreglar tracking.

Debemos establecer contratos formales para:

- `/tracking`
- `/pickups`
- `/shipments`
- `/customers`
- `/integrations/whatsapp`

Formato objetivo recomendado:

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "errors": []
}
```

### Prioridad 2 - Seguridad e idempotencia del API

Antes de exponer webhooks publicos:

- validar webhook de Meta;
- aplicar rate limiting;
- asegurar idempotencia;
- endurecer logging;
- separar endpoint publico de dominio interno.

### Prioridad 3 - Crear el modulo `Recogidas`

La integracion no debe inventar la operacion dentro del adaptador de WhatsApp.

Debe consumir un dominio claro:

- `PickupRequest`
- `PickupPackage`
- `PickupAddress`
- `PickupWindow`
- `PickupStatus`

### Prioridad 4 - Integracion WhatsApp

WhatsApp debe ser cliente del modulo `Recogidas`, no su reemplazo.

### Prioridad 5 - Observabilidad integral

La trazabilidad completa debe existir desde V1.

### Prioridad 6 - QA del admin

La falla local de `/usuarios` debe corregirse, pero no bloquea la arquitectura de WhatsApp.

### Prioridad 7 - Geocodificacion avanzada

Primero medir calidad real con score de confianza y revision manual.

## 4. Decision sobre contratos API

### Problema actual

Ya existe evidencia de contratos desalineados entre consumidores.

Eso vuelve fragil cualquier integracion nueva.

### Decision

Antes de producir la integracion de WhatsApp, se debe crear una capa de contrato formal para APIs operativas nuevas y para endpoints tocados por multiples consumidores.

### Implicacion

El modulo `Integrations/WhatsApp` no debe devolver formatos improvisados.

Debe adherirse a:

- DTOs formales;
- envelopes consistentes;
- codigos de error claros;
- versionado o al menos compatibilidad controlada.

## 5. Decision sobre seguridad

### Hallazgo

La comparacion de headers entre web y API es util, pero no suficiente por si sola.

### Decision

Se debe hacer una auditoria del API orientada a webhooks e integraciones, no solo una auditoria de headers.

### Checklist minimo

- endpoint de verificacion;
- autenticidad del emisor;
- replay protection;
- rate limit por origen;
- timeouts y retries controlados;
- colas para procesamiento;
- logs estructurados con redaccion de datos sensibles;
- idempotencia obligatoria.

## 6. Decision sobre observabilidad

### Hallazgo

La observabilidad no puede quedar como mejora secundaria.

### Decision

Desde V1, toda interaccion de WhatsApp debe poder seguirse de punta a punta.

### Campos de correlacion recomendados

- `correlation_id`
- `source`
- `external_message_id`
- `flow_submission_id`
- `pickup_id`
- `customer_id`

### Pregunta que la plataforma debe poder responder

`Que paso con la recogida que pidio este cliente por WhatsApp a una hora especifica`

## 7. Decision sobre geocodificacion

### Hallazgo

No es obligatorio pasar a Google Maps desde el primer dia.

### Decision

V1 operara con pipeline de confianza:

```text
direccion cruda
  ->
normalizacion
  ->
geocodificacion
  ->
score de confianza
  ->
aceptacion automatica o revision manual
```

### Implicacion

La geocodificacion no bloquea el inicio del proyecto, pero si debe quedar modelada y medible.

## 8. Decision sobre versionado

### Hallazgo

Las desalineaciones de version ya existen y seran mas peligrosas con WhatsApp.

### Decision

Antes de rollout productivo, debemos crear una matriz activa de versiones.

### Componentes minimos a versionar

- `P13`
- `P14`
- `P15`
- `P16/frontend`
- `P16/api`
- `WhatsApp Flow`
- `DB schema`

## 9. No bloqueadores

Estos temas deben resolverse, pero no son el bloqueo arquitectonico principal del proyecto:

- bug local `/usuarios` en `next dev`;
- falta de realtime via `Reverb` en V1;
- migracion a PostgreSQL.

## 10. Veredicto consolidado

Danhei esta en fase de consolidacion operativa.

No necesita reconstruccion para integrar WhatsApp.

Si necesita:

- contratos API mas estrictos;
- seguridad para webhooks;
- modulo `Recogidas` bien modelado;
- observabilidad transversal;
- disciplina de versionado.

## 11. Siguiente paso recomendado

Los proximos entregables recomendados son:

1. matriz de versiones y estado actual;
2. contrato API del modulo `Pickups`;
3. modelo de datos final;
4. estados y transiciones de `Recogidas`;
5. pantallas del admin;
6. diseno funcional exacto del Flow;
7. runbook de sandbox y despliegue.
