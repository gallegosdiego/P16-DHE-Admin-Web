<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Models\User;
use App\Support\PublicAssetUrl;
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

    protected $appends = ['destination_account_masked', 'has_support', 'support_url'];

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
     * reconocer una cuenta sin exponerla.
     */
    public function getDestinationAccountMaskedAttribute(): ?string
    {
        $number = trim((string) ($this->attributes['destination_account_number'] ?? ''));

        if ($number === '') {
            return null;
        }

        if (mb_strlen($number) <= 4) {
            return $number;
        }

        return '····'.mb_substr($number, -4);
    }

    public function getHasSupportAttribute(): bool
    {
        return ! empty($this->attributes['support_path']);
    }

    /**
     * Se usa PublicAssetUrl y no Storage::url() a proposito: el helper resuelve
     * el dominio real del despliegue y se niega a devolver localhost, que es
     * exactamente el fallo que Storage::url() produce en este servidor.
     */
    public function getSupportUrlAttribute(): ?string
    {
        return PublicAssetUrl::toPublicUrl($this->attributes['support_path'] ?? null);
    }

    /**
     * Un movimiento reversado ya no necesita soporte: no hay dinero que probar.
     */
    public function needsSupport(): bool
    {
        return ! $this->has_support
            && $this->status === 'posted'
            && $this->movement_type === 'standard'
            && $this->method !== 'cash';
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
