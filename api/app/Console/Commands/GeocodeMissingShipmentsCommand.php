<?php

namespace App\Console\Commands;

use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\ShipmentGeodataService;
use Illuminate\Console\Command;

class GeocodeMissingShipmentsCommand extends Command
{
    protected $signature = 'shipments:geocode-missing
        {--limit=100 : Maximo de envios a procesar}
        {--id=* : IDs especificos de envios}
        {--dry-run : Solo audita, no persiste cambios}
        {--json : Imprime salida JSON}';

    protected $description = 'Geocodifica envios historicos o recientes que aun no tienen latitud/longitud.';

    public function handle(ShipmentGeodataService $shipmentGeodataService): int
    {
        $limit = max((int) $this->option('limit'), 1);
        $dryRun = (bool) $this->option('dry-run');
        $ids = collect($this->option('id'))->filter()->map(fn ($id) => (int) $id)->values();

        $query = Shipment::query()
            ->withoutCoordinates()
            ->whereNotNull('recipient_address')
            ->where('recipient_address', '!=', '')
            ->orderBy('id');

        if ($ids->isNotEmpty()) {
            $query->whereIn('id', $ids);
        }

        $shipments = $query->limit($limit)->get();

        $report = [
            'dry_run' => $dryRun,
            'requested_limit' => $limit,
            'selected_ids' => $ids->all(),
            'processed' => 0,
            'geocoded' => 0,
            'failed' => 0,
            'skipped' => 0,
            'items' => [],
        ];

        foreach ($shipments as $shipment) {
            $report['processed']++;
            $beforeCity = $shipment->recipient_city;
            $result = $shipmentGeodataService->repair($shipment);

            if (! $dryRun && $shipment->isDirty()) {
                $shipment->saveQuietly();
            }

            if ($shipment->hasRecipientCoordinates()) {
                $report['geocoded']++;
                $report['items'][] = [
                    'shipment_id' => $shipment->id,
                    'display_code' => $shipment->display_code,
                    'status' => $dryRun ? 'preview' : 'geocoded',
                    'zone' => $shipment->recipient_zone,
                    'city' => $shipment->recipient_city,
                    'lat' => $shipment->recipient_lat,
                    'lng' => $shipment->recipient_lng,
                    'zone_resolved' => $result['zone_resolved'] ?? false,
                    'city_resolved' => $result['city_resolved'],
                ];
                continue;
            }

            if (! filled($shipment->recipient_city)) {
                $report['skipped']++;
                $report['items'][] = [
                    'shipment_id' => $shipment->id,
                    'display_code' => $shipment->display_code,
                    'status' => 'skipped',
                    'reason' => $shipment->geocodingReason(),
                    'reason_label' => $shipment->getGeocodingReasonLabelAttribute(),
                ];
                continue;
            }

            $report['failed']++;
            $report['items'][] = [
                'shipment_id' => $shipment->id,
                'display_code' => $shipment->display_code,
                'status' => 'failed',
                'zone' => $shipment->recipient_zone,
                'city' => $shipment->recipient_city,
                'reason' => $shipment->geocodingReason(),
                'reason_label' => $shipment->getGeocodingReasonLabelAttribute(),
                'zone_resolved' => $result['zone_resolved'] ?? false,
                'city_resolved' => $result['city_resolved'] || blank($beforeCity),
            ];
        }

        if ($shipments->isEmpty()) {
            $report['skipped'] = 0;
        }

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        $this->info('Geocodificacion de envios sin coordenadas');
        $this->line('Procesados: '.$report['processed']);
        $this->line('Geocodificados: '.$report['geocoded']);
        $this->line('Fallidos: '.$report['failed']);
        $this->line('Modo dry-run: '.($dryRun ? 'SI' : 'NO'));

        return self::SUCCESS;
    }
}
