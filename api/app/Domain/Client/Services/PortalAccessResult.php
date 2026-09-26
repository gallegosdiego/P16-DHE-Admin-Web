<?php

namespace App\Domain\Client\Services;

use App\Models\User;

/**
 * Resultado de dar acceso o de generar una contraseña nueva. La contraseña solo
 * viaja aquí, una vez, para que el panel la muestre o la mande por WhatsApp.
 */
final class PortalAccessResult
{
    public function __construct(
        public readonly User $user,
        public readonly string $password,
        public readonly bool $emailSent,
        public readonly ?string $emailProblem,
        public readonly ?string $whatsappUrl,
    ) {}
}
