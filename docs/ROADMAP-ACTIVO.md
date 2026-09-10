# Roadmap activo de Danhei

**Versión:** 1.7
**Fecha:** 10 de septiembre de 2026
**Estado:** activo
**Alcance:** pendientes priorizados de operación, finanzas, QA e integraciones
**Regla:** este es el único backlog documental vigente del ecosistema.

## Objetivo de la etapa

Cerrar el núcleo operativo y financiero sobre una entrada única de paquetes, con conciliaciones reconstruibles y sin depender todavía de integraciones externas.

## P0 — Obligatorio para declarar el núcleo listo

### OPS-00 — Entrada única de paquetes

**Avance:** dominio/API, panel P16 y portal cliente P14 implementados. El despliegue de P16 está confirmado en producción y el ingreso espontáneo ya tiene UAT focalizado aprobado; permanece el recorrido integral entre plataformas.

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
- [x] desplegar migraciones y validar el ingreso espontáneo P16 en producción (`88b9005`);
- [ ] ejecutar UAT integral P14 → P16 → P15.

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

**Avance:** desplegado en producción el 19/08 (`21dbb31`), API y frontend. Pasó una revisión de código de 10 hallazgos, todos corregidos antes del despliegue. Falta solo el QA visual.

- [x] distinguir reportado, disponible y transferido;
- [x] permitir selección de guías y transferencias parciales;
- [x] impedir pagar dinero todavía no disponible;
- [x] exigir cuenta destino en toda transferencia electrónica y congelarla en el movimiento;
- [x] admitir el comprobante del banco como adjunto posterior, con `sha256`, tipo, tamaño y autor;
- [x] mostrar cuántas transferencias vigentes siguen sin soporte;
- [ ] aprobar QA visual en escritorio y móvil.

**Cuenta destino (19/08):** se escribe a mano en cada transferencia y queda copiada en el movimiento, no referenciada. Si el cliente cambia de cuenta mañana, el comprobante viejo sigue diciendo a dónde fue el dinero aquel día. El número completo se guarda en base de datos —hace falta para auditar— pero al navegador solo viajan los últimos cuatro dígitos.

**Soporte (19/08):** opcional y en un segundo paso, con endpoint propio. Va aparte del pago por dos razones: no meter un archivo dentro de la petición idempotente que mueve dinero, y permitir registrar el movimiento cuando se pagó antes de tener el comprobante a mano. Lo que falta no se esconde: el movimiento se marca «Sin soporte» y la mesa muestra el total pendiente.

**Revisión del 19/08 (tarde):** la revisión de código corrigió, antes de desplegar: el comprobante bancario pasó al **disco privado** con descarga autenticada (publicarlo en `/storage` anulaba el enmascarado del número de cuenta); el snapshot de `AuditLog` al reversar recupera el número completo con `makeVisible`; el adjunto corre bajo transacción con lock; `method` se normaliza antes de validar y `destination_kind` es obligatoria en pagos electrónicos; la regla «sin soporte» quedó en **una sola fuente** (`needs_support` en el modelo) que consumen el contador, el badge, el CSV y el impreso; y el historial devuelve las 50 recientes más toda transferencia sin soporte, para que cada unidad del contador tenga fila desde la que resolverse. Contrato completo en [API-CONTRACTS.md](./API-CONTRACTS.md).

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

El ingreso espontáneo P16 quedó confirmado en producción el 28 de julio de 2026. Este cierre no sustituye el UAT integral de solicitudes multicanal, rutas, entregas y conciliaciones.

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

- [x] exponer comprobante de solo lectura para lotes conciliados;
- [x] incluir diferencias, custodio, sede, tercero que entrega y detalle por guía;
- [x] permitir impresión y guardado como PDF desde el panel;
- [ ] aprobar QA visual y validación integral en el entorno desplegado.

### OPS-02 — Evidencia de novedades

Foto obligatoria y causal para faltante, rechazo o diferencia de custodia.

