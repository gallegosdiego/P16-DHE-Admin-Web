<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Client\Services\PortalAccessResult;
use App\Domain\Client\Services\PortalAccessService;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Accesos al portal de clientes desde el panel. Solo el equipo de Danhei los da:
 * superadmin y administrador. No hay registro público.
 */
class ClientPortalAccessController extends Controller
{
    private const MANAGER_ROLES = ['superadmin', 'administrador', 'admin'];

    public function __construct(private readonly PortalAccessService $service) {}

    /** Lista de clientes con el estado de su acceso. */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeManager($request);

        return response()->json([
            'data' => $this->service->statusByClient(),
            'email_enabled' => $this->service->emailEnabled(),
            'portal_url' => config('portal.url'),
        ]);
    }

    /** Estado del acceso de un cliente y los datos de su ficha para rellenar. */
    public function show(Request $request, Client $client): JsonResponse
    {
        $this->authorizeManager($request);

        $user = $client->portalUser();

        return response()->json([
            'status' => $user === null ? 'sin_acceso' : ($user->active === false ? 'desactivado' : 'activo'),
            'user' => $user ? $this->service->userPayload($user) : null,
            'suggestion' => $this->service->suggestion($client),
            'email_enabled' => $this->service->emailEnabled(),
            'portal_url' => config('portal.url'),
        ]);
    }

    public function store(Request $request, Client $client): JsonResponse
    {
        $actor = $this->authorizeManager($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:120', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:24'],
            'password' => ['nullable', 'string', 'min:8', 'max:64'],
            'send_email' => ['sometimes', 'boolean'],
        ], [
            'email.unique' => 'Ya existe un usuario con este correo.',
        ]);

        $result = $this->service->grant($client, $validated, $actor, (bool) ($validated['send_email'] ?? true));

        return response()->json($this->resultPayload($result), 201);
    }

    public function resetPassword(Request $request, Client $client): JsonResponse
    {
        $actor = $this->authorizeManager($request);

        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:8', 'max:64'],
            'send_email' => ['sometimes', 'boolean'],
        ]);

        $result = $this->service->resetPassword(
            $client,
            $actor,
            $validated['password'] ?? null,
            (bool) ($validated['send_email'] ?? true),
        );

        return response()->json($this->resultPayload($result));
    }

    public function setActive(Request $request, Client $client): JsonResponse
    {
        $actor = $this->authorizeManager($request);

        $validated = $request->validate(['active' => ['required', 'boolean']]);

        $user = $this->service->setActive($client, (bool) $validated['active'], $actor);

        return response()->json([
            'status' => $user->active === false ? 'desactivado' : 'activo',
            'user' => $this->service->userPayload($user),
        ]);
    }

    /** @return array<string, mixed> */
    private function resultPayload(PortalAccessResult $result): array
    {
        return [
            'status' => 'activo',
            'user' => $this->service->userPayload($result->user),
            // Se devuelve una sola vez: el panel la enseña para copiarla o enviarla.
            'password' => $result->password,
            'email_sent' => $result->emailSent,
            'email_problem' => $result->emailProblem,
            'whatsapp_url' => $result->whatsappUrl,
            'portal_url' => config('portal.url'),
        ];
    }

    private function authorizeManager(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        $roles = $user->roles()->pluck('name')->all();

        abort_unless(
            array_intersect($roles, self::MANAGER_ROLES) !== [],
            403,
            'Solo superadmin y administrador pueden gestionar los accesos al portal.',
        );

        return $user;
    }
}
