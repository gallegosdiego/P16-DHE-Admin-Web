<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Exportación de datos a CSV.
 * Requiere permiso reports.export.
 */
class ExportController extends Controller
{
    /**
     * Exportar envíos a CSV.
     *
     * GET /api/exports/shipments?status=delivered&from=2026-01-01&to=2026-12-31
     */
    public function shipments(Request $request): Response
    {
        $query = Shipment::with(['sender', 'driver'])
            ->orderBy('created_at', 'desc');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($from = $request->query('from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->whereDate('created_at', '<=', $to);
        }
        if ($zone = $request->query('zone')) {
            $query->where('recipient_zone', $zone);
        }

        $shipments = $query->limit(5000)->get();

        $csv = $this->generateCsv($shipments);

        $filename = 'envios_' . now()->format('Y-m-d_His') . '.csv';

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    private function generateCsv($shipments): string
    {
        $headers = [
            'Guia',
            'Estado',
            'Remitente',
            'Destinatario',
            'Telefono',
            'Direccion',
            'Zona',
            'Tipo Pago',
            'Monto COD',
            'Costo Envio',
            'Estado Financiero',
            'Conductor',
            'Creado',
            'Entregado',
        ];

        // BOM for Excel UTF-8
        $output = "\xEF\xBB\xBF" . implode(',', $headers) . "\n";

        foreach ($shipments as $s) {
            $row = [
                $s->display_code,
                $s->status,
                $this->escapeCsv($s->sender?->name ?? 'N/A'),
                $this->escapeCsv($s->recipient_name),
                $s->recipient_phone,
                $this->escapeCsv($s->recipient_address),
                $s->recipient_zone ?? '',
                $s->payment_type,
                $s->cod_amount ?? 0,
                $s->shipping_cost ?? 0,
                $s->financial_status ?? 'pending',
                $this->escapeCsv($s->driver?->name ?? 'Sin asignar'),
                $s->created_at?->format('Y-m-d H:i'),
                $s->delivered_at?->format('Y-m-d H:i') ?? '',
            ];

            $output .= implode(',', $row) . "\n";
        }

        return $output;
    }

    private function escapeCsv(?string $value): string
    {
        if ($value === null) return '';
        // Si contiene coma, comilla o salto de línea, envolver en comillas
        if (str_contains($value, ',') || str_contains($value, '"') || str_contains($value, "\n")) {
            return '"' . str_replace('"', '""', $value) . '"';
        }
        return $value;
    }
}
