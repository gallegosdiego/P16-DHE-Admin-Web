# Fase 8 — Comprobante de recepción

**Estado:** implementado localmente; pendiente QA visual y validación integral en el entorno desplegado.

## Objetivo

Cerrar la primera etapa de ingreso y custodia con un comprobante interno que permita demostrar qué lote se recibió, en qué sede, quién lo recibió físicamente y qué resultado tuvo cada paquete.

## Alcance

- Se agregó `GET /api/operational-pickup-batches/{id}/receipt`.
- La ruta requiere `intakes.receive` y es de solo lectura.
- Un lote abierto o en conciliación no puede generar un comprobante final.
- El payload incluye solicitud, cliente/remitente comercial, sede, custodio, tercero que entregó, fecha de cierre, totales y detalle de guías.
- Se distinguen recepciones completas de recepciones con diferencias.
- El panel de `Ingreso de paquetes` permite consultar el comprobante y abrir una vista imprimible para guardarlo como PDF desde el navegador.
- Los valores del detalle se escapan antes de construir el documento imprimible.

## Invariantes

1. Consultar o imprimir no crea una guía, recepción ni evento de custodia.
2. Las diferencias (`rejected` y `missing`) permanecen visibles con causal y observación.
3. La identidad de `received_by` sigue siendo la persona que recibió físicamente, separada del usuario que ejecutó la petición cuando el flujo lo permita.
4. La salida no se ofrece a clientes ni pilotos porque el permiso de recepción es interno.

## Validación local

- `php artisan test --filter='UnifiedIntakeApiTest'`: **11/11**.
- `npm run typecheck`: correcto.
- `npm run lint`: correcto.

## Pendiente de QA

- Abrir un ingreso completado y uno con diferencias desde `/recogidas`.
- Consultar **Ver comprobante** y comprobar que el navegador permite **Guardar como PDF**.
- Confirmar que un lote en conciliación informa que aún no hay comprobante final.
- Verificar escritorio y móvil sin modificar la APK 4.2.22 que está en QA.
