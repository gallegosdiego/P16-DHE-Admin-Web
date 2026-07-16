<?php

namespace App\Domain\Financial\Services;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\FinancialRateRule;
use App\Domain\Shared\Models\Zone;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

class FinancialRateResolver
{
    /**
     * @return array{amount: int, source: string, rule: FinancialRateRule|null, snapshot: array<string, mixed>}
     */
    public function resolve(
        string $serviceType,
        CarbonInterface|string $serviceDate,
        ?Driver $driver = null,
        ?Client $client = null,
        ?string $zoneName = null,
        int $fallbackAmount = 0,
    ): array {
        $date = $serviceDate instanceof CarbonInterface
            ? $serviceDate->toDateString()
            : (string) $serviceDate;
        $zoneId = $this->resolveZoneId($zoneName);

        $rules = FinancialRateRule::query()
            ->with(['driver:id,name', 'client:id,name,company', 'zone:id,name'])
            ->where('service_type', $serviceType)
            ->where('is_active', true)
            ->whereDate('effective_from', '<=', $date)
            ->where(function ($query) use ($date) {
                $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date);
            })
            ->where(function ($query) use ($driver, $client, $zoneId) {
                $query->where('scope_type', 'global');
                if ($driver !== null) {
                    $query->orWhere(fn ($scope) => $scope->where('scope_type', 'driver')->where('driver_id', $driver->id));
                }
                if ($client !== null) {
                    $query->orWhere(fn ($scope) => $scope->where('scope_type', 'client')->where('client_id', $client->id));
                }
                if ($zoneId !== null) {
                    $query->orWhere(fn ($scope) => $scope->where('scope_type', 'zone')->where('zone_id', $zoneId));
                }
            })
            ->get()
            ->sort(function (FinancialRateRule $left, FinancialRateRule $right): int {
                return [
                    $this->specificity($right),
                    $right->priority,
                    $right->effective_from?->timestamp ?? 0,
                    $right->version,
                    $right->id,
                ] <=> [
                    $this->specificity($left),
                    $left->priority,
                    $left->effective_from?->timestamp ?? 0,
                    $left->version,
                    $left->id,
                ];
            });

        /** @var FinancialRateRule|null $rule */
        $rule = $rules->first();
        $amount = $rule?->amount ?? max(0, $fallbackAmount);
        $source = $rule !== null ? 'financial_rate_rule' : 'legacy_fallback';

        return [
            'amount' => (int) $amount,
            'source' => $source,
            'rule' => $rule,
            'snapshot' => [
                'source' => $source,
                'service_type' => $serviceType,
                'service_date' => $date,
                'amount' => (int) $amount,
                'rule_id' => $rule?->id,
                'rule_key' => $rule?->rule_key,
                'rule_version' => $rule?->version,
                'rule_name' => $rule?->name,
                'scope_type' => $rule?->scope_type,
                'driver_id' => $driver?->id,
                'client_id' => $client?->id,
                'zone_id' => $zoneId,
                'zone_name' => $zoneName,
            ],
        ];
    }

    private function resolveZoneId(?string $zoneName): ?int
    {
        $zoneName = trim((string) $zoneName);
        if ($zoneName === '') {
            return null;
        }

        return Zone::query()
            ->where('name', $zoneName)
            ->orWhere('slug', Str::slug($zoneName))
            ->value('id');
    }

    private function specificity(FinancialRateRule $rule): int
    {
        return match ($rule->scope_type) {
            'driver' => 4,
            'client' => 3,
            'zone' => 2,
            default => 1,
        };
    }
}
