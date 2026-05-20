<?php

namespace App\Domain\Financial\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Support\Carbon;

class AgingReportService
{
    /**
     * Genera el reporte de antigüedad de cuentas por cobrar (aging report).
     *
     * Agrupa los envíos post-venta pendientes por cliente y los clasifica
     * en buckets de antigüedad basados en la fecha de creación del envío.
     *
     * Buckets:
     * - current: < 1 día
     * - 1–30 días
     * - 31–60 días
     * - 61–90 días
     * - 90+ días
     *
     * @return array{clients: array, summary: array}
     */
    public function generate(): array
    {
        $now = Carbon::now();

        // Obtener todos los envíos post-venta con deuda pendiente,
        // agrupados por client_id, cargando la relación client en una sola consulta.
        $shipments = Shipment::with('client:id,name,company,phone')
            ->where('payment_type', 'post_sale')
            ->whereIn('financial_status', ['pending', 'invoiced', 'overdue'])
            ->select([
                'id', 'client_id', 'shipping_cost', 'created_at',
                'financial_status', 'payment_type',
            ])
            ->get();

        // Agrupar por client_id
        $grouped = $shipments->groupBy('client_id');

        // Acumuladores del resumen general
        $summary = [
            'total_receivable' => 0,
            'total_current'    => 0,
            'total_1_30'       => 0,
            'total_31_60'      => 0,
            'total_61_90'      => 0,
            'total_90_plus'    => 0,
            'overdue_pct'      => 0,
        ];

        $totalOverdueAmount = 0;
        $clients = [];

        foreach ($grouped as $clientId => $clientShipments) {
            $client = $clientShipments->first()->client;

            // Si el cliente fue eliminado (soft-deleted), usar datos mínimos
            $clientName    = $client->name ?? 'Cliente #' . $clientId;
            $clientCompany = $client->company ?? '';
            $clientPhone   = $client->phone ?? '';

            $buckets = [
                'current'    => 0,
                'bucket_1_30'  => 0,
                'bucket_31_60' => 0,
                'bucket_61_90' => 0,
                'bucket_90_plus' => 0,
            ];
            $totalOwed  = 0;
            $oldestDays = 0;

            foreach ($clientShipments as $shipment) {
                $days = (int) $now->diffInDays($shipment->created_at);
                $amount = (int) $shipment->shipping_cost;
                $totalOwed += $amount;

                if ($days > $oldestDays) {
                    $oldestDays = $days;
                }

                if ($days < 1) {
                    $buckets['current'] += $amount;
                } elseif ($days <= 30) {
                    $buckets['bucket_1_30'] += $amount;
                } elseif ($days <= 60) {
                    $buckets['bucket_31_60'] += $amount;
                } elseif ($days <= 90) {
                    $buckets['bucket_61_90'] += $amount;
                } else {
                    $buckets['bucket_90_plus'] += $amount;
                }
            }

            // Acumular en resumen
            $summary['total_receivable'] += $totalOwed;
            $summary['total_current']    += $buckets['current'];
            $summary['total_1_30']       += $buckets['bucket_1_30'];
            $summary['total_31_60']      += $buckets['bucket_31_60'];
            $summary['total_61_90']      += $buckets['bucket_61_90'];
            $summary['total_90_plus']    += $buckets['bucket_90_plus'];

            // Monto vencido (> 30 días)
            $totalOverdueAmount += $buckets['bucket_31_60']
                + $buckets['bucket_61_90']
                + $buckets['bucket_90_plus'];

            $clients[] = [
                'id'              => $clientId,
                'name'            => $clientName,
                'company'         => $clientCompany,
                'phone'           => $clientPhone,
                'total_owed'      => $totalOwed,
                'current'         => $buckets['current'],
                'bucket_1_30'     => $buckets['bucket_1_30'],
                'bucket_31_60'    => $buckets['bucket_31_60'],
                'bucket_61_90'    => $buckets['bucket_61_90'],
                'bucket_90_plus'  => $buckets['bucket_90_plus'],
                'shipments_count' => $clientShipments->count(),
                'oldest_days'     => $oldestDays,
            ];
        }

        // Ordenar por total_owed descendente
        usort($clients, fn ($a, $b) => $b['total_owed'] <=> $a['total_owed']);

        // Porcentaje vencido
        $summary['overdue_pct'] = $summary['total_receivable'] > 0
            ? round(($totalOverdueAmount / $summary['total_receivable']) * 100, 1)
            : 0;

        return [
            'clients' => $clients,
            'summary' => $summary,
        ];
    }
}
