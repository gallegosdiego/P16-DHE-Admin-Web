<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Driver\Models\Driver;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * Solicitud de traspaso entre pilotos que espera la aceptación del piloto que
 * tiene el paquete en su ruta activa (contrato 2026-09-26-B §1).
 */
class CustodyTransferRequest extends Model
{
    public const PENDING = 'pending';

    public const ACCEPTED = 'accepted';

    public const REJECTED = 'rejected';

    public const EXPIRED = 'expired';

    public const CANCELLED = 'cancelled';

    public const APPROVED_BY_ADMIN = 'approved_by_admin';

    /** Minutos que A tiene para responder. */
    public const TTL_MINUTES = 30;

    protected $fillable = [
        'shipment_id', 'from_driver_id', 'to_driver_id', 'status', 'requested_by_user_id',
        'responded_by_user_id', 'reason', 'requested_at', 'responded_at', 'expires_at',
        'custody_event_id', 'metadata_json',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'responded_at' => 'datetime',
        'expires_at' => 'datetime',
        'metadata_json' => 'array',
    ];

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function fromDriver(): BelongsTo
    {
        return $this->belongsTo(Driver::class, 'from_driver_id')->withTrashed();
    }

    public function toDriver(): BelongsTo
    {
        return $this->belongsTo(Driver::class, 'to_driver_id')->withTrashed();
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function respondedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by_user_id');
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }

    public function isOverdue(): bool
    {
        return $this->isPending() && $this->expires_at !== null && $this->expires_at->lte(now());
    }

    public function isExecuted(): bool
    {
        return in_array($this->status, [self::ACCEPTED, self::APPROVED_BY_ADMIN], true);
    }

    /** Vencimiento perezoso: marca como vencidas las pendientes que ya pasaron su hora. */
    public static function expireOverdue(?int $shipmentId = null): int
    {
        return self::query()
            ->where('status', self::PENDING)
            ->where('expires_at', '<=', now())
            ->when($shipmentId !== null, fn ($q) => $q->where('shipment_id', $shipmentId))
            ->update(['status' => self::EXPIRED, 'responded_at' => DB::raw('expires_at'), 'updated_at' => now()]);
    }
}
