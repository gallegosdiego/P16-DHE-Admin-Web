<?php

namespace App\Mail;

use App\Domain\Client\Models\Client;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Datos de acceso al portal de clientes: bienvenida o contraseña nueva.
 * Se envía en síncrono (en este hosting no corre un worker de colas).
 */
class PortalAccessMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Client $client,
        public User $user,
        public string $password,
        public string $kind = 'granted',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->kind === 'reset'
                ? 'Tu contraseña nueva del portal de clientes — Danhei Express'
                : 'Bienvenido al portal de clientes de Danhei Express',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.portal-access',
            with: [
                'portalUrl' => config('portal.url'),
                'supportWhatsapp' => config('portal.support_whatsapp'),
            ],
        );
    }
}
