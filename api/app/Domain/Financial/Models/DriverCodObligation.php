<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DriverCodObligation extends Model
{
    /**
     * Medios con los que el dinero llega directo a la cuenta de Danhei. El
     * piloto no lo tiene en la mano: no es efectivo por entregar, es un pago
     * digital que la oficina debe verificar. Se comparan en minúsculas.
     */
    public const DIGITAL_METHODS = ['transferencia', 'transferencia bancaria', 'bank_transfer', 'transfer', 'nequi', 'daviplata', 'pse'];

    public const CHANNEL_CASH = 'cash';

    public const CHANNEL_DIGITAL = 'digital';

    /** Método con que se registra en el libro la verificación de un pago digital. */
    public const DIGITAL_VERIFICATION_METHOD = 'digital_verification';

    protected $appends = ['channel'];

    protected $fillable = ['driver_id', 'client_id', 'shipment_id', 'delivery_attempt_id', 'opening_entry_id', 'collection_date', 'expected_amount', 'collected_amount', 'remitted_amount', 'payment_method', 'status', 'reported_at', 'fully_remitted_at', 'notes'];

    protected function casts(): array
    {
        return ['collection_date' => 'date', 'expected_amount' => 'integer', 'collected_amount' => 'integer', 'remitted_amount' => 'integer', 'reported_at' => 'datetime', 'fully_remitted_at' => 'datetime'];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function openingEntry(): BelongsTo
    {
        return $this->belongsTo(FinancialOpeningEntry::class, 'opening_entry_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(DriverCodRemittanceAllocation::class, 'obligation_id');
    }

    public static function isDigitalMethod(?string $method): bool
    {
        return in_array(mb_strtolower(trim((string) $method)), self::DIGITAL_METHODS, true);
    }

    /** «cash» (el piloto trae el billete) o «digital» (llegó a la cuenta de Danhei). */
    public function getChannelAttribute(): string
    {
        return self::isDigitalMethod($this->payment_method) ? self::CHANNEL_DIGITAL : self::CHANNEL_CASH;
    }

    public function scopeChannel(Builder $query, string $channel): Builder
    {
        $placeholders = implode(', ', array_fill(0, count(self::DIGITAL_METHODS), '?'));
        $expression = "LOWER(TRIM(COALESCE(payment_method, ''))) IN ({$placeholders})";

        return $channel === self::CHANNEL_DIGITAL
            ? $query->whereRaw($expression, self::DIGITAL_METHODS)
            : $query->whereRaw("NOT ({$expression})", self::DIGITAL_METHODS);
    }

    public function outstanding(): int
    {
        return max(0, (int) $this->collected_amount - (int) $this->remitted_amount);
    }
}
