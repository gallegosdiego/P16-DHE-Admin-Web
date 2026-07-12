<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'permission' => \App\Http\Middleware\CheckPermission::class,
            'scope' => \App\Http\Middleware\ScopeClient::class,
            'feature' => \App\Http\Middleware\EnsureFeatureEnabled::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $jsonError = static function (
            Request $request,
            string $message,
            int $status,
            string $code,
            array $extra = []
        ) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'message' => $message,
                'code' => $code,
                'retryable' => in_array($status, [408, 429, 502, 503, 504], true),
                ...$extra,
            ], $status);
        };

        $exceptions->render(function (ValidationException $exception, Request $request) use ($jsonError) {
            $errors = $exception->errors();
            $firstField = array_key_first($errors);
            $firstMessage = $firstField ? ($errors[$firstField][0] ?? null) : null;

            return $jsonError(
                $request,
                $firstMessage ?: 'Error de validación.',
                422,
                'validation_error',
                ['errors' => $errors]
            );
        });

        $exceptions->render(function (AuthenticationException $exception, Request $request) use ($jsonError) {
            return $jsonError($request, 'Sesión expirada. Vuelve a iniciar sesión.', 401, 'auth_expired');
        });

        $exceptions->render(function (AuthorizationException $exception, Request $request) use ($jsonError) {
            return $jsonError($request, 'No autorizado para realizar esta acción.', 403, 'forbidden');
        });

        $exceptions->render(function (AccessDeniedHttpException $exception, Request $request) use ($jsonError) {
            return $jsonError(
                $request,
                $exception->getMessage() ?: 'No autorizado para realizar esta acción.',
                403,
                'forbidden'
            );
        });

        $exceptions->render(function (\InvalidArgumentException $exception, Request $request) use ($jsonError) {
            $message = $exception->getMessage() ?: 'Operación inválida.';
            $code = str_contains(mb_strtolower($message), 'transición no permitida')
                ? 'invalid_transition'
                : 'invalid_operation';

            return $jsonError($request, $message, 422, $code);
        });

        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $exception, Request $request) use ($jsonError) {
            return $jsonError($request, 'Recurso no encontrado.', 404, 'not_found');
        });

        $exceptions->render(function (MethodNotAllowedHttpException $exception, Request $request) use ($jsonError) {
            return $jsonError($request, 'Método HTTP no permitido para este recurso.', 405, 'method_not_allowed');
        });

        $exceptions->render(function (HttpExceptionInterface $exception, Request $request) use ($jsonError) {
            $status = $exception->getStatusCode();
            $message = $exception->getMessage() ?: match ($status) {
                400 => 'Solicitud inválida.',
                401 => 'Sesión expirada. Vuelve a iniciar sesión.',
                403 => 'No autorizado para realizar esta acción.',
                404 => 'Recurso no encontrado.',
                405 => 'Método HTTP no permitido para este recurso.',
                409 => 'La solicitud no pudo completarse por un conflicto de estado.',
                422 => 'La solicitud no pudo procesarse.',
                default => 'Error interno del servidor.',
            };
            $code = match ($status) {
                400 => 'bad_request',
                401 => 'auth_expired',
                403 => 'forbidden',
                404 => 'not_found',
                405 => 'method_not_allowed',
                409 => 'conflict',
                422 => 'unprocessable_entity',
                default => 'http_error',
            };

            return $jsonError($request, $message, $status, $code);
        });

        $exceptions->render(function (\Throwable $exception, Request $request) use ($jsonError) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return $jsonError(
                $request,
                config('app.debug') ? $exception->getMessage() : 'Error interno del servidor.',
                500,
                'internal_server_error'
            );
        });
    })->create();
