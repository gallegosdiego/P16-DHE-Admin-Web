<?php

namespace App\Http\Middleware;

use App\Domain\Operations\Services\OperationalIntakeSchema;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureOperationalIntakeReady
{
    public function __construct(
        private readonly OperationalIntakeSchema $schema,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->schema->ensureReady();

        return $next($request);
    }
}
