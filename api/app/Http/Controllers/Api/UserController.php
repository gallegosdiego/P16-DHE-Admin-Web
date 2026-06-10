<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * Listar usuarios con filtros.
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::with('roles:id,name');

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }
        if ($role = $request->query('role')) {
            $query->whereHas('roles', fn ($q) => $q->where('name', $role));
        }

        $users = $query->orderBy('name')
            ->paginate($request->query('per_page', 25));

        // Agregar roles como array plano
        $users->getCollection()->transform(function ($user) {
            $user->setAttribute('role_names', $user->getRoleNames());
            $user->setAttribute('permissions_count', $user->getAllPermissions()->count());
            return $user;
        });

        return response()->json($users);
    }

    /**
     * Detalle de un usuario.
     */
    public function show(User $user): JsonResponse
    {
        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'client_id' => $user->client_id,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'created_at' => $user->created_at,
            'tokens_count' => $user->tokens()->count(),
        ]);
    }

    /**
     * Crear usuario.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'phone' => ['nullable', 'string', 'max:24'],
            'role' => ['required', 'string', 'exists:roles,name'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'phone' => $validated['phone'] ?? null,
            'client_id' => $validated['client_id'] ?? null,
        ]);

        $user->assignRole($validated['role']);

        return response()->json([
            ...$user->toArray(),
            'roles' => $user->getRoleNames(),
        ], 201);
    }

    /**
     * Actualizar usuario.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'email', Rule::unique('users')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:24'],
            'password' => ['nullable', 'string', 'min:8'],
            'role' => ['sometimes', 'string', 'exists:roles,name'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
        ]);

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $role = $validated['role'] ?? null;
        unset($validated['role']);

        $user->update($validated);

        if ($role) {
            $user->syncRoles([$role]);
        }

        return response()->json([
            ...$user->fresh()->toArray(),
            'roles' => $user->getRoleNames(),
        ]);
    }

    /**
     * Roles disponibles.
     */
    public function roles(): JsonResponse
    {
        $roles = \Spatie\Permission\Models\Role::all()
            ->map(fn ($r) => [
                'name' => $r->name,
                'users_count' => $r->users()->count(),
                'permissions' => $r->permissions->pluck('name'),
            ]);

        return response()->json($roles);
    }

    /**
     * Soft-delete: enviar usuario a la papelera.
     * Revoca tokens activos para cerrar sesión.
     */
    public function destroy(User $user): JsonResponse
    {
        // No permitir eliminar el propio usuario
        if (auth()->id() === $user->id) {
            return response()->json(['message' => 'No puedes eliminarte a ti mismo'], 422);
        }

        // Revocar todos los tokens (cerrar sesiones)
        $user->tokens()->delete();

        $user->delete(); // soft-delete

        return response()->json(['message' => 'Usuario enviado a la papelera'], 200);
    }

    /**
     * Listar usuarios en papelera (soft-deleted).
     */
    public function trashed(): JsonResponse
    {
        $users = User::onlyTrashed()
            ->with('roles:id,name')
            ->orderByDesc('deleted_at')
            ->get()
            ->map(function ($user) {
                $user->setAttribute('role_names', $user->getRoleNames());
                return $user;
            });

        return response()->json($users);
    }

    /**
     * Restaurar usuario desde papelera.
     */
    public function restore(int $id): JsonResponse
    {
        $user = User::onlyTrashed()->findOrFail($id);
        $user->restore();

        return response()->json([
            'message' => 'Usuario restaurado',
            'user' => $user->fresh(),
        ]);
    }
}
