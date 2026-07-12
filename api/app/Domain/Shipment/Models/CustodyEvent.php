<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Operations\Models\OperationalTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class CustodyEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'shipment_id', 'operational_task_id', 'shipment_evidence_id', 'event_type',
        'previous_custodian_type', 'previous_custodian_id', 'previous_custodian_name',
        'new_custodian_type', 'new_custodian_id', 'new_custodian_name',
        'physical_condition', 'actor_user_id', 'lat', 'lng', 'occurred_at',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'occurred_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Los eventos de custodia son inmutables.'));
        static::deleting(fn () => throw new LogicException('Los eventos de custodia no se pueden eliminar.'));
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function operationalTask(): BelongsTo
    {
        return $this->belongsTo(OperationalTask::class);
    }

    public function evidence(): BelongsTo
    {
        return $this->belongsTo(ShipmentEvidence::class, 'shipment_evidence_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
