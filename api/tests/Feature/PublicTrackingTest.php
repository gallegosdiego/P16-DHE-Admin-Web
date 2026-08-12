<?php

namespace Tests\Feature;

use App\Domain\Shipment\Models\Shipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicTrackingTest extends TestCase
{
    use RefreshDatabase;

    private function envio(array $overrides = []): Shipment
    {
        $user = User::factory()->create();

        return Shipment::create([
            'created_by' => $user->id,
            'tracking_code' => 'DHE2026081200042',
            'display_code' => '#DHE00042',
            'public_token' => str_repeat('a', 32),
            'sequence_number' => 42,
            'status' => 'delivered',
            'financial_status' => 'pending',
            'recipient_name' => 'Cliente Secreto',
            'recipient_phone' => '320 555 1234',
            'recipient_address' => 'Calle 1',
            'recipient_city' => 'Bogota',
            'shipping_cost' => 10000,
            ...$overrides,
        ]);
    }

    public function test_el_token_opaco_muestra_el_envio_sin_segundo_factor(): void
    {
        $this->envio();

        $this->getJson('/api/track?token='.str_repeat('a', 32))
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('shipment.recipient_name', 'Cliente Secreto');
    }

    public function test_el_codigo_de_guia_solo_ya_no_revela_nada(): void
    {
        $this->envio();

        // El corazon del arreglo: adivinar el consecutivo ya no basta.
        $this->getJson('/api/track?code=DHE00042')
            ->assertStatus(422);
    }

    public function test_el_codigo_con_el_segundo_factor_correcto_funciona(): void
    {
        $this->envio();

        $this->getJson('/api/track?code=DHE00042&phone=1234')
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('shipment.display_code', '#DHE00042');
    }

    public function test_el_segundo_factor_equivocado_no_distingue_de_inexistente(): void
    {
        $this->envio();

        // Teléfono incorrecto y guía inexistente deben responder igual: 404 sin
        // pistas. Si difirieran, se podría confirmar qué códigos existen.
        $conFactorMalo = $this->getJson('/api/track?code=DHE00042&phone=9999');
        $inexistente = $this->getJson('/api/track?code=DHE99999&phone=1234');

        $conFactorMalo->assertStatus(404)->assertJsonPath('found', false);
        $inexistente->assertStatus(404)->assertJsonPath('found', false);
        $this->assertSame($inexistente->json('message'), $conFactorMalo->json('message'));
    }

    public function test_un_token_inexistente_no_revela_nada(): void
    {
        $this->envio();

        $this->getJson('/api/track?token='.str_repeat('z', 32))
            ->assertStatus(404)
            ->assertJsonPath('found', false);
    }

    public function test_cada_envio_recibe_un_token_unico_al_crearse(): void
    {
        $generator = app(\App\Domain\Shipment\Services\TrackingCodeGenerator::class);

        $a = $generator->generate();
        $b = $generator->generate();

        $this->assertSame(32, strlen($a['public_token']));
        $this->assertNotSame($a['public_token'], $b['public_token']);
    }
}
