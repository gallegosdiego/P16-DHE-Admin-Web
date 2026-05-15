<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExpensePayment extends Model
{
    protected $fillable = [
        'fixed_expense_id',
        'amount',
        'period_date',
        'paid_at',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'period_date' => 'date',
            'paid_at' => 'date',
        ];
    }

    // ── Relaciones ────────────────────────────────

    public function expense(): BelongsTo
    {
        return $this->belongsTo(FixedExpense::class, 'fixed_expense_id');
    }
}
