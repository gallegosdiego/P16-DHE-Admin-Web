<?php

namespace App\Domain\Financial\Models;

use App\Domain\Client\Models\Client;
use App\Domain\Shipment\Models\Shipment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentIntent extends Model
{
    protected $fillable = ['public_id', 'shipment_id', 'client_id', 'amount', 'purpose', 'provider', 'status', 'qr_payload', 'provider_reference', 'expires_at', 'verified_at', 'metadata_json'];
    protected $hidden = ['metadata_json'];
    protected function casts(): array { return ['amount' => 'integer', 'expires_at' => 'datetime', 'verified_at' => 'datetime', 'metadata_json' => 'array']; }
    public function shipment(): BelongsTo { return $this->belongsTo(Shipment::class); }
    public function client(): BelongsTo { return $this->belongsTo(Client::class); }
}
