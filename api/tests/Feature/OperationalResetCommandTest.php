<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OperationalResetCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_dry_run_reports_scope_without_changing_data(): void
    {
        $before = $this->identityAndOperationCounts();

        Artisan::call('danhei:reset-operations', [
            '--dry-run' => true,
            '--json' => true,
        ]);

        $report = json_decode(Artisan::output(), true);

        $this->assertIsArray($report);
        $this->assertTrue($report['dry_run']);
        $this->assertSame($before['shipments'], $report['deleted']['shipments']);
        $this->assertSame($before, $this->identityAndOperationCounts());
    }

    public function test_reset_deletes_operations_and_preserves_identities_and_configuration(): void
    {
        Storage::fake('public');
        Storage::fake('local');

        $client = Client::query()->firstOrFail();
        $driver = Driver::query()->firstOrFail();
        $shipment = Shipment::query()->firstOrFail();

        Storage::disk('public')->put('evidence/reset-test.jpg', 'evidence');
        Storage::disk('public')->put('intake/reset-test.jpg', 'intake');

        DB::table('shipments')->where('id', $shipment->id)->update([
            'evidence_photo' => 'evidence/reset-test.jpg',
            'intake_photo' => 'intake/reset-test.jpg',
        ]);

        DB::table('drivers')->where('id', $driver->id)->update(['status' => 'route']);

        DB::table('customer_whatsapp_settings')->insert([
            'customer_id' => $client->id,
            'status' => 'DISABLED',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $preservedBefore = [
            'users' => User::query()->count(),
            'clients' => Client::query()->count(),
            'drivers' => Driver::query()->count(),
            'settings' => DB::table('customer_whatsapp_settings')->count(),
        ];

        Artisan::call('danhei:reset-operations', [
            '--force' => true,
            '--json' => true,
        ]);

        $report = json_decode(Artisan::output(), true);

        $this->assertIsArray($report);
        $this->assertFalse($report['dry_run']);
        $this->assertSame(0, DB::table('shipments')->count());
        $this->assertSame(0, DB::table('shipment_events')->count());
        $this->assertSame(0, DB::table('route_stops')->count());
        $this->assertSame(0, DB::table('routes')->count());
        $this->assertSame(0, DB::table('cod_settlements')->count());
        $this->assertSame(0, DB::table('driver_payouts')->count());
        $this->assertSame(0, DB::table('notifications')->count());

        $this->assertSame($preservedBefore['users'], User::query()->count());
        $this->assertSame($preservedBefore['clients'], Client::query()->count());
        $this->assertSame($preservedBefore['drivers'], Driver::query()->count());
        $this->assertSame($preservedBefore['settings'], DB::table('customer_whatsapp_settings')->count());
        $this->assertSame('active', $driver->fresh()->status);

        Storage::disk('public')->assertMissing('evidence/reset-test.jpg');
        Storage::disk('public')->assertMissing('intake/reset-test.jpg');
        Storage::disk('local')->assertExists($report['report_path']);
    }

    private function identityAndOperationCounts(): array
    {
        return [
            'users' => User::query()->count(),
            'clients' => Client::query()->count(),
            'drivers' => Driver::query()->count(),
            'shipments' => Shipment::withTrashed()->count(),
            'routes' => DB::table('routes')->count(),
            'notifications' => DB::table('notifications')->count(),
        ];
    }
}
