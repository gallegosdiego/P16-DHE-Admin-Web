# Plan de cierre del sistema financiero Danhei

**Versión:** 2.1
**Última revisión:** 16 de julio de 2026
**Estado:** activo

## 1. Objetivo

Cerrar un sistema financiero reconstruible por guía, capaz de responder sin ambigüedad:

1. cuánto COD debe entregar cada piloto a Danhei;
2. cuánto debe pagar Danhei al piloto por sus servicios;
3. cuánto COD está reportado, disponible y pendiente de transferir a cada cliente.

Estas tres cuentas son independientes y nunca se compensan automáticamente.

## 2. Estado implementado

### Libro COD del piloto

- obligación individual por guía entregada;
- monto cobrado, remitido y pendiente;
- abonos parciales;
- asignaciones explícitas a obligaciones;
- resumen disponible para P16 y P15.

### Libro de servicios del piloto

- causación individual por guía y concepto;
- monto ganado, pagado y pendiente;
- pagos parciales y asignaciones;
- separación estricta frente al COD.

### Libro COD del cliente

- monto reportado;
- monto disponible después de recibir o verificar fondos;
- monto transferido;
- saldo pendiente de transferencia;
- pagos parciales asignables por guía.

### Controles backend cerrados el 16 de julio de 2026

- ninguna operación puede dejar remanentes silenciosos;
- no se permiten IDs duplicados dentro de una asignación manual;
- no se permite asignar por encima del saldo real;
- remesas, pagos de servicios y pagos al cliente requieren `Idempotency-Key`.
- la colisión por dos inserciones simultáneas se recupera releyendo el registro ganador;

### Reglas de remuneración cerradas el 16 de julio de 2026

- tarifa fija en COP para entrega, recogida, devolución a sede y devolución al cliente;
- alcance global, por piloto, cliente o zona, con prioridad y vigencia;
- cada cambio crea una versión con motivo, usuario aprobador y auditoría;
- cada causación conserva regla, tarifa estándar y snapshot, por lo que el histórico no se recalcula;
- una entrega conserva compatibilidad con `shipment.driver_fee` y `driver.per_package_rate` cuando todavía no existe regla;
- una recogida o devolución sin regla aprobada no genera remuneración automática.

### Pagos digitales

- intención de pago con identificador público, monto, vencimiento y payload QR;
- simulación de verificación limitada a pruebas;
- sin integración bancaria productiva.

## 3. Modelo contable operativo

```text
Entrega COD
  ├─ crea obligación del piloto a Danhei
  ├─ crea causación del servicio del piloto
  └─ reporta derecho COD del cliente

Recepción de dinero en Danhei
  ├─ aplica abono a obligaciones del piloto
  └─ habilita el mismo valor en la cuenta del cliente

Pago al piloto
  └─ aplica únicamente a causaciones de servicios

Transferencia al cliente
  └─ aplica únicamente a COD disponible
```

## 4. Reglas vigentes

| Regla | Estado |
|---|---|
| Asignación automática de abonos | FIFO por obligación más antigua. |
| Selección manual | Permitida por guía o conjunto de guías. |
| Pago parcial | Permitido sin cerrar el saldo restante. |
| Compensación COD/servicios | Prohibida automáticamente. |
| Edición de saldos | Prohibida. Se usan ajustes o reversos. |
| Dinero disponible al cliente | Solo después de recepción física o verificación electrónica. |
| Valores monetarios | Enteros en pesos colombianos. |
| Idempotencia | Obligatoria en movimientos financieros. |
| Cierre | Por paquete, selección, día o periodo, siempre con detalle por guía. |

## 5. Estado de interfaz y trabajo pendiente

### FIN-UI-01 — Conciliación COD del piloto en P16

**Estado:** primera versión implementada localmente.

- muestra guía, fecha y monto COD;
- separa cobrado, remitido y pendiente;
- captura método, referencia y notas;
- permite abono por selección o monto general FIFO;
- muestra el total que se registrará antes de confirmar.

### FIN-UI-02 — Pago de servicios al piloto en P16

**Estado:** primera versión implementada localmente.

- conceptos causados por guía;
- tarifa aplicada y vigencia;
- pagos anteriores y saldo;
- pago total, parcial o por selección.

La tarifa y su vigencia se administran en `/configuracion`. Cada línea muestra la regla/version aplicada o identifica explícitamente el origen legacy/manual.

### FIN-UI-03 — Liquidación al cliente en P16

**Estado:** primera versión implementada localmente.

- reportado, disponible, transferido y pendiente;
- guías que respaldan cada saldo;
- transferencia total o parcial;
- cuenta destino y referencia.

La referencia ya se registra. Falta enriquecer y validar la cuenta destino antes del cierre productivo.

### FIN-DOC-01 — Comprobantes

**Estado:** versión formal implementada localmente con historial, impresión/guardado PDF, CSV y saldos persistidos.

- [x] consecutivo;
- [x] tercero y periodo;
- [x] líneas asignadas;
- [x] método, referencia, usuario y fecha;
- [x] impresión/guardado PDF y CSV;
- [x] saldo anterior, movimiento y saldo posterior persistidos en el comprobante formal.

### FIN-CTRL-01 — Reversos y aprobaciones

- [x] movimiento inverso relacionado con el original;
- [x] motivo obligatorio;
- [x] permisos separados para registrar, reversar y crear apertura;
- [x] bloqueo transaccional e idempotencia;
- [x] prohibición de reversar una remesa cuando el cliente ya recibió fondos asociados;
- [ ] decidir si producción exige doble aprobación por usuarios distintos.

### FIN-DATA-01 — Apertura histórica

Registrar el “día cero” sin inventar entregas:

- [x] saldo COD por piloto;
- [x] saldo de servicios por piloto;
- [x] saldo COD disponible por cliente;
- [x] fecha de corte, soporte y aprobador;
- [x] integración de la apertura con los pagos y asignaciones normales;
- [ ] QA visual y total de control previo en ambiente publicado.

## 6. Casos de aceptación

1. Diez guías de COP 10.000 generan COP 100.000 de obligación COD.
2. Una remesa de COP 80.000 deja COP 20.000 abiertos y asignados de forma visible.
3. Un segundo abono puede aplicarse parcialmente a una guía restante.
4. Servicios por COP 35.000 con pago de COP 20.000 dejan COP 15.000 pendientes.
5. Ningún pago de servicios reduce el COD del piloto.
6. El cliente solo puede recibir hasta el saldo disponible.
7. Un doble envío idempotente no duplica movimientos.
8. Un reverso conserva el movimiento original.
9. P15 y P16 muestran los mismos totales del piloto.
10. La suma de líneas coincide con cada saldo agregado.
11. Un pago superior al saldo se rechaza y no deja dinero sin clasificar.
12. Una asignación con IDs repetidos se rechaza.
13. La prueba de estrés concurrente en MySQL/MariaDB confirma que dos solicitudes simultáneas devuelven un único movimiento.

## 7. Orden de implementación

1. aprobar los valores comerciales cargados en las reglas y ejecutar QA de `/configuracion`;
2. aprobar en QA FIN-UI-01 a FIN-UI-03;
3. aprobar en QA comprobantes, reversos y apertura histórica;
4. decidir la política de doble aprobación y enriquecer cuenta destino;
5. ejecutar estrés concurrente en MySQL/MariaDB;
6. UAT con un piloto y un cliente;
7. rollout progresivo.

## 8. Fuera del cierre inmediato

- integración productiva con Nequi;
- facturación electrónica;
- nómina legal;
- compensación automática entre cuentas;
- ajustes directos sin auditoría.
