<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('pickup_requests')) {
            return;
        }

        $this->makeNullableForeignKey('customer_id', 'clients');

        $nullableColumns = array_values(array_filter(
            ['contact_name', 'contact_phone'],
            fn (string $column): bool => Schema::hasColumn('pickup_requests', $column),
        ));

        if ($nullableColumns !== []) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($nullableColumns): void {
                if (in_array('contact_name', $nullableColumns, true)) {
                    $table->string('contact_name', 120)->nullable()->change();
                }
                if (in_array('contact_phone', $nullableColumns, true)) {
                    $table->string('contact_phone', 24)->nullable()->change();
                }
            });
        }

        $missingColumns = [];
        if (! Schema::hasColumn('pickup_requests', 'contact_email')) {
            $missingColumns[] = 'contact_email';
        }
        if (! Schema::hasColumn('pickup_requests', 'sender_company')) {
            $missingColumns[] = 'sender_company';
        }

        if ($missingColumns !== []) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($missingColumns): void {
                if (in_array('contact_email', $missingColumns, true)) {
                    $table->string('contact_email', 120)->nullable()->after('contact_phone');
                }
                if (in_array('sender_company', $missingColumns, true)) {
                    $table->string('sender_company', 100)->nullable()->after('contact_email');
                }
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('pickup_requests')) {
            return;
        }

        $columns = array_values(array_filter(
            ['contact_email', 'sender_company'],
            fn (string $column): bool => Schema::hasColumn('pickup_requests', $column),
        ));

        if ($columns !== []) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($columns): void {
                $table->dropColumn($columns);
            });
        }
    }

    private function makeNullableForeignKey(string $columnName, string $referencedTable): void
    {
        if (! Schema::hasColumn('pickup_requests', $columnName)) {
            return;
        }

        $foreignKey = collect(Schema::getForeignKeys('pickup_requests'))
            ->first(fn (array $key): bool => in_array($columnName, $key['columns'] ?? [], true));

        if ($foreignKey !== null) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($foreignKey): void {
                $table->dropForeign($foreignKey['name'] ?? [$foreignKey['columns'][0]]);
            });
        }

        $column = collect(Schema::getColumns('pickup_requests'))
            ->first(fn (array $definition): bool => $definition['name'] === $columnName);

        if (! ($column['nullable'] ?? false)) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($columnName): void {
                $table->unsignedBigInteger($columnName)->nullable()->change();
            });
        }

        $hasForeignKey = collect(Schema::getForeignKeys('pickup_requests'))
            ->contains(fn (array $key): bool => in_array($columnName, $key['columns'] ?? [], true));

        if (! $hasForeignKey) {
            Schema::table('pickup_requests', function (Blueprint $table) use ($columnName, $referencedTable): void {
                $table->foreign($columnName)->references('id')->on($referencedTable)->restrictOnDelete();
            });
        }
    }
};
