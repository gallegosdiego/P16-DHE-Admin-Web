<?php

namespace App\Http\Controllers\Api;

use App\Domain\Financial\Models\ExpensePayment;
use App\Domain\Financial\Models\FixedExpense;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    /**
     * Lista de gastos fijos con estado del mes actual.
     */
    public function index(): JsonResponse
    {
        $expenses = FixedExpense::active()
            ->orderBy('name')
            ->get()
            ->map(function (FixedExpense $expense) {
                $payment = $expense->currentMonthPayment();

                return [
                    ...$expense->toArray(),
                    'current_month_status' => $payment?->status ?? 'pending',
                    'current_month_paid_at' => $payment?->paid_at?->toDateString(),
                    'days_until_due' => $expense->daysUntilDue(),
                    'is_due_soon' => $expense->isDueSoon(),
                    'is_overdue' => $expense->isOverdue(),
                ];
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

        $expense = FixedExpense::create([
            ...$validated,
            'is_active' => true,
        ]);

        return response()->json($expense, 201);
    }

    public function update(Request $request, FixedExpense $expense): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'amount' => ['sometimes', 'integer', 'min:0'],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $expense->update($validated);

        return response()->json($expense->fresh());
    }

    /**
     * Marcar gasto como pagado para el mes actual.
     */
    public function markPaid(FixedExpense $expense): JsonResponse
    {
        $periodDate = now()->startOfMonth()->toDateString();

        ExpensePayment::updateOrCreate(
            ['fixed_expense_id' => $expense->id, 'period_date' => $periodDate],
            [
                'amount' => $expense->amount,
                'status' => 'paid',
                'paid_at' => now()->toDateString(),
            ]
        );

        return response()->json(['message' => 'Gasto marcado como pagado.']);
    }

    /**
     * Historial de pagos de un gasto fijo.
     */
    public function history(FixedExpense $expense): JsonResponse
    {
        $payments = $expense->payments()
            ->orderByDesc('period_date')
            ->limit(24) // Últimos 24 meses
            ->get();

        return response()->json([
            'expense' => $expense,
            'payments' => $payments,
        ]);
    }
}
