<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Domain\Pickup\Models\PickupRequest;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * "Dirección o foto": el cliente puede declarar un paquete escribiendo a
 * dónde va, o mostrándonoslo. Exigir las dos cosas es justo el formulario
 * largo que el portal quiere evitar.
 */
class PickupDeclaredPhotoTest extends TestCase
{
    use RefreshDatabase;

    private User $clientUser;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->client = Client::create([
            'name' => 'Cliente Foto',
            'phone' => '3001112233',
            'email' => 'foto@portal.com',
            'billing_type' => 'post_sale',
        ]);

        $this->clientUser = User::create([
            'name' => 'Usuario Foto',
            'email' => 'foto@portal.com',
            'password' => Hash::make('secret123'),
            'client_id' => $this->client->id,
        ]);
        // El rol vive en dos guards: sin el de sanctum, los permisos de la API
        // rechazan al cliente aunque el usuario tenga el rol.
        $this->clientUser->syncRoles([
            Role::query()->where('name', 'client')->where('guard_name', 'web')->firstOrFail(),
            Role::query()->where('name', 'client')->where('guard_name', 'sanctum')->firstOrFail(),
        ]);
    }

    public function test_un_paquete_se_puede_declarar_solo_con_la_foto(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->post('/api/pickup-intakes', $this->solicitud([
                'declared_photo' => UploadedFile::fake()->image('guia.jpg'),
            ]))
            ->assertCreated();

        $pickup = PickupRequest::query()->findOrFail($response->json('data.id'));
        $paquete = $pickup->packages()->firstOrFail();

        $this->assertNotNull($paquete->declared_photo_path, 'La foto declarada debe quedar guardada.');
        $this->assertSame(64, strlen((string) $paquete->declared_photo_sha256), 'Debe quedar su huella SHA-256.');
        Storage::disk('public')->assertExists($paquete->declared_photo_path);
    }

    public function test_un_paquete_se_puede_declarar_solo_con_la_direccion(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->post('/api/pickup-intakes', $this->solicitud([
                'recipient_name' => 'Destinatario Uno',
                'recipient_phone' => '3007778899',
                'delivery_address_line1' => 'Calle 80 #10-20',
            ]))
            ->assertCreated();

        $this->assertSame(1, PickupRequest::query()->count());
    }

    public function test_sin_direccion_ni_foto_no_se_acepta(): void
    {
        $this->actingAs($this->clientUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/pickup-intakes', $this->solicitud([
                'recipient_name' => 'Destinatario Sin Nada',
                'recipient_phone' => '3007778899',
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['packages.0.delivery_address_line1']);
    }

    public function test_la_jornada_elegida_queda_con_su_etiqueta_vigente(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->post('/api/pickup-intakes', $this->solicitud([
                'declared_photo' => UploadedFile::fake()->image('guia.jpg'),
            ], ['pickup_window_code' => 'MORNING']))
            ->assertCreated();

        $pickup = PickupRequest::query()->findOrFail($response->json('data.id'));

        $this->assertSame('MORNING', $pickup->pickup_window_code);
        // La etiqueta se deriva, no se copia del cliente.
        $this->assertStringContainsString('Mañana', (string) $pickup->pickup_window_label);
    }

    public function test_el_portal_publica_las_jornadas_disponibles(): void
    {
        $response = $this->actingAs($this->clientUser, 'sanctum')
            ->getJson('/api/client-portal/pickup-windows')
            ->assertOk();

        $codigos = array_column($response->json('windows'), 'code');
        $this->assertContains('MORNING', $codigos);
        $this->assertContains('AFTERNOON', $codigos);
        // "Por confirmar" no se ofrece: es el estado por defecto, no una opción.
        $this->assertNotContains('TO_CONFIRM', $codigos);
    }

    /**
     * @param  array<string, mixed>  $paquete
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function solicitud(array $paquete, array $extra = []): array
    {
        return array_merge([
            'source' => 'client_portal',
            'intake_mode' => 'pickup_at_client_location',
            'customer_id' => $this->client->id,
            'pickup_address_line1' => 'Carrera 7 #45-12',
            'pickup_city' => 'Bogotá',
            'contact_name' => 'Contacto',
            'contact_phone' => '3001112233',
            'packages' => [$paquete],
        ], $extra);
    }
}
