# Estado actual del ecosistema Danhei

**Corte:** 16 de julio de 2026
**Estado general:** núcleo operativo funcional, primera interfaz financiera implementada y cierre visual/UAT aún pendiente
**Alcance:** estado comprobado de P13, P14, P15, P16 e integraciones aisladas

## Resumen ejecutivo

Danhei ya opera como un ecosistema conectado: P14 crea ingresos y consulta guías, P16 administra la operación y concentra la API, y P15 ejecuta tareas de piloto. WhatsApp y Nequi productivo siguen fuera de la ruta crítica.

Durante el corte del 16 de julio se cerraron dos frentes que seguían abiertos desde código:

- P14 quedó migrado al ingreso unificado y dejó de crear guías nuevas desde el recorrido normal del cliente.
- El backend financiero cerró sus invariantes de asignación e idempotencia para remesas, pagos al piloto y pagos al cliente.
- P16 incorporó una primera mesa de conciliación por guía para las tres cuentas financieras independientes.
- P16 incorporó reglas de remuneración versionadas para entregas, recogidas y devoluciones, con alcance, vigencia, aprobación y trazabilidad histórica.

## Estado por producto

| Producto | Rama | Estado |
|---|---|---|
| P13 Landing | `dev` | Sitio público estable; fuera del bloque financiero inmediato. |
| P14 Cliente | `main` | Ingreso unificado activo; `/envios` queda como consulta y detalle. |
| P15 Piloto | `main` | Código de recogidas, tareas mixtas y conciliación disponible; falta nueva APK y QA físico. |
| P16 Admin/API | `main` + cambios locales validados | Base operativa lista, mesa de conciliación en `/pagos` y reglas financieras en `/configuracion`; faltan QA, comprobantes y controles de cierre. |

## Capacidades cerradas

- identidades de usuarios, clientes y pilotos preservadas;
- limpieza segura de datos operativos en entornos de prueba;
- WhatsApp protegido por banderas y fuera de la ruta crítica;
- tres modalidades de ingreso: recogida en cliente, entrega planificada e ingreso espontáneo en sede;
- tareas operativas y rutas mixtas;
- conciliación física de paquetes recibidos, faltantes o rechazados;
- cadena de custodia;
- intentos de entrega y evidencia;
- obligaciones COD del piloto por guía;
- remuneración del piloto separada del COD;
- derecho COD del cliente separado y transferible parcialmente;
- reglas backend que rechazan duplicados, remanentes y sobreasignaciones;
- idempotencia en pickup intake y en movimientos financieros, con recuperación de colisión concurrente implementada y prueba de estrés MySQL/MariaDB aún pendiente;
- intención de pago QR simulada para pruebas;
- interfaces base P14 y P16 alineadas con el flujo de ingreso unificado;
- mesa administrativa P16 para remesa COD, pago de servicios y liquidación al cliente por selección o distribución FIFO;
- historial de remesas, pagos y transferencias con comprobante imprimible/guardable como PDF y descarga CSV;
- reglas fijas en COP para remunerar entrega, recogida y devolución, con alcance global/piloto/cliente/zona, vigencias y versiones auditadas;
- causaciones de servicio con regla, tarifa estándar y snapshot histórico; las recogidas y devoluciones sin regla aprobada no generan un valor inventado;
- comprobantes financieros con saldo anterior, movimiento y saldo posterior persistidos;
- reversos como movimientos inversos auditables, sin eliminación de historia y con bloqueo si el COD ya fue transferido al cliente;
- apertura histórica de COD del piloto, servicios del piloto o COD disponible del cliente sin guías ficticias;
- resumen de conciliación visible para el piloto en P15.

## Pendientes reales

### P0 — QA visual y UAT operativo

- aprobar escritorio y móvil para P14 y P16;
- ejecutar UAT completo del ingreso unificado;
- desplegar migraciones y validar continuidad del flujo en entorno publicado.

### P0 — Cierre financiero administrativo

`/pagos` ya abre en una mesa de conciliación basada en `driver-reconciliations` y `client-ledger`. Permite elegir guías, asignar montos manualmente o por FIFO y mantiene separadas las tres cuentas.

Falta cerrar:

- QA visual y funcional de la nueva mesa en escritorio y móvil;
- aprobación comercial de los valores reales y QA visual de las reglas tarifarias;
- QA visual de comprobantes, reversos y apertura histórica;
- decisión sobre doble aprobación por personas distintas; actualmente cada movimiento queda aprobado por el usuario autorizado que lo registra;
- cuenta destino y soporte enriquecido para transferencias al cliente;
- prueba concurrente real de idempotencia en MySQL/MariaDB.

### P0 — Release móvil

La APK física actualmente identificada en documentación previa fue construida antes de los últimos cambios de recogidas y conciliación. Se requiere una nueva compilación y QA en dispositivo real.

### P1 — Cierre operativo documental

- comprobante descargable de recepción;
- confirmación del cliente cuando aplique;
- evidencia obligatoria para faltantes, rechazos o novedades.

### P1 — QA integral

- recorrido P14 → P16 → P15 → conciliación;
- entrega COD con abono parcial;
- devolución y traspaso de custodia;
- móvil real con red inestable y reintentos.

## Bloqueos externos

- WhatsApp: autorización, credenciales y configuración Meta;
- Nequi productivo: acceso comercial/API, webhook y verificación bancaria.

Ninguno de estos bloqueos externos impide cerrar el sistema operativo y financiero manual.

## Despliegue

- API P16: despliegue manual mediante Git Version Control de cPanel;
- frontend P16: verificar que producción corresponda al commit aprobado antes de cada QA;
- P14: frontend desplegable desde su proyecto Vercel;
- P15: APK local release para QA.

## Regla de lectura

Este archivo responde “qué existe hoy”. El trabajo siguiente se administra exclusivamente en [ROADMAP-ACTIVO.md](./ROADMAP-ACTIVO.md).
