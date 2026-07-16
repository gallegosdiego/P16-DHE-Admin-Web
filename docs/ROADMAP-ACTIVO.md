# Roadmap activo de Danhei

**Versión:** 1.1
**Fecha:** 16 de julio de 2026
**Estado:** activo
**Alcance:** pendientes priorizados de operación, finanzas, QA e integraciones
**Regla:** este es el único backlog documental vigente del ecosistema.

## Objetivo de la etapa

Cerrar el núcleo operativo y financiero sobre una entrada única de paquetes, con conciliaciones reconstruibles y sin depender todavía de integraciones externas.

## P0 — Obligatorio para declarar el núcleo listo

### OPS-00 — Entrada única de paquetes

**Avance:** dominio/API, panel P16 y portal cliente P14 implementados y validados localmente. El QA visual y el despliegue final siguen fuera de este documento porque dependen del responsable funcional y del flujo de publicación.

- [x] separar forma de ingreso y ejecutor en el dominio;
- [x] admitir piloto, empleado Danhei, operador de sede y recolector autorizado;
- [x] agregar paquetes con idempotencia antes de cerrar la recepción;
- [x] garantizar una guía por paquete mediante bloqueo transaccional;
- [x] resolver el ingreso espontáneo de mostrador en una sola operación atómica;
- [x] conservar identidad del tercero y cadena de custodia;
- [x] reemplazar los caminos paralelos de “Nuevo pedido” y “Solicitar recogida” por un asistente único en P16;
- [x] incorporar en P16 las tres vías, múltiples paquetes, recepción inmediata, asignación a empleado, filtros y materialización selectiva;
- [x] migrar P14 al mismo contrato y retirar la creación directa de guías del recorrido normal del cliente;
- [ ] aprobar QA visual de P16 y P14 en escritorio y móvil;
- [ ] desplegar migraciones y ejecutar UAT integral.

**Cierre:** se cumplen los casos de aceptación de [PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md](./PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md).

### FIN-01 — Reglas financieras configurables

**Avance:** reglas de remuneración, versionado, permisos, auditoría y panel administrativo implementados localmente. Falta QA visual y la aprobación comercial de valores reales.

- [x] definir tarifa fija en COP para entrega, recogida, devolución a sede y devolución al cliente;
- [x] resolver vigencia con alcance global, por piloto, cliente o zona;
- [x] conservar versiones, motivo, aprobador y snapshot inmutable en la causación;
- [x] mantener separadas obligación COD, remuneración del piloto y cuenta del cliente;
- [x] definir FIFO como asignación automática predeterminada y permitir selección manual;
- [x] no inventar remuneración para recogidas o devoluciones sin regla aprobada;
- [ ] aprobar valores comerciales y ejecutar QA visual en `/configuracion`.

**Cierre:** reglas aprobadas, versionadas y cubiertas por pruebas.

### FIN-02 — Conciliación COD del piloto

**Avance:** libro backend, primera interfaz P16 e historial con comprobante básico implementados localmente. Falta QA visual/funcional.

- mostrar obligaciones por guía;
- permitir abono total o parcial;
- seleccionar paquetes o agrupar por día;
- conservar saldo pendiente y referencia del pago.

**Cierre:** un recaudo de COP 100.000 con entrega de COP 80.000 conserva COP 20.000 pendientes y trazables.

### FIN-03 — Pago de servicios al piloto

**Avance:** libro backend, primera interfaz P16 e historial con comprobante básico implementados localmente. Falta QA visual/funcional.

- mostrar causación por paquete y concepto;
- permitir pago total o parcial;
- prohibir compensación automática con COD.

**Cierre:** una causación de COP 35.000 con pago de COP 20.000 conserva COP 15.000 pendientes.

### FIN-04 — Liquidación COD al cliente

**Avance:** libro backend, primera interfaz P16 e historial con comprobante básico implementados localmente. Falta QA y cuenta destino enriquecida.

- distinguir reportado, disponible y transferido;
- permitir selección de guías y transferencias parciales;
- impedir pagar dinero todavía no disponible.

