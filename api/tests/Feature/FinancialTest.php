<?php

namespace Tests\Feature;

use App\Domain\Financial\Models\Employee;
use App\Domain\Financial\Models\FixedExpense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinancialTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $operador;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->seed(\Database\Seeders\DemoDataSeeder::class);
        $this->seed(\Database\Seeders\FinancialDemoSeeder::class);
        $this->admin = User::where('email', 'admin@danheiexpress.com')->first();
        $this->operador = User::where('email', 'operador@danheiexpress.com')->first();
    }

    // ── Financial Overview ────────────────────────

    public function test_admin_can_get_financial_overview(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/financial/overview');

        $response->assertOk()
            ->assertJsonStructure([
                'cod' => ['pending', 'collected', 'settled'],
                'post_sale' => ['pending', 'invoiced', 'overdue', 'total_receivable'],
                'drivers' => ['pending_payment'],
                'totals' => ['total_receivable', 'total_payable'],
            ]);
    }

    public function test_operador_cannot_access_financial_overview(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/financial/overview');

        $response->assertForbidden();
    }

    // ── COD Operations ────────────────────────────

    public function test_legacy_cod_and_driver_paid_writes_are_retired(): void
    {
        $shipment = \App\Domain\Shipment\Models\Shipment::where('payment_type', 'cash_on_delivery')->firstOrFail();
        $shipment->update(['financial_status' => 'collected', 'status' => 'delivered', 'driver_paid' => false]);

        foreach (['collect', 'settle', 'driver-paid'] as $action) {
            $this->actingAs($this->admin, 'sanctum')
                ->postJson("/api/financial/shipments/{$shipment->id}/{$action}")
                ->assertStatus(410)
                ->assertJsonPath('message', 'Esta acción se retiró. Usa Pagos → Conciliación.');
        }

        $this->assertDatabaseHas('shipments', [
            'id' => $shipment->id,
            'financial_status' => 'collected',
            'driver_paid' => false,
        ]);
    }

    // ── Expenses ──────────────────────────────────

    public function test_admin_can_list_expenses(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/expenses');

        $response->assertOk()
            ->assertJsonStructure([
                'expenses' => [['id', 'name', 'amount', 'current_month_status']],
                'total_monthly',
            ]);
    }

    public function test_admin_can_create_expense(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/expenses', [
                'name' => 'Luz eléctrica',
                'amount' => 150000,
                'frequency' => 'monthly',
                'due_day' => 25,
                'notes' => 'Factura de energía',
            ]);

        $response->assertCreated()
            ->assertJsonPath('name', 'Luz eléctrica');

        $this->assertDatabaseHas('fixed_expenses', [
            'name' => 'Luz eléctrica',
            'amount' => 150000,
        ]);
    }

    public function test_admin_can_update_expense(): void
    {
        $expense = FixedExpense::first();

        $response = $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/expenses/{$expense->id}", [
                'amount' => 1500000,
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('fixed_expenses', [
            'id' => $expense->id,
            'amount' => 1500000,
        ]);
    }

    public function test_admin_can_mark_expense_paid(): void
    {
        $expense = FixedExpense::first();

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/expenses/{$expense->id}/pay");

        $response->assertOk()
            ->assertJsonPath('message', 'Gasto marcado como pagado.');
    }

    public function test_admin_can_view_expense_history(): void
    {
        $expense = FixedExpense::first();

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/expenses/{$expense->id}/history");

        $response->assertOk()
            ->assertJsonStructure([
                'expense' => ['id', 'name', 'amount'],
                'payments',
            ]);
    }

    // ── Payroll ───────────────────────────────────

    public function test_admin_can_list_employees(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/employees');

        $response->assertOk()
            ->assertJsonStructure([
                'employees' => [['id', 'name', 'position', 'salary']],
                'total_monthly_payroll',
                'active_count',
            ]);
    }

    public function test_admin_can_create_employee(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/employees', [
                'name' => 'Pedro Test',
                'position' => 'Auxiliar',
                'salary' => 900000,
                'pay_frequency' => 'biweekly',
            ]);

        $response->assertCreated()
            ->assertJsonPath('name', 'Pedro Test');
    }

    public function test_admin_can_pay_employee(): void
    {
        $employee = Employee::first();
        $periodStart = now()->startOfMonth()->addMonth()->toDateString();
        $periodEnd = now()->endOfMonth()->addMonth()->toDateString();

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/employees/{$employee->id}/pay", [
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Pago de nómina registrado.');
    }

    public function test_cannot_pay_employee_duplicate_period(): void
    {
        $employee = Employee::first();
        $periodStart = '2099-01-01';
        $periodEnd = '2099-01-31';

        // Primer pago
        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/employees/{$employee->id}/pay", [
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
            ]);

        // Segundo pago del mismo periodo = error
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/employees/{$employee->id}/pay", [
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
            ]);

        $response->assertUnprocessable();
    }

    public function test_admin_can_view_employee_payment_history(): void
    {
        $employee = Employee::first();

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/employees/{$employee->id}/history");

        $response->assertOk()
            ->assertJsonStructure([
                'employee' => ['id', 'name'],
                'payments',
            ]);
    }

    // ── Accounts Receivable ──────────────────────

    public function test_admin_can_view_accounts_receivable(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/clients-receivable');

        $response->assertOk()
            ->assertJsonStructure([
                'clients',
                'total_owed',
                'count',
            ]);
    }

    // ── RBAC ─────────────────────────────────────

    public function test_operador_cannot_access_expenses(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/expenses');

        $response->assertForbidden();
    }

    public function test_operador_cannot_access_payroll(): void
    {
        $response = $this->actingAs($this->operador, 'sanctum')
            ->getJson('/api/employees');

        $response->assertForbidden();
    }
}
