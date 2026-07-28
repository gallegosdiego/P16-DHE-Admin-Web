# Incidente cPanel: SHA actualizado con esquema incompleto

**Fecha:** 28 de julio de 2026

**Estado:** corrección implementada y validada localmente; requiere integrar el
PR y ejecutar una sola vez el nuevo HEAD en cPanel.

## Evidencia

- Git Version Control mostró el mismo SHA `a190dd7` como último despliegue a
  las 14:54, 15:06 y 15:08;
- `.cpanel.yml` ya contenía exactamente 3 tareas;
- el panel continuó recibiendo `operational_intake_unavailable`;
- el script anterior acumulaba errores, escribía un marcador
  `running/completed_with_errors` y finalizaba de forma controlada para evitar
  una tarea colgada;
- por ese contrato, cPanel podía actualizar el campo “último SHA desplegado”
  aunque la base operativa no hubiera terminado.

## Causa

El límite de tareas ya estaba corregido. El defecto restante era la diferencia
entre el resultado de Git Version Control y el resultado real del runtime:

1. cPanel ejecutaba 3 tareas;
2. la tercera contenía varias migraciones y verificadores;
3. los códigos de salida de Laravel y de algunos reparadores no siempre se
   convertían en un fallo persistente;
4. el cierre controlado evitaba la cola colgada, pero también permitía que la
   interfaz registrara el SHA sin un `last-success` válido.

## Corrección

- se mantienen exactamente 3 tareas en `.cpanel.yml`;
- las migraciones operativas se agrupan en una sola llamada `migrate`;
- la recuperación del esquema se ejecuta dentro del mismo proceso PHP;
- el despliegue exige `operational_intake_ready=true` antes de pasar a
  reparaciones secundarias;
- un fallo crítico escribe `deploy-cpanel.last-failure` con `status=failed`,
  fase y código de salida;
- el proceso conserva un `exit(0)` controlado exclusivamente para no dejar
  `UserTasks` fallidas en cola; el marcador del API pasa a ser la fuente
  autoritativa;
- un éxito elimina el marcador de fallo y escribe `phase=complete` o
  `phase=complete_with_warnings`.

## Criterio de cierre

Después de integrar el PR:

1. vaciar o esperar cualquier `UserTask` previamente encolada;
2. actualizar desde remoto;
3. confirmar el nuevo SHA;
4. pulsar una sola vez **Desplegar commit HEAD**;
5. exigir que `deploy-cpanel.last-success` contenga ese SHA;
6. exigir `status=success` y fase `complete` o `complete_with_warnings`;
7. comprobar `/api/runtime-check`;
8. comprobar `/api/pickup-requests`;
9. registrar y recibir un paquete QA.
