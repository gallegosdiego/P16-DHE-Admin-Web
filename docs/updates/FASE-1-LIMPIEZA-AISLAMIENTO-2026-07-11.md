# Fase 1 — Limpieza operativa y aislamiento de integraciones

Fecha de cierre: 2026-07-11

## Resultado

La base local de pruebas quedó preparada para reconstruir el flujo operativo sin borrar la identidad del ecosistema Danhei. Se eliminaron únicamente datos transaccionales y se conservaron usuarios, clientes, pilotos, direcciones, roles, permisos y configuración estructural.

WhatsApp quedó aislado mediante banderas de funcionalidad. El sistema de recogidas continúa disponible como capacidad operativa genérica y no depende de que Meta autorice la integración.

## Limpieza aplicada

Comando incorporado:

```powershell
php artisan danhei:reset-operations --dry-run --json
php artisan danhei:reset-operations --force --json
```

El comando solo puede ejecutarse en entornos `local`, `testing` o `staging`, genera un reporte auditable y limita la eliminación de archivos a directorios operativos permitidos.

Resultado de la ejecución local:

| Entidad operativa | Eliminados |
|---|---:|
| Envíos | 23 |
| Eventos de envío | 31 |
| Paradas de ruta | 8 |
| Rutas | 1 |
| Notificaciones | 3 |

Entidades preservadas:

| Entidad maestra | Conservados |
|---|---:|
| Usuarios | 4 |
| Clientes | 7 |
| Pilotos | 6 |

Los seis pilotos se normalizaron al estado activo. El reporte de la ejecución quedó en `storage/app/private/operations/resets/reset-20260711-173152-752302.json`.

## Aislamiento de WhatsApp

Se agregaron tres banderas independientes:

```dotenv
WHATSAPP_INBOUND_ENABLED=false
WHATSAPP_OUTBOUND_ENABLED=false
WHATSAPP_ADMIN_UI_ENABLED=false
NEXT_PUBLIC_WHATSAPP_ADMIN_UI_ENABLED=false
```

- La entrada de webhooks queda cerrada cuando `WHATSAPP_INBOUND_ENABLED` está desactivada.
- El procesamiento en segundo plano ignora de forma explícita mensajes recibidos mientras la integración esté desactivada.
- Las rutas administrativas exclusivas de WhatsApp quedan ocultas y protegidas.
- Los controles exclusivos de WhatsApp desaparecen del frontend.
- El módulo se presenta como **Recogidas**, no como **Recogidas WA**.
- Las rutas genéricas para gestionar solicitudes de recogida permanecen disponibles.

## Archivos principales

- `api/app/Console/Commands/ResetOperationalDataCommand.php`
- `api/app/Http/Middleware/EnsureFeatureEnabled.php`
- `api/config/whatsapp_pickups.php`
- `api/routes/api.php`
- `frontend/src/lib/features.ts`
- `frontend/src/app/(admin)/recogidas/page.tsx`

## Validación

- Backend, pruebas funcionales por lotes: **317 pruebas, 1443 aserciones, todas aprobadas**.
- Backend, pruebas unitarias: **1 prueba, 1 aserción, aprobada**.
- Frontend, comprobación de tipos: aprobada.
- Frontend, lint: aprobado.
- Frontend, compilación de producción: aprobada.
- `git diff --check`: sin errores de espacios o parches inválidos; solo avisos de normalización CRLF/LF.

La ejecución monolítica de toda la suite superó el tiempo disponible del proceso, sin registrar fallos. Por eso se ejecutó la misma cobertura funcional dividida en grupos.

## Estado del esquema local

La base local todavía tiene migraciones históricas pendientes. El comando de limpieza fue diseñado para tolerar tablas y columnas opcionales, pero antes de construir la Fase 2 se debe actualizar el esquema existente y comprobar que las migraciones pendientes son compatibles con los datos maestros preservados.

## Siguiente bloque

La Fase 2 construirá la base operativa común para:

1. sedes y puntos Danhei;
2. recogida en el local del cliente;
3. entrega programada del cliente en una sede;
4. recepción espontánea sin solicitud previa;
5. tareas asignables a piloto o recolector autorizado;
6. lotes y paquetes recibidos, faltantes o rechazados;
7. intentos de entrega;
8. evidencias selladas;
9. cadena de custodia auditable.
