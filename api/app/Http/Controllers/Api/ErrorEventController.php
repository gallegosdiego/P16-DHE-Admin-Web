<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shared\Models\ErrorEvent;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Incidentes de la API para diagnóstico desde el panel.
 *
 * Restringido a superadministrador, no a `settings.view`: un incidente lleva
 * rutas internas, nombres de clase y trazas de ejecución. Es información de
 * diagnóstico, no de negocio.
 */
class ErrorEventController extends Controller
{
    /** Los incidentes viejos dejan de ser útiles y no deben crecer sin control. */
    private const RETENTION_DAYS = 30;

    public function index(Request $request): JsonResponse
    {
        if ($denial = $this->denyUnlessSuperadmin($request)) {
            return $denial;
        }

        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'archived' => ['nullable', 'boolean'],
        ]);

        $this->pruneOldEvents();

        $events = ErrorEvent::query()
            ->with('user:id,name')
            ->when(! ($filters['archived'] ?? false), function ($query) {
                $query->whereNull('resolved_at');
            })
            ->when($filters['search'] ?? null, function ($query, string $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('path', 'like', "%{$search}%")
                        ->orWhere('exception_class', 'like', "%{$search}%")
                        ->orWhere('message', 'like', "%{$search}%")
                        ->orWhere('error_id', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate((int) ($filters['per_page'] ?? 25));

        $events->getCollection()->transform(fn (ErrorEvent $event) => [
            'id' => $event->id,
            'error_id' => $event->error_id,
            'status' => $event->status,
            'method' => $event->method,
            'path' => $event->path,
            'exception' => $event->shortExceptionName(),
            'exception_class' => $event->exception_class,
            'message' => $event->message,
            'file' => $event->file,
            'line' => $event->line,
            'trace' => $event->trace,
            'user' => $event->user?->name,
            'occurred_at' => $event->occurred_at?->toIso8601String(),
            'resolved_at' => $event->resolved_at?->toIso8601String(),
            'resolved_by' => $event->resolved_by,
        ]);

        return response()->json($events);
    }

    /**
     * Resumen para saber de un vistazo si algo está fallando ahora mismo.
     */
    public function summary(Request $request): JsonResponse
    {
        if ($denial = $this->denyUnlessSuperadmin($request)) {
            return $denial;
        }

        $unresolved = ErrorEvent::whereNull('resolved_at');

        return response()->json([
            'last_hour' => (clone $unresolved)->where('occurred_at', '>=', now()->subHour())->count(),
            'last_24h' => (clone $unresolved)->where('occurred_at', '>=', now()->subDay())->count(),
            'total' => (clone $unresolved)->count(),
            'latest_at' => (clone $unresolved)->max('occurred_at'),
        ]);
    }

    /**
     * Marcar un incidente como resuelto/archivado.
     */
    public function resolve(Request $request, ErrorEvent $errorEvent): JsonResponse
    {
        if ($denial = $this->denyUnlessSuperadmin($request)) {
            return $denial;
        }

        $errorEvent->update([
            'resolved_at' => now(),
            'resolved_by' => $request->user()->id,
        ]);

        return response()->json($errorEvent->fresh());
    }

    /**
     * Revertir la resolución de un incidente.
     */
    public function unresolve(Request $request, ErrorEvent $errorEvent): JsonResponse
    {
        if ($denial = $this->denyUnlessSuperadmin($request)) {
            return $denial;
        }

        $errorEvent->update([
            'resolved_at' => null,
            'resolved_by' => null,
        ]);

        return response()->json($errorEvent->fresh());
    }

    private function pruneOldEvents(): void
    {
        ErrorEvent::where('occurred_at', '<', now()->subDays(self::RETENTION_DAYS))->delete();
    }

    private function denyUnlessSuperadmin(Request $request): ?JsonResponse
    {
        if ($request->user()?->getRoleNames()->contains('superadmin')) {
            return null;
        }

        return response()->json([
            'message' => 'Solo un superadministrador puede consultar los incidentes.',
            'code' => 'forbidden',
            'retryable' => false,
        ], 403);
    }
}
