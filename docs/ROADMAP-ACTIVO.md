# Roadmap activo de Danhei

**Versión:** 1.0

**Fecha:** 15 de julio de 2026

**Estado:** activo

**Alcance:** pendientes priorizados de operación, finanzas, QA e integraciones

**Regla:** este es el único backlog documental vigente del ecosistema.

## Objetivo de la etapa

Unificar primero el ingreso físico de paquetes, cerrar después el sistema financiero y validar el recorrido operativo completo antes de activar integraciones externas o ampliar el producto.

## P0 — Obligatorio para declarar el núcleo listo

### OPS-00 — Entrada única de paquetes

**Avance:** fases 1 (dominio/API) y 2 (panel P16) implementadas y verificadas automáticamente en local; todavía no publicadas. El QA visual de P16 queda a cargo del responsable funcional.

- [x] separar forma de ingreso y ejecutor en el dominio;
- [x] admitir piloto, empleado Danhei, operador de sede y recolector autorizado;
- [x] agregar paquetes con idempotencia antes de cerrar la recepción;
- [x] garantizar una guía por paquete mediante bloqueo transaccional;
- [x] resolver el ingreso espontáneo de mostrador en una sola operación atómica;
- [x] conservar identidad del tercero y cadena de custodia;
- [x] reemplazar los caminos paralelos de “Nuevo pedido” y “Solicitar recogida” por un asistente único en P16;
- [x] incorporar en P16 las tres vías, múltiples paquetes, recepción inmediata, asignación a empleado, filtros y materialización selectiva;
- [ ] aprobar QA visual de P16 en escritorio y móvil;
- [ ] migrar P14 al mismo contrato;
- [ ] retirar la creación directa de guías para roles normales después de migrar las pantallas;
- [ ] desplegar migraciones y ejecutar UAT integral.

**Cierre:** se cumplen los casos de aceptación de [PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md](./PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md).

### FIN-01 — Reglas financieras configurables

- definir tarifa de entrega, recogida y devolución;
- definir vigencia por piloto, cliente, zona o fecha;
- mantener separadas obligación COD, remuneración del piloto y cuenta del cliente;
- definir FIFO como asignación automática predeterminada y permitir selección manual.

**Cierre:** reglas aprobadas, versionadas y cubiertas por pruebas.

### FIN-02 — Conciliación COD del piloto

- mostrar obligaciones por guía;
- permitir abono total o parcial;
- seleccionar paquetes o agrupar por día;
- conservar saldo pendiente y referencia del pago.

**Cierre:** un recaudo de COP 100.000 con entrega de COP 80.000 conserva COP 20.000 pendientes y trazables.

### FIN-03 — Pago de servicios al piloto

- mostrar causación por paquete y concepto;
- permitir pago total o parcial;
- prohibir compensación automática con COD.

**Cierre:** una causación de COP 35.000 con pago de COP 20.000 conserva COP 15.000 pendientes.

### FIN-04 — Liquidación COD al cliente

- distinguir reportado, disponible y transferido;
- permitir selección de guías y transferencias parciales;
- impedir pagar dinero todavía no disponible.

**Cierre:** el saldo se reconstruye únicamente desde movimientos asignados.

### FIN-05 — Comprobantes, reversos y apertura

- consecutivo y comprobante PDF/CSV;
- anulación mediante movimiento inverso, sin borrar historia;
- asiento de apertura para saldos del día cero;
- permisos para registrar, aprobar y anular.

**Cierre:** cada saldo tiene soporte y cada corrección conserva el original.

### FIN-06 — Invariantes de asignación e idempotencia

- rechazar atómicamente, en la primera versión, cualquier operación cuyo monto no quede asignado por completo;
- rechazar líneas duplicadas en una misma solicitud de asignación;
- impedir que la suma asignada a una línea supere su saldo aunque el identificador se repita;
- usar una llave idempotente para remesas, pagos de servicios y pagos al cliente;
- probar concurrencia y doble envío.

**Cierre:** ningún reintento, duplicado o remanente puede alterar silenciosamente los libros.

Una cuenta de pagos sin aplicar queda fuera de este cierre y solo podrá añadirse como libro explícito en una fase posterior.

### QA-01 — UAT del panel P16

- solicitudes multicanal;
- asignación y recepción;
- devolución y custodia;
- conciliaciones parciales;
- escritorio y móvil.

### MOB-01 — Nueva APK P15

- incrementar versión y `versionCode`;
- generar APK con los commits de recogidas/conciliación;
- instalar en Android real;
- validar entrega, recogida, recaudo, corte de red y continuidad del día.

## P1 — Cierre operativo

### OPS-01 — Comprobante de recepción

Documento descargable con lote, paquetes, diferencias, custodio, sede y fecha.

### OPS-02 — Evidencia de novedades

Foto obligatoria y causal para faltante, rechazo o diferencia de custodia.

### OPS-03 — Confirmación de cliente

Definir firma, OTP o confirmación equivalente para entrega/recogida cuando aplique.

### QA-02 — Prueba integral

Recorrido P14 → P16 → P15 → entrega/recogida → conciliación piloto → liquidación cliente.

Checklist: [qa/UAT-ECOSISTEMA-2026-07-15.md](./qa/UAT-ECOSISTEMA-2026-07-15.md).

## P2 — Mejoras posteriores

- monitoreo GPS e historial operativo enriquecidos;
- alertas de vencimiento documental;
- filtros avanzados e informes financieros;
- hardening adicional de autenticación y despliegue;
- evaluación de navegación embebida.

## Bloqueados por terceros

### EXT-01 — WhatsApp

No iniciar activación productiva hasta tener autorización Meta, credenciales, webhook firmado y sandbox aprobado.

### EXT-02 — Nequi

El QR dinámico real requiere proveedor autorizado, referencias únicas, webhook y conciliación bancaria. El simulador actual es únicamente de pruebas.

## Orden de ejecución

1. OPS-00.
2. FIN-01 a FIN-06.
3. QA-01.
4. MOB-01.
5. OPS-01 a OPS-03.
6. QA-02.
7. P2 e integraciones externas.
