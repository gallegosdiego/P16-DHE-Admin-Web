# Cierre de clientes y papelera administrativa

**Fecha:** 29 de julio de 2026
**Repositorio:** `gallegosdiego/P16-DHE-Admin-Web`
**Implementación:** `8d474cc`

## Alcance

Se cerró el ajuste del módulo comercial de clientes y se dejó una papelera
administrativa para clientes, pilotos y usuarios.

## Cambios funcionales

- La tabla de Clientes prioriza nombre, teléfono, preferencias de pago, envíos
  y deuda.
- Las acciones de ver, editar y eliminar usan iconos con etiquetas accesibles.
- El filtro `0 pendientes` de Revisión de cierre usa la misma geometría del
  botón `Actualizar`, sin alterar colores.
- Se eliminó el control `Mostrar archivados` del módulo Clientes.
- La navegación Admin incluye `Papelera` con secciones desplegables para
  clientes, pilotos y usuarios.
- Restaurar devuelve el maestro a la operación; eliminar desde la papelera
  aplica un purge lógico.

## Contrato de archivado

- El primer eliminar usa `DELETE` y aplica soft delete.
- La papelera consulta `GET /api/clients-trashed`, `GET /api/drivers-trashed`
  y `GET /api/users-trashed`.
- Restaurar usa los endpoints `POST .../{id}/restore` correspondientes.
- El purge usa `POST .../{id}/purge`, exige que el registro esté en papelera y
  conserva guías, paquetes, saldos y auditoría.
- El campo `purged_at` funciona como tombstone: el maestro deja de aparecer en
  bandejas operativas, pero sus referencias históricas no se rompen.

## Despliegue

La migración `api/database/migrations/2026_07_29_133000_add_purged_at_to_master_records.php`
agrega `purged_at` a clientes, pilotos y usuarios. El flujo de cPanel debe
ejecutar la migración mediante `api/scripts/deploy-cpanel-all.php`; en otro
flujo de despliegue equivalente se debe ejecutar `php artisan migrate --force`
antes de validar la papelera.

La lista de migraciones operativas de `deploy-cpanel-all.php` incluye esta
migración y `CpanelDeploymentContractTest` verifica que no se omita en futuras
entregas. Si el API devuelve 500 después de publicar cambios de papelera,
primero se debe ejecutar **Deploy HEAD Commit** en cPanel y confirmar el
marcador `storage/logs/deploy-cpanel.last-success`.

## Verificación

- Frontend: `npm run lint`, `npm run typecheck` y `npm run build` aprobados.
- Backend: `php artisan test --filter=ClientEdgeCaseTest` aprobado.
- Rutas de papelera verificadas con `php artisan route:list`.
- `git diff --check` aprobado.

## Ajuste visual posterior

- La vista inicial de Clientes muestra solo nombre, teléfono, envíos, deuda y
  acciones.
- Las preferencias de pago permanecen disponibles dentro del formulario y el
  detalle del cliente, pero no ocupan espacio en el listado operativo.
- Los iconos de ver, editar y enviar a papelera resaltan en fucsia al pasar el
  cursor, tanto en tabla como en tarjetas móviles.

## Optimización móvil

- Los filtros y KPIs se agrupan en un acordeón `Resumen comercial`, cerrado por
  defecto para dejar el buscador y el listado más cerca.
- `Revisión de cierre` se presenta como una fila compacta con flecha y solo
  despliega sus pendientes cuando el usuario la abre.
- La distribución completa de escritorio permanece sin cambios.

## Encabezados compactos

- `Nuevo cliente` vive junto al título de Clientes; en móvil se representa
  como un botón cuadrado con `+` y tooltip accesible.
- El buscador y `Buscar` permanecen en su propia fila sin cambiar su flujo.
- En el navbar móvil se oculta únicamente `Panel Operativo`; `Danhei Admin`
  permanece visible y el navbar de escritorio conserva la etiqueta completa.
