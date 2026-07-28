# Cierre UAT del ingreso y despliegue cPanel — 28 de julio de 2026

## Resultado

El responsable funcional confirmó que el ingreso espontáneo de paquetes funciona en producción desde el panel administrativo P16 después de desplegar el commit `88b9005` en cPanel.

Este cierre cubre el flujo de mostrador para crear el ingreso y no declara terminados los recorridos integrales P14 → P16 → P15, las rutas, la entrega ni la conciliación financiera.

## Contrato operativo de publicación

`.cpanel.yml` conserva exactamente tres tareas:

1. crear el directorio de logs;
2. copiar `api/.` al destino de la API;
3. ejecutar `scripts/deploy-cpanel-all.php` desde `/home/danheiex/api.danheiexpress.com`.

El tercer paso agrupa migraciones, reparaciones y verificaciones en un proceso PHP. El resultado se valida con:

- `storage/logs/deploy-cpanel.last-success` para éxito operativo;
- `storage/logs/deploy-cpanel.last-failure` para una fase crítica fallida;
- `GET /api/runtime-check` con una cuenta autorizada para confirmar disponibilidad del esquema.

## Procedimiento para futuras publicaciones

1. Integrar el cambio aprobado en `main`.
2. Actualizar el repositorio en Git Version Control de cPanel.
3. Confirmar que `HEAD Commit` coincide con el SHA aprobado.
4. Ejecutar **Desplegar commit HEAD** una sola vez.
5. Revisar el marcador de éxito o de fallo.
6. Ejecutar el caso funcional afectado y registrar la evidencia.

No se deben agregar migraciones como tareas nuevas ni repetir el botón de despliegue mientras exista un intento activo.
