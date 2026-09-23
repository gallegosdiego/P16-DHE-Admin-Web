<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\IdempotencyRecord;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustodyBatch
{
    public function run(string $scope, string $key, string $operation, array $payload, Closure $callback): array
    {
        $hash = hash('sha256', json_encode($this->canonicalize($payload), JSON_THROW_ON_ERROR));
        $execute = fn () => DB::transaction(function () use ($scope, $key, $operation, $hash, $callback): array {
            $query = IdempotencyRecord::where('scope', $scope)->where('idempotency_key', $key)->where('operation', $operation);
            $record = (clone $query)->lockForUpdate()->first();
            if ($record) {
                if (! hash_equals($record->request_hash, $hash)) {
                    throw ValidationException::withMessages(['idempotency_key' => 'La llave ya fue usada con un contenido diferente.']);
                }
                if ($record->status !== 'completed' || ! is_array($record->response_json)) {
                    throw ValidationException::withMessages(['idempotency_key' => 'La operación con esta llave todavía está en proceso.']);
                }

                return $record->response_json;
            }
            $record = IdempotencyRecord::create(['scope' => $scope, 'idempotency_key' => $key, 'operation' => $operation,
                'request_hash' => $hash, 'status' => 'processing', 'expires_at' => now()->addDays(7)]);
            // Los paquetes usan savepoints: uno rechazado no invalida los demás.
            // El resultado y sus cambios se confirman juntos, incluso si el proceso se interrumpe.
            $response = $callback();
            $record->update(['status' => 'completed', 'response_json' => $response, 'completed_at' => now()]);

            return $response;
        }, 3);
        try {
            return $execute();
        } catch (QueryException $error) {
            if (! IdempotencyRecord::where('scope', $scope)->where('idempotency_key', $key)->where('operation', $operation)->exists()) {
                throw $error;
            }

            return $execute();
        }
    }

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
