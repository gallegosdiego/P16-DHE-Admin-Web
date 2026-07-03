# Iteracion 27 - Autogestion documental y vencimientos - 2026-07-02

## Objetivo

Completar la siguiente capa del expediente documental para que:

- el piloto pueda subir sus propios documentos desde la app;
- administracion y piloto vean fechas de vencimiento y alertas consistentes;
- el backend entregue un payload util para QA, panel y futuras notificaciones.

## Alcance implementado

### Backend

Se agregaron columnas de vencimiento en `drivers` para los documentos expirables:

- `driver_license_expires_at`
- `soat_expires_at`
- `technical_inspection_expires_at`

Archivo:

- `D:\DHE dev\P16-DHE-Admin-Web\api\database\migrations\2026_07_02_230000_add_document_expiry_columns_to_drivers_table.php`

Se amplio `DriverController` para:

- permitir `POST /api/driver/documents` scoped al piloto autenticado;
- seguir soportando `POST /api/drivers/{driver}/documents` desde admin;
- aceptar fechas `YYYY-MM-DD`;
- devolver por documento:
  - `supports_expiry`
  - `expires_at`
  - `days_to_expiry`
  - `alert_level`
  - `alert_message`
- devolver resumen agregado:
  - `count_missing`
  - `count_warning`
  - `count_expired`
  - `needs_attention_count`

Archivos:

- `D:\DHE dev\P16-DHE-Admin-Web\api\app\Http\Controllers\Api\DriverController.php`
- `D:\DHE dev\P16-DHE-Admin-Web\api\app\Domain\Driver\Models\Driver.php`
- `D:\DHE dev\P16-DHE-Admin-Web\api\routes\api.php`

### Panel administrativo

En el detalle del piloto se extendio `Expediente documental` con:

- resumen de faltantes / por vencer / vencidos;
- badge por estado documental;
- campo de vencimiento para documentos expirables;
- guardado conjunto de archivo + fecha.

En el listado de pilotos se agrego filtro por expediente:

- `Expediente critico`
- `Con faltantes`
- `Por vencer`
- `Vencidos`
- `Completos`

Archivo:

- `D:\DHE dev\P16-DHE-Admin-Web\frontend\src\app\(admin)\conductores\[id]\page.tsx`

### App piloto

El perfil del piloto ahora permite:

- seleccionar documento desde camara o galeria;
- registrar o corregir fecha de vencimiento;
- ver alertas documentales desde el mismo perfil;
- guardar cambios hacia backend con `multipart/form-data`.

Archivos:

- `D:\DHE dev\P15-DHE-App-Repartidor\app\(tabs)\perfil.tsx`
- `D:\DHE dev\P15-DHE-App-Repartidor\lib\api.ts`
- `D:\DHE dev\P15-DHE-App-Repartidor\lib\types.ts`

## Reglas de alerta implementadas

- `missing`: falta el archivo;
- `warning`: falta fecha o vence en <= 30 dias;
- `expired`: fecha menor a hoy;
- `ok`: documento presente y sin riesgo inmediato.

## Validacion ejecutada

- `php artisan test --filter=ScopedEndpointTest`
- `npm run typecheck`
- `npx tsc --noEmit`

Estado:

- backend: **OK**
- panel admin: **OK**
- app piloto: **OK**

## Pendiente real despues de esta iteracion

- QA en dispositivo real del flujo camara / galeria;
- decidir si se agregan recordatorios push por vencimiento;
- exponer filtros globales de conductores con expediente critico.