- [x] validar causal y foto obligatoria en la conciliación administrativa y móvil;
- [x] persistir evidencia por ítem de recepción con hash, metadatos, origen y usuario;
- [x] exponer la evidencia en el comprobante interno sin alterar la custodia normal de paquetes recibidos;
- [ ] desplegar migración/API y aprobar UAT en producción.

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
- [x] integrar comprobante formal, reversos y apertura histórica definidos en FIN-05;
- [x] incorporar cuenta destino y soporte a la mesa y al comprobante (FIN-04);
- [ ] aprobar QA visual y funcional en escritorio y móvil.

> La integración de FIN-05 ya estaba hecha desde el 29/07 y este documento no lo recogía: `ReconciliationWorkspace` monta `OpeningBalancesPanel` y cada `MovementHistory` lleva su acción de reverso. Verificado leyendo el componente el 19/08.

### CRM-01 — Maestro de clientes y revisión de guías pendientes

**Avance:** cerrado en el frontend P16 y respaldado por el contrato API vigente. La entrega visual está publicada en producción con `222a828`.

- [x] separar contacto de cobro de empresa/razón social;
- [x] conservar nombre, teléfono y correo del contacto, junto con NIT y teléfono corporativo de la empresa;
- [x] permitir las tres preferencias de pago como información general no exclusiva;
- [x] admitir guías administrativas sin cliente maestro y enviarlas a revisión pendiente;
- [x] vincular posteriormente la guía al cliente correcto sin perder snapshot de remitente, historial ni movimientos COD;
- [x] archivar/restaurar clientes mediante soft delete;
- [x] reorganizar el detalle del cliente con cabecera, tarjetas de contexto, pestañas y métricas responsive;
- [x] cubrir el flujo principal con una regresión E2E.

**Cierre:** [CLIENTE-CONTACTO-REVISION-2026-07-30.md](./updates/CLIENTE-CONTACTO-REVISION-2026-07-30.md).

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

## OPS-05 — Rutas y conciliación del día (fase siguiente acordada)

**Contexto:** el tramo ingreso → bodega → piloto quedó cerrado el 07/09 (ver [updates/CIERRE-INGRESO-BODEGA-PILOTO-2026-09-07.md](./updates/CIERRE-INGRESO-BODEGA-PILOTO-2026-09-07.md)). Orden acordado con Diego: primero rutas, después conciliación de cierre de día.

- [x] tablero de despacho por localidad: selección de grupo completo, filtro por piloto y custodia visible (OT-07, 07/09);
- [x] convertir la propuesta de despacho en asignación real: `POST /routes/dispatch-proposals/apply`, idempotente y con eventos (OT-07, 07/09);
- [x] las paradas de tarea cuentan en el progreso y cierre de la salida (OT-07, 07/09; una tarea fallida bloquea el cierre automático a propósito hasta que la conciliación decida);
- [x] conciliación de fin de día (OT-F, 09/09): resumen por piloto, retorno a bodega atómico e idempotente y pantalla Cierre de día; certificado con el escenario real 15 salieron / 10 entregados / 5 devueltos, día conciliado y los cinco reapareciendo en el tablero. **OPS-05 queda cerrado.**


## OPS-06 — Ciclo de custodia por escaneo (cerrado en API el 09-10/09)

**Contexto:** acta en `P17/design-system/ARQUITECTURA-CORRELACION-ASIGNACION-CUSTODIA-2026-09-09.md`. Regla que gobierna: la asignación es una intención, la custodia es un hecho físico, y **el último escaneo manda**.

- [x] recepción por escaneo del piloto: validar sin mutar y confirmar atómico por paquete con idempotencia (OT-C, 09/09);
- [x] correlación asignación↔custodia: `checked`, `auto_assigned` y `transferred` con el piloto anterior (OT-G1, 10/09);
- [x] revisiones de custodia con **certificación de vista** por un operario, auditable y sin bloquear al piloto (OT-G1 + OT-G3);
- [x] devolución iniciada por el piloto (`POST /driver/returns`) y confirmación de sede como rastro, nunca compuerta (OT-G1);
- [x] panel: correlación visible por parada, bandeja de revisiones y custodia manual con motivo obligatorio (OT-G3, 09/09);
- [x] P15: botón central de escáner con tomar y devolver custodia (OT-G2, 09/09; rama `feat/boton-central-custodia`, pendiente de APK y QA físico);
- [ ] **UAT del ciclo completo con APK real** (OT-K genera el APK de QA; requiere teléfono en la red de la oficina);
- [ ] segunda ronda: decisión sobre tareas fallidas, `ISSUE → IN_WAREHOUSE` y variantes de devolución con novedad.

