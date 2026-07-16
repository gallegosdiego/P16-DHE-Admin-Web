<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\ClientCodPayout;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\DriverCodRemittance;
use App\Domain\Financial\Models\DriverServiceEarning;
use App\Domain\Financial\Models\DriverServicePayment;
use App\Domain\Financial\Models\FinancialOpeningEntry;
use App\Domain\Financial\Models\PaymentIntent;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shared\Services\IdempotencyService;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReconciliationLedgerController extends Controller
{
    public function driverSummary(Request $request, Driver $driver): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $obligations = DriverCodObligation::query()
            ->with(['shipment:id,display_code,cod_amount', 'openingEntry:id,reference,support_reference'])
            ->where('driver_id', $driver->id);
        $earnings = DriverServiceEarning::query()
            ->with([
                'shipment:id,display_code',
                'operationalTask:id,task_code,task_type',
                'openingEntry:id,reference,support_reference',
                'rateRule:id,rule_key,version,name,scope_type',
            ])
            ->where('driver_id', $driver->id);
        $remittances = DriverCodRemittance::query()
            ->with([
                'receivedBy:id,name',
                'approvedBy:id,name',
                'reversalOf:id,reference',
                'reversal:id,reference,reversal_of_id',
                'allocations.obligation.shipment:id,display_code',
                'allocations.obligation.openingEntry:id,reference',
            ])
            ->where('driver_id', $driver->id);
        $servicePayments = DriverServicePayment::query()
            ->with([
                'paidBy:id,name',
                'approvedBy:id,name',
                'reversalOf:id,reference',
                'reversal:id,reference,reversal_of_id',
                'allocations.earning.shipment:id,display_code',
                'allocations.earning.openingEntry:id,reference',
            ])
            ->where('driver_id', $driver->id);

        foreach (['from' => '>=', 'to' => '<='] as $field => $operator) {
            if (! empty($filters[$field])) {
                $obligations->whereDate('collection_date', $operator, $filters[$field]);
                $earnings->whereDate('earned_date', $operator, $filters[$field]);
                $remittances->whereDate('received_at', $operator, $filters[$field]);
                $servicePayments->whereDate('paid_at', $operator, $filters[$field]);
            }
        }
        $obligationRows = $obligations->orderBy('collection_date')->get();
        $earningRows = $earnings->orderBy('earned_date')->get();

        return response()->json([
            'driver' => $driver->only(['id', 'name', 'phone']),
            'cod' => ['collected' => $obligationRows->sum('collected_amount'), 'remitted' => $obligationRows->sum('remitted_amount'), 'pending' => $obligationRows->sum(fn ($row) => $row->outstanding()), 'lines' => $obligationRows],
            'services' => ['earned' => $earningRows->sum('amount'), 'paid' => $earningRows->sum('paid_amount'), 'pending' => $earningRows->sum(fn ($row) => $row->outstanding()), 'lines' => $earningRows],
            'remittances' => $remittances->latest('received_at')->limit(50)->get(),
            'service_payments' => $servicePayments->latest('paid_at')->limit(50)->get(),
            'rule' => 'Los saldos COD y de servicios son cuentas independientes; no se compensan automáticamente.',
        ]);
    }

    public function myDriverSummary(Request $request): JsonResponse
    {
        $driver = Driver::query()->where('user_id', $request->user()->id)->firstOrFail();

        return $this->driverSummary($request, $driver);
    }

    public function remitCod(Request $request, Driver $driver, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        $idempotencyKey = $this->idempotencyKey($request);

        try {
            $remittance = $idempotency->runForModel(
                'user:'.$request->user()->getAuthIdentifier(),
                $idempotencyKey,
                'financial.driver_cod_remittance:'.$driver->id,
                array_merge($data, ['driver_id' => $driver->id]),
                fn () => $ledger->recordCodRemittance($driver, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []),
            );
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json($remittance->fresh([
            'approvedBy:id,name',
            'allocations.obligation.shipment',
            'allocations.obligation.openingEntry:id,reference',
        ]), 201);
    }

    public function payDriver(Request $request, Driver $driver, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        $idempotencyKey = $this->idempotencyKey($request);

        try {
            $payment = $idempotency->runForModel(
                'user:'.$request->user()->getAuthIdentifier(),
                $idempotencyKey,
                'financial.driver_service_payment:'.$driver->id,
                array_merge($data, ['driver_id' => $driver->id]),
                fn () => $ledger->recordServicePayment($driver, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []),
            );
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json($payment->fresh([
            'approvedBy:id,name',
            'allocations.earning.shipment',
            'allocations.earning.openingEntry:id,reference',
        ]), 201);
    }

    public function clientLedger(Request $request, Client $client): JsonResponse
    {
        $rows = ClientCodEntitlement::query()
            ->with(['shipment:id,display_code,cod_amount', 'openingEntry:id,reference,support_reference'])
            ->where('client_id', $client->id)
            ->orderByDesc('created_at')
            ->get();
        $payouts = ClientCodPayout::query()
            ->with([
                'paidBy:id,name',
                'approvedBy:id,name',
                'reversalOf:id,reference',
                'reversal:id,reference,reversal_of_id',
                'allocations.entitlement.shipment:id,display_code',
                'allocations.entitlement.openingEntry:id,reference',
            ])
            ->where('client_id', $client->id)
            ->latest('paid_at')
            ->limit(50)
            ->get();

        return response()->json([
            'client' => $client->only(['id', 'name', 'company']),
            'reported' => $rows->sum('reported_amount'),
            'available' => $rows->sum('available_amount'),
            'transferred' => $rows->sum('transferred_amount'),
            'pending_transfer' => $rows->sum(fn ($row) => $row->outstanding()),
            'lines' => $rows,
            'payouts' => $payouts,
        ]);
    }

    public function payClient(Request $request, Client $client, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        $idempotencyKey = $this->idempotencyKey($request);

        try {
            $payout = $idempotency->runForModel(
                'user:'.$request->user()->getAuthIdentifier(),
                $idempotencyKey,
                'financial.client_cod_payout:'.$client->id,
                array_merge($data, ['client_id' => $client->id]),
                fn () => $ledger->recordClientPayout($client, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []),
            );
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json($payout->fresh([
            'approvedBy:id,name',
            'allocations.entitlement.shipment',
            'allocations.entitlement.openingEntry:id,reference',
        ]), 201);
    }

    public function reverseRemittance(Request $request, DriverCodRemittance $remittance, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->reversalRules());
        $reversal = $this->runReversal(
            $request,
            $idempotency,
            'financial.driver_cod_remittance_reversal:'.$remittance->id,
            array_merge($data, ['remittance_id' => $remittance->id]),
            fn () => $ledger->reverseCodRemittance($remittance, $request->user(), $data['reason']),
        );

        return response()->json($reversal, 201);
    }

    public function reverseServicePayment(Request $request, DriverServicePayment $payment, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->reversalRules());
        $reversal = $this->runReversal(
            $request,
            $idempotency,
            'financial.driver_service_payment_reversal:'.$payment->id,
            array_merge($data, ['payment_id' => $payment->id]),
            fn () => $ledger->reverseServicePayment($payment, $request->user(), $data['reason']),
        );

        return response()->json($reversal, 201);
    }

    public function reverseClientPayout(Request $request, ClientCodPayout $clientCodPayout, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate($this->reversalRules());
        $reversal = $this->runReversal(
            $request,
            $idempotency,
            'financial.client_cod_payout_reversal:'.$clientCodPayout->id,
            array_merge($data, ['payout_id' => $clientCodPayout->id]),
            fn () => $ledger->reverseClientPayout($clientCodPayout, $request->user(), $data['reason']),
        );

        return response()->json($reversal, 201);
    }

    public function openingEntries(): JsonResponse
    {
        return response()->json([
            'data' => FinancialOpeningEntry::query()
                ->with(['driver:id,name', 'client:id,name,company', 'createdBy:id,name', 'approvedBy:id,name'])
                ->latest('effective_date')
                ->latest('id')
                ->limit(100)
                ->get(),
        ]);
    }

    public function createOpeningEntry(Request $request, ReconciliationLedgerService $ledger, IdempotencyService $idempotency): JsonResponse
    {
        $data = $request->validate([
            'account_type' => ['required', 'in:driver_cod_due,driver_service_payable,client_cod_available'],
            'driver_id' => ['nullable', 'integer', 'exists:drivers,id', 'required_if:account_type,driver_cod_due,driver_service_payable'],
            'client_id' => ['nullable', 'integer', 'exists:clients,id', 'required_if:account_type,client_cod_available'],
            'amount' => ['required', 'integer', 'min:1'],
            'effective_date' => ['required', 'date'],
            'support_reference' => ['required', 'string', 'min:3', 'max:191'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $idempotencyKey = $this->idempotencyKey($request);

        try {
            $entry = $idempotency->runForModel(
                'user:'.$request->user()->getAuthIdentifier(),
                $idempotencyKey,
                'financial.opening_entry',
                $data,
                fn () => $ledger->recordOpeningEntry($data['account_type'], (int) $data['amount'], $request->user(), $data),
            );
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json($entry, 201);
    }

    public function createPaymentIntent(Request $request): JsonResponse
    {
        $data = $request->validate(['shipment_id' => ['required', 'exists:shipments,id'], 'provider' => ['nullable', 'in:nequi'], 'expires_in_minutes' => ['nullable', 'integer', 'min:1', 'max:60']]);
        $shipment = Shipment::findOrFail($data['shipment_id']);
        abort_unless($shipment->payment_type->value === 'cash_on_delivery' && (int) $shipment->cod_amount > 0, 422, 'La guía no tiene un COD cobrable.');
        $expiresAt = now()->addMinutes((int) ($data['expires_in_minutes'] ?? 15));
        $publicId = (string) Str::uuid();
        $intent = PaymentIntent::create([
            'public_id' => $publicId,
            'shipment_id' => $shipment->id,
            'client_id' => $shipment->client_id,
            'amount' => (int) $shipment->cod_amount,
            'provider' => $data['provider'] ?? 'nequi',
            'status' => 'pending',
            'expires_at' => $expiresAt,
            'qr_payload' => "DANHEI|PAY|{$publicId}|{$shipment->cod_amount}|{$expiresAt->timestamp}",
        ]);

        return response()->json($intent, 201);
    }

    public function showPaymentIntent(PaymentIntent $paymentIntent): JsonResponse
    {
        if ($paymentIntent->status === 'pending' && $paymentIntent->expires_at?->isPast()) {
            $paymentIntent->update(['status' => 'expired']);
        }

        return response()->json($paymentIntent->fresh());
    }

    public function simulatePaymentVerification(Request $request, PaymentIntent $paymentIntent, ReconciliationLedgerService $ledger): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing') || (bool) config('services.payment_intents.simulator_enabled'), 403, 'El simulador solo está habilitado en pruebas.');
        abort_if($paymentIntent->status !== 'pending', 422, 'La intención ya no está pendiente.');
        abort_if($paymentIntent->expires_at?->isPast(), 422, 'La intención expiró.');
        $paymentIntent->update(['status' => 'verified', 'verified_at' => now(), 'provider_reference' => 'SIM-'.Str::upper(Str::random(10))]);
        $shipment = $paymentIntent->shipment;
        if ($shipment) {
            $ledger->makeClientCodAvailable($shipment, null, (int) $paymentIntent->amount);
        }

        return response()->json($paymentIntent->fresh());
    }

    private function paymentRules(): array
    {
        return [
            'amount' => ['required', 'integer', 'min:1'],
            'method' => ['nullable', 'string', 'max:40'],
            'external_reference' => ['nullable', 'string', 'max:120'],
            'received_at' => ['nullable', 'date'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.id' => ['required_with:allocations', 'integer'],
            'allocations.*.amount' => ['required_with:allocations', 'integer', 'min:1'],
        ];
    }

    private function reversalRules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ];
    }

    private function runReversal(Request $request, IdempotencyService $idempotency, string $operation, array $payload, callable $callback): mixed
    {
        try {
            return $idempotency->runForModel(
                'user:'.$request->user()->getAuthIdentifier(),
                $this->idempotencyKey($request),
                $operation,
                $payload,
                $callback,
            );
        } catch (\InvalidArgumentException $exception) {
            abort(422, $exception->getMessage());
        }
    }

    private function idempotencyKey(Request $request): string
    {
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        if ($idempotencyKey === '' || mb_strlen($idempotencyKey) > 191) {
            throw ValidationException::withMessages([
                'idempotency_key' => 'Use una llave única de máximo 191 caracteres.',
            ]);
        }

        return $idempotencyKey;
    }
}
