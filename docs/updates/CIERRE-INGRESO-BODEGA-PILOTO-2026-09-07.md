# Cierre del tramo ingreso → bodega → piloto — 7 de septiembre de 2026

**Estado:** fusionado y subido a `main` en P16 (`47ada00`), P14 (`f123225`) y P13 (`d14306a`); despliegue en cPanel/Vercel pendiente de ejecución manual.

**Alcance:** seis órdenes de trabajo (OT-01 a OT-06) ejecutadas entre el 2 y el 7 de septiembre por ejecutores externos, cada una con revisión independiente posterior que corrió la suite completa y corrigió los defectos que la validación filtrada no detectó.

## Qué cierra esta entrega

El recorrido completo de un paquete desde que entra por cualquiera de las tres vías hasta que el piloto se lo lleva, con estado veraz y rastro auditable en cada paso.

### OT-01 — Tipo de pago por paquete

- Cada paquete del ingreso lleva su propio selector de tipo (contra entrega, post entrega, prepago, Mercado Libre); desaparece la modalidad única por ingreso.
- `pickup_packages` gana la columna `payment_type`; ambos endpoints de ingreso aceptan `packages.*.payment_type` y la materialización lo respeta por paquete, con respaldo para ingresos anteriores.
- Un contra entrega puede guardarse con monto pendiente; la guarda financiera impide despacharlo o entregarlo hasta definir el monto, cerrando el hueco por el que una guía quedaba «recaudada» por $0 e invisible para la conciliación.
- Defecto corregido en revisión: la guarda previa al despliegue de cPanel no declaraba la columna nueva; el contrato de columnas quedó alineado.

### OT-02 — Localidad automática

- La geocodificación deja de descartar la localidad que Google ya devolvía: se lee `sublocality_level_1`, se empareja contra el catálogo de zonas por slug y solo entre activas de Bogotá.
- Endpoints nuevos para detectar la localidad de una dirección suelta o de una guía, con modos sugerir y aplicar.
- En el ingreso, al salir del campo de dirección se propone la localidad detectada, siempre editable y sin pisar una elección manual.
- Causa raíz de la geocodificación muerta: PHP sin paquete de certificados (`curl error 60`); documentado en [geocoding-setup.md](../geocoding-setup.md).
- Defecto corregido en revisión: el normalizador guardaba las zonas sin tilde («Usaquen»), partiendo los agrupamientos por texto exacto; ahora la zona vuelve a su forma canónica del catálogo antes de guardarse y se repararon los registros afectados.

### OT-03 — Estado «Entregado al piloto»

- Estado nuevo `handed_to_driver` entre bodega y ruta; la entrega manual registra custodia **y** transición con evento en la línea de tiempo, idempotente y sin retroceder paquetes ya asignados o en ruta.
- Se elimina el parche de interfaz (`handedOverIds`) que ocultaba el botón con memoria del navegador y lo hacía reaparecer al recargar, con riesgo de doble entrega.
- Rutas deja de escribir el estado directo en la base: iniciar ruta, cerrar parada y crear ruta pasan por `TransitionShipmentStatus`.
- Defectos corregidos en revisión: el botón perdió los paquetes «Asignado a ruta» (bloqueaba la entrega en mostrador de rutas planificadas); iniciar ruta con un paquete aún en bodega lanzaba transición inválida (500); entregar sin haber iniciado la ruta se rechazaba — ahora se encadena o promueve como corresponde.

### OT-04 — Filtros de operación en Paquetes

- Pestañas «En bodega» y «Entregado al piloto»; rango de fechas con defecto de 7 días y «Ver todo» (antes la lista forzaba solo hoy, ocultando lo represado).
- El motivo del «geo pendiente» por fin se muestra en el detalle, distinguiendo coordenadas reales de aproximadas. Revisión: sin defectos.

### OT-05 y OT-06 — Pasos del paquete

- Tracker de cinco pasos (Recepción → En bodega → Con el piloto → En ruta → Entregado) que traduce los doce estados internos: en el detalle del panel (OT-05), y de cara al cliente en portal P14 y rastreo público P13 (OT-06), donde el paso 3 se etiqueta «Con el mensajero» sin exponer datos internos.
- Novedad = aviso ámbar sin mover el progreso, tomando el paso del `from_status` del último evento; devuelto/cancelado = final alternativo.
- Defectos corregidos en revisión (OT-05): con paso indeterminable el tracker pintaba «Recepción» activo con la luz de avance corriendo; el `Stepper` gana el modo `halted` para recorridos cerrados (entregado muestra cinco chulos, sin animación de avance).

## Renombres y guía impresa (misma ventana)

- Pantallas: «Envíos y guías» → **Paquetes**; «Ingreso de paquetes» → **Ingresos**; la vía `walk_in_at_hub` → **Mostrador**.
- La lista muestra la fecha de ingreso bajo cada guía con su antigüedad («2 sep · hace 3 días») para reconocer represados.
- La guía impresa gana el bloque **REMITENTE** (datos del ingreso con respaldo en el cliente maestro) y escapa los textos que antes rompían la impresión.

## Evidencia

- Backend: suite completa `php -d memory_limit=512M vendor/bin/phpunit` → 496 pruebas, 486 pasan, 0 fallos (los 10 errores restantes son la extensión GD ausente en la máquina local).
- Frontends P16 y P14: typecheck, lint y build de producción en verde; P13 verificado manualmente.
- La e2e nueva del tracker queda commiteada pero roja: el entorno Playwright no renderiza `/pedidos` desde antes de esta ventana (misma falla que la certificación); es deuda previa, no de esta entrega.

## Deudas que deja anotadas

1. Entorno e2e de P16 roto (las páginas no renderizan con el mock); sin red de seguridad de interfaz.
2. Máquina local: extensión GD ausente y `memory_limit` de 128M cortan la suite si no se ajustan.
3. P14 aún envía `is_cod` deducido del monto en su formulario de recogidas (el respaldo del backend lo cubre); migrarlo al contrato por paquete.
4. Tracker cliente: devuelto/cancelado no «cortan el recorrido» donde iba (falta usar la línea de tiempo que ya reciben).
5. Producción cPanel: verificar certificados CA de PHP como en local (`geocoding-setup.md`).
