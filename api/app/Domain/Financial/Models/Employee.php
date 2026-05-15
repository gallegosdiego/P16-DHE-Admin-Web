<?php

namespace App\Domain\Financial\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'name',
        'position',
        'phone',
        'salary',
        'pay_frequency',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'salary' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    // ── Relaciones ────────────────────────────────

    public function payments(): HasMany
    {
        return $this->hasMany(PayrollPayment::class);
    }

    // ── Scopes ────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // ── Helpers ───────────────────────────────────

    /**
     * Último pago registrado.
     */
    public function lastPayment(): ?PayrollPayment
    {
        return $this->payments()->orderByDesc('period_end')->first();
    }

    /**
     * ¿Ya se pagó un periodo específico?
     */
    public function hasPaidPeriod(string $periodStart, string $periodEnd): bool
    {
        return $this->payments()
            ->whereDate('period_start', $periodStart)
            ->whereDate('period_end', $periodEnd)
            ->where('status', 'paid')
            ->exists();
    }
}
