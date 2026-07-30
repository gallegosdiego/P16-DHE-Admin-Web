# Maestro de clientes y revisión de clientes pendientes — 30 de julio de 2026

**Estado:** cerrado

**Alcance:** P16 Admin/API, contacto de cobro, empresa relacionada, guías sin cliente maestro y detalle administrativo del cliente.

**Entrega de interfaz:** `222a828` en `main` (PR [#18](https://github.com/gallegosdiego/P16-DHE-Admin-Web/pull/18)).

## Decisión funcional

El cliente maestro identifica al contacto de cobro, pero no reemplaza la información operativa de cada envío.

- El contacto de cobro conserva nombre, teléfono y correo.
- La empresa o razón social conserva nombre, NIT y teléfono corporativo como contexto asociado.
- Las preferencias `cash_on_delivery`, `post_sale` y `prepaid` son informativas y pueden coexistir. El tipo real se define por paquete o guía.
- Remitente y destinatario permanecen separados del cliente maestro. Una guía puede conservar un remitente libre aunque después se vincule a un cliente.
- Archivar un cliente lo retira de los listados activos, pero no elimina guías, paquetes, movimientos financieros ni historial.

## Flujo de una guía sin cliente identificado

1. El operador puede completar el flujo operativo dejando `client_id` vacío y registrando, si existe, el contacto o la empresa del remitente.
2. La guía queda en `Pendientes por identificar cliente` para revisión administrativa.
3. El operador selecciona el cliente maestro correcto y ejecuta la vinculación.
4. La API conserva el snapshot de remitente, asigna la guía al cliente y retroalimenta el libro COD cuando corresponde. El historial y la trazabilidad no se reescriben.

## Contrato API vigente

- `GET /api/shipments/pending-client-review` lista guías no canceladas sin `client_id`, con búsqueda, filtros y paginación.
- `POST /api/shipments/{shipment}/link-client` vincula una guía a un cliente activo y actualiza las relaciones financieras derivadas sin borrar datos históricos.
- `POST /api/shipments` y `PUT /api/shipments/{id}` aceptan `client_id` nulo y los campos snapshot `sender_name`, `sender_phone`, `sender_email` y `sender_company`.
- `POST /api/pickup-intakes` y `POST /api/pickup-intakes/walk-in/complete` permiten contacto/empresa pendientes para los flujos administrativos; el portal cliente conserva la exigencia de su cliente asociado.
- `DELETE /api/clients/{id}` archiva mediante soft delete; `POST /api/clients/{id}/restore` restaura el maestro sin tocar su historial.
- El maestro de clientes acepta `company_phone` y `billing_types[]`; `billing_type` se mantiene únicamente como compatibilidad para consumidores antiguos.

## Presentación en el panel

El detalle del cliente ahora organiza la información en esta jerarquía:

1. cabecera con nombre, estado y empresa relacionada;
2. pestañas de resumen, envíos, direcciones y WhatsApp cuando la funcionalidad está habilitada;
3. tarjeta de contacto de cobro;
4. tarjeta de empresa/razón social;
5. preferencias de pago compactas y marcadas como informativas;
6. métricas de envíos, deuda e ingresos.

La cabecera tiene cierre visible en la esquina superior derecha, las pestañas exponen estado accesible y la composición se adapta a escritorio y móvil.

## Evidencia de entrega

- Validación local: `npm run lint`, `npm run typecheck -- --incremental false`, `npm run build`.
- Pruebas E2E locales y de GitHub: **57 escenarios aprobados**.
- GitHub Actions `frontend-ci` para `main`: ejecución exitosa posterior al merge.
- Vercel Production: estado `success` para el commit `222a828`.
- Smoke público posterior: `https://admin.danheiexpress.com/clientes` redirige correctamente a `/login`; la API mantiene `GET /api/health` en `200`.
- Esta entrega solo modifica frontend y pruebas/documentación; no requiere ejecutar migraciones ni repetir el despliegue de API en cPanel.

## Pendientes que no se cierran con esta entrega

- UAT integral P14 → P16 → P15.
- QA físico de la nueva APK P15.
- QA financiero integral y aprobaciones comerciales pendientes del roadmap.
