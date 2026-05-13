<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Facades\DB;

/**
 * Generador de guías Danhei Express.
 *
 * Formato interno: DHE + YYYYMMDD + NNNNN (ej: DHE2026051200042)
 * Formato visible: #DHE00042 (consecutivo global)
 */
class TrackingCodeGenerator
{
    /**
     * Genera el siguiente par de códigos (tracking interno + display).
     *
     * @return array{tracking_code: string, display_code: string, sequence_number: int}
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
            ];
        });
    }
}
