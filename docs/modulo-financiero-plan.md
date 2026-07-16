# Plan de cierre del sistema financiero Danhei

**Versión:** 2.0
**Última revisión:** 15 de julio de 2026
**Estado:** activo
**Reemplaza:** plan financiero preliminar anterior a los libros de conciliación del 12 de julio

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

- causación individual por guía/concepto;
- monto ganado, pagado y pendiente;
- pagos parciales y asignaciones;
- separación estricta frente al COD.

### Libro COD del cliente

- monto reportado;
- monto disponible después de recibir/verificar fondos;
- monto transferido;
- saldo pendiente de transferencia;
- pagos parciales asignables por guía.

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

## 4. Reglas por aprobar

| Regla | Propuesta predeterminada |
|---|---|
| Asignación automática de abonos | FIFO por obligación más antigua. |
| Selección manual | Permitida por guía o conjunto de guías. |
| Pago parcial | Permitido sin cerrar el saldo restante. |
| Compensación COD/servicios | Prohibida automáticamente. Un cruce autorizado crea dos movimientos. |
| Edición de saldos | Prohibida. Se usan ajustes o reversos. |
| Dinero disponible al cliente | Solo después de recepción física o verificación electrónica. |
| Valores monetarios | Enteros en pesos colombianos. |
| Tarifa | Regla con vigencia; nunca valor fijo escondido en frontend. |
| Cierre | Por paquete, selección, día o periodo, siempre con detalle por guía. |

Decisiones de negocio pendientes:

- tarifa de entrega;
- tarifa de recogida;
- tarifa de devolución completa o parcial;
- diferencias por piloto, cliente, zona o fecha;
- montos que exigen doble aprobación;
- mecanismo de confirmación del cliente;
- política de retención de comprobantes.

## 5. Trabajo pendiente

### FIN-UI-01 — Conciliación COD del piloto

La pantalla debe mostrar y permitir seleccionar:

- guía, fecha, cliente y monto COD;
- cobrado, remitido y pendiente;
- método, referencia y notas;
- abono por paquete o monto general;
- distribución propuesta antes de confirmar.

### FIN-UI-02 — Pago de servicios al piloto

- conceptos causados por guía;
- tarifa aplicada y vigencia;
- pagos anteriores y saldo;
- pago total, parcial o por selección.

### FIN-UI-03 — Liquidación al cliente

- reportado, disponible, transferido y pendiente;
- guías que respaldan cada saldo;
- transferencia total o parcial;
- cuenta destino y referencia.

### FIN-DOC-01 — Comprobantes

Cada remesa o pago debe generar:

- consecutivo;
- tercero y periodo;
- líneas asignadas;
- saldo anterior, movimiento y saldo posterior;
- método, referencia, usuario y fecha;
- PDF imprimible y CSV.

### FIN-CTRL-01 — Reversos y aprobaciones

- movimiento inverso relacionado con el original;
- motivo obligatorio;
- permisos separados para registrar, aprobar y anular;
- bloqueo de concurrencia e idempotencia.

### FIN-CTRL-02 — Asignación completa y sin duplicados

La implementación actual ordena las líneas por fecha e ID y aplica FIFO cuando no se envían asignaciones. La revisión detectó controles que deben cerrarse antes de UAT financiero:

- un pago mayor al saldo puede quedar parcialmente sin asignar sin clasificación contable explícita;
- una solicitud puede repetir el mismo ID dentro de `allocations` y validar cada entrada contra el saldo anterior;
- los endpoints financieros todavía necesitan una llave idempotente de operación.

Para la primera versión se adopta una regla única: rechazar atómicamente cuando `amount` no coincida con la suma asignada, impedir IDs duplicados y exigir idempotencia. No se permite guardar un remanente implícito.

Una cuenta formal de efectivo o pago sin aplicar podrá evaluarse después como función independiente. Si se incorpora, necesitará libro, permisos, asignación posterior, comprobantes y conciliación propios; no será una excepción silenciosa a esta regla.

### FIN-DATA-01 — Apertura histórica

Registrar el “día cero” sin inventar entregas:

- saldo COD por piloto;
- saldo de servicios por piloto;
- saldo COD por cliente;
- fecha de corte, soporte y aprobador;
- previsualización y total de control antes de confirmar.

## 6. Casos de aceptación

1. Diez guías de COP 10.000 generan COP 100.000 de obligación COD.
2. Una remesa de COP 80.000 deja COP 20.000 abiertos y asignados de forma visible.
3. Un segundo abono puede aplicarse parcialmente a una guía restante.
4. Servicios por COP 35.000 con pago de COP 20.000 dejan COP 15.000 pendientes.
5. Ningún pago de servicios reduce el COD del piloto.
6. El cliente solo puede recibir hasta el saldo disponible.
7. Un doble envío no duplica movimientos.
8. Un reverso conserva el movimiento original.
9. P15 y P16 muestran los mismos totales del piloto.
10. La suma de líneas coincide con cada saldo agregado.
11. Un pago superior al saldo se rechaza y no deja dinero sin clasificar.
12. Una asignación con IDs repetidos se rechaza.
13. Repetir la misma solicitud idempotente devuelve el mismo movimiento.

## 7. Orden de implementación

1. aprobar reglas y tarifas;
2. implementar FIN-UI-01 a FIN-UI-03;
3. implementar comprobantes y controles;
4. preparar apertura histórica;
5. pruebas backend y E2E;
6. UAT con un piloto y un cliente;
7. rollout progresivo.

## 8. Fuera del cierre inmediato

- integración productiva con Nequi;
- facturación electrónica;
- nómina legal;
- compensación automática entre cuentas;
- ajustes directos sin auditoría.
