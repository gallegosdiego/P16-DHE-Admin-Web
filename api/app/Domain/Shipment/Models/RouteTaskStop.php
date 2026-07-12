<?php

namespace App\Domain\Shipment\Models;

use App\Domain\Operations\Models\OperationalTask;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RouteTaskStop extends Model
{
    protected $fillable = ['route_id', 'operational_task_id', 'sort_order', 'status', 'started_at', 'completed_at', 'notes'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'started_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function route(): BelongsTo { return $this->belongsTo(Route::class); }
    public function operationalTask(): BelongsTo { return $this->belongsTo(OperationalTask::class); }
}
