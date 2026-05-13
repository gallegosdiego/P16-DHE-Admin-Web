<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinancialDemoSeeder extends Seeder
{
    public function run(): void
    {
        // ── Gastos fijos ──────────────────────────────
        $arriendo = DB::table('fixed_expenses')->insertGetId([
            'name' => 'Arriendo local',
            'amount' => 1200000,
            'frequency' => 'monthly',
            'due_day' => 5,
            'notes' => 'Local 64, Cl 13 #15-48',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $internet = DB::table('fixed_expenses')->insertGetId([
            'name' => 'Internet',
            'amount' => 85000,
            'frequency' => 'monthly',
            'due_day' => 15,
            'notes' => 'Fibra 100 Mbps',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Pagos del mes anterior (ya pagados)
        DB::table('expense_payments')->insert([
            [
                'fixed_expense_id' => $arriendo,
                'amount' => 1200000,
                'period_date' => now()->subMonth()->startOfMonth()->toDateString(),
                'paid_at' => now()->subMonth()->addDays(4)->toDateString(),
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'fixed_expense_id' => $internet,
                'amount' => 85000,
                'period_date' => now()->subMonth()->startOfMonth()->toDateString(),
                'paid_at' => now()->subMonth()->addDays(14)->toDateString(),
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Pago de este mes: arriendo pagado, internet pendiente
        DB::table('expense_payments')->insert([
            'fixed_expense_id' => $arriendo,
            'amount' => 1200000,
            'period_date' => now()->startOfMonth()->toDateString(),
            'paid_at' => now()->subDays(5)->toDateString(),
            'status' => 'paid',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // ── Empleados administrativos ─────────────────
        $emp1 = DB::table('employees')->insertGetId([
            'name' => 'Ángel Danhei',
            'position' => 'Administrador',
            'phone' => '311 220 6587',
            'salary' => 2000000,
            'pay_frequency' => 'monthly',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $emp2 = DB::table('employees')->insertGetId([
            'name' => 'Sandra López',
            'position' => 'Vendedora',
            'phone' => '310 555 1234',
            'salary' => 1300000,
            'pay_frequency' => 'biweekly',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $emp3 = DB::table('employees')->insertGetId([
            'name' => 'Carlos Despacho',
            'position' => 'Despachador',
            'phone' => '312 666 7890',
            'salary' => 1100000,
            'pay_frequency' => 'biweekly',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Pagos de nómina: Ángel pagado, Sandra pendiente, Carlos pagado
        DB::table('payroll_payments')->insert([
            [
                'employee_id' => $emp1,
                'amount' => 2000000,
                'period_start' => now()->startOfMonth()->toDateString(),
                'period_end' => now()->endOfMonth()->toDateString(),
                'paid_at' => now()->subDays(3)->toDateString(),
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'employee_id' => $emp3,
                'amount' => 1100000,
                'period_start' => now()->startOfMonth()->toDateString(),
                'period_end' => now()->addDays(14)->toDateString(),
                'paid_at' => now()->subDay()->toDateString(),
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->command->info('✅ Datos financieros demo: 2 gastos fijos, 3 empleados.');
    }
}
