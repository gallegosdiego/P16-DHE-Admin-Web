<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PayrollController extends Controller
{
    /**
     * Lista de empleados con estado de pago del periodo actual.
     */
    public function index(): JsonResponse
    {
        $employees = DB::table('employees')
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();

        $employees = $employees->map(function ($emp) {
            // Buscar último pago
            $lastPayment = DB::table('payroll_payments')
                ->where('employee_id', $emp->id)
                ->orderByDesc('period_end')
                ->first();

            $emp->last_payment_status = $lastPayment?->status ?? 'pending';
            $emp->last_payment_date = $lastPayment?->paid_at;
            $emp->last_period_end = $lastPayment?->period_end;

            return $emp;
        });

        $totalPayroll = $employees->where('is_active', true)->sum('salary');

        return response()->json([
            'employees' => $employees,
            'total_monthly_payroll' => (int) $totalPayroll,
            'active_count' => $employees->where('is_active', true)->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'position' => ['required', 'string', 'max:60'],
            'phone' => ['nullable', 'string', 'max:24'],
            'salary' => ['required', 'integer', 'min:0'],
            'pay_frequency' => ['required', 'in:monthly,biweekly'],
        ]);

        $id = DB::table('employees')->insertGetId([
            ...$validated,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('employees')->find($id), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'position' => ['sometimes', 'string', 'max:60'],
            'phone' => ['nullable', 'string', 'max:24'],
            'salary' => ['sometimes', 'integer', 'min:0'],
            'pay_frequency' => ['sometimes', 'in:monthly,biweekly'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        DB::table('employees')->where('id', $id)->update([
            ...$validated,
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('employees')->find($id));
    }

    /**
     * Registrar pago de nómina.
     */
    public function markPaid(Request $request, int $id): JsonResponse
    {
        $employee = DB::table('employees')->find($id);
        if (! $employee) {
            return response()->json(['error' => 'Empleado no encontrado.'], 404);
        }

        $request->validate([
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date'],
        ]);

        DB::table('payroll_payments')->insert([
            'employee_id' => $id,
            'amount' => $employee->salary,
            'period_start' => $request->period_start,
            'period_end' => $request->period_end,
            'paid_at' => now()->toDateString(),
            'status' => 'paid',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Pago de nómina registrado.']);
    }
}
