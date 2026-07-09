<?php

namespace App\Http\Controllers\Api;

use App\Domain\Driver\Models\Driver;
use App\Domain\Driver\Services\DriverHistoryService;
use App\Domain\Driver\Support\DriverDocumentInspector;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\PublicAssetUrl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class DriverController extends Controller
{
    public function __construct(
        private readonly DriverDocumentInspector $documentInspector,
    ) {
    }

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
        if ($documentStatus = $request->query('document_status')) {
            $this->applyDocumentStatusFilter($query, (string) $documentStatus);
        }

        $drivers = $query->with('user:id,email,driver_id')->orderBy('name')->get();
        $this->attachAccessUsers($drivers);
        $drivers->each(function (Driver $driver): void {
            $documents = $this->driverDocumentsPayload($driver);
            $driver->setAttribute('documents', $documents);
            $driver->setAttribute('document_status', $this->resolveDriverDocumentStatus($documents));
        });

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
        $driver->setAttribute('documents', $this->driverDocumentsPayload($driver));

        return response()->json($driver);
    }

    public function profile(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $driver = Driver::with('user:id,email,driver_id')->find($driverId);

        if (! $driver) {
            return response()->json(['error' => 'Piloto no encontrado'], 404);
        }

        $this->attachAccessUsers($driver);

        return response()->json($this->driverProfilePayload($driver));
    }

    public function history(Request $request, Driver $driver, DriverHistoryService $historyService): JsonResponse
    {
        $validated = $request->validate([
            'per_page' => ['nullable', 'integer', 'min:1', 'max:20'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        return response()->json(
            $historyService->paginateByDriver(
                (int) $driver->id,
                (int) ($validated['per_page'] ?? 12),
                (int) ($validated['page'] ?? 1),
            )
        );
    }

    public function historyDate(Request $request, Driver $driver, string $date, DriverHistoryService $historyService): JsonResponse
    {
        $history = $historyService->detailByDriverDate((int) $driver->id, $date);

        if (! $history) {
            return response()->json(['message' => 'No se encontro historial para esa fecha.'], 404);
        }

        return response()->json($history);
    }

    public function updateDocuments(Request $request, Driver $driver): JsonResponse
    {
        return $this->persistDriverDocuments($request, $driver, true);
    }

    public function updateOwnDocuments(Request $request): JsonResponse
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);

        if ($driverId <= 0) {
            return response()->json(['error' => 'Acceso denegado'], 403);
        }

        $driver = Driver::find($driverId);

        if (! $driver) {
            return response()->json(['error' => 'Piloto no encontrado'], 404);
        }

        return $this->persistDriverDocuments($request, $driver, false);
    }

    private function persistDriverDocuments(Request $request, Driver $driver, bool $allowClear): JsonResponse
    {
        $documentMap = $this->driverDocumentMap();
        $documentKeys = array_keys($documentMap);
        $rules = [];

        if ($allowClear) {
            $rules['clear_documents'] = ['nullable', 'array'];
            $rules['clear_documents.*'] = ['string', Rule::in($documentKeys)];
        }

        foreach ($documentMap as $documentKey => $meta) {
            $rules[$documentKey] = ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'];

            if (isset($meta['expiry_column'])) {
                $rules["{$documentKey}_expires_at"] = ['nullable', 'date_format:Y-m-d'];
            }
        }

        $validated = $request->validate($rules);
        $updates = [];
        $clearedDocuments = [];

        foreach (($validated['clear_documents'] ?? []) as $documentKey) {
            $column = $documentMap[$documentKey]['column'];
            $this->deletePublicFileUrl($driver->getRawOriginal($column));
            $updates[$column] = null;
            $clearedDocuments[$documentKey] = true;

            if (isset($documentMap[$documentKey]['expiry_column'])) {
                $updates[$documentMap[$documentKey]['expiry_column']] = null;
            }
        }

        foreach ($documentMap as $documentKey => $meta) {
            if (! $request->hasFile($documentKey)) {
                continue;
            }

            $column = $meta['column'];
            $this->deletePublicFileUrl($driver->getRawOriginal($column));
            $path = $request->file($documentKey)->store('drivers/documents', 'public');
            $updates[$column] = $path;
        }

        foreach ($documentMap as $documentKey => $meta) {
            $expiryColumn = $meta['expiry_column'] ?? null;
            $expiryInput = "{$documentKey}_expires_at";

            if (! $expiryColumn || isset($clearedDocuments[$documentKey]) || ! array_key_exists($expiryInput, $validated)) {
                continue;
            }

            $updates[$expiryColumn] = $validated[$expiryInput];
        }

        if ($updates === []) {
            return response()->json([
                'message' => 'No se enviaron cambios de documentos.',
                'documents' => $this->driverDocumentsPayload($driver),
            ]);
        }

        $driver->update($updates);
        $driver = $driver->fresh();

        return response()->json([
            'message' => 'Expediente documental actualizado.',
            'documents' => $this->driverDocumentsPayload($driver),
        ]);
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
            'phone'            => ['required', 'string', 'max:24'],
            'email'            => ['required', 'email', 'unique:users,email'],
            'password'         => ['required', 'string', 'min:6'],
            'vehicle'          => ['nullable', 'string', 'max:80'],
            'plate'            => ['nullable', 'string', 'max:16'],
            'zone'             => ['nullable', 'string', 'max:60'],
            'per_package_rate' => ['nullable', 'integer', 'min:0'],
            'daily_rate'       => ['nullable', 'integer', 'min:0'],
        ]);

        $validated['phone'] = trim((string) $validated['phone']);

        if ($validated['phone'] === '') {
            throw ValidationException::withMessages([
                'phone' => ['El teléfono del piloto es obligatorio.'],
            ]);
        }

        $names = explode(' ', $validated['name']);
        $initials = strtoupper(
            substr($names[0], 0, 1) . (isset($names[1]) ? substr($names[1], 0, 1) : '')
        );

        $driver = DB::transaction(function () use ($validated, $initials) {
            $driver = Driver::create([
                'name'             => $validated['name'],
                'phone'            => $validated['phone'],
                'vehicle'          => $validated['vehicle'] ?? null,
                'plate'            => $validated['plate'] ?? null,
                'zone'             => $validated['zone'] ?? null,
                'per_package_rate' => $validated['per_package_rate'] ?? 3000,
                'daily_rate'       => $validated['daily_rate'] ?? 0,
                'initials'         => $initials,
            ]);

            $user = User::create([
                'name'      => $validated['name'],
                'email'     => $validated['email'],
                'phone'     => $validated['phone'],
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
                if ((int) $linkedUser->driver_id !== (int) $driver->id) $userData['driver_id'] = $driver->id;
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

    private function driverProfilePayload(Driver $driver): array
    {
        return [
            'id' => (int) $driver->id,
            'name' => $driver->name,
            'initials' => $driver->initials,
            'phone' => $driver->phone,
            'vehicle' => $driver->vehicle,
            'plate' => $driver->plate,
            'zone' => $driver->zone,
            'status' => $driver->status,
            'user' => $driver->user ? [
                'id' => (int) $driver->user->id,
                'email' => $driver->user->email,
            ] : null,
            'documents' => $this->driverDocumentsPayload($driver),
        ];
    }

    private function driverDocumentsPayload(Driver $driver): array
    {
        return $this->documentInspector->payload($driver);
    }

    private function resolveDriverDocumentStatus(array $documentsPayload): string
    {
        return $this->documentInspector->status($documentsPayload);
    }

    private function applyDocumentStatusFilter(Builder $query, string $documentStatus): void
    {
        $normalized = strtolower(trim($documentStatus));
        $today = now()->toDateString();
        $warningLimit = now()->addDays(30)->toDateString();
        $documentColumns = collect($this->driverDocumentMap())
            ->pluck('column')
            ->filter()
            ->values()
            ->all();
        $expiryPairs = collect($this->driverDocumentMap())
            ->filter(fn (array $meta) => isset($meta['expiry_column']))
            ->map(fn (array $meta) => [
                'column' => $meta['column'],
                'expiry_column' => $meta['expiry_column'],
            ])
            ->values()
            ->all();

        $applyMissing = function (Builder $builder) use ($documentColumns): void {
            $builder->where(function (Builder $missingQuery) use ($documentColumns): void {
                foreach ($documentColumns as $column) {
                    $missingQuery->orWhereNull($column)->orWhere($column, '');
                }
            });
        };

        $applyExpired = function (Builder $builder) use ($expiryPairs, $today): void {
            $builder->where(function (Builder $expiredQuery) use ($expiryPairs, $today): void {
                foreach ($expiryPairs as $pair) {
                    $expiredQuery->orWhere(function (Builder $documentQuery) use ($pair, $today): void {
                        $documentQuery
                            ->whereNotNull($pair['column'])
                            ->where($pair['column'], '!=', '')
                            ->whereNotNull($pair['expiry_column'])
                            ->whereDate($pair['expiry_column'], '<', $today);
                    });
                }
            });
        };

        $applyWarning = function (Builder $builder) use ($expiryPairs, $today, $warningLimit): void {
            $builder->where(function (Builder $warningQuery) use ($expiryPairs, $today, $warningLimit): void {
                foreach ($expiryPairs as $pair) {
                    $warningQuery->orWhere(function (Builder $documentQuery) use ($pair, $today, $warningLimit): void {
                        $documentQuery
                            ->whereNotNull($pair['column'])
                            ->where($pair['column'], '!=', '')
                            ->where(function (Builder $expiryQuery) use ($pair, $today, $warningLimit): void {
                                $expiryQuery
                                    ->whereNull($pair['expiry_column'])
                                    ->orWhereBetween($pair['expiry_column'], [$today, $warningLimit]);
                            });
                    });
                }
            });
        };

        if ($normalized === 'missing') {
            $applyMissing($query);
            return;
        }

        if ($normalized === 'expired') {
            $applyExpired($query);
            return;
        }

        if ($normalized === 'warning') {
            $applyWarning($query);
            return;
        }

        if ($normalized === 'critical') {
            $query->where(function (Builder $criticalQuery) use ($applyMissing, $applyExpired, $applyWarning): void {
                $criticalQuery->where(function (Builder $nested) use ($applyMissing): void {
                    $applyMissing($nested);
                })->orWhere(function (Builder $nested) use ($applyExpired): void {
                    $applyExpired($nested);
                })->orWhere(function (Builder $nested) use ($applyWarning): void {
                    $applyWarning($nested);
                });
            });
            return;
        }

        if ($normalized === 'complete' || $normalized === 'ok') {
            $query->where(function (Builder $completeQuery) use ($applyMissing, $applyExpired, $applyWarning): void {
                $completeQuery
                    ->whereNot(function (Builder $nested) use ($applyMissing): void {
                        $applyMissing($nested);
                    })
                    ->whereNot(function (Builder $nested) use ($applyExpired): void {
                        $applyExpired($nested);
                    })
                    ->whereNot(function (Builder $nested) use ($applyWarning): void {
                        $applyWarning($nested);
                    });
            });
        }
    }

    private function driverDocumentMap(): array
    {
        return $this->documentInspector->documentMap();
    }

    private function deletePublicFileUrl(?string $url): void
    {
        if (! filled($url)) {
            return;
        }

        $path = PublicAssetUrl::toStoredPath($url);

        if (filled($path)) {
            Storage::disk('public')->delete($path);
        }
    }
}
