# Gobernanza documental

**Última revisión:** 15 de julio de 2026

**Estado:** activo

**Alcance:** reglas de creación, actualización, archivo y aprobación documental del ecosistema

## Propósito

Mantener documentación breve, verificable y útil para desarrollo, QA, operación y despliegue.

## Jerarquía

En caso de contradicción prevalece este orden:

1. código, migraciones y configuración versionada;
2. `docs/ESTADO-ACTUAL.md`;
3. `docs/ROADMAP-ACTIVO.md`;
4. contratos y arquitectura;
5. runbooks de operación;
6. plan maestro;
7. actualizaciones históricas, sprints y bitácoras.

## Tipos documentales

| Tipo | Ubicación | Regla |
|---|---|---|
| Estado | `docs/ESTADO-ACTUAL.md` | Se actualiza con cada cierre importante. |
| Backlog | `docs/ROADMAP-ACTIVO.md` | Única lista vigente de pendientes. |
| Arquitectura | `docs/ARCHITECTURE.md` | Explica decisiones estables, no tareas. |
| Contratos | `docs/API-CONTRACTS.md` | Debe cambiar junto con endpoints/tipos. |
| Operación | `docs/operations/` | Pasos reproducibles y seguros. |
| QA | `docs/qa/` | Escenarios, ambientes y evidencia. |
| Seguridad | `docs/security/` | Permisos y controles verificables. |
| Actualización | `docs/updates/` | Evidencia inmutable de una entrega. |
| Histórico | `docs/documentacion-legacy/` y `SPRINT-*` | No se usa para planificar trabajo nuevo. |

## Encabezado obligatorio

Los documentos nuevos deben indicar:

- título;
- fecha o última revisión;
- estado: borrador, activo, cerrado, bloqueado o histórico;
- alcance;
- documento que reemplazan, cuando aplique.

## Reglas de mantenimiento

- No crear otra lista maestra de pendientes: actualizar `ROADMAP-ACTIVO.md`.
- No declarar “producción” únicamente porque compila o CI pasa; registrar la evidencia de despliegue/QA.
- No guardar secretos, tokens, contraseñas ni valores reales de `.env`.
- Usar rutas relativas en enlaces internos.
- Actualizar README, estado, contratos, QA y changelog en el mismo cambio cuando corresponda.
- Los documentos de cierre no se reescriben para cambiar la historia; se agrega una corrección o un nuevo cierre.
- Las versiones de APK deben distinguir código fuente, artefacto construido y versión instalada en QA.

## Revisión de release

Antes de publicar:

1. comprobar enlaces principales;
2. confirmar versiones contra archivos de configuración;
3. confirmar ramas y commits contra Git;
4. separar implementado, desplegado y validado;
5. actualizar el roadmap;
6. registrar pruebas ejecutadas;
7. evitar instrucciones destructivas sin respaldo y `dry-run`.
