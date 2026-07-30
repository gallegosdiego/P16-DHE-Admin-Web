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

## Ficha de cliente y contacto rapido

- En escritorio, `Resumen comercial` y `Revision de cierre` son acordeones
  independientes; los filtros de tipo de pago permanecen visibles.
- La tabla de Clientes mantiene solo nombre, telefono, envios y deuda. El
  correo queda disponible dentro de la ficha del cliente.
- El telefono incluye un acceso directo a WhatsApp mediante `wa.me`.
- El icono de ver abre `/clientes/{id}` en escritorio, con breadcrumb, boton
  de regreso, resumen financiero, historial de envios y direcciones.
- En movil se conserva el detalle como modal y no se cambia la navegacion
  compacta existente.

## Contacto movil en clientes

- `Revision de cierre` conserva un control visible para volver a recoger el
  panel despues de expandirlo en escritorio.
- Las tarjetas moviles muestran accesos compactos para WhatsApp y llamada
  junto al nombre y telefono del cliente.
- El detalle movil mantiene una cabecera fija con ficha, nombre, telefono,
  cerrar, WhatsApp y llamada; el contenido financiero se desplaza debajo.

## Ajuste de escritorio y colores de contacto

- La cabecera de Clientes se distribuye en tres zonas en PC: titulo a la
  izquierda, busqueda centrada y `Nuevo cliente` a la derecha.
- En escritorio, la busqueda usa un boton compacto con icono de lupa; en
  movil conserva el texto `Buscar`.
- La tabla de escritorio agrega WhatsApp como columna independiente entre
  telefono y envios.
- WhatsApp usa realce verde y llamada usa realce azul en tarjetas y detalle
  movil, con una sombra suave al pasar el cursor o tocar.

## Orden y cartera pendiente

- La tabla de PC queda ordenada como `Nombre`, `WhatsApp`, `Telefono`,
  `Envíos` y `Deuda`.
- El contador de `Envíos` usa `owed_shipments_count` de
  `/api/clients-receivable`, no el total historico de paquetes.
- Ese contador representa guias `post_sale` pendientes, facturadas o vencidas;
  al liquidarlas disminuye sin borrar el historial del cliente.
