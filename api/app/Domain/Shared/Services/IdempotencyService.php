<?php

namespace App\Domain\Shared\Services;

use App\Domain\Shared\Models\IdempotencyRecord;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class IdempotencyService
{
    /**
     * Ejecuta una creación una sola vez y devuelve el mismo modelo en reintentos.
     *
     * @param  array<string, mixed>  $payload
     * @param  Closure(): Model  $callback
     */
    public function runForModel(
        string $scope,
        string $key,
        string $operation,
        array $payload,
        Closure $callback,
    ): Model {
        $hash = hash('sha256', json_encode($this->canonicalize($payload), JSON_THROW_ON_ERROR));

        try {
            return $this->execute($scope, $key, $operation, $hash, $callback);
        } catch (QueryException $exception) {
            $concurrentRecordExists = IdempotencyRecord::query()
                ->where('scope', $scope)
                ->where('idempotency_key', $key)
                ->where('operation', $operation)
                ->exists();

            if (! $concurrentRecordExists) {
                throw $exception;
            }

            return $this->execute($scope, $key, $operation, $hash, $callback);
        }
    }

    /**
     * @param  Closure(): Model  $callback
     */
    private function execute(
        string $scope,
        string $key,
        string $operation,
        string $hash,
        Closure $callback,
    ): Model {
        return DB::transaction(function () use ($scope, $key, $operation, $hash, $callback) {
            $record = IdempotencyRecord::query()
                ->where('scope', $scope)
                ->where('idempotency_key', $key)
                ->where('operation', $operation)
                ->lockForUpdate()
                ->first();

            if ($record !== null) {
                if (! hash_equals($record->request_hash, $hash)) {
                    throw ValidationException::withMessages([
                        'idempotency_key' => 'La llave ya fue usada con un contenido diferente.',
                    ]);
                }

                if ($record->status !== 'completed' || ! $record->result_type || ! $record->result_id) {
                    throw ValidationException::withMessages([
                        'idempotency_key' => 'La operación con esta llave todavía está en proceso.',
                    ]);
                }

                $resultClass = $record->result_type;
                if (! is_subclass_of($resultClass, Model::class)) {
                    throw new RuntimeException('El resultado idempotente almacenado no es un modelo válido.');
                }

                return $resultClass::query()->findOrFail($record->result_id);
            }

            $record = IdempotencyRecord::query()->create([
                'scope' => $scope,
                'idempotency_key' => $key,
                'operation' => $operation,
                'request_hash' => $hash,
                'status' => 'processing',
                'expires_at' => now()->addDays(7),
            ]);

            $result = $callback();
            if (! $result->exists) {
                throw new RuntimeException('La operación idempotente debe devolver un modelo persistido.');
            }

            $record->update([
                'status' => 'completed',
                'result_type' => $result::class,
                'result_id' => $result->getKey(),
                'response_json' => ['id' => $result->getKey()],
                'completed_at' => now(),
            ]);

            return $result;
        });
    }

    /** @param array<string, mixed> $payload */
    private function canonicalize(array $payload): array
    {
        ksort($payload);

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = array_is_list($value)
                    ? array_map(fn ($item) => is_array($item) ? $this->canonicalize($item) : $item, $value)
                    : $this->canonicalize($value);
            }
        }

        return $payload;
    }
}
