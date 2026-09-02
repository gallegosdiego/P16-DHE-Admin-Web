<?php

namespace Database\Seeders;

use App\Domain\Financial\Models\Employee;
use App\Domain\Financial\Models\ExpensePayment;
use App\Domain\Financial\Models\FixedExpense;
use App\Domain\Financial\Models\PayrollPayment;
use Illuminate\Database\Seeder;

class FinancialDemoSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        // ── Gastos fijos ──────────────────────────────
        $arriendo = FixedExpense::updateOrCreate(
            ['name' => 'Arriendo local'],
            ['amount' => 1200000, 'frequency' => 'monthly', 'due_day' => 5, 'notes' => 'Local 64, Cl 13 #15-48', 'is_active' => true],
        );
        $internet = FixedExpense::updateOrCreate(
            ['name' => 'Internet'],
            ['amount' => 85000, 'frequency' => 'monthly', 'due_day' => 15, 'notes' => 'Fibra 100 Mbps', 'is_active' => true],
        );

        // Pagos del mes anterior (ya pagados)
        ExpensePayment::updateOrCreate(
            ['fixed_expense_id' => $arriendo->id, 'period_date' => $now->copy()->subMonth()->startOfMonth()],
            ['amount' => 1200000, 'paid_at' => $now->copy()->subMonth()->addDays(4)->toDateString(), 'status' => 'paid'],
        );
        ExpensePayment::updateOrCreate(
            ['fixed_expense_id' => $internet->id, 'period_date' => $now->copy()->subMonth()->startOfMonth()],
            ['amount' => 85000, 'paid_at' => $now->copy()->subMonth()->addDays(14)->toDateString(), 'status' => 'paid'],
        );

        // Pago de este mes: arriendo pagado, internet pendiente
        ExpensePayment::updateOrCreate(
            ['fixed_expense_id' => $arriendo->id, 'period_date' => $now->copy()->startOfMonth()],
            ['amount' => 1200000, 'paid_at' => $now->copy()->subDays(5)->toDateString(), 'status' => 'paid'],
        );

        // ── Empleados administrativos ─────────────────
        $emp1 = Employee::updateOrCreate(['phone' => '311 220 6587'], ['name' => 'Ángel Danhei', 'position' => 'Administrador', 'salary' => 2000000, 'pay_frequency' => 'monthly', 'is_active' => true]);
        Employee::updateOrCreate(['phone' => '310 555 1234'], ['name' => 'Sandra López', 'position' => 'Vendedora', 'salary' => 1300000, 'pay_frequency' => 'biweekly', 'is_active' => true]);
        $emp3 = Employee::updateOrCreate(['phone' => '312 666 7890'], ['name' => 'Carlos Despacho', 'position' => 'Despachador', 'salary' => 1100000, 'pay_frequency' => 'biweekly', 'is_active' => true]);

        // Pagos de nómina: Ángel pagado, Sandra pendiente, Carlos pagado
        PayrollPayment::updateOrCreate(
            ['employee_id' => $emp1->id, 'period_start' => $now->copy()->startOfMonth(), 'period_end' => $now->copy()->endOfMonth()],
            ['amount' => 2000000, 'paid_at' => $now->copy()->subDays(3)->toDateString(), 'status' => 'paid'],
        );
        PayrollPayment::updateOrCreate(
            ['employee_id' => $emp3->id, 'period_start' => $now->copy()->startOfMonth(), 'period_end' => $now->copy()->addDays(14)->startOfDay()],
            ['amount' => 1100000, 'paid_at' => $now->copy()->subDay()->toDateString(), 'status' => 'paid'],
        );

        $this->command->info('✅ Datos financieros demo: 2 gastos fijos, 3 empleados.');
    }
}
