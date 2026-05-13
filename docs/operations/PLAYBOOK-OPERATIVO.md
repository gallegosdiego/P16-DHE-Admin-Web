# Playbook Operativo

## 1) Arranque rapido local

### Backend
```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 2) Credenciales demo
- Email: `admin@danheiexpress.com`
- Password: `DanheiAdmin2026!`
- Rol: `superadmin`

## 3) Smoke operacional (3-5 min)
- Login OK.
- Dashboard live:
  - KPI carga.
  - Refresh manual OK.
- Pedidos:
  - Seleccion multiple visible.
  - Batch assign/status responde.
- Reportes:
  - `/reports/stats` con rango de fechas.
  - Export de ambos CSV.
- Pagos:
  - Board conductor visible.
  - Boton de accion habilitado solo cuando aplica.
- Usuarios y Auditoria:
  - Tabla y paginacion cargan.

## 4) Runbooks de incidente

### A) Frontend no carga datos
- Revisar `NEXT_PUBLIC_API_URL` (si aplica).
- Revisar backend `http://127.0.0.1:8000/api/health`.
- Confirmar token en login y `dhe_auth_token` cookie.

### B) 500 en backend
- Ver logs:
```bash
cd api
Get-Content storage/logs/laravel.log -Tail 120
```
- Causa comun: sqlite no inicializado.
- Corregir:
```bash
php artisan migrate:fresh --seed
```

### C) Export CSV falla
- Confirmar permisos `reports.view`.
- Confirmar popup/download permitido por navegador.
- Probar endpoints directos autenticados:
  - `/api/reports/export/shipments`
  - `/api/reports/export/financial`

### D) Acciones financieras deshabilitadas
- Revisar que `driver-board` entregue:
  - `collect_shipment_id`
  - `settle_shipment_id`
  - `driver_paid_shipment_id`
- Si vienen `null`, no hay caso accionable para ese conductor.

## 5) Checklist de release
- Frontend:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Backend:
  - `php artisan test --filter=ProfileTest`
  - `php artisan test --filter=ShipmentTest`
  - `php artisan test --filter=UserAndReportTest`

## 6) Escalacion
- Incidente P1 (caida login/dashboard/reportes): abrir canal inmediato y bloquear despliegues.
- Incidente P2 (modulo puntual): rollback funcional por ruta y fix hotpatch.
- Incidente P3 (polish visual): documentar y programar en sprint siguiente.