**Cierre:** el saldo se reconstruye únicamente desde movimientos asignados.

### FIN-05 — Comprobantes, reversos y apertura

**Avance:** comprobantes formales, reversos completos y apertura histórica implementados localmente. Falta QA visual y definir si producción exigirá doble aprobación por personas distintas.

- [x] consecutivo e historial por movimiento;
- [x] comprobante básico imprimible/guardable como PDF y CSV;
- [x] incorporar saldo anterior, efecto y saldo posterior al comprobante formal;
- [x] anulación mediante movimiento inverso, sin borrar historia;
- [x] bloquear el reverso de COD cuando el cliente ya recibió los fondos asociados;
- [x] asiento de apertura para saldos del día cero sin inventar guías;
- [x] permisos dedicados `financial.reverse` y `financial.opening`;
- [ ] decidir y, si se exige, implementar doble aprobación por usuarios distintos.

**Cierre:** cada saldo tiene soporte y cada corrección conserva el original.

### FIN-06 — Invariantes de asignación e idempotencia

**Avance:** invariantes e idempotencia secuencial cerradas en backend. Falta una prueba de estrés concurrente sobre el motor de base de datos usado en producción.

- [x] rechazar atómicamente cualquier operación cuyo monto no quede asignado por completo;
- [x] rechazar líneas duplicadas en una misma solicitud de asignación;
- [x] impedir que un monto exceda el saldo real disponible;
- [x] usar una llave idempotente para remesas, pagos de servicios y pagos al cliente;
- [x] cubrir reintento, llave reutilizada y asignaciones inválidas con pruebas backend;
- [ ] ejecutar una prueba concurrente real contra MySQL/MariaDB antes del UAT financiero final.

**Pendiente menor posterior:** si se agrega una cuenta de dinero sin aplicar, deberá modelarse como un libro explícito y no como una excepción silenciosa.

### QA-01 — UAT del panel P16

- solicitudes multicanal;
- asignación y recepción;
- devoluciones y custodia;
- conciliaciones parciales;
- escritorio y móvil.

### MOB-01 — Nueva APK P15

- incrementar versión y `versionCode`;
- generar APK con los commits de recogidas y conciliación;
- instalar en Android real;
- validar entrega, recogida, recaudo, corte de red y continuidad del día.

## P1 — Cierre operativo

### OPS-01 — Comprobante de recepción

Documento descargable con lote, paquetes, diferencias, custodio, sede y fecha.

### OPS-02 — Evidencia de novedades

Foto obligatoria y causal para faltante, rechazo o diferencia de custodia.

### OPS-03 — Confirmación de cliente

Definir firma, OTP o confirmación equivalente para entrega o recogida cuando aplique.

### FIN-UI-01 — Renovación del módulo administrativo de pagos

**Avance:** primera versión operativa implementada localmente. Las secciones legacy permanecen como reportes auxiliares mientras se completa el cierre financiero.

- [x] abrir `/pagos` en una mesa basada en `driver-reconciliations` y `client-ledger`;
- [x] permitir selección manual de líneas y distribución FIFO;
- [x] diferenciar claramente:
  - COD que el piloto debe remitir;
  - servicios que Danhei debe pagar;
  - COD disponible para transferir al cliente;
- [x] mantener trazabilidad por guía y por periodo;
- [x] enviar movimientos con llave idempotente y reintento seguro;
- [x] mostrar historial y comprobante básico PDF/CSV;
- [ ] aprobar QA visual y funcional en escritorio y móvil;
- [ ] integrar comprobante formal, reversos y apertura histórica definidos en FIN-05.

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

1. QA visual y UAT de OPS-00, FIN-01 y FIN-UI-01.
2. QA visual de comprobantes, reversos y apertura de FIN-05.
3. Definir doble aprobación y cuenta destino enriquecida.
4. Prueba concurrente pendiente de FIN-06.
5. MOB-01.
6. OPS-01 a OPS-03.
7. QA-02.
8. P2 e integraciones externas.
