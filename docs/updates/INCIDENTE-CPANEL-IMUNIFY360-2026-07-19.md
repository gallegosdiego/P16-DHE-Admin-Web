# Incidente cPanel e Imunify360 — 19 de julio de 2026

**Estado:** bloqueado en la infraestructura del proveedor antes de ejecutar el despliegue

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

## Conclusión

Otra actualización de Laravel, migración o `.cpanel.yml` no puede resolver este
punto: el task runner no está ejecutando el archivo. La acción requerida
pertenece al proveedor de hosting.

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
