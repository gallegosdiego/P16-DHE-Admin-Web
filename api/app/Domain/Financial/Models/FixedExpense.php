<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FixedExpense extends Model
{
    protected $fillable = [
        'name',
        'amount',
        'frequency',
        'due_day',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'due_day' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    // ── Relaciones ────────────────────────────────

    public function payments(): HasMany
    {
        return $this->hasMany(ExpensePayment::class);
    }

    // ── Scopes ────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // ── Helpers ───────────────────────────────────

    /**
     * Estado de pago del mes actual.
     */
    public function currentMonthPayment(): ?ExpensePayment
    {
        return $this->payments()
            ->whereMonth('period_date', now()->month)
            ->whereYear('period_date', now()->year)
            ->first();
    }

    /**
     * Días hasta el vencimiento (null si no tiene due_day).
     */
    public function daysUntilDue(): ?int
    {
        if (! $this->due_day) {
            return null;
        }

        return $this->due_day - now()->day;
    }

    /**
     * ¿Se vence pronto? (5 días o menos).
     */
    public function isDueSoon(): bool
    {
        $days = $this->daysUntilDue();

        return $days !== null && $days >= 0 && $days <= 5;
    }

    /**
     * ¿Está vencido y no pagado este mes?
     */
    public function isOverdue(): bool
    {
        $days = $this->daysUntilDue();
        if ($days === null || $days >= 0) {
            return false;
        }

        $payment = $this->currentMonthPayment();

        return ! $payment || $payment->status !== 'paid';
    }
}
