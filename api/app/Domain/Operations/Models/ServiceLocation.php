<?php

namespace App\Domain\Operations\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceLocation extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'code', 'name', 'location_type', 'address_line1', 'address_complement',
        'zone', 'city', 'lat', 'lng', 'timezone', 'opening_hours_json',
        'capabilities_json', 'contact_name', 'contact_phone', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'opening_hours_json' => 'array',
            'capabilities_json' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(OperationalTask::class);
    }
}
