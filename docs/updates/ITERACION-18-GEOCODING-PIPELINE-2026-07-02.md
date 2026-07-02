# Iteracion 18 - geocodificacion operativa de pedidos

Fecha: 2026-07-02

## Objetivo

Cerrar el siguiente cuello de botella real del mapa y de las rutas inteligentes:

- coordenadas faltantes en pedidos;
- poca visibilidad operativa de faltantes;
- ausencia de herramienta segura para backfill historico.

## Cambios implementados

### 1. Geocodificacion mas robusta en `Shipment`

El modelo ahora:

- reintenta geocodificar si faltan coordenadas;
- reintenta geocodificar si cambia direccion o ciudad;
- respeta coordenadas manuales si fueron suministradas;
- expone:
  - `has_coordinates`
  - `geocoding_pending`

### 2. Soporte operativo en API de pedidos

`ShipmentController` ahora soporta:

- `GET /api/shipments?has_coordinates=1`
- `GET /api/shipments?has_coordinates=0`
- `GET /api/shipments?needs_geocoding=1`
- `GET /api/shipments/geo-summary`

Ademas, crear/editar pedidos ya acepta:

- `recipient_city`
- `recipient_lat`
- `recipient_lng`

## 3. Comando de backfill historico

Se agrego:

`php artisan shipments:geocode-missing`

Opciones utiles:

- `--limit=100`
- `--id=123`
- `--dry-run`
- `--json`

## 4. Deploy-check mas util

`/api/deploy-check` ahora reporta tambien:

- columnas de geocodificacion;
- bandera `geocoding_ready`;
- bandera `google_maps_geocoding_configured`.

## Validacion

- `php artisan test` OK
- 233 pruebas verdes

## Pendiente que sigue abierto

Aunque la base tecnica ya quedo mejor, aun falta:

- ejecutar backfill real en produccion;
- visualizar estos faltantes dentro del panel admin;
- validar con pedidos reales el porcentaje de cobertura geografica.
