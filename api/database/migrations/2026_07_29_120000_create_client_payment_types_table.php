<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_payment_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->enum('payment_type', ['cash_on_delivery', 'post_sale', 'prepaid']);
            $table->timestamps();
            $table->unique(['client_id', 'payment_type']);
        });

        $now = now();
        $legacyPreferences = DB::table('clients')
            ->whereNotNull('billing_type')
            ->get(['id', 'billing_type']);

        foreach ($legacyPreferences as $client) {
            DB::table('client_payment_types')->insert([
                'client_id' => $client->id,
                'payment_type' => $client->billing_type,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('client_payment_types');
    }
};
