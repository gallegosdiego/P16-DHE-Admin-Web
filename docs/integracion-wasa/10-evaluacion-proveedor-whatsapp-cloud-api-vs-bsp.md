# Evaluacion De Proveedor - Meta Cloud API Vs BSP

Fecha: 2026-07-07

## 1. Decision recomendada

La recomendacion para Danhei es usar `Meta WhatsApp Cloud API` directamente como proveedor principal.

Proveedor alternativo de contingencia:

- `360dialog`

No recomendados para esta etapa:

- `Twilio`
- `WATI`
- `Infobip`
- `Gupshup`

## 2. Por que esta recomendacion encaja con Danhei

Danhei ya tiene:

- backend propio en `Laravel`;
- panel administrativo propio;
- base de datos propia;
- clientes, pedidos, pilotos, tracking y finanzas modelados;
- equipo tecnico capaz de operar una integracion API directa.

Por eso, un BSP completo agrega mas valor comercial que valor arquitectonico. En esta fase, Danhei necesita:

- controlar el flujo;
- reducir intermediarios;
- evitar costos adicionales por mensaje o por asiento;
- dejar el negocio en `P16/api`.

## 3. Comparacion resumida

### Meta Cloud API directa

Ventajas:

- menor dependencia externa;
- control tecnico total;
- arquitectura mas limpia;
- acceso directo a Flows, templates, webhooks y APIs oficiales;
- sin capa adicional de pricing del integrador.

Contras:

- mas responsabilidad de onboarding y soporte recae en Danhei;
- el equipo debe operar directamente secretos, plantillas, webhooks y observabilidad.

### 360dialog

Ventajas:

- soporte especializado;
- onboarding mas guiado;
- costo fijo mensual claro;
- API orientada a desarrolladores.

Contras:

- dependencia adicional;
- otra capa contractual;
- costo mensual incluso si el volumen inicial es bajo.

### Twilio / WATI / Infobip / Gupshup

Para Danhei hoy agregan una capa extra que no resuelve un hueco prioritario del sistema. Son utiles si se busca:

- inbox multiagente listo para usar;
- omnicanalidad amplia;
- automatizaciones comerciales empaquetadas;
- soporte enterprise de comunicaciones.

Ese no es el problema principal de esta iniciativa.

## 4. Confirmaciones actuales de fuentes oficiales

Con base en documentacion oficial verificada el 2026-07-07:

- Meta indica que Cloud API soporta `80 mensajes por segundo` por numero por defecto, con upgrade automatico hasta `1000 mps` en numeros elegibles.
- Meta publica que, desde `2025-07-01`, el pricing paso a modelo por mensaje template entregado.
- Meta soporta onboarding de usuarios que ya usan la app WhatsApp Business, pero el escenario de coexistencia tiene restricciones operativas y debe probarse con cuidado.
- Twilio publica una tarifa propia de `USD 0.005` por mensaje entrante o saliente, ademas de los cargos de Meta.
- 360dialog publica planes desde `EUR 49/mes`.

## 5. Conclusiones practicas para Danhei

### Conclusion 1

Para la V1 de recogidas, `Meta directo` es la opcion mas coherente tecnica y economicamente.

### Conclusion 2

El numero productivo actual no debe conectarse primero. La ruta correcta es:

1. numero de prueba en Meta;
2. sandbox tecnico con webhook, Flow e inbox;
3. numero secundario controlado;
4. auditoria del numero principal;
5. produccion.

### Conclusion 3

Aunque usemos Meta directo, el codigo no debe quedar amarrado rigidamente a Meta.

Debe existir una interfaz de proveedor, por ejemplo:

- `WhatsAppProvider`
- `MetaCloudProvider`
- `Dialog360Provider`
- `MockProvider`

## 6. Recomendacion final

La recomendacion operativa para Danhei queda asi:

- proveedor principal: `Meta WhatsApp Cloud API`
- proveedor alternativo documentado: `360dialog`
- decision de codigo: integrar detras de una interfaz de proveedor

## 7. Fuentes

- [Meta - About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Meta - Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput)
- [Meta - Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Meta - Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Twilio - WhatsApp Messaging Pricing](https://www.twilio.com/en-us/whatsapp/pricing)
- [360dialog - Pricing](https://360dialog.com/pricing)
