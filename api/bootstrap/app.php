<?php

use App\Domain\Operations\Exceptions\OperationalIntakeUnavailable;
use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\EnsureFeatureEnabled;
use App\Http\Middleware\EnsureOperationalIntakeReady;
use App\Http\Middleware\ScopeClient;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
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
            'permission' => CheckPermission::class,
            'scope' => ScopeClient::class,
            'feature' => EnsureFeatureEnabled::class,
            'operational-intake-ready' => EnsureOperationalIntakeReady::class,
        ]);
        $middleware->prependToPriorityList(
            SubstituteBindings::class,
            EnsureOperationalIntakeReady::class,
        );
        $middleware->prependToPriorityList(
            EnsureOperationalIntakeReady::class,
            CheckPermission::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $errorIds = new WeakMap;
        $errorIdFor = static function (Throwable $exception) use ($errorIds): string {
            if (! isset($errorIds[$exception])) {
                $errorIds[$exception] = (string) Str::uuid();
            }

            return $errorIds[$exception];
        };
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

        $exceptions->dontReport([
            OperationalIntakeUnavailable::class,
        ]);

        $exceptions->report(function (Throwable $exception) use ($errorIdFor) {
            if (! app()->bound('request')) {
                return null;
            }

            $request = request();

            if (! $request instanceof Request
                || (! $request->is('api/*') && ! $request->expectsJson())) {
                return null;
            }

            $errorId = $errorIdFor($exception);
            $userId = null;

            try {
                $userId = $request->user()?->getAuthIdentifier();
            } catch (Throwable) {
                // El registro debe conservarse aunque autenticación dependa del fallo original.
            }

            Log::error('api.unhandled_exception', [
                'error_id' => $errorId,
                'method' => $request->method(),
                'path' => $request->path(),
                'route' => $request->route()?->uri(),
                'user_id' => $userId,
                'exception_class' => $exception::class,
                'message' => $exception->getMessage(),
                'exception' => $exception,
            ]);

            // El registro estructurado anterior reemplaza al reporte genérico y
            // conserva una sola referencia por incidente.
            return false;
        });

        $exceptions->render(function (OperationalIntakeUnavailable $exception, Request $request) use ($jsonError) {
            $userId = null;

            try {
                $userId = $request->user()?->getAuthIdentifier();
            } catch (Throwable) {
                // El diagnóstico de esquema no debe fallar si la sesión no puede resolverse.
            }

            Log::warning('operational_intake.request_blocked_schema_incomplete', [
                'method' => $request->method(),
                'path' => $request->path(),
                'user_id' => $userId,
                'missing_tables' => $exception->missingTables,
                'missing_columns_count' => count($exception->missingColumns),
                'missing_columns_sample' => array_slice($exception->missingColumns, 0, 20),
            ]);

            $response = $jsonError(
                $request,
                $exception->getMessage(),
                503,
                'operational_intake_unavailable',
                [
                    'required_action' => 'database_update',
                    'missing_tables' => $exception->missingTables,
                    'missing_columns_count' => count($exception->missingColumns),
                ],
            );

            return $response?->header('Retry-After', '60');
        });

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

        $exceptions->render(function (InvalidArgumentException $exception, Request $request) use ($jsonError) {
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

        $exceptions->render(function (Throwable $exception, Request $request) use ($errorIdFor, $jsonError) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            $errorId = $errorIdFor($exception);

            $response = $jsonError(
                $request,
                config('app.debug') ? $exception->getMessage() : 'Error interno del servidor.',
                500,
                'internal_server_error',
                ['error_id' => $errorId],
            );

            return $response?->header('X-Error-ID', $errorId);
        });
    })->create();
