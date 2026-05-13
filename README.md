# P16-DHE-Admin-Web — Danhei Express

Panel administrativo del ecosistema Danhei Express.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Laravel 13 + PHP 8.3 |
| Frontend | Next.js 15 + TypeScript + TailwindCSS |
| Base de datos | SQLite (dev) / PostgreSQL + PostGIS (prod) |
| Auth | Laravel Sanctum + Spatie Permission |
| Arquitectura | API-first + DDD modular |

## Estructura

```
P16-DHE-Admin-Web/
├── api/                  ← Laravel 13 (backend)
│   ├── app/
│   │   ├── Domain/       ← DDD: Shipment, Client, Driver, Financial, User, Shared
│   │   └── Http/Controllers/Api/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   └── routes/api.php
├── frontend/             ← Next.js 15 (frontend)
│   └── src/
│       ├── app/
│       │   ├── (admin)/  ← Route group protegido
│       │   └── login/
│       ├── lib/          ← Auth context, mock data, helpers
│       └── components/
└── boceto-app-web/       ← Prototipo de referencia (HTML/CSS/JS)
```

## Instalación local

### Requisitos
- PHP 8.3+
- Composer 2.x
- Node.js 22+
- npm 10+

### Backend

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --port=8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend corre en `http://localhost:3000`
Backend corre en `http://localhost:8000`

### Credenciales demo

```
Email:    admin@danheiexpress.com
Password: DanheiAdmin2026!
Rol:      superadmin
```

## API Endpoints (35 rutas)

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check (público) |
| POST | `/api/login` | Login → retorna token |
| POST | `/api/logout` | Logout (auth) |
| GET | `/api/me` | Perfil del usuario (auth) |

### Dashboard
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dashboard` | KPIs del día + financiero |

### Envíos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/shipments` | Listar (filtros: status, driver_id, search, etc.) |
| POST | `/api/shipments` | Crear envío (guía automática) |
| GET | `/api/shipments/{id}` | Detalle con timeline |
| PUT | `/api/shipments/{id}` | Actualizar datos |
| POST | `/api/shipments/{id}/status` | Cambiar estado |
| POST | `/api/shipments/{id}/assign` | Asignar conductor |

### Clientes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/clients` | Listar (filtros: search, billing_type) |
| POST | `/api/clients` | Crear |
| GET | `/api/clients/{id}` | Detalle + resumen financiero |
| PUT | `/api/clients/{id}` | Actualizar |
| GET | `/api/clients-receivable` | ¿Quién me debe? |

### Conductores
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/drivers` | Listar con stats |
| POST | `/api/drivers` | Crear |
| GET | `/api/drivers/{id}` | Detalle + resumen del día |
| PUT | `/api/drivers/{id}` | Actualizar |
| POST | `/api/drivers/{id}/toggle-status` | Activar/Inactivar |

### Financiero
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/financial/overview` | Dashboard financiero |
| GET | `/api/financial/driver-board` | Board de recaudo por conductor |
| POST | `/api/financial/shipments/{id}/collect` | Marcar recaudado |
| POST | `/api/financial/shipments/{id}/settle` | Liquidar |
| POST | `/api/financial/shipments/{id}/driver-paid` | Marcar pago conductor |
| POST | `/api/financial/settle-batch` | Liquidar lote |

### Gastos fijos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/expenses` | Listar con estado de pago |
| POST | `/api/expenses` | Crear |
| PUT | `/api/expenses/{id}` | Actualizar |
| POST | `/api/expenses/{id}/pay` | Marcar pagado |

### Nómina / Empleados
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/employees` | Listar con último pago |
| POST | `/api/employees` | Crear |
| PUT | `/api/employees/{id}` | Actualizar |
| POST | `/api/employees/{id}/pay` | Registrar pago nómina |

## Roles y permisos

| Rol | Descripción |
|-----|------------|
| `superadmin` | Acceso total (bypass) |
| `administrador` | Gestión completa |
| `operador` | Envíos + conductores (sin financiero) |
| `conductor` | Solo sus envíos |
| `cliente` | Solo sus envíos |

## Datos demo

- 7 clientes (3 empresas post-venta, 4 personas contra entrega)
- 5 conductores (4 motos, 1 bicicleta)
- 7 envíos en distintos estados
- Timeline de eventos auditables
- 2 gastos fijos (arriendo $1.2M, internet $85K)
- 3 empleados (administrador, vendedora, despachador)

## Repositorios

- **Este proyecto:** https://github.com/gallegosdiego/P16-DHE-Admin-Web
- **App Cliente:** https://github.com/gallegosdiego/P14-DHE-app-Cliente-
- **App Repartidor:** https://github.com/gallegosdiego/P15-DHE-App-Repartidor-
