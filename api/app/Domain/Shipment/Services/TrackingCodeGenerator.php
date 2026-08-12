<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Generador de guías Danhei Express.
 *
 * Formato interno: DHE + YYYYMMDD + NNNNN (ej: DHE2026051200042)
 * Formato visible: #DHE00042 (consecutivo global)
 * Token público: 32 caracteres aleatorios, sin relación con el consecutivo.
 *
 * La distinción importa: el consecutivo es cómodo para el mostrador pero, por
 * ser predecible, no puede identificar un envío en un endpoint público. El
 * token opaco cumple ese papel.
 */
class TrackingCodeGenerator
{
    /**
     * Genera el siguiente juego de identificadores de un envío.
     *
     * @return array{tracking_code: string, display_code: string, sequence_number: int, public_token: string}
     */
    public function generate(): array
    {
        return DB::transaction(function () {
            $lastSequence = Shipment::withTrashed()
                ->lockForUpdate()
                ->max('sequence_number') ?? 0;

            $nextSequence = $lastSequence + 1;
            $date = now()->format('Ymd');

            return [
                'tracking_code' => sprintf('DHE%s%05d', $date, $nextSequence),
                'display_code' => sprintf('#DHE%05d', $nextSequence),
                'sequence_number' => $nextSequence,
                'public_token' => $this->freshPublicToken(),
            ];
        });
    }

    /**
     * Un token de rastreo que no colisiona con ninguno existente.
     *
     * 32 caracteres alfanuméricos ≈ 190 bits de entropía. La comprobación de
     * unicidad es una red por si acaso; a esa entropía una colisión es
     * astronómicamente improbable, pero la garantía dura debe venir del índice
     * UNIQUE de la columna, no de la probabilidad.
     */
    public function freshPublicToken(): string
    {
        do {
            $token = Str::random(32);
        } while (Shipment::withTrashed()->where('public_token', $token)->exists());

        return $token;
    }
}
