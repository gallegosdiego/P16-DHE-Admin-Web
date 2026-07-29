# OPS-02 — Evidencia de novedades en recepción

Fecha: 2026-07-29

## Alcance

La recepción normal no cambia: un paquete marcado como `received` conserva su flujo de guía y custodia. Cuando la conciliación registra un `missing`, un `rejected` o una diferencia física (`physical_condition=observed_damage`), el cierre exige una causal (`exception_code`) y una fotografía.

La regla aplica a los dos puntos de entrada:

- P16: conciliación administrativa en `/api/operational-pickup-batches/{id}/reconcile` y al completar un ingreso presencial.
- P15: conciliación de la recogida del piloto en `/api/driver/pickup-batches/{id}/reconcile`; la app captura la imagen antes de permitir cerrar.

## Persistencia y trazabilidad

Cada foto se guarda en `pickup_batch_item_evidence`, vinculada al ítem del lote, con SHA-256, MIME, tamaño, dimensiones, origen (`admin` o `mobile`), usuario, fecha de recepción y ruta pública. El comprobante de recepción devuelve la evidencia asociada por paquete para revisión interna.

No se crean guías, pagos ni eventos de custodia adicionales por guardar la foto. Si una transacción falla después de guardar el archivo, el servicio elimina la ruta temporal para no dejar artefactos huérfanos.

## Despliegue y UAT

1. Integrar el cambio en `main` de P16 y el ajuste de P15.
2. Ejecutar en cPanel el despliegue consolidado; incluye `2026_07_29_110000_create_pickup_batch_item_evidence_table.php`.
3. Comprobar `deploy-cpanel.last-success` con el SHA desplegado y consultar el runtime check.
4. Verificar en UAT: recepción normal sin foto, faltante sin foto (debe rechazar), faltante con foto y causal (debe cerrar), rechazo con foto, daño físico con foto y comprobante con enlace de evidencia.

Estado: implementación local validada; pendiente integración, despliegue manual de cPanel y QA visual en dispositivos reales.
