# Changelog actual de Danhei

**Formato:** UTF-8
**Inicio de esta serie:** 12 de julio de 2026
**Estado:** activo

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
- la suite backend completa pasa con 369 pruebas y 1.746 aserciones;
- la suite E2E completa del panel pasa con 46 escenarios;
- lint, TypeScript y build de P16, junto con lint y build de P14, quedan aprobados;
- se actualizan `README.md`, `ESTADO-ACTUAL.md`, `ROADMAP-ACTIVO.md` y `modulo-financiero-plan.md` para reflejar el estado real del 16 de julio de 2026.
- el despliegue de cPanel limpia automáticamente las cachés de Laravel después de copiar el API, evitando que producción conserve rutas y controladores de la versión anterior.
- el nuevo ingreso carga clientes y sedes de forma independiente, selecciona la primera sede activa y muestra una acción de configuración explícita cuando el catálogo está vacío, en lugar de dejar un selector obligatorio sin opciones.
- se registra la sede principal Danhei en producción con los datos corporativos ya declarados por el panel, habilitando los ingresos planificados y sin aviso en mostrador.
- la marca del panel y del acceso usa un nuevo recurso magenta de fondo transparente, con contraste y sombra adaptados por tema para conservar legibilidad en superficies claras y oscuras.
- el catálogo productivo queda dividido entre `Sede principal` y `Sede B`; el nuevo ingreso conserva la sede principal como selección inicial aunque el API ordene alfabéticamente las opciones.

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