## OPS-07 — Ingreso: lo que el cliente declara vs. lo que llega (en curso)

**Contexto:** acta en `P17/design-system/ARQUITECTURA-PORTAL-CLIENTE-Y-CONCILIACION-2026-09-09.md`. El levantamiento confirmó que el 80% ya existía; el hueco real era el excedente físico, bloqueado en cuatro capas.

- [x] excedente en el mostrador (OT-J1, 10/09): resultado `undeclared` con contador propio, regla de cierre corregida, guía creada por la materialización existente y comprobante que dice esperados/recibidos/sin declarar. **La declaración del cliente nunca se reescribe.**
- [ ] OT-J2 · mostrador en el panel: conteo físico vs. declarado y alta del excedente con su formulario y foto;
- [ ] OT-J3 · seguimiento de la recogida para el cliente, estados en su lenguaje, cancelación propia, redirección por rol y atajo de acceso desde la ficha del cliente;
- [ ] OT-J4 · fotos por paquete en la solicitud (regla "dirección o foto") y ventana de recogida elegible.
## DT — Deudas técnicas vigentes (07/09)

- [x] entorno e2e de P16 reparado (OT-08, 07/09): el mock interceptaba 127.0.0.1 y la app usaba localhost; suite completa 46/46 en verde (docs/qa/REPARACION-ENTORNO-E2E-2026-09.md);
- [ ] máquina local: instalar extensión GD de PHP y subir `memory_limit` (128M corta la suite; usar `-d memory_limit=512M` mientras tanto);
- [x] P14 migrado al contrato `packages.*.payment_type` (OT-09, 07/09);
- [x] tracker cliente: devuelto/cancelado cortan el recorrido usando la línea de tiempo (OT-09, 07/09);
- [ ] producción cPanel: verificar certificados CA de PHP (`docs/geocoding-setup.md`) para que la geocodificación no caiga al ancla fija;
- [x] portal público `rastrear` de P14 pinta tracker y línea de tiempo (OT-09, 07/09).
- [x] (09/09, saldada el mismo día por dirección) los 20 specs e2e previos al rediseño v2 quedaron actualizados
  al markup actual (variante escritorio vs tarjetas móviles ocultas, tablero de OT-07, pestaña "Pago contra
  entrega", tokens v2 en lugar de clases dark legacy); batería completa en verde. El arreglo destapó y corrigió
  dos defectos reales: el botón "Revisar custodia"/"Iniciar" de /rutas aplastado a ancho cero en columnas de
  1280px, y el panel de historial de gastos/nómina de /pagos que la migración v2 dejó sin renderizar.
- [x] (09/09) decidido por Diego: la custodia manual del panel ("Pasar custodia al piloto") se conserva como
  respaldo con **selector de motivo** (3 fijos + "otro"); implementación en OT-G3. La "contraparte del
  mostrador" del flujo de escaneo quedó resuelta por la arquitectura de correlación: certificación de vista de
  las revisiones, sin bloquear al piloto. (El enlace de WhatsApp de cartera queda sin mensaje precargado a
  propósito — abre el chat y la persona escribe lo que necesita.)

## SEC — Pendiente de seguridad (07/09, requiere a Diego)

- [ ] rotar o restringir la llave de Google Maps de Android de P15: estuvo escrita en `app.json` del historial público desde el 18/06 y la purga de agosto no la alcanzó; la rama del escáner la movió a `.env` (`GOOGLE_MAPS_ANDROID_KEY` vía `app.config.js`), pero el historial la conserva. Restringir por paquete y huella SHA-1 o regenerarla en la consola de Google Cloud.
