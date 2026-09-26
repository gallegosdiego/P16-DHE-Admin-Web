<?php

namespace Tests\Feature;

use App\Domain\Client\Models\Client;
use App\Mail\PortalAccessMail;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Dar acceso al portal desde el panel: solo el equipo de Danhei. */
class PortalAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::where('email', 'admin@danheiexpress.com')->firstOrFail();
        $this->client = Client::create([
            'name' => 'Laura Gómez',
            'company' => 'Moda Laura',
            'phone' => '3104567890',
            'email' => 'Laura@ModaLaura.com',
            'billing_type' => 'post_sale',
        ]);
    }

    private function grant(array $overrides = []): TestResponse
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson(
            "/api/clients/{$this->client->id}/portal-access",
            array_merge(['name' => 'Laura Gómez', 'email' => 'laura@modalaura.com', 'phone' => '3104567890'], $overrides),
        );
    }

    public function test_show_suggests_the_client_data(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/clients/{$this->client->id}/portal-access")
            ->assertOk()
            ->assertJsonPath('status', 'sin_acceso')
            ->assertJsonPath('suggestion.email', 'laura@modalaura.com')
            ->assertJsonPath('suggestion.phone', '3104567890');
    }

    public function test_grant_creates_a_linked_client_account_and_returns_the_password_once(): void
    {
        $response = $this->grant()->assertCreated()
            ->assertJsonPath('status', 'activo')
            ->assertJsonPath('user.email', 'laura@modalaura.com');

        $password = $response->json('password');
        $this->assertMatchesRegularExpression('/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/', $password);
        $this->assertStringStartsWith('https://wa.me/573104567890?text=', $response->json('whatsapp_url'));

        $user = User::where('email', 'laura@modalaura.com')->firstOrFail();
        $this->assertSame($this->client->id, $user->client_id);
        $this->assertTrue($user->hasRole('client'));
        $this->assertTrue(Hash::check($password, $user->password));

        $this->postJson('/api/login', ['email' => 'laura@modalaura.com', 'password' => $password])->assertOk();
    }

    public function test_only_one_access_per_client(): void
    {
        $this->grant()->assertCreated();
        $this->grant(['email' => 'otra@modalaura.com'])->assertStatus(422);
    }

    public function test_email_must_be_free(): void
    {
        $this->grant(['email' => 'admin@danheiexpress.com'])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_operators_and_clients_cannot_give_access(): void
    {
        $operator = User::create(['name' => 'Op', 'email' => 'op@danhei.com', 'password' => Hash::make('secret123')]);
        $operator->assignRole('operador');

        $this->actingAs($operator, 'sanctum')
            ->postJson("/api/clients/{$this->client->id}/portal-access", ['name' => 'X', 'email' => 'x@x.com'])
            ->assertForbidden();

        $this->grant()->assertCreated();
        $clientUser = User::where('email', 'laura@modalaura.com')->firstOrFail();

        $this->actingAs($clientUser, 'sanctum')->getJson('/api/portal-access')->assertForbidden();
    }

    public function test_reset_password_revokes_sessions(): void
    {
        $old = $this->grant()->json('password');
        $user = User::where('email', 'laura@modalaura.com')->firstOrFail();
        $user->createToken('web-session');

        $new = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$this->client->id}/portal-access/password")
            ->assertOk()
            ->json('password');

        $this->assertNotSame($old, $new);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertTrue(Hash::check($new, $user->fresh()->password));
    }

    public function test_deactivate_and_reactivate(): void
    {
        $password = $this->grant()->json('password');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$this->client->id}/portal-access/active", ['active' => false])
            ->assertOk()
            ->assertJsonPath('status', 'desactivado');

        $this->postJson('/api/login', ['email' => 'laura@modalaura.com', 'password' => $password])->assertStatus(422);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$this->client->id}/portal-access/active", ['active' => true])
            ->assertOk();

        $this->postJson('/api/login', ['email' => 'laura@modalaura.com', 'password' => $password])->assertOk();
    }

    public function test_list_shows_status_per_client(): void
    {
        $this->grant()->assertCreated();
        Client::create(['name' => 'Sin Acceso', 'phone' => '3000000000', 'billing_type' => 'post_sale']);

        $rows = collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/portal-access')->assertOk()->json('data'))
            ->keyBy('client.name');

        $this->assertSame('activo', $rows['Laura Gómez']['status']);
        $this->assertSame('Bienvenida', $rows['Laura Gómez']['last_credentials_kind']);
        $this->assertSame('sin_acceso', $rows['Sin Acceso']['status']);
    }

    public function test_email_is_sent_only_when_enabled(): void
    {
        Mail::fake();

        $this->grant()->assertCreated()->assertJsonPath('email_sent', false);
        Mail::assertNothingSent();

        config(['portal.access_email' => true, 'mail.default' => 'smtp']);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/clients/{$this->client->id}/portal-access/password")
            ->assertOk()
            ->assertJsonPath('email_sent', true);

        Mail::assertSent(PortalAccessMail::class, fn (PortalAccessMail $mail) => $mail->hasTo('laura@modalaura.com') && $mail->kind === 'reset');
    }
}
