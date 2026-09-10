<?php

namespace App\Domain\Shipment\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class CustodyReview extends Model
{
    protected $fillable = ['shipment_id', 'type', 'previous_driver_id', 'new_driver_id', 'custody_event_id', 'status', 'occurred_at', 'acknowledged_by_user_id', 'acknowledged_at', 'metadata'];

    protected $casts = ['occurred_at' => 'datetime', 'acknowledged_at' => 'datetime', 'metadata' => 'array'];

    public function shipment()
    {
        return $this->belongsTo(Shipment::class);
    }

    public function acknowledgedBy()
    {
        return $this->belongsTo(User::class, 'acknowledged_by_user_id');
    }
}
