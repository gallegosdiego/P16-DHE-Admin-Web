# Iteracion 26 - Expediente documental de pilotos - 2026-07-02

## Objetivo

Implementar el expediente documental del piloto para que:

- administracion pueda cargar y revisar documentos desde el detalle del piloto;
- el piloto pueda ver en su cuenta que documentos ya estan cargados;
- el sistema tenga una estructura consistente para futuras validaciones o vencimientos.

## Alcance implementado

### Backend

Se agregaron columnas de documentos al modelo `drivers`:

- `driver_license_photo`
- `vehicle_registration_photo`
- `soat_photo`
- `technical_inspection_photo`
- `national_id_front_photo`
- `national_id_back_photo`

Archivo:

- `D:\DHE dev\P16-DHE-Admin-Web\api\database\migrations\2026_07_02_210000_add_document_columns_to_drivers_table.php`

Se agregaron endpoints:

- `GET /api/driver/profile`
- `POST /api/drivers/{driver}/documents`

Archivos clave:

- `D:\DHE dev\P16-DHE-Admin-Web\api\app\Http\Controllers\Api\DriverController.php`
- `D:\DHE dev\P16-DHE-Admin-Web\api\routes\api.php`

Se implemento:

- payload normalizado del expediente;
- resumen de completitud;
- reemplazo de archivos;
- borrado limpio del archivo anterior cuando se reemplaza o retira.

### Panel administrativo

Se agrego la seccion `Expediente documental` en el detalle del piloto.

Archivo:

- `D:\DHE dev\P16-DHE-Admin-Web\frontend\src\app\(admin)\conductores\[id]\page.tsx`

Capacidades:

- ver documentos ya cargados;
- abrir la imagen completa;
- subir nuevos archivos;
- retirar documentos puntuales;
- revisar porcentaje de completitud.

### App piloto

Se agrego el expediente documental dentro de `Perfil`.

Archivo:

- `D:\DHE dev\P15-DHE-App-Repartidor\app\(tabs)\perfil.tsx`

Capacidades:

- consultar el expediente del piloto actual;
- ver cantidad de documentos cargados;
- abrir vista previa de cada imagen.

## Decisiones de arquitectura

### 1. Upload solo administrativo

En esta iteracion, la carga de documentos se dejo del lado administrativo.

Motivo:

- reduce complejidad operativa inicial;
- evita permisos extra de camara/galeria para un flujo que aun no se definio como obligatorio;
- mantiene el primer release del expediente enfocado en visibilidad y control.

### 2. Perfil scoped para piloto

Se creo `GET /api/driver/profile` en vez de sobrecargar `GET /api/me`.

Motivo:

- separa identidad/autenticacion de datos operativos;
- permite evolucionar perfil del piloto sin contaminar el contrato auth;
- deja mas claro el ownership del payload.

### 3. Reutilizacion del patron de archivos publicos

Se reutilizo el mismo enfoque ya usado por evidencia e intake:

- almacenamiento en disco `public`;
- URL lista para cliente web o movil;
- limpieza del archivo previo al reemplazarlo.

## Validacion ejecutada

- `php artisan test --filter=ScopedEndpointTest`
- `npm run typecheck`
- `npx tsc --noEmit`

Estado:

- backend: **OK**
- panel admin: **OK**
- app piloto: **OK**

## Pendiente real despues de esta iteracion

Lo que queda abierto ya no es el expediente basico, sino mejoras futuras:

- permitir que el piloto cargue o actualice documentos desde la app;
- agregar fechas de vencimiento y alertas para SOAT/licencia/tecnomecanica;
- filtros administrativos por expediente incompleto o vencido.
