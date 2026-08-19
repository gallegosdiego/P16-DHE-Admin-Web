# Estado actual del ecosistema Danhei

**Corte:** 19 de agosto de 2026
**Estado general:** núcleo operativo y financiero funcional y desplegado, ecosistema endurecido tras la remediación de seguridad de agosto, UAT integral restante
**Alcance:** estado comprobado de P13, P14, P15, P16, P17, P18 e integraciones aisladas

## Resumen ejecutivo

Danhei opera como un ecosistema conectado: P14 crea ingresos y consulta guías, P16 administra la operación y concentra la API, y P15 ejecuta tareas de piloto. WhatsApp y Nequi productivo siguen fuera de la ruta crítica.

Agosto fue el mes de la seguridad y del cierre financiero:

- **Remediación de seguridad (11–13/08):** una fuga real —un `cookies.txt` con sesión viva en un repositorio público— disparó una remediación completa. Se rotó la `APP_KEY`, el rastreo público pasó a token opaco con segundo factor (guía + últimos 4 dígitos del teléfono), se endureció la CSP, los tokens caducan por tipo de dispositivo, se eliminaron las 34 vulnerabilidades de dependencias y quedaron vigiladas en CI, y los incidentes de la API son consultables y archivables desde el panel.
- **Blindaje del historial (14/08):** se purgó la historia comprometida de P15 con `push --force` (respaldada en bundles locales), y los seis repositorios quedaron con barrido de gitleaks en CI **y** un hook de pre-commit que bloquea credenciales antes de que el commit exista.
- **Rastreo público reparado (19/08):** la corrección de `tracking.html` al contrato real del API quedó desplegada; «no existe» y «segundo factor incorrecto» son indistinguibles por construcción.
- **Cierre financiero FIN-04 (19/08):** toda transferencia electrónica al cliente exige y congela la cuenta destino, admite el comprobante del banco como adjunto posterior en disco privado con descarga autenticada, y lo que falta no se esconde: contador de «sin soporte» respaldado por una única regla en el modelo (`needs_support`). Pasó una revisión de código de 10 hallazgos, corregidos antes de desplegar.

La documentación de la remediación y sus pendientes de ecosistema viven en P17 (`ecosistema/remediacion-2026-08/pendientes.md`), que es la lista que manda a ese nivel.

## Estado por producto

| Producto | Rama | Estado |
|---|---|---|
| P13 Landing | `main` | Sitio público estable; rastreo con segundo factor **desplegado y verificado** el 19/08. |
| P14 Cliente | `main` | Ingreso unificado activo; Next 16.3 con CI de auditoría; `/envios` queda como consulta y detalle. |
| P15 Piloto | `main` | Historia purgada y CI nuevo (tipos + auditoría con excepciones); APK 4.2.23 vigente; falta reconstruir sobre Expo 57 y QA físico. |
| P16 Admin (frontend) | `main` desplegado (`21dbb31`) | Mesa de conciliación con cuenta destino, soporte y contador «sin soporte» en producción (Vercel). |
| P16 API | `main` / cPanel (`21dbb31`) | Contrato financiero completo con FIN-04; `deployment-health` público para monitoreo; migraciones al día. |
| P17 Docs | `main` | Fuente documental del ecosistema; barrido completo de gitleaks en verde. |
| P18 WhatsApp Reader | `main` | Lector de solo lectura, fuera de la ruta crítica; CI con excepciones documentadas. |

## Capacidades cerradas

Operación:

- identidades de usuarios, clientes y pilotos preservadas;
- tres modalidades de ingreso: recogida en cliente, entrega planificada e ingreso espontáneo en sede;
- tareas operativas y rutas mixtas; conciliación física de paquetes; cadena de custodia;
- intentos de entrega y evidencia; evidencia obligatoria por ítem con hash y metadatos;
- comprobante de recepción imprimible con diferencias, custodio y detalle por guía.

Finanzas:

