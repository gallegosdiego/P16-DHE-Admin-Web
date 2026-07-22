# Incidente cPanel e Imunify360 — 19 de julio de 2026

**Estado:** limitación de la automatización UAPI; no era la causa del bucle manual

## Evidencia

El repositorio administrado por cPanel descargó los commits de recuperación,
pero **Desplegar commit HEAD** no actualizó el último SHA desplegado ni ejecutó
la primera migración.

Se añadió y ejecutó el workflow manual y de solo lectura
`cpanel-diagnostics`. Las consultas autenticadas a:

- `VersionControl/retrieve`;
- `VersionControlDeployment/retrieve`;
- `UserTasks/retrieve`;

respondieron HTTP 200, pero el cuerpo real fue:

```json
{
  "message": "Access denied by Imunify360 bot-protection. IPs used for automation should be whitelisted"
}
```

No hubo respuesta UAPI y no fue posible consultar la cola. El bloqueo se
produce en Imunify360 antes de llegar a cPanel Git Version Control.

## Conclusión corregida

Este bloqueo afecta las consultas UAPI automatizadas desde GitHub, pero no
explica por sí solo el bucle de **Desplegar commit HEAD** en la interfaz manual.
La causa del bucle manual y su solución están documentadas en
`INCIDENTE-DEPLOY-CONSOLIDADO-2026-07-21.md`: demasiadas tareas secuenciales,
directorio de trabajo incorrecto y salida no redirigida. El deploy manual se
resolvió reduciendo `.cpanel.yml` a tres tareas y ejecutando un script PHP
consolidado.

El proveedor todavía puede habilitar UAPI para automatización, pero no se debe
volver a tratar ese bloqueo como la causa principal del deploy manual.

## Solicitud exacta para soporte

Solicitar a Latinoamérica Hosting:

1. revisar y reiniciar la cola `UserTasks` del usuario `danheiex`;
2. inspeccionar `/home/danheiex/.cpanel/logs/user_task_runner.log`;
3. inspeccionar el `vc_*_git_deploy.log` más reciente;
4. comprobar por qué `VersionControlDeployment::create` queda en HEAD sin
   ejecutar `.cpanel.yml`;
5. permitir las consultas UAPI autenticadas con API Token a
   `/execute/VersionControl/*`, `/execute/VersionControlDeployment/*` y
   `/execute/UserTasks/*`, o indicar el mecanismo autorizado para automatización;
6. confirmar que la protección de Imunify360 no intercepte esas rutas después
   de autenticar el token.

No se solicita desactivar globalmente Imunify360 ni abrir todos los accesos. La
excepción debe limitarse a las rutas autenticadas necesarias o al mecanismo que
el proveedor recomiende.

## Criterio de desbloqueo

- `VersionControlDeployment/retrieve` devuelve una respuesta UAPI real;
- la cola deja de mantener el despliegue indefinidamente en HEAD;
- cPanel ejecuta la primera tarea de `.cpanel.yml`;
- `deploy-cpanel.last-attempt` aparece en el runtime;
- al finalizar, `deploy-cpanel.last-success` contiene el SHA esperado.
