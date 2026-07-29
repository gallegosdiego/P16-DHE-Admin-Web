<?php

namespace App\Domain\Pickup\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PickupBatchItemEvidence extends Model
{
    protected $table = 'pickup_batch_item_evidence';

    protected $fillable = [
        'pickup_batch_item_id',
        'evidence_type',
        'original_path',
        'sealed_path',
        'sha256',
        'mime_type',
        'file_size',
        'width',
        'height',
        'source',
        'lat',
        'lng',
        'captured_at',
        'received_at',
        'created_by',
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

    public function item(): BelongsTo
    {
        return $this->belongsTo(PickupBatchItem::class, 'pickup_batch_item_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
