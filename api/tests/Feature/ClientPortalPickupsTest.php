<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Enums\PickupStatus;
use App\Domain\Pickup\Models\PickupPackage;
use App\Domain\Pickup\Models\PickupRequest;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * El cliente sigue su propia recogida: la ve, entiende en qué peldaño va,
 * y puede cancelarla mientras nadie haya salido a recogerla. Nada más y
 * nada de otro cliente.
 */
class ClientPortalPickupsTest extends TestCase
{
    use RefreshDatabase;

    private User $clientUser;

    private Client $client;

    private Client $otherClient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->client = Client::create([
            'name' => 'Cliente Recogidas',
            'phone' => '3001112233',
            'email' => 'recogidas@portal.com',
            'billing_type' => 'post_sale',
        ]);
        $this->otherClient = Client::create([
            'name' => 'Cliente Ajeno',
            'phone' => '3004445566',
            'email' => 'ajeno@portal.com',
            'billing_type' => 'post_sale',
        ]);

        $this->clientUser = User::create([
            'name' => 'Usuario Recogidas',
            'email' => 'recogidas@portal.com',
            'password' => Hash::make('secret123'),
            'client_id' => $this->client->id,
        ]);
        $this->clientUser->assignRole('client');
    }

    public function test_el_cliente_ve_sus_recogidas_con_el_peldano_en_su_lenguaje(): void
    {
        $this->pickup($this->client->id, PickupStatus::ACCEPTED);
        $this->pickup($this->otherClient->id, PickupStatus::SUBMITTED);

        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/pickups')
            ->assertOk();

        $this->assertCount(1, $response->json('data'), 'Solo debe ver las suyas.');
        $this->assertSame('aprobada', $response->json('data.0.status_label'));
    }

    public function test_pedir_datos_al_cliente_se_le_dice_con_todas_sus_letras(): void
    {
        $pickup = $this->pickup($this->client->id, PickupStatus::NEEDS_CUSTOMER_INPUT);

        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson("/api/client-portal/pickups/{$pickup->id}")
            ->assertOk();

        // Esconderlo dentro de "recibida" dejaría su recogida detenida sin
        // que el cliente sepa que la pelota está de su lado.
        $this->assertSame('necesitamos tus datos', $response->json('pickup.status_label'));
    }

    public function test_el_detalle_trae_los_paquetes_declarados_con_datos_reales(): void
    {
        $pickup = $this->pickup($this->client->id, PickupStatus::ACCEPTED);
        PickupPackage::create([
            'pickup_request_id' => $pickup->id,
            'package_index' => 1,
            'recipient_name' => 'Destinatario Uno',
            'recipient_phone' => '3007778899',
            'delivery_address_line1' => 'Calle 80 #10-20',
            'delivery_city' => 'Bogotá',
            'payment_type' => 'prepaid',
        ]);

        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson("/api/client-portal/pickups/{$pickup->id}")
            ->assertOk();

        $paquete = $response->json('pickup.packages.0');
        $this->assertSame('Destinatario Uno', $paquete['recipient_name']);
        $this->assertSame('Calle 80 #10-20', $paquete['delivery_address']);
        $this->assertArrayHasKey('reception_result', $paquete);
    }

    public function test_no_puede_ver_la_recogida_de_otro_cliente(): void
    {
        $ajena = $this->pickup($this->otherClient->id, PickupStatus::ACCEPTED);

        $this->actingAs($this->clientUser, 'sanctum')
            ->getJson("/api/client-portal/pickups/{$ajena->id}")
            ->assertForbidden();
    }

    public function test_puede_cancelar_antes_de_asignar_y_no_despues(): void
    {
        $porAsignar = $this->pickup($this->client->id, PickupStatus::SUBMITTED);
        $this->actingAs($this->clientUser, 'sanctum')
            ->postJson("/api/client-portal/pickups/{$porAsignar->id}/cancel")
            ->assertOk();

        $yaAsignada = $this->pickup($this->client->id, PickupStatus::ASSIGNED);
        $this->actingAs($this->clientUser, 'sanctum')
            ->postJson("/api/client-portal/pickups/{$yaAsignada->id}/cancel")
            ->assertStatus(422);
    }

    private function pickup(int $customerId, PickupStatus $status): PickupRequest
    {
        return PickupRequest::create([
            'pickup_code' => 'PR-'.str_pad((string) random_int(1, 999999), 6, '0', STR_PAD_LEFT),
            'customer_id' => $customerId,
            'source' => 'client_portal',
            'intake_mode' => 'pickup_at_client_location',
            'status' => $status,
            'pickup_address_line1' => 'Carrera 7 #45-12',
            'pickup_city' => 'Bogotá',
            'contact_name' => 'Contacto',
            'contact_phone' => '3001112233',
            'package_count' => 1,
            'pickup_window_code' => 'TO_CONFIRM',
            'pickup_window_label' => 'Por confirmar',
            'correlation_id' => (string) Str::uuid(),
            'submitted_at' => now(),
        ]);
    }
}
