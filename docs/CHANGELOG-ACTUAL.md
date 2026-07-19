# Changelog actual de Danhei

**Formato:** UTF-8
**Inicio de esta serie:** 12 de julio de 2026
**Estado:** activo

## 2026-07-19 — Bloqueo de despliegue en infraestructura

- se incorpora un diagnóstico manual y de solo lectura para repositorio, despliegues y cola `UserTasks` de cPanel;
- las tres consultas autenticadas confirman que Imunify360 bloquea el acceso antes de UAPI con el mensaje `Access denied by Imunify360 bot-protection`;
- el diagnóstico trata respuestas HTTP 200 sin contrato UAPI como fallos y evita falsos positivos verdes;
- se documenta la solicitud acotada al proveedor: revisar el task runner, los registros `vc_*_git_deploy.log` y la excepción para rutas UAPI autenticadas, sin desactivar globalmente la protección.

## 2026-07-17 — Diagnóstico trazable de despliegue e ingreso

- la verificación autenticada de producción confirma que el API sigue con el esquema de ingreso incompleto: solo `service_locations` está disponible y faltan solicitudes, paquetes, tareas, lotes, intentos, custodia e idempotencia;
- el comportamiento de `/api/pickup-requests` demuestra que el API activo no contiene todavía el guard de esquema del commit publicado: el listado responde 500 mientras la creación responde el 503 protector;
- cada despliegue de cPanel escribe marcadores separados de intento, éxito y fallo, con commit, fecha, fase y código de salida;
- `/api/runtime-check` expone una huella segura del último despliegue, sin rutas internas ni contenido de registros;
- el error esperado `operational_intake_unavailable` incorpora UUID, `X-Error-ID`, cantidad de componentes faltantes y estado del despliegue;
- el formulario de nuevo ingreso y el tablero de ingresos explican que el paquete no fue registrado, muestran una referencia para soporte y evitan reintentos ambiguos;
- las rutas protegidas del API responden JSON 401 aun cuando el cliente no envía `Accept: application/json`, eliminando el falso 422 `Route [login] not defined`;
- se agregan pruebas unitarias, de integración y E2E para marcadores, autenticación, esquema incompleto y presentación trazable del incidente.
- la validación completa queda aprobada con 391 pruebas backend, 1.949 aserciones, 52 escenarios E2E, lint, TypeScript y compilación de producción.
- después de confirmar que cPanel descargaba el HEAD pero no alcanzaba la primera migración, `.cpanel.yml` adopta un modo de recuperación con 22 tareas cortas, independientes y de rutas literales;
- el camino crítico deja de depender de los orquestadores Bash, `timeout`, `flock` y redirecciones persistentes que el task runner del hosting no completaba;
- cada grupo operativo registra `schema_core`, `runtime_repairs` o `financial_schema`, y el cierre registra el SHA real resuelto directamente desde el repositorio de cPanel;
- WhatsApp y la reparación secundaria del índice diario quedan fuera del despliegue de recuperación para no bloquear paquetes, custodia ni finanzas.
- el modo de recuperación queda validado con YAML estricto, 393 pruebas backend y 1.960 aserciones.

## 2026-07-16 — Cierre técnico de ingreso unificado y robustecimiento financiero

