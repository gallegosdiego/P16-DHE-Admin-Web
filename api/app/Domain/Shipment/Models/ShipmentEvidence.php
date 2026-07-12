<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Operations\Models\OperationalTask;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShipmentEvidence extends Model
{
    protected $table = 'shipment_evidence';

    protected $fillable = [
        'shipment_id', 'operational_task_id', 'delivery_attempt_id', 'evidence_type',
        'original_path', 'sealed_path', 'sha256', 'mime_type', 'file_size', 'width',
        'height', 'source', 'lat', 'lng', 'captured_at', 'received_at', 'created_by',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'lat' => 'float',
            'lng' => 'float',
            'captured_at' => 'datetime',
            'received_at' => 'datetime',
            'metadata_json' => 'array',
        ];
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function operationalTask(): BelongsTo
    {
        return $this->belongsTo(OperationalTask::class);
    }

    public function deliveryAttempt(): BelongsTo
    {
        return $this->belongsTo(DeliveryAttempt::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
