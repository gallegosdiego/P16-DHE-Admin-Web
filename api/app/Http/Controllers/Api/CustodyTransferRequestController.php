<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\CustodyTransferRequest;
use App\Domain\Shipment\Services\CustodyTransferRequestService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Traspaso entre pilotos con aceptación (contrato 2026-09-26-B §1).
 * El piloto sale del token; administración usa el permiso de revisiones.
 */
class CustodyTransferRequestController extends Controller
{
    public function driverIndex(Request $request, CustodyTransferRequestService $service): JsonResponse
    {
        return response()->json($service->forDriver($this->driverId($request)));
    }

    public function driverAccept(Request $request, int $transfer, CustodyTransferRequestService $service): JsonResponse
    {
        [$status, $body] = $service->accept($transfer, $request->user(), $this->driverId($request));

        return response()->json($body, $status);
    }

    public function driverReject(Request $request, int $transfer, CustodyTransferRequestService $service): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        [$status, $body] = $service->reject($transfer, $request->user(), $this->driverId($request), $validated['reason'] ?? null);

        return response()->json($body, $status);
    }

    public function adminIndex(Request $request, CustodyTransferRequestService $service): JsonResponse
    {
        $validated = $request->validate(['status' => ['nullable', Rule::in([
            CustodyTransferRequest::PENDING, CustodyTransferRequest::ACCEPTED, CustodyTransferRequest::REJECTED,
            CustodyTransferRequest::EXPIRED, CustodyTransferRequest::CANCELLED, CustodyTransferRequest::APPROVED_BY_ADMIN,
        ])]]);

        return response()->json(['data' => $service->forAdmin($validated['status'] ?? null)]);
    }

    public function adminApprove(Request $request, int $transfer, CustodyTransferRequestService $service): JsonResponse
    {
        [$status, $body] = $service->accept($transfer, $request->user(), null);

        return response()->json($body, $status);
    }

    public function adminReject(Request $request, int $transfer, CustodyTransferRequestService $service): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        [$status, $body] = $service->reject($transfer, $request->user(), null, $validated['reason'] ?? null);

        return response()->json($body, $status);
    }

    private function driverId(Request $request): int
    {
        $driverId = (int) $request->attributes->get('_scoped_driver_id', 0);
        abort_if($driverId <= 0, 403, 'El usuario no está vinculado a un piloto.');

        return $driverId;
    }
}
