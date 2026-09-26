<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal de clientes — Danhei Express</title>
</head>
<body style="margin:0;padding:0;background:#fff3f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#131826;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff3f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8dce2;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#0c0f1a;padding:24px 28px;border-bottom:3px solid #d1007f;">
              <span style="font-size:22px;font-weight:800;letter-spacing:0.02em;color:#ffffff;">DANHEI</span>
              <span style="font-size:22px;font-weight:800;letter-spacing:0.02em;color:#ff5cb4;"> EXPRESS</span>
              <div style="margin-top:6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#b7bdcc;">Portal de clientes</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">
                @if ($kind === 'reset')
                  Tu contraseña nueva
                @else
                  Hola, {{ \Illuminate\Support\Str::of($user->name)->explode(' ')->first() }}. Ya tienes acceso.
                @endif
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5f6675;">
                @if ($kind === 'reset')
                  Generamos una contraseña nueva para el acceso de <strong style="color:#131826;">{{ $client->company ?: $client->name }}</strong>. La anterior ya no funciona.
                @else
                  Desde el portal de <strong style="color:#131826;">{{ $client->company ?: $client->name }}</strong> puedes pedir recogidas, seguir tus envíos paso a paso y consultar tus saldos.
                @endif
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff3f8;border:1px solid #e8dce2;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;font-size:14px;line-height:1.7;">
                    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5f6675;">Tus datos de acceso</div>
                    <div><strong>Usuario:</strong> {{ $user->email }}</div>
                    <div><strong>Contraseña:</strong> <span style="font-family:Consolas,monospace;font-size:15px;color:#d1007f;">{{ $password }}</span></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background:#d1007f;border-radius:2px;box-shadow:0 0 18px rgba(209,0,127,0.45);">
                    <a href="{{ $portalUrl }}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Entrar al portal</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5f6675;">
                Por seguridad, cambia la contraseña en <strong style="color:#131826;">Mi perfil</strong> después de entrar. Nunca te la pediremos por teléfono.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#5f6675;">
                ¿Dudas? Escríbenos por WhatsApp al <a href="https://wa.me/{{ $supportWhatsapp }}" style="color:#d1007f;">+{{ $supportWhatsapp }}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e8dce2;font-size:11px;line-height:1.6;color:#8d93a3;">
              DANHEI EXPRESS S.A.S. · Calle 13 #15-48, Locales 91 y 92, Bogotá D.C. · Recibes este correo porque tu empresa tiene acceso al portal de clientes.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
