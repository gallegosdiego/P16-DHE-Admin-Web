<?php

namespace App\Domain\Client\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Shared\Models\AuditLog;
use App\Mail\PortalAccessMail;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;

/**
 * Acceso de una empresa cliente al portal: crear su usuario, darle una contraseña
 * nueva y activar o desactivar el acceso.
 *
 * Solo lo da el equipo de Danhei (superadmin y administrador); no hay registro
 * público. El vínculo es users.client_id y el rol `client`: con eso el portal
 * enseña a la cuenta únicamente lo de su empresa (ver ClientPortalBoundary).
 * Un acceso por empresa.
 */
class PortalAccessService
{
    /**
     * Datos que ya tiene la ficha, para rellenar el formulario sin reescribir nada.
     *
     * @return array{name: string, email: string, phone: ?string}
     */
    public function suggestion(Client $client): array
    {
        $email = mb_strtolower(trim((string) $client->email));

        return [
            'name' => trim((string) ($client->name ?: $client->company)),
            'email' => filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '',
            'phone' => $client->phone ?: $client->company_phone,
        ];
    }

    /**
     * Crea la cuenta del portal y la vincula a la empresa.
     *
     * @param  array{name: string, email: string, phone?: ?string, password?: ?string}  $data
     *
     * @throws ValidationException si la empresa ya tiene acceso
     */
    public function grant(Client $client, array $data, User $actor, bool $sendEmail = true): PortalAccessResult
    {
        $password = $this->passwordFrom($data['password'] ?? null);

        $user = DB::transaction(function () use ($client, $data, $password, $actor) {
            // Bloqueo de la fila: dos personas dando acceso a la vez a la misma
            // empresa no pueden crear dos cuentas.
            $locked = Client::whereKey($client->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->portalUser()) {
                throw ValidationException::withMessages([
                    'client' => 'Este cliente ya tiene acceso al portal.',
                ]);
            }

            $user = new User;
            $user->forceFill([
                'name' => trim($data['name']),
                'email' => mb_strtolower(trim($data['email'])),
                'phone' => $data['phone'] ?? null,
                'password' => Hash::make($password),
                'client_id' => $locked->id,
                'active' => true,
                // El correo lo aporta la propia empresa: no se pide verificarlo.
                'email_verified_at' => now(),
            ])->save();

            $user->syncRoles($this->clientRoles());

            $this->audit('portal_access.granted', $locked, $actor, null, ['email' => $user->email]);

            return $user;
        });

        return $this->deliver($client, $user, $password, $actor, $sendEmail, 'granted');
    }

    /**
     * Contraseña nueva y se le reenvía el acceso. Es el camino cuando el cliente
     * la olvida: las sesiones abiertas dejan de valer.
     */
    public function resetPassword(Client $client, User $actor, ?string $password = null, bool $sendEmail = true): PortalAccessResult
    {
        $user = $this->portalUserOrFail($client);
        $password = $this->passwordFrom($password);

        $user->forceFill(['password' => Hash::make($password)])->save();
        $user->tokens()->delete();

        $this->audit('portal_access.password_reset', $client, $actor, null, ['email' => $user->email]);

        return $this->deliver($client, $user, $password, $actor, $sendEmail, 'reset');
    }

    /** Activa o desactiva el acceso sin borrar la cuenta ni el vínculo. */
    public function setActive(Client $client, bool $active, User $actor): User
    {
        $user = $this->portalUserOrFail($client);

        $user->forceFill(['active' => $active])->save();

        if (! $active) {
            $user->tokens()->delete();
        }

        $this->audit(
            $active ? 'portal_access.enabled' : 'portal_access.disabled',
            $client,
            $actor,
            ['active' => ! $active],
            ['active' => $active, 'email' => $user->email],
        );

        return $user;
    }

    public function emailEnabled(): bool
    {
        return (bool) config('portal.access_email')
            && ! in_array(config('mail.default'), ['log', 'array', null], true);
    }

    /**
     * Estado del portal por empresa para la lista del panel: quién tiene acceso,
     * si está activo y cuándo entró por última vez.
     *
     * @return list<array<string, mixed>>
     */
    public function statusByClient(): array
    {
        $clients = Client::query()
            ->with(['users' => fn ($q) => $q->with('roles:id,name')->orderBy('id')])
            ->orderBy('name')
            ->get(['id', 'name', 'company', 'email', 'phone', 'is_active']);

        $lastSent = AuditLog::query()
            ->where('entity_type', 'Client')
            ->whereIn('action', ['portal_access.granted', 'portal_access.password_reset'])
            ->orderBy('id')
            ->get(['entity_id', 'action', 'occurred_at'])
            ->keyBy('entity_id');

        return $clients->map(function (Client $client) use ($lastSent): array {
            $user = $client->users->first(fn (User $u) => $u->hasPortalClientRoleOnly());
            $last = $lastSent->get($client->id);

            return [
                'client' => [
                    'id' => $client->id,
                    'name' => $client->name,
                    'company' => $client->company,
                    'email' => $client->email,
                    'phone' => $client->phone,
                    'is_active' => (bool) $client->is_active,
                ],
                'status' => $user === null ? 'sin_acceso' : ($user->active === false ? 'desactivado' : 'activo'),
                'user' => $user ? $this->userPayload($user) : null,
                'last_credentials_at' => $last?->occurred_at?->toIso8601String(),
                'last_credentials_kind' => $last === null ? null : ($last->action === 'portal_access.password_reset' ? 'Contraseña nueva' : 'Bienvenida'),
            ];
        })->values()->all();
    }

