# Simplificación del ingreso de mostrador — 30 de agosto de 2026

**Estado:** implementado en rama `claude/admin-web-context-skucfr`; pendiente de aprobación y merge.

**Alcance:** solo frontend P16 (`/recogidas/nueva`). El contrato de `POST /api/pickup-intakes/walk-in/complete` no cambia.

## Problema

El formulario de nuevo ingreso mostraba cinco tarjetas con ~25 campos, aunque el API solo exige sede, costos por defecto y, por paquete, destinatario, teléfono y dirección. El plan de unificación ya identificaba como riesgo «mostrador demasiado lento».

## Decisión

Divulgación progresiva: lo obligatorio y lo frecuente quedan visibles; lo opcional queda plegado con sus valores por defecto a la vista. Ningún campo ni capacidad se elimina.

## Mapa del formulario simplificado

```text
Nuevo ingreso de paquetes
├── Cliente y sede                         (visible)
│   ├── Cliente (contacto de cobro)       ← a él se factura; sin cliente ⇒ aviso de revisión pendiente
│   ├── Sede Danhei                       ← autoseleccionada (HUB-PRINCIPAL)
│   └── ▸ Contacto, remitente e instrucciones   (plegado; se autollena al elegir cliente)
├── Paquetes                               (visible)
│   ├── Destinatario · Teléfono · Dirección · Valor COD
│   ├── ▸ Más detalles                    (plegado: complemento, ciudad, tamaño, frágil, manejo especial)
│   └── «Marcar rechazo»                  (enlace; abre motivo + foto obligatoria)
├── ▸ Cobro del servicio                   (plegado; resumen: envío/paquete, pago piloto, modalidad sin COD)
├── ▸ ¿Entrega o recibe otra persona?      (plegado: tercero que trae + receptor físico)
└── Resumen fijo: paquetes aceptados · cobro de envío · COD esperado · [Registrar y recibir]
```

El caso típico —cliente conocido, un paquete aceptado— se resuelve con 2 selecciones y 4 campos.

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
- Playwright local: **59 escenarios aprobados** (suite completa).

## Pendientes

- QA visual en escritorio y móvil (sigue siendo el pendiente P0 de OPS-00/FIN-UI).
- Decidir si `/recogidas/nueva` recupera las vías «Danhei recoge» y «entrega planificada» con la misma estructura simplificada; hoy la pantalla sirve solo el ingreso espontáneo, igual que antes de este cambio.
