# Changelog actual de Danhei

**Formato:** UTF-8

**Inicio de esta serie:** 12 de julio de 2026

**Estado:** activo

**Alcance:** cambios vigentes del ecosistema consolidados desde P16

El archivo `CHANGELOG.md` anterior se conserva como historial, pero contiene tramos con codificación heredada. Las novedades posteriores al 12 de julio se registran aquí.

## 2026-07-15 – Consolidación documental

- se corrige el diagnóstico de runtime para no marcar continuidad de rutas como lista cuando la base todavía conserva el índice único legacy `driver_id + route_date`;
- el chequeo de runtime ahora expone que Google Maps es opcional cuando el fallback de geocodificación está activo y sano;
- se define el plan para unificar Nuevo pedido, recogidas e ingresos en sede bajo una sola entrada de paquetes;
- se implementa localmente la Fase 1 de OPS-00 en la API: adición idempotente, materialización con bloqueo, empleado real, ingreso espontáneo atómico, permisos y custodia del tercero;
- se implementa localmente la Fase 2 de OPS-00 en P16: asistente único de ingreso, tres vías operativas, captura de varios paquetes, ingreso espontáneo atómico, identidad del tercero, recepción programada, asignación a empleados, filtros por vía, adición de paquetes y materialización selectiva;
- se migran la navegación, la paleta de comandos, el tablero, Envíos y guías y los CTAs normales de P16 hacia **Nuevo ingreso**; la creación directa queda fuera del recorrido normal y se conserva temporalmente por compatibilidad;
- lint, TypeScript y build de frontend pasan; la regresión focalizada de API registra 26 pruebas y 150 aserciones, y la suite completa 348 pruebas y 1.616 aserciones; el QA visual queda a cargo del responsable funcional;
- se agregan dos migraciones aditivas al despliegue cPanel;
- la publicación y la interfaz P14 permanecen pendientes y no se declaran desplegadas;
- se crea el portal documental canónico;
- se separan Estado actual y Roadmap activo;
- se actualiza el plan financiero contra los libros realmente implementados;
- se organizan fuentes de verdad para P13, P14, P15 y P16;
- se clasifica como histórico el material de sprints, bitácoras y listas reemplazadas;
- se identifica que la APK `4.2.20` fue construida antes de las funciones móviles integradas el 12 de julio.

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
- intención QR Nequi con simulador limitado a pruebas;
- deploy cPanel ampliado inicialmente con cuatro migraciones aditivas; el 15 de julio se añadieron dos migraciones OPS-00, aún pendientes de publicación.
