<?php

return [
    /*
    | Portal de clientes (P14). Lo usa el alta de accesos para el enlace del
    | mensaje de bienvenida.
    */
    'url' => env('CLIENT_PORTAL_URL', 'https://portal.danheiexpress.com'),

    /*
    | Enviar por correo los datos de acceso. Apagado hasta que el correo saliente
    | del servidor esté configurado (MAIL_*): mientras tanto el panel muestra la
    | contraseña una vez y ofrece enviarla por WhatsApp.
    */
    'access_email' => (bool) env('PORTAL_ACCESS_EMAIL', false),

    // WhatsApp de soporte que aparece en el mensaje de bienvenida.
    'support_whatsapp' => env('PORTAL_SUPPORT_WHATSAPP', '573112206587'),
];
