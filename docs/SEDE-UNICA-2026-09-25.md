# Sede única: revisión de API y consumidores

La única sede operativa será Calle 13 #15-48, Locales 91 y 92. Esta entrega prepara el código; el usuario realizará cPanel. La edición y desactivación del catálogo productivo siguen pendientes y no se ejecutan con seeders.

## Fallos corregidos

- La respuesta de paradas operativas para piloto omitía la sede. Ahora incluye `operational_task.service_location` con identificador, nombre, dirección, complemento, ciudad y estado activo. Es un campo adicional compatible con consumidores anteriores.
- Crear una devolución a sede admitía identificadores inactivos. Ahora devuelve 422 en `service_location_id`.
- Las tareas previas de recepción/devolución podían avanzar después del cierre de su sede. Se valida al programar parada, aceptar, iniciar, completar y abrir recepción. También se valida al crear una tarea de ingreso a sede desde una solicitud anterior. No se impiden estados de cancelación/fallo ni se eliminan históricos.
- El filtro de rutas del día compara fechas mediante `whereDate`, evitando perder tareas cuando el motor almacena la fecha con hora.

P15 complementa esto mostrando la sede real y respetando Aceptar → Iniciar → Completar. Antes mostraba la dirección del destinatario para devoluciones y ofrecía completar una tarea recién aceptada. Una devolución al remitente sin dirección explícita muestra una instrucción para confirmar el destino; no se inventa una dirección a partir del destinatario.

## Operación y publicación pendientes

1. Revisar solicitudes, tareas y lotes abiertos asociados a sedes que se retirarán. Resolver su destino con trazabilidad antes del cierre. No trasladar custodia automáticamente ni editar referencias de operaciones terminadas.
2. Publicar esta API y el panel cuando se autorice la fusión de PR 53. cPanel corresponde al usuario; fusionar P16 también puede publicar su frontend en Vercel.
3. Editar la principal existente en Configuración → Sedes operativas; conservar ID/código. Actualizar dirección y complemento, revisar coordenadas, contacto y horarios. Desactivar todas las demás, sin borrarlas.
4. Comprobar el catálogo activo desde panel y portal cliente. Un formulario antiguo con una sede cerrada debe recibir 422.
5. Integrar P15, generar una APK nueva y probar en Android físico el recorrido completo de devolución. La APK 4.2.25 existente no contiene estos cambios.

La recepción por escáner y sus devoluciones de custodia no incorporan restricciones por localidad. Su registro genérico de bodega (`hub`, sin identificador de sede) sigue siendo el contrato actual: no acredita por sí solo la presencia física en los locales 91 y 92. No se modifican Maps ni WhatsApp.

Los comprobantes de recepción y el portal obtienen los datos de sede desde relaciones con el catálogo. Las direcciones copiadas al crear solicitudes históricas se conservan; no deben confundirse con el destino operativo actual ni sobrescribirse masivamente.

Entrega y pruebas consolidadas: [acta del ecosistema](https://github.com/gallegosdiego/P17-DHE-docs/blob/main/actualizaciones/2026-09-25-sede-principal-locales-91-92.md).
