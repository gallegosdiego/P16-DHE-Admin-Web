<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class DriverController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Driver::withCount([
            'shipments as active_shipments_count' => function ($q) {
                $q->whereNotIn('status', ['delivered', 'returned', 'cancelled']);
            },
            'shipments as delivered_today_count' => function ($q) {
                $q->where('status', 'delivered')
                  ->whereDate('delivered_at', now()->toDateString());
            },
        ]);

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('plate', 'like', "%{$search}%");
            });
        }

        $drivers = $query->with('user:id,email,driver_id')->orderBy('name')->get();
        $this->attachAccessUsers($drivers);

        return response()->json($drivers);
    }

    public function show(Driver $driver): JsonResponse
    {
        $driver->load(['user:id,email,driver_id', 'shipments' => function ($q) {
            $q->whereDate('created_at', now()->toDateString())
              ->with('client:id,name');
        }]);
        $this->attachAccessUsers($driver);

        // Resumen financiero del conductor
        $today = now()->toDateString();
        $driver->setAttribute('today_summary', [
            'assigned' => $driver->shipments()->whereDate('created_at', $today)->count(),
            'delivered' => $driver->shipments()->where('status', 'delivered')->whereDate('delivered_at', $today)->count(),
            'cash_collected' => (int) $driver->shipments()
                ->where('payment_type', 'cash_on_delivery')
                ->where('financial_status', 'collected')
                ->whereDate('updated_at', $today)
                ->sum('cod_amount'),
            'pending_cash' => (int) $driver->pendingCashCollection(),
            'earnings' => (int) $driver->shipments()->whereDate('created_at', $today)->sum('driver_fee'),
        ]);

        return response()->json($driver);
    }

    /**
     * Crear piloto repartidor.
     *
     * Crea un Driver + un User con rol 'conductor' vinculado,
     * para que el piloto pueda iniciar sesión en la app móvil.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'             => ['required', 'string', 'max:100'],
            'phone'            => ['nullable', 'string', 'max:24'],
            'email'            => ['required', 'email', 'unique:users,email'],
            'password'         => ['required', 'string', 'min:6'],
            'vehicle'          => ['nullable', 'string', 'max:80'],
            'plate'            => ['nullable', 'string', 'max:16'],
            'zone'             => ['nullable', 'string', 'max:60'],
            'per_package_rate' => ['nullable', 'integer', 'min:0'],
            'daily_rate'       => ['nullable', 'integer', 'min:0'],
        ]);

        $names = explode(' ', $validated['name']);
        $initials = strtoupper(
            substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
        );

        $driver = DB::transaction(function () use ($validated, $initials) {
            $driver = Driver::create([
                'name'             => $validated['name'],
                'phone'            => $validated['phone'] ?? null,
                'vehicle'          => $validated['vehicle'] ?? null,
                'plate'            => $validated['plate'] ?? null,
                'zone'             => $validated['zone'] ?? null,
                'per_package_rate' => $validated['per_package_rate'] ?? 3000,
                'daily_rate'       => $validated['daily_rate'] ?? null,
                'initials'         => $initials,
            ]);

            $user = User::create([
                'name'      => $validated['name'],
                'email'     => $validated['email'],
                'phone'     => $validated['phone'] ?? null,
                'password'  => Hash::make($validated['password']),
                'driver_id' => $driver->id,
            ]);

            // Relación bidireccional
            $driver->update(['user_id' => $user->id]);

            $this->assignDriverRoles($user);

            return $driver;
        });

        return response()->json($driver->load('user:id,email,driver_id'), 201);
    }

    public function update(Request $request, Driver $driver): JsonResponse
    {
        // Buscar usuario vinculado de forma robusta
        $linkedUser = $this->resolveAccessUser($driver);

        $validated = $request->validate([
            'name'             => ['sometimes', 'string', 'max:100'],
            'phone'            => ['sometimes', 'string', 'max:24'],
            'vehicle'          => ['nullable', 'string', 'max:80'],
            'plate'            => ['nullable', 'string', 'max:16'],
            'zone'             => ['nullable', 'string', 'max:60'],
            'status'           => ['sometimes', 'in:active,route,inactive'],
            'per_package_rate' => ['nullable', 'integer', 'min:0'],
            'daily_rate'       => ['nullable', 'integer', 'min:0'],
            'email'            => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($linkedUser?->id)],
            'password'         => ['nullable', 'string', 'min:6'],
        ]);

        // Separar campos de Driver vs User
        $email = $validated['email'] ?? null;
        $password = $validated['password'] ?? null;
        unset($validated['email'], $validated['password']);

        if (! $linkedUser && $email && ! $password) {
            throw ValidationException::withMessages([
                'password' => ['La contraseña es obligatoria para crear el acceso del piloto.'],
            ]);
        }

        // Recalcular iniciales si cambió el nombre
        if (isset($validated['name'])) {
            $names = explode(' ', $validated['name']);
            $validated['initials'] = strtoupper(
                substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
            );
        }

        $driver = DB::transaction(function () use ($driver, $validated, $linkedUser, $email, $password) {
            $driver->update($validated);

            // Actualizar credenciales del User vinculado o crear acceso para pilotos legados
            if ($linkedUser) {
                $userData = [];
                if ($email) $userData['email'] = $email;
                if ($password) $userData['password'] = Hash::make($password);
                if (isset($validated['name'])) $userData['name'] = $validated['name'];
                if (array_key_exists('phone', $validated)) $userData['phone'] = $validated['phone'];
                if ($userData !== []) {
                    $linkedUser->update($userData);
                }

                if (! $driver->user_id) {
                    $driver->update(['user_id' => $linkedUser->id]);
                }

                $this->assignDriverRoles($linkedUser);
            } elseif ($email && $password) {
                $linkedUser = User::create([
                    'name'      => $driver->name,
                    'email'     => $email,
                    'phone'     => $driver->phone,
                    'password'  => Hash::make($password),
                    'driver_id' => $driver->id,
                ]);

                $driver->update(['user_id' => $linkedUser->id]);
                $this->assignDriverRoles($linkedUser);
            }

            return $driver->fresh();
        });

        return response()->json($driver->load('user:id,email,driver_id'));
    }

    public function toggleStatus(Driver $driver): JsonResponse
    {
        $newStatus = $driver->status === 'active' ? 'inactive' : 'active';
        $driver->update(['status' => $newStatus]);

        return response()->json($driver->fresh());
    }

    /**
     * Soft-delete: enviar piloto a la papelera.
     * También desactiva el User vinculado.
     */
    public function destroy(Driver $driver): JsonResponse
    {
        // Desactivar el User vinculado (si existe)
        $linkedUser = $this->resolveAccessUser($driver);
        if ($linkedUser) {
            $linkedUser->delete(); // soft-delete si User tiene SoftDeletes, sino hard-delete
        }

        $driver->delete(); // soft-delete gracias a SoftDeletes trait

        return response()->json(['message' => 'Piloto enviado a la papelera'], 200);
    }

    /**
     * Listar pilotos en papelera (soft-deleted).
     */
    public function trashed(): JsonResponse
    {
        $drivers = Driver::onlyTrashed()->orderByDesc('deleted_at')->get();
        $this->attachAccessUsers($drivers, true);
        return response()->json($drivers);
    }

    /**
     * Restaurar piloto desde papelera.
     */
    public function restore(int $id): JsonResponse
    {
        $driver = Driver::onlyTrashed()->findOrFail($id);
        $driver->restore();

        // Restaurar User vinculado si fue soft-deleted
        $linkedUser = $this->resolveAccessUser($driver, true);
        if ($linkedUser && $linkedUser->trashed()) {
            $linkedUser->restore();
        }
        if ($linkedUser) {
            if (! $linkedUser->driver_id) {
                $linkedUser->update(['driver_id' => $driver->id]);
            }
            if (! $driver->user_id) {
                $driver->update(['user_id' => $linkedUser->id]);
            }
        }

        return response()->json(['message' => 'Piloto restaurado', 'driver' => $driver]);
    }

    private function attachAccessUsers(Driver|\Illuminate\Support\Collection $drivers, bool $withTrashed = false): void
    {
        $collection = $drivers instanceof Driver ? collect([$drivers]) : $drivers;
        $missingDrivers = $collection->filter(
            fn (Driver $driver) => ! $driver->relationLoaded('user') || ! $driver->getRelation('user')
        );

        if ($missingDrivers->isEmpty()) {
            return;
        }

        $query = $withTrashed ? User::withTrashed() : User::query();
        $users = $query
            ->select('id', 'email', 'driver_id')
            ->where(function ($q) use ($missingDrivers) {
                $userIds = $missingDrivers->pluck('user_id')->filter()->values();
                $driverIds = $missingDrivers->pluck('id')->values();

                if ($userIds->isNotEmpty()) {
                    $q->whereIn('id', $userIds);
                }
                $q->orWhereIn('driver_id', $driverIds);
            })
            ->get();

        $usersById = $users->keyBy('id');
        $usersByDriver = $users->whereNotNull('driver_id')->keyBy('driver_id');

        $missingDrivers->each(function (Driver $driver) use ($usersById, $usersByDriver): void {
            if ($driver->user_id && $usersById->has($driver->user_id)) {
                $driver->setRelation('user', $usersById->get($driver->user_id));
                return;
            }

            if ($usersByDriver->has($driver->id)) {
                $driver->setRelation('user', $usersByDriver->get($driver->id));
            }
        });
    }

    private function resolveAccessUser(Driver $driver, bool $withTrashed = false): ?User
    {
        if ($driver->relationLoaded('user') && $driver->user) {
            return $driver->user;
        }

        $query = $withTrashed ? User::withTrashed() : User::query();
        if ($driver->user_id) {
            $user = (clone $query)->find($driver->user_id);
            if ($user) {
                return $user;
            }
        }

        return $query->where('driver_id', $driver->id)->first();
    }

    private function assignDriverRoles(User $user): void
    {
        $roles = Role::query()
            ->where('name', 'driver')
            ->whereIn('guard_name', ['web', 'sanctum'])
            ->get();

        if ($roles->isNotEmpty()) {
            $user->assignRole($roles);
        }
    }
}
