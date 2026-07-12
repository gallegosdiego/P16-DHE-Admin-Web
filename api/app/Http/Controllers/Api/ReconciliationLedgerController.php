<?php

namespace App\Http\Controllers\Api;

use App\Domain\Client\Models\Client;
use App\Domain\Driver\Models\Driver;
use App\Domain\Financial\Models\ClientCodEntitlement;
use App\Domain\Financial\Models\DriverCodObligation;
use App\Domain\Financial\Models\DriverServiceEarning;
use App\Domain\Financial\Models\PaymentIntent;
use App\Domain\Financial\Services\ReconciliationLedgerService;
use App\Domain\Shipment\Models\Shipment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReconciliationLedgerController extends Controller
{
    public function driverSummary(Request $request, Driver $driver): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date']]);
        $obligations = DriverCodObligation::query()->with('shipment:id,display_code,cod_amount')->where('driver_id', $driver->id);
        $earnings = DriverServiceEarning::query()->with('shipment:id,display_code')->where('driver_id', $driver->id);
        foreach (['from' => '>=', 'to' => '<='] as $field => $operator) {
            if (! empty($filters[$field])) { $obligations->whereDate('collection_date', $operator, $filters[$field]); $earnings->whereDate('earned_date', $operator, $filters[$field]); }
        }
        $obligationRows = $obligations->orderBy('collection_date')->get();
        $earningRows = $earnings->orderBy('earned_date')->get();

        return response()->json([
            'driver' => $driver->only(['id', 'name', 'phone']),
            'cod' => ['collected' => $obligationRows->sum('collected_amount'), 'remitted' => $obligationRows->sum('remitted_amount'), 'pending' => $obligationRows->sum(fn ($row) => $row->outstanding()), 'lines' => $obligationRows],
            'services' => ['earned' => $earningRows->sum('amount'), 'paid' => $earningRows->sum('paid_amount'), 'pending' => $earningRows->sum(fn ($row) => $row->outstanding()), 'lines' => $earningRows],
            'rule' => 'Los saldos COD y de servicios son cuentas independientes; no se compensan automáticamente.',
        ]);
    }

    public function myDriverSummary(Request $request): JsonResponse
    {
        $driver = Driver::query()->where('user_id', $request->user()->id)->firstOrFail();
        return $this->driverSummary($request, $driver);
    }

    public function remitCod(Request $request, Driver $driver, ReconciliationLedgerService $ledger): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        try {
            $remittance = $ledger->recordCodRemittance($driver, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []);
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
        return response()->json($remittance, 201);
    }

    public function payDriver(Request $request, Driver $driver, ReconciliationLedgerService $ledger): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        try {
            $payment = $ledger->recordServicePayment($driver, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []);
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
        return response()->json($payment, 201);
    }

    public function clientLedger(Request $request, Client $client): JsonResponse
    {
        $rows = ClientCodEntitlement::query()->with('shipment:id,display_code,cod_amount')->where('client_id', $client->id)->orderByDesc('created_at')->get();
        return response()->json([
            'client' => $client->only(['id', 'name', 'company']),
            'reported' => $rows->sum('reported_amount'),
            'available' => $rows->sum('available_amount'),
            'transferred' => $rows->sum('transferred_amount'),
            'pending_transfer' => $rows->sum(fn ($row) => $row->outstanding()),
            'lines' => $rows,
        ]);
    }

    public function payClient(Request $request, Client $client, ReconciliationLedgerService $ledger): JsonResponse
    {
        $data = $request->validate($this->paymentRules());
        try {
            $payout = $ledger->recordClientPayout($client, (int) $data['amount'], $request->user(), $data, $data['allocations'] ?? []);
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
        return response()->json($payout, 201);
    }

    public function createPaymentIntent(Request $request): JsonResponse
    {
        $data = $request->validate(['shipment_id' => ['required', 'exists:shipments,id'], 'provider' => ['nullable', 'in:nequi'], 'expires_in_minutes' => ['nullable', 'integer', 'min:1', 'max:60']]);
        $shipment = Shipment::findOrFail($data['shipment_id']);
        abort_unless($shipment->payment_type->value === 'cash_on_delivery' && (int) $shipment->cod_amount > 0, 422, 'La guía no tiene un COD cobrable.');
        $expiresAt = now()->addMinutes((int) ($data['expires_in_minutes'] ?? 15));
        $publicId = (string) Str::uuid();
        $intent = PaymentIntent::create([
            'public_id' => $publicId, 'shipment_id' => $shipment->id, 'client_id' => $shipment->client_id, 'amount' => (int) $shipment->cod_amount,
            'provider' => $data['provider'] ?? 'nequi', 'status' => 'pending', 'expires_at' => $expiresAt,
            'qr_payload' => "DANHEI|PAY|{$publicId}|{$shipment->cod_amount}|{$expiresAt->timestamp}",
        ]);
        return response()->json($intent, 201);
    }

    public function showPaymentIntent(PaymentIntent $paymentIntent): JsonResponse
    {
        if ($paymentIntent->status === 'pending' && $paymentIntent->expires_at?->isPast()) $paymentIntent->update(['status' => 'expired']);
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
            'amount' => ['required', 'integer', 'min:1'], 'method' => ['nullable', 'string', 'max:40'], 'external_reference' => ['nullable', 'string', 'max:120'],
            'received_at' => ['nullable', 'date'], 'paid_at' => ['nullable', 'date'], 'notes' => ['nullable', 'string', 'max:1000'],
            'allocations' => ['nullable', 'array'], 'allocations.*.id' => ['required_with:allocations', 'integer'], 'allocations.*.amount' => ['required_with:allocations', 'integer', 'min:1'],
        ];
    }
}
