<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DailySummaryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->seed(\Database\Seeders\FinancialDemoSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
    }

    public function test_admin_can_get_daily_summary(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/daily-summary')
            ->assertOk()
            ->assertJsonStructure(['date', 'packages', 'revenue', 'cod', 'receivables', 'outsourcing']);
    }

    public function test_daily_summary_packages_are_integers(): void
    {
        $data = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/daily-summary')
            ->assertOk()
            ->json();

        $this->assertIsInt($data['packages']['total_today']);
        $this->assertIsInt($data['packages']['delivered_today']);
        $this->assertIsInt($data['packages']['total_week']);
        $this->assertIsInt($data['packages']['total_month']);
    }

    public function test_admin_can_get_profit_loss(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/profit-loss?from=2026-01-01&to=2026-12-31')
            ->assertOk()
            ->assertJsonStructure(['period', 'income', 'costs', 'net_profit', 'margin_percent']);
    }

    public function test_profit_loss_validates_dates(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/profit-loss')
            ->assertUnprocessable();
    }

    public function test_collect_batch_works(): void
    {
        $driverId = \App\Domain\Shipment\Models\Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay shipments con driver_id');
        }

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/financial/collect-batch', ['driver_id' => $driverId]);

        $response->assertOk();
        $this->assertGreaterThanOrEqual(0, $response->json('count'));
    }

    public function test_driver_paid_batch_works(): void
    {
        $driverId = \App\Domain\Shipment\Models\Shipment::whereNotNull('driver_id')->value('driver_id');
        if (! $driverId) {
            $this->markTestSkipped('No hay shipments con driver_id');
        }

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/financial/driver-paid-batch', ['driver_id' => $driverId])
            ->assertOk();
    }
}