    /** @return array<string, mixed> */
    public function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'active' => $user->active !== false,
            'last_login_at' => $user->last_login_at instanceof Carbon ? $user->last_login_at->toIso8601String() : null,
            'created_at' => $user->created_at?->toIso8601String(),
        ];
    }

    /** Contraseña legible: sin 0/O ni 1/l/I, fácil de dictar por teléfono. */
    public function generatePassword(): string
    {
        $alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $chars = '';
        for ($i = 0; $i < 12; $i++) {
            $chars .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return substr($chars, 0, 4).'-'.substr($chars, 4, 4).'-'.substr($chars, 8, 4);
    }

    private function passwordFrom(?string $password): string
    {
        $password = $password !== null ? trim($password) : '';

        return $password !== '' ? $password : $this->generatePassword();
    }

    /**
     * Entrega de los datos de acceso. Por correo solo si está configurado; siempre
     * se devuelve el enlace de WhatsApp con el mensaje listo para el cliente.
     *
     * La contraseña viaja en claro en el mensaje (misma práctica que el alta manual
     * que se hacía hasta ahora); el cliente puede cambiarla en su perfil.
     */
    private function deliver(Client $client, User $user, string $password, User $actor, bool $sendEmail, string $kind): PortalAccessResult
    {
        $whatsappUrl = $this->whatsappUrl($client, $user, $password, $kind);

        if (! $sendEmail) {
            return new PortalAccessResult($user, $password, false, null, $whatsappUrl);
        }

        if (! $this->emailEnabled()) {
            return new PortalAccessResult($user, $password, false, 'El correo de accesos no está activado: entrega la contraseña por WhatsApp.', $whatsappUrl);
        }

        try {
            Mail::to($user->email)->send(new PortalAccessMail($client, $user, $password, $kind));
            $this->audit('portal_access.email_sent', $client, $actor, null, ['to' => $user->email, 'kind' => $kind]);

            return new PortalAccessResult($user, $password, true, null, $whatsappUrl);
        } catch (\Throwable $e) {
            report($e);

            return new PortalAccessResult($user, $password, false, 'El servidor de correo rechazó el envío: entrega la contraseña por WhatsApp.', $whatsappUrl);
        }
    }

    private function whatsappUrl(Client $client, User $user, string $password, string $kind): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) ($user->phone ?: $client->phone ?: $client->company_phone));

        if ($digits === null || strlen($digits) < 10) {
            return null;
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '3')) {
            $digits = '57'.$digits;
        }

        $first = Str::of($user->name)->explode(' ')->first() ?: $user->name;
        $intro = $kind === 'reset'
            ? "Hola {$first}, te enviamos una contraseña nueva para el portal de clientes de Danhei Express."
            : "Hola {$first}, ya tienes acceso al portal de clientes de Danhei Express. Desde ahí puedes pedir recogidas y seguir tus envíos.";

        $message = implode("\n", [
            $intro,
            '',
            'Entra en: '.config('portal.url'),
            'Usuario: '.$user->email,
            'Contraseña: '.$password,
            '',
            'Te recomendamos cambiarla en Mi perfil después de entrar.',
        ]);

        return 'https://wa.me/'.$digits.'?text='.rawurlencode($message);
    }

    private function portalUserOrFail(Client $client): User
    {
        $user = $client->portalUser();

        if (! $user) {
            throw ValidationException::withMessages([
                'client' => 'Este cliente no tiene acceso al portal.',
            ]);
        }

        return $user;
    }

    /** @return list<Role|string> */
    private function clientRoles(): array
    {
        $roles = Role::query()
            ->where('name', 'client')
            ->whereIn('guard_name', ['web', 'sanctum'])
            ->get()
            ->all();

        return $roles !== [] ? $roles : ['client'];
    }

    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>  $new
     */
    private function audit(string $action, Client $client, User $actor, ?array $old, array $new): void
    {
        try {
            AuditLog::create([
                'user_id' => $actor->id,
                'action' => $action,
                'entity_type' => 'Client',
                'entity_id' => $client->id,
                'old_values' => $old,
                'new_values' => $new,
                'description' => 'Acceso al portal de clientes',
                'ip_address' => request()?->ip(),
                'occurred_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Un fallo de auditoría no deshace un acceso ya concedido.
            report($e);
        }
    }
}