- obligaciones COD del piloto, remuneración del piloto y derecho COD del cliente como cuentas separadas que no se compensan entre sí;
- reglas de remuneración versionadas con alcance, vigencia, aprobación y snapshot inmutable;
- mesa administrativa en `/pagos` por selección de guías o distribución FIFO, con llave idempotente y reintento seguro;
- comprobantes con saldo anterior/movimiento/posterior, reversos como movimientos inversos auditables y apertura histórica sin guías ficticias;
- **cuenta destino congelada en cada transferencia electrónica** (el número viaja enmascarado al navegador; completo solo en base de datos y en el snapshot de auditoría);
- **soporte bancario adjunto** en disco privado con `sha256`, servido únicamente por endpoint autenticado; regla «sin soporte» en una sola fuente (`needs_support`) que comparten contador, badge, CSV e impreso;
- invariantes de asignación e idempotencia cerradas en backend (falta solo la prueba de estrés concurrente sobre MySQL/MariaDB).

Seguridad (agosto):

- rastreo público con token opaco y segundo factor; respuestas indistinguibles para «no existe» y «factor incorrecto»;
- CSP endurecida sin `unsafe-eval`; caducidad de tokens por tipo de dispositivo; `APP_KEY` rotada el 12/08 con generador asistido;
- incidentes de la API consultables, archivables y restaurables desde el panel;
- verificación automática de despliegue (`/api/deployment-health`, 200/503) apta para monitor externo;
- gitleaks en CI y hook de pre-commit anticredenciales en los seis repositorios;
- historia comprometida de P15 purgada del remoto y respaldada en bundles locales.

CRM:

- contacto de cobro separado de empresa/razón social; preferencias de pago múltiples e informativas;
- guías sin cliente maestro operables y vinculables después, sin perder snapshot ni historial financiero;
- archivado/restauración de clientes por soft delete; detalle de cliente responsive con métricas.

## Pendientes reales

### P0 — QA visual y UAT operativo

- aprobar escritorio y móvil para P14 y P16 — incluye la mesa de `/pagos` con cuenta destino y soporte, y las reglas tarifarias en `/configuracion`;
- ejecutar UAT integral P14 → P16 → P15 y los recorridos que no son ingreso espontáneo.

### P0 — Release móvil

- reconstruir la APK de P15 sobre Expo 57 y ejecutar los 34 casos de UAT físico. Depende de rotar/restringir la clave de Google Maps (aplazada por decisión del 19/08).

### P1 — Cierre operativo y financiero

- desplegar migración/API de la evidencia de novedades (OPS-02) y aprobar su UAT en producción;
- decidir la confirmación del cliente en entrega/recogida (OPS-03, sin diseño aún);
- prueba concurrente real de idempotencia sobre MySQL/MariaDB;
- decisión de producto sobre doble aprobación por personas distintas.

### Ecosistema (se administran en P17)

- monitor externo sobre `deployment-health`; despliegue por releases (P2.2) y rama `production` construida por CI (P2.1); privatizar P16; ticket de *garbage collection* a GitHub por la vieja historia de P15; restringir la clave de Maps; portal de clientes (53 clientes sin usuario).

## Bloqueos externos

- WhatsApp: autorización, credenciales y configuración Meta;
- Nequi productivo: acceso comercial/API, webhook y verificación bancaria.

Ninguno de estos bloqueos impide cerrar el sistema operativo y financiero manual.

## Despliegue

- API P16: manual mediante Git Version Control de cPanel; `.cpanel.yml` conserva exactamente 3 tareas y `deploy-cpanel-all.php` aplica **todas** las migraciones pendientes y escribe marcadores de intento, éxito o fallo; `/api/deployment-health` responde 200/503 desde fuera;
- frontend P16: producción verificada en Vercel para `21dbb31`; se despliega solo al fusionar en `main`;
- P13: desplegado desde cPanel el 19/08; la cabecera `Last-Modified` es la prueba fiable de que las tareas corrieron (el script termina en `exit(0)` a propósito y cPanel informa éxito aunque fallen);
- P14: frontend desplegable desde su proyecto Vercel;
- P15: APK local release para QA.

## Regla de lectura

Este archivo responde “qué existe hoy”. El trabajo siguiente se administra exclusivamente en [ROADMAP-ACTIVO.md](./ROADMAP-ACTIVO.md); los pendientes de nivel ecosistema, en P17.
