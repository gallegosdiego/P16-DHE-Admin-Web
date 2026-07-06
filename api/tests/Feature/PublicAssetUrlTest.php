<?php

namespace Tests\Feature;

use App\Support\PublicAssetUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class PublicAssetUrlTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_rebuilds_storage_urls_with_current_request_host(): void
    {
        $request = Request::create('https://api.danheiexpress.com/api/drivers/1', 'GET');
        $this->app->instance('request', $request);

        $resolved = PublicAssetUrl::toPublicUrl('http://127.0.0.1:8000/storage/drivers/documents/licencia.jpg');

        $this->assertSame(
            'https://api.danheiexpress.com/storage/drivers/documents/licencia.jpg',
            $resolved
        );
    }

    public function test_it_converts_relative_public_paths_into_absolute_urls(): void
    {
        $request = Request::create('https://api.danheiexpress.com/api/shipments/1', 'GET');
        $this->app->instance('request', $request);

        $this->assertSame(
            'https://api.danheiexpress.com/storage/evidence/prueba.jpg',
            PublicAssetUrl::toPublicUrl('evidence/prueba.jpg')
        );

        $this->assertSame(
            'evidence/prueba.jpg',
            PublicAssetUrl::toStoredPath('/storage/evidence/prueba.jpg')
        );
    }
}
