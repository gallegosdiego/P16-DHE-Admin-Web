<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ClientCodPayout extends Model
{
    protected $fillable = [
        'reference', 'client_id', 'paid_by', 'approved_by', 'amount', 'allocated_amount',
        'balance_before', 'balance_after', 'movement_type', 'status', 'reversal_of_id',
        'method', 'external_reference', 'paid_at', 'approved_at', 'notes',
        'destination_kind', 'destination_bank', 'destination_account_type',
        'destination_account_number', 'destination_holder_name', 'destination_holder_document',
        'support_path', 'support_sha256', 'support_mime', 'support_size',
        'support_uploaded_at', 'support_uploaded_by',
    ];

    /**
     * El numero de cuenta completo no sale del backend: al frontend viaja
     * enmascarado. Se conserva entero en base de datos para poder auditar un
     * pago, pero no hay razon para pasearlo por el navegador ni por los logs.
     */
    protected $hidden = ['destination_account_number', 'support_path'];

    protected $appends = ['destination_account_masked', 'has_support', 'needs_support'];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'allocated_amount' => 'integer',
            'balance_before' => 'integer',
            'balance_after' => 'integer',
            'support_size' => 'integer',
            'paid_at' => 'datetime',
            'approved_at' => 'datetime',
            'support_uploaded_at' => 'datetime',
        ];
    }

    /**
     * Deja visibles los ultimos cuatro digitos, que es lo que se usa para
     * reconocer una cuenta sin exponerla. Un valor de 4 caracteres o menos se
     * oculta ENTERO: devolverlo completo anularia el $hidden de arriba. Misma
     * politica que IntegrationSettings con los secretos cortos.
     */
    public function getDestinationAccountMaskedAttribute(): ?string
    {
        $number = trim((string) ($this->attributes['destination_account_number'] ?? ''));

        if ($number === '') {
            return null;
        }

        if (mb_strlen($number) <= 4) {
            return '····';
        }

        return '····'.mb_substr($number, -4);
    }

    public function getHasSupportAttribute(): bool
    {
        return ! empty($this->attributes['support_path']);
    }

    /**
     * La regla «transferencia sin soporte» vive AQUI y solo aqui: el contador
     * del controlador usa el scope y el frontend lee el atributo serializado.
     * Antes existian cuatro copias (SQL, PHP, TS y la guarda de adjuntar) que
     * ya divergian en el trato de NULL, mayusculas y el status.
     */
    public function getNeedsSupportAttribute(): bool
    {
        return $this->needsSupport();
    }

    /**
     * Un movimiento reversado ya no necesita soporte: no hay dinero que probar.
     * El metodo se normaliza a minusculas para coincidir con la colacion
     * case-insensitive con que MySQL evalua el scope.
     */
    public function needsSupport(): bool
    {
        return ! $this->has_support
            && $this->status === 'posted'
            && $this->movement_type === 'standard'
            && strtolower((string) $this->method) !== 'cash';
    }

    /**
     * Version en consulta de needsSupport(). El whereNull/orWhere existe por
     * la logica trivalente de SQL: `method != 'cash'` EXCLUYE las filas con
     * method NULL, que para esta regla si cuentan como electronicas.
     */
    public function scopeNeedingSupport(Builder $query): Builder
    {
        return $query
            ->where('status', 'posted')
            ->where('movement_type', 'standard')
            ->where(fn ($q) => $q->whereNull('method')->orWhere('method', '!=', 'cash'))
            ->whereNull('support_path');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function paidBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function supportUploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'support_uploaded_by');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function reversal(): HasOne
    {
        return $this->hasOne(self::class, 'reversal_of_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(ClientCodPayoutAllocation::class, 'payout_id');
    }
}
