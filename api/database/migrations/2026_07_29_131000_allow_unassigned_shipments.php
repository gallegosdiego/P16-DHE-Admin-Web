<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shipments')) {
            return;
        }

        $this->makeNullableForeignKey('shipments', 'client_id', 'clients');

        $missingColumns = [];
        if (! Schema::hasColumn('shipments', 'sender_name')) {
            $missingColumns[] = 'sender_name';
        }
        if (! Schema::hasColumn('shipments', 'sender_phone')) {
            $missingColumns[] = 'sender_phone';
        }
        if (! Schema::hasColumn('shipments', 'sender_email')) {
            $missingColumns[] = 'sender_email';
        }
        if (! Schema::hasColumn('shipments', 'sender_company')) {
            $missingColumns[] = 'sender_company';
        }

        if ($missingColumns === []) {
            return;
        }

        Schema::table('shipments', function (Blueprint $table) use ($missingColumns): void {
            if (in_array('sender_name', $missingColumns, true)) {
                $table->string('sender_name', 120)->nullable()->after('client_id');
            }
            if (in_array('sender_phone', $missingColumns, true)) {
                $table->string('sender_phone', 24)->nullable()->after('sender_name');
            }
            if (in_array('sender_email', $missingColumns, true)) {
                $table->string('sender_email', 120)->nullable()->after('sender_phone');
            }
            if (in_array('sender_company', $missingColumns, true)) {
                $table->string('sender_company', 100)->nullable()->after('sender_email');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('shipments')) {
            return;
        }

        $columns = array_values(array_filter(
            ['sender_name', 'sender_phone', 'sender_email', 'sender_company'],
            fn (string $column): bool => Schema::hasColumn('shipments', $column),
        ));

        if ($columns !== []) {
            Schema::table('shipments', function (Blueprint $table) use ($columns): void {
                $table->dropColumn($columns);
            });
        }
    }

    private function makeNullableForeignKey(string $tableName, string $columnName, string $referencedTable): void
    {
        if (! Schema::hasColumn($tableName, $columnName)) {
            return;
        }

        $foreignKey = collect(Schema::getForeignKeys($tableName))
            ->first(fn (array $key): bool => in_array($columnName, $key['columns'] ?? [], true));

        if ($foreignKey !== null) {
            Schema::table($tableName, function (Blueprint $table) use ($foreignKey): void {
                $table->dropForeign($foreignKey['name'] ?? [$foreignKey['columns'][0]]);
            });
        }

        $column = collect(Schema::getColumns($tableName))
            ->first(fn (array $definition): bool => $definition['name'] === $columnName);

        if (! ($column['nullable'] ?? false)) {
            Schema::table($tableName, function (Blueprint $table) use ($columnName): void {
                $table->unsignedBigInteger($columnName)->nullable()->change();
            });
        }

        $hasForeignKey = collect(Schema::getForeignKeys($tableName))
            ->contains(fn (array $key): bool => in_array($columnName, $key['columns'] ?? [], true));

        if (! $hasForeignKey) {
            Schema::table($tableName, function (Blueprint $table) use ($columnName, $referencedTable): void {
                $table->foreign($columnName)->references('id')->on($referencedTable)->restrictOnDelete();
            });
        }
    }
};
