<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

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

        return response()->json($drivers);
    }

    public function show(Driver $driver): JsonResponse
    {
        $driver->load(['user:id,email,driver_id', 'shipments' => function ($q) {
            $q->whereDate('created_at', now()->toDateString())
              ->with('client:id,name');
        }]);

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

            // Asignar rol 'driver' (con permisos reales)
            if (\Spatie\Permission\Models\Role::where('name', 'driver')->exists()) {
                $user->assignRole('driver');
            }

            return $driver;
        });

        return response()->json($driver->load('user:id,email,driver_id'), 201);
    }

    public function update(Request $request, Driver $driver): JsonResponse
    {
        // Buscar usuario vinculado de forma robusta
        $linkedUser = $driver->user ?? User::where('driver_id', $driver->id)->first();

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

        // Recalcular iniciales si cambió el nombre
        if (isset($validated['name'])) {
            $names = explode(' ', $validated['name']);
            $validated['initials'] = strtoupper(
                substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
            );
        }

        $driver->update($validated);

        // Actualizar credenciales del User vinculado
        if ($linkedUser && ($email || $password)) {
            $userData = [];
            if ($email) $userData['email'] = $email;
            if ($password) $userData['password'] = Hash::make($password);
            if (isset($validated['name'])) $userData['name'] = $validated['name'];
            if (isset($validated['phone'])) $userData['phone'] = $validated['phone'];
            $linkedUser->update($userData);
        }

        return response()->json($driver->fresh()->load('user:id,email,driver_id'));
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
        $linkedUser = User::where('driver_id', $driver->id)->first();
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
        $linkedUser = User::withTrashed()->where('driver_id', $driver->id)->first();
        if ($linkedUser && $linkedUser->trashed()) {
            $linkedUser->restore();
        }

        return response()->json(['message' => 'Piloto restaurado', 'driver' => $driver]);
    }
}