- P14 se migra al ingreso unificado: `/envios` queda como consulta y el CTA principal pasa a `/recogidas`;
- P14 deja de crear guías nuevas desde el recorrido normal del cliente;
- se limpian textos visibles del portal cliente y se actualiza su README;
- el backend financiero ahora rechaza líneas duplicadas dentro de una asignación manual;
- el backend financiero ahora rechaza cualquier movimiento cuyo monto no quede asignado por completo;
- remesas, pagos de servicios y pagos al cliente pasan a exigir `Idempotency-Key`;
- el servicio idempotente recupera la colisión de inserción provocada por solicitudes simultáneas y relee el movimiento ganador;
- `/pagos` incorpora una primera mesa de conciliación sobre los libros nuevos para remesas COD, pagos al piloto y transferencias al cliente;
- la mesa permite asignación manual por guía o distribución FIFO, registra método, referencia y notas, y usa reintentos con la misma llave idempotente;
- los resúmenes financieros incluyen hasta 50 movimientos con usuario y asignaciones por guía;
- P16 muestra historial y genera comprobantes imprimibles/guardables como PDF y descargas CSV;
- `/configuracion` reemplaza la tabla local simulada por reglas financieras persistentes y versionadas para entrega, recogida y devolución;
- las reglas admiten alcance global, por piloto, cliente o zona, vigencias, prioridad, motivo, aprobador y activación auditada;
- cada causación de servicios conserva la regla aplicada, tarifa estándar y snapshot histórico;
- las tareas de recogida y devolución solo causan remuneración cuando existe una regla aprobada; no se inventan valores;
- `/api/runtime-check`, protegido por autenticación y `settings.view`, informa si la tabla y las columnas de reglas financieras están listas; `/api/deploy-check` permanece limitado a `local/testing`;
- los comprobantes financieros persisten saldo anterior, efecto y saldo posterior;
- se agregan reversos completos e idempotentes para remesas COD, pagos de servicios y transferencias al cliente;
- los reversos conservan el movimiento original, restauran asignaciones y bloquean la remesa si el cliente ya recibió esos fondos;
- `/pagos` permite registrar saldos de apertura con fecha y soporte sin crear guías ficticias;
- se agregan permisos dedicados `financial.reverse` y `financial.opening`;
- la carga de reportes financieros legacy se difiere hasta que el usuario abre una de esas pestañas;
- se agregan mocks y regresiones E2E para la separación de cuentas y el envío de remesas con llave idempotente;
- se agregan pruebas de regresión para duplicados, remanentes e idempotencia;
- la suite backend completa pasa con 388 pruebas y 1.904 aserciones;
- la suite E2E completa del panel pasa con 51 escenarios;
- lint, TypeScript y build de P16, junto con lint y build de P14, quedan aprobados;
- se actualizan `README.md`, `ESTADO-ACTUAL.md`, `ROADMAP-ACTIVO.md` y `modulo-financiero-plan.md` para reflejar el estado real del 16 de julio de 2026.
- el despliegue de cPanel limpia automáticamente las cachés de Laravel después de copiar el API, evitando que producción conserve rutas y controladores de la versión anterior.
- el nuevo ingreso carga clientes y sedes de forma independiente, selecciona la primera sede activa y muestra una acción de configuración explícita cuando el catálogo está vacío, en lugar de dejar un selector obligatorio sin opciones.
- se registra la sede principal Danhei en producción con los datos corporativos ya declarados por el panel, habilitando los ingresos planificados y sin aviso en mostrador.
- la marca del panel y del acceso usa un nuevo recurso magenta de fondo transparente, con contraste y sombra adaptados por tema para conservar legibilidad en superficies claras y oscuras.
- el catálogo productivo queda dividido entre `Sede principal` y `Sede B`; el nuevo ingreso conserva la sede principal como selección inicial aunque el API ordene alfabéticamente las opciones.
- el despliegue manual de cPanel concentra sus tareas de runtime en un ejecutor con bloqueo de concurrencia, tiempo límite por etapa, límite total y registro persistente, evitando indicadores indefinidos sin diagnóstico;
- la reparación del índice diario de rutas limita explícitamente la espera por bloqueos de MySQL antes de ejecutar cambios de índice.
- se corrige el orden del despliegue después de detectar en producción que el bloqueo del índice diario detenía las migraciones posteriores y dejaba ausente `operational_tasks.assigned_user_id`;
- el esquema operativo se verifica y repara antes de continuar con finanzas, mientras la optimización de rutas pasa al final como tarea aplazable;
- `/api/runtime-check` informa tablas, columnas y disponibilidad real del ingreso unificado mediante `operational_intake_ready`.
- se incluye en cPanel la migración histórica que crea `pickup_requests`, `pickup_packages` y `pickup_review_events`, omitida por el despliegue acotado anterior;
- las fundaciones de recogidas y operaciones pasan a ser reanudables: si una sede o tabla ya existe, completan únicamente las piezas faltantes sin borrar datos maestros.
- el acceso administrativo reemplaza la tarjeta oscura por una superficie rosado perla translúcida, con campos claros, textos ciruela y bordes fucsia suaves para integrarse con la identidad Danhei sin perder contraste.
- los campos del acceso quedan aislados del tema oscuro global: usan fondo gris-blanco, texto y cursor fucsia, y conservan esos colores durante el autocompletado del navegador.
- se confirma en producción que el error 500 de `Registrar y recibir` provenía de una base parcial: solo existía `service_locations` y faltaban solicitudes, paquetes, tareas, lotes, custodia e idempotencia.
- la fundación crítica de ingresos se desacopla de WhatsApp: sedes, solicitudes, paquetes y revisión se crean primero mediante una migración propia; la integración restringida pasa a ser opcional y no puede bloquear el núcleo operativo.
- se acortan dos identificadores de índices de WhatsApp que superaban el límite de 64 caracteres de MySQL y podían detener la migración antes de crear `pickup_requests`.
- el ingreso responde `503` con una explicación operativa cuando el esquema no está listo, en lugar de exponer un error interno genérico.
- `/api/runtime-check` inspecciona ahora las columnas completas del recorrido, devuelve `RUNTIME_BLOCKED` y estado HTTP 503 cuando el esquema operativo o financiero está incompleto.
- cPanel adopta un despliegue `schema-first`: prepara y verifica el esquema
  operativo antes de copiar controladores y rutas nuevas, informa la fase exacta
  de cualquier fallo y guarda el commit del último despliegue exitoso.
