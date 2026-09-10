<?php

namespace Database\Seeders;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Services\CustodyRecorder;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Escenario demo para certificar la conciliación de fin de día (OT-F):
 * 15 envíos desechables en bodega con custodia de sede coherente.
 *
 * El resto del recorrido (custodia al piloto por escaneo, salida, 10
 * entregas y 5 devoluciones) se ejecuta por la API real para que los
 * eventos queden legítimos — este seeder solo pone la materia prima.
 *
 * Idempotente: se puede correr las veces que haga falta sin duplicar.
 */
class DayCloseDemoSeeder extends Seeder
{
    public function run(): void
    {
        $client = Client::query()->first();
        $admin = User::where('email', 'admin@danheiexpress.com')->first();

        if (! $client || ! $admin) {
            $this->command?->warn('Falta la base demo (cliente o admin); corre antes los seeders demo.');

            return;
        }

        $recorder = app(CustodyRecorder::class);
        $sequenceBase = (int) Shipment::query()->max('sequence_number');

        for ($i = 1; $i <= 15; $i++) {
            $code = sprintf('DEMODC%03d', $i);

            $shipment = Shipment::withoutEvents(function () use ($client, $admin, $code, $i, $sequenceBase) {
                return Shipment::firstOrCreate(
                    ['tracking_code' => $code],
                    [
                        'sequence_number' => $sequenceBase + $i,
                        'public_token' => Str::random(32),
                        'client_id' => $client->id,
                        'created_by' => $admin->id,
                        'display_code' => '#'.$code,
                        'status' => 'in_warehouse',
                        'recipient_name' => 'Destinatario Demo Cierre '.$i,
                        'recipient_phone' => '30000000'.str_pad((string) $i, 2, '0', STR_PAD_LEFT),
                        'recipient_address' => 'Calle '.(40 + $i).' #10-'.$i,
                        'recipient_zone' => 'Kennedy',
                        'recipient_city' => 'Bogotá',
                        'payment_type' => 'prepaid',
                        'shipping_cost' => 12000,
                        'size_code' => 'small',
                        // Nacen geocodificados: sin esto, el guardado dispara la
                        // cascada externa y en máquinas sin certificados CA de
                        // PHP el flujo se cuelga (deuda documentada del entorno).
                        'recipient_lat' => 4.6280 + ($i * 0.0004),
                        'recipient_lng' => -74.1520 - ($i * 0.0004),
                        'geocoded_at' => now(),
                    ]
                );
            });

            if ($shipment->getRawOriginal('recipient_lat') === null) {
                Shipment::withoutEvents(function () use ($shipment, $i) {
                    $shipment->forceFill([
                        'recipient_lat' => 4.6280 + ($i * 0.0004),
                        'recipient_lng' => -74.1520 - ($i * 0.0004),
                        'geocoded_at' => now(),
                    ])->save();
                });
            }

            $hasCustody = CustodyEvent::where('shipment_id', $shipment->id)->exists();

            if (! $hasCustody) {
                $recorder->record($shipment, [
                    'event_type' => 'received_at_hub',
                    'new_custodian_type' => 'hub',
                    'new_custodian_id' => 1,
                    'new_custodian_name' => 'Sede principal',
                    'actor_user_id' => $admin->id,
                    'metadata_json' => ['origen' => 'DayCloseDemoSeeder (certificación OT-F)'],
                ]);
            }

            $this->command?->line($shipment->tracking_code.' → '.$shipment->getRawOriginal('status'));
        }

        $this->command?->info('Escenario DayClose demo listo: 15 envíos en bodega con custodia de sede.');
    }
}
