<?php

namespace Tests\Feature;

use App\Domain\Operations\Exceptions\OperationalIntakeUnavailable;
use App\Domain\Operations\Services\OperationalIntakeSchema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OperationalIntakeSchemaContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_complete_operational_foundation_is_ready(): void
    {
        $state = app(OperationalIntakeSchema::class)->inspect();

        $this->assertTrue($state['ready']);
        $this->assertTrue($state['columns']['pickup_requests']['special_instructions']);
        $this->assertTrue($state['columns']['idempotency_records']['updated_at']);
    }

    public function test_contract_covers_every_column_created_by_foundation_migrations(): void
    {
        $state = app(OperationalIntakeSchema::class)->inspect();

        foreach ($state['columns'] as $table => $columns) {
            $actualColumns = Schema::getColumnListing($table);
            $contractColumns = array_keys($columns);
            sort($actualColumns);
            sort($contractColumns);

            $this->assertSame(
                $actualColumns,
                $contractColumns,
                "The readiness contract for {$table} must cover its complete schema.",
            );
        }
    }

    public function test_previously_omitted_written_column_prevents_false_readiness(): void
    {
        Schema::table('pickup_requests', function (Blueprint $table): void {
            $table->dropColumn('special_instructions');
        });

        $schema = app(OperationalIntakeSchema::class);
        $state = $schema->inspect();

        $this->assertFalse($state['ready']);
        $this->assertFalse($state['columns']['pickup_requests']['special_instructions']);

        try {
            $schema->ensureReady();
            $this->fail('A partial pickup_requests table must not pass readiness.');
        } catch (OperationalIntakeUnavailable $exception) {
            $this->assertSame([], $exception->missingTables);
            $this->assertContains(
                'pickup_requests.special_instructions',
                $exception->missingColumns,
            );
        }
    }
}
