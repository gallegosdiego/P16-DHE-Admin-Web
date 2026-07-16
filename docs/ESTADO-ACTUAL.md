# Estado actual del ecosistema Danhei

**Corte:** 15 de julio de 2026

**Estado general:** núcleo operativo funcional; cierre financiero y QA móvil pendientes

**Alcance:** estado comprobado de P13, P14, P15, P16 e integraciones aisladas

## Resumen ejecutivo

Danhei ya opera como un ecosistema conectado: P14 crea solicitudes, P16 administra la operación y concentra la API, y P15 ejecuta tareas de piloto. WhatsApp y Nequi no forman parte de la ruta crítica y permanecen aislados hasta contar con autorización externa.

El código base de los cuatro repositorios estaba sincronizado con sus ramas remotas al iniciar esta auditoría. La reorganización documental del 15 de julio permanece local hasta que se revise y publique en cada repositorio. P16 tiene CI frontend aprobado para el commit de código `5f517e8`.

## Estado por producto

| Producto | Rama | Referencia actual | Estado |
|---|---|---|---|
| P13 Landing | `dev` | `432c891` | Sitio público estable; fuera del bloque financiero inmediato. |
| P14 Cliente | `main` | `228d8ba` | Recogidas multicanal y saldo COD verificado implementados. |
| P15 Piloto | `main` | `d1f0c1d` | Código de recogidas, tareas mixtas y conciliación disponible; falta nueva APK y QA físico. |
| P16 Admin/API | `main` | `5f517e8` + cambios locales | Fundación operativa y libros financieros implementados. Las fases 1 y 2 de OPS-00 están desarrolladas y verificadas automáticamente en local; faltan QA visual, publicación, migración de P14 y cierre financiero. |

Los hashes son una referencia del corte documental, no una configuración que deba escribirse en despliegues.

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
- intención de pago QR simulada para pruebas;
- interfaces operativas P16 alineadas con el sistema visual Danhei;
- resumen de conciliación visible para el piloto en P15.

## Pendientes reales

### P0 — Unificación del ingreso de paquetes

P16 ya conduce los CTAs normales del panel al ingreso unificado y conserva la creación directa únicamente como compatibilidad interna temporal. P14 todavía debe migrar sus caminos paralelos que crean guías directamente mediante `/shipments`. Antes del cierre financiero se debe completar la entrada única definida en [PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md](./PLAN-UNIFICACION-INGRESO-PAQUETES-2026-07-15.md).

**Avance local de fases 1 y 2, pendiente de publicación:** el backend incorpora adición idempotente de paquetes, materialización protegida contra duplicados, ingreso espontáneo atómico, asignación a empleados reales, permisos específicos, transiciones de estado y custodia del tercero que entrega. P16 incorpora el asistente único, las tres vías, múltiples paquetes, recepción programada, asignación a empleados, filtros por vía, adición de paquetes y materialización selectiva. Lint, TypeScript, build y la suite completa de API pasan; esta última registra 348 pruebas y 1.616 aserciones. El QA visual queda asignado al responsable funcional antes de publicar.

- ejecutar QA visual de escritorio y móvil sobre la Fase 2 de P16;
- migrar P14 al mismo contrato y a una decisión simplificada;
- reservar la creación directa de guías para el permiso excepcional;
- ejecutar UAT y publicar las migraciones aditivas.

### P0 — Cierre financiero

- interfaz P16 para seleccionar guías y asignar abonos parciales;
- conciliación por paquete, selección o día;
- pago parcial de servicios al piloto;
- liquidación parcial al cliente;
- comprobantes, anulaciones y apertura histórica;
- QA de invariantes y permisos financieros.

Controles técnicos pendientes detectados en la revisión:

- rechazar atómicamente, para la primera versión, cualquier pago que no quede asignado por completo;
- rechazar identificadores duplicados dentro de `allocations`;
- aplicar idempotencia a remesas, pagos al piloto y liquidaciones al cliente;
- causar tarifas de recogida y devolución cuando negocio las apruebe; hoy la causación automática implementada corresponde a entregas.

### P0 — Release móvil

La APK física `4.2.20` fue construida el 10 de julio. El código de recogidas y conciliación se integró el 12 de julio, por lo que se necesita una nueva versión y un nuevo artefacto Android antes de QA.

### P1 — Cierre de recepción

- comprobante descargable;
- confirmación del cliente;
- evidencia obligatoria para faltantes, rechazos o novedades.

### P1 — QA integral

- recorrido P14 → P16 → P15 → conciliación;
- entrega COD con abono parcial;
- devolución y traspaso de custodia;
- geocodificación y tracking en producción;
- móvil real con red inestable y reintentos.

### Bloqueos externos

- WhatsApp: autorización, credenciales y configuración Meta;
- Nequi productivo: acceso comercial/API, webhook y verificación bancaria.

Ninguno de estos bloqueos externos impide cerrar el sistema operativo y financiero manual.

## Despliegue

- API P16: despliegue manual mediante Git Version Control de cPanel; ver [DEPLOY-CPANEL.md](./DEPLOY-CPANEL.md).
- Frontend P16: verificar que producción corresponda al commit aprobado antes de cada QA.
- P14: frontend desplegable desde su proyecto Vercel.
- P15: APK local release para QA; la firma actual es de distribución interna, no de Play Store.

## Regla de lectura

Este archivo responde “qué existe hoy”. El trabajo siguiente se administra exclusivamente en [ROADMAP-ACTIVO.md](./ROADMAP-ACTIVO.md). Los documentos de `updates/` y los sprints anteriores son evidencia histórica.
