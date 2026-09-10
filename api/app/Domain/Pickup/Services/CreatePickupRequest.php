<?php

namespace App\Domain\Pickup\Services;

use App\Domain\Operations\Enums\IntakeMode;
use App\Domain\Operations\Models\ServiceLocation;
use App\Domain\Operations\Services\OperationalTaskService;
use App\Domain\Pickup\Enums\PickupWindow;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shared\Services\IdempotencyService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class CreatePickupRequest
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly OperationalTaskService $tasks,
        private readonly DeclaredPhotoStorage $declaredPhotos,
    ) {}

    /** @param array<string, mixed> $payload */
    public function execute(string $scope, string $idempotencyKey, array $payload): PickupRequest
    {
        /** @var PickupRequest $request */
        $request = $this->idempotency->runForModel(
            $scope,
            $idempotencyKey,
            'create_pickup_request',
            // La huella se calcula sobre una copia serializable: un archivo
            // subido no cabe en un JSON, y sin esto la petición con foto
            // revienta antes de llegar a crear nada.
            $this->huellaDelPayload($payload),
            fn () => $this->create($payload),
        );

        return $request->load(['customer', 'serviceLocation', 'packages', 'tasks']);
    }

    /**
     * Reemplaza cada archivo por sus señas para poder firmar la petición.
     * Dos envíos del mismo archivo dan la misma huella, que es justo lo que
     * la idempotencia necesita para reconocer un reintento.
     */
    private function huellaDelPayload(mixed $value): mixed
    {
        if ($value instanceof UploadedFile) {
            $ruta = $value->getRealPath();

            return [
                'original_name' => $value->getClientOriginalName(),
                'size' => $value->getSize(),
                'mime_type' => $value->getMimeType(),
                'sha256' => is_string($ruta) && is_file($ruta) ? hash_file('sha256', $ruta) : null,
            ];
        }

        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->huellaDelPayload($item), $value);
        }

        return $value;
    }

    /** @param array<string, mixed> $payload */
    private function create(array $payload): PickupRequest
    {
        // Las fotos se escriben en disco fuera de la transacción, así que si
        // esta falla hay que barrerlas: si no, quedan archivos sin dueño.
        $rutasGuardadas = [];

        try {
            return $this->createDentroDeTransaccion($payload, $rutasGuardadas);
        } catch (Throwable $error) {
            $this->declaredPhotos->discard($rutasGuardadas);
            throw $error;
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  list<string>  $rutasGuardadas
     */
    private function createDentroDeTransaccion(array $payload, array &$rutasGuardadas): PickupRequest
    {
        return DB::transaction(function () use ($payload, &$rutasGuardadas) {
            $mode = IntakeMode::from($payload['intake_mode']);
            $location = isset($payload['service_location_id'])
                ? ServiceLocation::query()->where('is_active', true)->find($payload['service_location_id'])
                : null;

            if ($mode->requiresServiceLocation() && $location === null) {
                throw ValidationException::withMessages([
                    'service_location_id' => 'La sede seleccionada no existe o está inactiva.',
                ]);
            }

            if ($mode->requiresFieldAssignment() && blank($payload['pickup_address_line1'] ?? null)) {
                throw ValidationException::withMessages([
                    'pickup_address_line1' => 'La recogida en el local requiere dirección.',
                ]);
            }

            $packages = $payload['packages'];
            $request = PickupRequest::query()->create([
                'pickup_code' => $this->nextCode(),
                'customer_id' => $payload['customer_id'] ?? null,
                'source' => $payload['source'],
                'intake_mode' => $mode,
                'service_location_id' => $location?->id,
                'planned_dropoff_at' => $payload['planned_dropoff_at'] ?? null,
                'status' => 'submitted',
                'pickup_address_line1' => $payload['pickup_address_line1'] ?? $location?->address_line1,
                'pickup_address_complement' => $payload['pickup_address_complement'] ?? $location?->address_complement,
                'pickup_zone' => $payload['pickup_zone'] ?? $location?->zone,
                'pickup_city' => $payload['pickup_city'] ?? $location?->city,
                'pickup_lat' => $payload['pickup_lat'] ?? $location?->lat,
                'pickup_lng' => $payload['pickup_lng'] ?? $location?->lng,
                'contact_name' => $payload['contact_name'] ?? null,
                'contact_phone' => $payload['contact_phone'] ?? null,
                'contact_email' => $payload['contact_email'] ?? null,
                'sender_company' => $payload['sender_company'] ?? null,
                'pickup_window_code' => $payload['pickup_window_code'] ?? ($mode === IntakeMode::WALK_IN_AT_HUB ? 'NOW' : 'TO_CONFIRM'),
                'pickup_window_label' => $this->etiquetaDeVentana($payload, $mode),
                'package_count' => count($packages),
                'requested_cod_total' => array_sum(array_map(
                    fn (array $package) => (($package['payment_type'] ?? null) === 'cash_on_delivery' || ($package['is_cod'] ?? false))
                        ? (int) ($package['requested_cod_amount'] ?? 0)
                        : 0,
                    $packages,
                )),
                'special_instructions' => $payload['special_instructions'] ?? null,
                'correlation_id' => (string) Str::uuid(),
                'submitted_at' => now(),
            ]);

            foreach ($packages as $index => $package) {
                $paymentType = $package['payment_type'] ?? null;
                $isCod = isset($package['is_cod'])
                    ? (bool) $package['is_cod']
                    : ($paymentType === 'cash_on_delivery');
                if ($paymentType === null) {
                    $paymentType = $isCod ? 'cash_on_delivery' : 'post_sale';
                }
                if ($paymentType === 'cash_on_delivery') {
                    $isCod = true;
                }

                // La foto con la que el cliente declaró el paquete: se guarda
                // fuera del registro y solo viajan su ruta y su hash.
                $fotoDeclarada = $package['declared_photo'] ?? null;
                unset($package['declared_photo']);
                $datosFoto = [];

                if ($fotoDeclarada instanceof UploadedFile) {
                    $guardada = $this->declaredPhotos->store($fotoDeclarada);
                    $rutasGuardadas[] = $guardada['path'];
                    $datosFoto = [
                        'declared_photo_path' => $guardada['path'],
                        'declared_photo_sha256' => $guardada['sha256'],
                        'declared_photo_mime' => $guardada['mime_type'],
                        'declared_photo_size' => $guardada['file_size'],
                    ];
                }

                PickupPackage::query()->create(array_merge($package, $datosFoto, [
                    'pickup_request_id' => $request->id,
                    'package_index' => $index + 1,
                    'payment_type' => $paymentType,
                    'is_cod' => $isCod,
                    'requested_cod_amount' => $isCod ? (int) ($package['requested_cod_amount'] ?? 0) : 0,
                    'is_fragile' => (bool) ($package['is_fragile'] ?? false),
                ]));
            }

            $this->tasks->createForPickupRequest($request);

            AuditLog::log(
                'operations.pickup_created',
                $request,
                null,
                $request->only(['pickup_code', 'source', 'intake_mode', 'service_location_id', 'package_count']),
                'Solicitud de recogida creada por el caso de uso multicanal.',
            );

            return $request;
        });
    }

    /**
     * La etiqueta de la jornada se deriva del código elegido, no se copia del
     * cliente: así el cliente ve siempre la franja vigente y si la operación
     * cambia sus horarios no quedan solicitudes con una copia congelada.
     *
     * @param  array<string, mixed>  $payload
     */
    private function etiquetaDeVentana(array $payload, IntakeMode $mode): string
    {
        $code = $payload['pickup_window_code'] ?? null;
        $window = is_string($code) ? PickupWindow::tryFrom($code) : null;

        if ($window !== null) {
            return $window->label();
        }

        return $mode === IntakeMode::WALK_IN_AT_HUB
            ? PickupWindow::NOW->label()
            : PickupWindow::TO_CONFIRM->label();
    }

    private function nextCode(): string
    {
        do {
            $code = 'PR-'.now()->format('ymd').'-'.Str::upper(Str::random(6));
        } while (PickupRequest::query()->where('pickup_code', $code)->exists());

        return $code;
    }
}
