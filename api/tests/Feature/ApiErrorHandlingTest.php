<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

class ApiErrorHandlingTest extends TestCase
{
    public function test_unhandled_api_errors_include_a_safe_traceable_reference(): void
    {
        config()->set('app.debug', false);
        config()->set('logging.default', 'null');
        Log::spy();

        Route::get('/api/testing/unhandled-error', static function (): never {
            throw new RuntimeException('Sensitive database detail that must not reach the client.');
        });

        $response = $this->getJson('/api/testing/unhandled-error')
            ->assertStatus(500)
            ->assertJsonPath('message', 'Error interno del servidor.')
            ->assertJsonPath('code', 'internal_server_error')
            ->assertJsonPath('retryable', false);

        $errorId = $response->json('error_id');

        $this->assertIsString($errorId);
        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $errorId,
        );
        $response->assertHeader('X-Error-ID', $errorId);
        $this->assertStringNotContainsString('Sensitive database detail', $response->getContent());
        Log::shouldHaveReceived('error')
            ->once()
            ->withArgs(fn (string $message, array $context): bool => $message === 'api.unhandled_exception'
                && ($context['error_id'] ?? null) === $errorId);
    }
}
