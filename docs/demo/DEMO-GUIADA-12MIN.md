# Demo Guiada (10-12 min)

## Objetivo
Mostrar que el panel admin ya opera con backend real, con foco en operacion diaria, control financiero y trazabilidad.

## Pre-demo checklist (5 min antes)
- Backend levantado en `http://127.0.0.1:8000`.
- Frontend levantado en `http://127.0.0.1:3000`.
- Usuario demo:
  - Email: `admin@danheiexpress.com`
  - Password: `DanheiAdmin2026!`
- Navegador en modo limpio (sin extensiones bloqueando descargas CSV).

## Guion minuto a minuto

### 0:00 - 1:00 | Login y contexto
- Entrar a `/login`.
- Iniciar sesion con usuario admin.
- Mensaje clave:
  - "Todo este flujo esta conectado al backend Laravel y respeta permisos por rol."

### 1:00 - 3:00 | Dashboard live
- Ir a `Dashboard`.
- Mostrar:
  - Auto refresh cada 30s.
  - Indicador de conexion.
  - Ultimos envios reales.
  - Widget financiero expandible.
- Clic en `Actualizar ahora`.
- Mensaje clave:
  - "El dashboard no usa mocks; toma KPIs, actividad y eventos reales."

### 3:00 - 5:00 | Pedidos batch
- Ir a `Pedidos`.
- Seleccionar varios envios.
- Ejecutar:
  - Asignacion masiva de conductor.
  - Cambio masivo de estado.
- Mostrar toast de resultado.
- Mensaje clave:
  - "Batch ya usa endpoints dedicados (`/shipments/batch-*`), no bucles cliente por envio."

### 5:00 - 7:00 | Usuarios + Auditoria
- Ir a `Usuarios`.
- Abrir `Nuevo usuario` (no es obligatorio guardar en demo).
- Ir a `Auditoria`.
- Mostrar tabla y paginacion.
- Mensaje clave:
  - "Creamos modulo de usuarios y trazabilidad operativa, ambos conectados a API real."

### 7:00 - 9:00 | Reportes con export real
- Ir a `Reportes`.
- Cambiar rango de fechas.
- Clic en `Aplicar`.
- Ejecutar:
  - `Exportar envios`
  - `Exportar financiero`
- Mensaje clave:
  - "Export ahora viene del backend (`/reports/export/*`), no CSV local del navegador."

### 9:00 - 10:30 | Pagos y riesgo operativo
- Ir a `Pagos`.
- Mostrar board conductor.
- Probar una accion disponible (recaudo, liquidar o pago conductor).
- Mensaje clave:
  - "Cada accion usa shipment id real entregado por API y se habilita solo si aplica."

### 10:30 - 12:00 | Metricas y cierre
- Ir a `Metricas`.
- Mostrar:
  - Throughput/hora.
  - Error rate.
  - Lead time promedio.
  - Alertas basicas.
- Mensaje clave:
  - "Pasamos de ver datos a gestionar con indicadores y umbrales operativos."

## Plan B (si algo falla en vivo)
- Si falla auth: validar `php artisan serve` y migraciones seed.
- Si falla export CSV: verificar popup/download policy del navegador.
- Si falla modulo puntual: continuar con ruta alterna `Dashboard -> Reportes -> Metricas`.

## Cierre sugerido (30s)
"Hoy ya tenemos operacion real, trazabilidad y control financiero en un solo panel. El siguiente paso es endurecer E2E y observabilidad para escalar sin regresiones."
