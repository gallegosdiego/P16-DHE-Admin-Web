<?php

namespace App\Http\Controllers\Api;

use App\Domain\Financial\Models\Employee;
use App\Domain\Financial\Models\PayrollPayment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    /**
     * Lista de empleados con estado de pago del periodo actual.
     */
    public function index(): JsonResponse
    {
        $employees = Employee::orderBy('name')
            ->get()
            ->map(function (Employee $emp) {
                $lastPayment = $emp->lastPayment();

                return [
                    ...$emp->toArray(),
                    'last_payment_status' => $lastPayment?->status ?? 'pending',
                    'last_payment_date' => $lastPayment?->paid_at?->toDateString(),
                    'last_period_end' => $lastPayment?->period_end?->toDateString(),
                ];
            });

        $totalPayroll = Employee::active()->sum('salary');

        return response()->json([
            'employees' => $employees,
            'total_monthly_payroll' => (int) $totalPayroll,
            'active_count' => Employee::active()->count(),
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

        $employee = Employee::create([
            ...$validated,
            'is_active' => true,
        ]);

        return response()->json($employee, 201);
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'position' => ['sometimes', 'string', 'max:60'],
            'phone' => ['nullable', 'string', 'max:24'],
            'salary' => ['sometimes', 'integer', 'min:0'],
            'pay_frequency' => ['sometimes', 'in:monthly,biweekly'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $employee->update($validated);

        return response()->json($employee->fresh());
    }

    /**
     * Registrar pago de nómina con prevención de duplicados.
     */
    public function markPaid(Request $request, Employee $employee): JsonResponse
    {
        $request->validate([
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
        ]);

        // Prevención de pago duplicado
        if ($employee->hasPaidPeriod($request->period_start, $request->period_end)) {
            return response()->json([
                'message' => 'Este periodo ya fue pagado para este empleado.',
            ], 422);
        }

        PayrollPayment::create([
            'employee_id' => $employee->id,
            'amount' => $employee->salary,
            'period_start' => $request->period_start,
            'period_end' => $request->period_end,
            'paid_at' => now()->toDateString(),
            'status' => 'paid',
        ]);

        return response()->json(['message' => 'Pago de nómina registrado.']);
    }

    /**
     * Historial de pagos de un empleado.
     */
    public function history(Employee $employee): JsonResponse
    {
        $payments = $employee->payments()
            ->orderByDesc('period_end')
            ->limit(24)
            ->get();

        return response()->json([
            'employee' => $employee,
            'payments' => $payments,
        ]);
    }
}