- el mismo verificador recupera permisos de ingreso faltantes aunque la
  migración correspondiente figure como ejecutada.
- todos los endpoints del módulo de ingreso validan el esquema antes del
  enlace de modelos y responden `503 operational_intake_unavailable` con una
  acción concreta, en lugar de consultar tablas ausentes y terminar en 500.
- el listado, detalle y notificador de recogidas comprueban físicamente las
  tablas de WhatsApp; cuando la integración opcional no existe, el núcleo
  conserva `whatsapp_contact: null`, `whatsapp_messages: []` y sigue operando.
- las notificaciones de WhatsApp se ejecutan fuera de la transacción operativa
  y fallan de forma controlada; una falla de mensaje, cola o proveedor no puede
  revertir una aprobación ni una solicitud de datos.
- los errores inesperados del API generan un UUID seguro en `error_id`, el
  encabezado `X-Error-ID` y un registro estructurado con contexto y excepción.
- el panel conserva el código, estado, referencia y posibilidad de reintento de
  cada error; `/recogidas` ya no reemplaza una consulta fallida por ceros o por
  un estado vacío falso y ofrece una acción accesible para reintentar.
- se agregan regresiones que eliminan físicamente las tablas opcionales,
  simulan el esquema operativo incompleto, verifican el aislamiento de
  autenticación y comprueban que los mensajes internos no se filtren al cliente.

## 2026-07-15 — Consolidación documental y fundación OPS-00

- se corrige el diagnóstico de runtime para no marcar continuidad de rutas como lista cuando la base todavía conserva el índice único legacy `driver_id + route_date`;
- el chequeo de runtime expone que Google Maps es opcional cuando el fallback de geocodificación está activo;
- se define el plan para unificar Nuevo pedido, recogidas e ingresos en sede bajo una sola entrada de paquetes;
- se implementa localmente la Fase 1 de OPS-00 en la API;
- se implementa localmente la Fase 2 de OPS-00 en P16;
- se reorganiza la documentación canónica del ecosistema;
- se actualiza el plan financiero contra los libros realmente implementados.

## 2026-07-14 — Alineación visual de operaciones

- Recogidas, nueva solicitud, asignación, recepción, sedes y Control operativo se alinean con el sistema visual Danhei;
- magenta como acción primaria y colores semánticos reservados para estados;
- eliminación del bloque duplicado de asignación;
- TypeScript, lint, build y frontend CI aprobados para `5f517e8`.

## 2026-07-12 — Fundación operativa y financiera

- solicitudes multicanal desde P14 y P16;
- tres modalidades de ingreso físico;
- tareas, lotes, intentos, evidencia, custodia e idempotencia;
- recogidas, tareas mixtas y conciliación visible en P15;
- libros separados para COD del piloto, remuneración del piloto y COD del cliente;
- abonos parciales y asignaciones por guía;
- intención QR Nequi con simulador limitado a pruebas.
