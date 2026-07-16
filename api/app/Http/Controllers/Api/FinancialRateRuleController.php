<?php

namespace App\Http\Controllers\Api;

use App\Domain\Financial\Models\FinancialRateRule;
use App\Domain\Shared\Models\AuditLog;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class FinancialRateRuleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rules = FinancialRateRule::query()
            ->with([
                'driver:id,name',
                'client:id,name,company',
                'zone:id,name',
                'createdBy:id,name',
                'approvedBy:id,name',
            ])
            ->when($request->filled('service_type'), fn ($query) => $query->where('service_type', $request->string('service_type')))
            ->when($request->filled('active'), fn ($query) => $query->where('is_active', $request->boolean('active')))
            ->orderBy('service_type')
            ->orderBy('scope_type')
            ->orderByDesc('effective_from')
            ->orderByDesc('version')
            ->get();

        return response()->json(['data' => $rules]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->validateScope($data);

        $rule = FinancialRateRule::query()->create(array_merge(
            $this->normalizedScope($data),
            [
                'rule_key' => (string) Str::uuid(),
                'version' => 1,
                'created_by' => $request->user()->id,
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
            ],
        ));

        AuditLog::log(
            'financial.rate_rule_created',
            $rule,
            null,
            $rule->toArray(),
            "Regla financiera {$rule->name} creada y aprobada.",
        );

        return response()->json($rule->load($this->relations()), 201);
    }

    public function createVersion(Request $request, FinancialRateRule $financialRateRule): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->validateScope($data);

        $versioned = DB::transaction(function () use ($request, $financialRateRule, $data) {
            $current = FinancialRateRule::query()
                ->where('rule_key', $financialRateRule->rule_key)
                ->orderByDesc('version')
                ->lockForUpdate()
                ->firstOrFail();
            $effectiveFrom = CarbonImmutable::parse($data['effective_from']);

            if ($effectiveFrom->lt($current->effective_from)) {
                throw ValidationException::withMessages([
                    'effective_from' => 'La nueva versión no puede iniciar antes de la versión vigente.',
                ]);
            }

            $before = $current->toArray();

            if ($effectiveFrom->equalTo($current->effective_from)) {
                $current->update(['is_active' => false]);
            } else {
                $previousVersionEnd = $effectiveFrom->subDay();

                if ($current->effective_to === null || $current->effective_to->gt($previousVersionEnd)) {
                    $current->update(['effective_to' => $previousVersionEnd->toDateString()]);
                }
            }

            $newRule = FinancialRateRule::query()->create(array_merge(
                $this->normalizedScope($data),
                [
                    'rule_key' => $current->rule_key,
                    'version' => $current->version + 1,
                    'supersedes_rule_id' => $current->id,
                    'created_by' => $request->user()->id,
                    'approved_by' => $request->user()->id,
                    'approved_at' => now(),
                ],
            ));

            return ['before' => $before, 'rule' => $newRule];
        });
        /** @var FinancialRateRule $newRule */
        $newRule = $versioned['rule'];

        AuditLog::log(
            'financial.rate_rule_versioned',
            $newRule,
            $versioned['before'],
            $newRule->toArray(),
            "Nueva versión de la regla financiera {$newRule->name}.",
        );

        return response()->json($newRule->load($this->relations()), 201);
    }

    public function toggle(Request $request, FinancialRateRule $financialRateRule): JsonResponse
    {
        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
            'change_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);
        $before = $financialRateRule->toArray();
        $financialRateRule->update([
            'is_active' => $data['is_active'],
        ]);

        AuditLog::log(
            'financial.rate_rule_toggled',
            $financialRateRule,
            $before,
            $financialRateRule->fresh()->toArray(),
            $data['change_reason'],
        );

        return response()->json($financialRateRule->fresh()->load($this->relations()));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'service_type' => ['required', Rule::in(['delivery', 'pickup', 'return_to_hub', 'return_to_client'])],
            'scope_type' => ['required', Rule::in(['global', 'driver', 'client', 'zone'])],
            'driver_id' => ['nullable', 'integer', 'exists:drivers,id'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'zone_id' => ['nullable', 'integer', 'exists:zones,id'],
            'amount' => ['required', 'integer', 'min:0'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'priority' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['nullable', 'boolean'],
            'change_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ];
    }

    /** @param array<string, mixed> $data */
    private function validateScope(array $data): void
    {
        $requiredField = match ($data['scope_type']) {
            'driver' => 'driver_id',
            'client' => 'client_id',
            'zone' => 'zone_id',
            default => null,
        };

        if ($requiredField !== null && empty($data[$requiredField])) {
            throw ValidationException::withMessages([
                $requiredField => "El alcance {$data['scope_type']} requiere seleccionar su entidad.",
            ]);
        }
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalizedScope(array $data): array
    {
        $data['driver_id'] = $data['scope_type'] === 'driver' ? ($data['driver_id'] ?? null) : null;
        $data['client_id'] = $data['scope_type'] === 'client' ? ($data['client_id'] ?? null) : null;
        $data['zone_id'] = $data['scope_type'] === 'zone' ? ($data['zone_id'] ?? null) : null;
        $data['priority'] = (int) ($data['priority'] ?? 0);
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        return $data;
    }

    /** @return list<string> */
    private function relations(): array
    {
        return [
            'driver:id,name',
            'client:id,name,company',
            'zone:id,name',
            'createdBy:id,name',
            'approvedBy:id,name',
        ];
    }
}
