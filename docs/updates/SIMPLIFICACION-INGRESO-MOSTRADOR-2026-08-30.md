# Simplificación y reorganización del ingreso de paquetes — 30 de agosto de 2026

**Estado:** implementado en rama `claude/admin-web-context-skucfr`; pendiente de aprobación y merge.

**Alcance:** solo frontend P16 (`/recogidas/nueva`). Los contratos de `POST /api/pickup-intakes/walk-in/complete` y `POST /api/pickup-intakes` no cambian.

## Problema

El formulario de nuevo ingreso mostraba cinco tarjetas con ~25 campos, aunque el API solo exige sede, costos por defecto y, por paquete, destinatario, teléfono y dirección. El plan de unificación ya identificaba como riesgo «mostrador demasiado lento». Además, la pantalla tenía la vía fija en ingreso espontáneo: las vías «Danhei recoge» y «entrega planificada» del asistente único no eran alcanzables desde P16.

## Decisión

Divulgación progresiva: lo obligatorio y lo frecuente quedan visibles; lo opcional queda plegado con sus valores por defecto a la vista. Ningún campo ni capacidad se elimina. Y las tres vías del método de ingreso vuelven a la misma pantalla: la primera pregunta es «¿Cómo ingresan los paquetes?» y cada vía muestra únicamente lo que necesita.

## Mapa del formulario reorganizado

```text
Nuevo ingreso de paquetes
├── ¿Cómo ingresan los paquetes?           (visible; «Recibir ahora» preseleccionado)
│   ├── Ya está en mostrador → recibir ahora            (walk_in_at_hub)
│   ├── Danhei recoge donde el cliente                  (pickup_at_client_location)
│   └── El cliente avisa y lleva a una sede             (planned_dropoff_at_hub)
├── Cliente y sede / dirección / fecha     (visible, según vía)
│   ├── Cliente (contacto de cobro)       ← a él se factura; sin cliente ⇒ aviso de revisión pendiente
│   ├── Mostrador:   Sede autoseleccionada (HUB-PRINCIPAL)
│   ├── Recogida:    Dirección de recogida + complemento + ciudad (sin sede)
│   ├── Planificada: Sede + fecha estimada de entrega
│   └── ▸ Contacto, remitente e instrucciones   (plegado; se autollena al elegir cliente)
├── Paquetes                               (visible, igual en las tres vías)
│   ├── Destinatario · Teléfono · Dirección · Valor COD
│   ├── ▸ Más detalles                    (plegado: complemento, ciudad, tamaño, frágil, manejo especial)
│   └── «Marcar rechazo»                  (solo mostrador; abre motivo + foto obligatoria)
├── ▸ Cobro del servicio                   (solo mostrador, plegado; resumen: envío/paquete, piloto, sin COD)
├── ▸ ¿Entrega o recibe otra persona?      (solo mostrador, plegado: tercero que trae + receptor físico)
└── Resumen fijo: vía · paquetes · cobro de envío (mostrador) · COD esperado · [Registrar y recibir | Crear ingreso]
```

El caso típico de mostrador —cliente conocido, un paquete aceptado— se resuelve con 2 selecciones y 4 campos. Una recogida donde el cliente: cliente, dirección de recogida y los 3 datos del paquete.

## Enrutamiento por vía

- Mostrador envía a `POST /pickup-intakes/walk-in/complete` con recepción, custodia y cobro, igual que antes.
- Recogida y entrega planificada envían a `POST /pickup-intakes` con `source: admin`, `intake_mode` y los campos propios de la vía; la solicitud cae en la bandeja de `/recogidas` para revisión, materialización y asignación, como define el plan de unificación.
- Nota: la versión anterior de la página tenía ramas muertas hacia `/pickup-intakes` que no enviaban `source` y habrían fallado la validación; esta entrega las reactiva con el payload correcto.

## Cambios de comportamiento

- El cliente se presenta explícitamente como **contacto de cobro**; al elegirlo se muestra «Se cobra a: …». Sin cliente, un aviso explica que la guía irá a «Pendientes por identificar cliente».
- El rechazo dejó de ser un select por paquete: es un enlace excepcional que abre su propio bloque. Esto también separa «Motivo del rechazo» de «Manejo especial», que antes compartían el mismo textarea.
- La «Modalidad para paquetes sin contraentrega» solo aparece cuando algún paquete aceptado tiene COD 0.
- Al agregar un paquete se copian ciudad y tamaño del anterior y el foco pasa al destinatario nuevo.
- El resumen fijo ahora incluye el cobro de envío total (costo por paquete × aceptados).
- «Registrar otro» limpia también el cliente seleccionado, que antes quedaba a medias (cliente elegido con contacto vacío).

## Soporte técnico

- Nuevo componente compartido `CollapsibleSection` en `frontend/src/components/operations-ui.tsx`; el contenido plegado permanece montado, así que el estado y los archivos adjuntos no se pierden al plegar.
- Payload, llave idempotente y manejo de errores quedan idénticos a la versión anterior.
- E2E: el escenario de diagnóstico 503 ahora abre la sección plegada de contacto antes de llenarla.

## Evidencia

- `npm run lint`, `npm run typecheck`, `npm run build` en verde.
- Playwright local: **61 escenarios aprobados** (suite completa), incluidos dos nuevos: creación de solicitud de recogida donde el cliente (payload con `intake_mode` y `source`) y validación de fecha obligatoria en la entrega planificada.

## Pendientes

- QA visual en escritorio y móvil (sigue siendo el pendiente P0 de OPS-00/FIN-UI).
- UAT del recorrido completo de las vías reactivadas: solicitud → materialización → asignación → recepción.
