<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClientCodEntitlement extends Model
{
    protected $fillable = ['client_id', 'shipment_id', 'driver_cod_obligation_id', 'reported_amount', 'available_amount', 'transferred_amount', 'status', 'available_at', 'fully_transferred_at'];
    protected function casts(): array { return ['reported_amount' => 'integer', 'available_amount' => 'integer', 'transferred_amount' => 'integer', 'available_at' => 'datetime', 'fully_transferred_at' => 'datetime']; }
    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
    public function shipment(): BelongsTo { return $this->belongsTo(Shipment::class); }
    public function obligation(): BelongsTo { return $this->belongsTo(DriverCodObligation::class, 'driver_cod_obligation_id'); }
    public function allocations(): HasMany { return $this->hasMany(ClientCodPayoutAllocation::class, 'entitlement_id'); }
    public function outstanding(): int { return max(0, (int) $this->available_amount - (int) $this->transferred_amount); }
}
