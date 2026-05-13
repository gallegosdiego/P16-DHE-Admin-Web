<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    /**
     * Lista de gastos fijos.
     */
    public function index(): JsonResponse
    {
        $expenses = DB::table('fixed_expenses')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        // Agregar estado del pago del periodo actual
        $expenses = $expenses->map(function ($expense) {
            $currentPayment = DB::table('expense_payments')
                ->where('fixed_expense_id', $expense->id)
                ->whereMonth('period_date', now()->month)
                ->whereYear('period_date', now()->year)
                ->first();

            $expense->current_month_status = $currentPayment?->status ?? 'pending';
            $expense->current_month_paid_at = $currentPayment?->paid_at;

            // Alerta si se acerca la fecha de vencimiento
            if ($expense->due_day) {
                $daysUntilDue = $expense->due_day - now()->day;
                $expense->days_until_due = $daysUntilDue;
                $expense->is_due_soon = $daysUntilDue >= 0 && $daysUntilDue <= 5;
                $expense->is_overdue = $daysUntilDue < 0 && ($currentPayment?->status ?? 'pending') !== 'paid';
            }

            return $expense;
        });

        $totalMonthly = $expenses->sum('amount');

        return response()->json([
            'expenses' => $expenses,
            'total_monthly' => (int) $totalMonthly,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'amount' => ['required', 'integer', 'min:0'],
            'frequency' => ['required', 'in:monthly,biweekly,weekly'],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $id = DB::table('fixed_expenses')->insertGetId([
            ...$validated,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('fixed_expenses')->find($id), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'amount' => ['sometimes', 'integer', 'min:0'],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        DB::table('fixed_expenses')->where('id', $id)->update([
            ...$validated,
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('fixed_expenses')->find($id));
    }

    /**
     * Marcar gasto como pagado para el mes actual.
     */
    public function markPaid(int $id): JsonResponse
    {
        $expense = DB::table('fixed_expenses')->find($id);
        if (! $expense) {
            return response()->json(['error' => 'Gasto no encontrado.'], 404);
        }

        $periodDate = now()->startOfMonth()->toDateString();

        DB::table('expense_payments')->updateOrInsert(
            ['fixed_expense_id' => $id, 'period_date' => $periodDate],
            [
                'amount' => $expense->amount,
                'status' => 'paid',
                'paid_at' => now()->toDateString(),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        return response()->json(['message' => 'Gasto marcado como pagado.']);
    }
}
