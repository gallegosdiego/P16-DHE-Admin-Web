<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shared\Models\Notification;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Listar notificaciones del usuario autenticado.
     *
     * GET /api/notifications?unread=1&per_page=20
     */
    public function index(Request $request): JsonResponse
    {
        $query = Notification::forUser($request->user()->id)
            ->latest();

        if ($request->boolean('unread', false)) {
            $query->unread();
        }

        $notifications = $query->paginate($request->query('per_page', 20));

        return response()->json($notifications);
    }

    /**
     * Contador de no leídas (para badge en navbar).
     *
     * GET /api/notifications/unread-count
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $count = Notification::forUser($request->user()->id)
            ->unread()
            ->count();

        return response()->json(['count' => $count]);
    }

    /**
     * Marcar una notificación como leída.
     *
     * POST /api/notifications/{notification}/read
     */
    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        // Verificar que pertenece al usuario autenticado
        if ((int) $notification->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'No autorizado'], 403);
        }

        $notification->markAsRead();

        return response()->json(['message' => 'Marcada como leída']);
    }

    /**
     * Marcar TODAS como leídas.
     *
     * POST /api/notifications/read-all
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $updated = Notification::forUser($request->user()->id)
            ->unread()
            ->update(['read_at' => now()]);

        return response()->json([
            'message' => "$updated notificaciones marcadas como leídas",
            'updated' => $updated,
        ]);
    }
}
