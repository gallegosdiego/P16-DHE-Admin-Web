<?php

namespace App\Integrations\WhatsApp\Services;

use Illuminate\Support\Facades\Schema;

class WhatsAppSchema
{
    /** @var array<string, list<string>> */
    private const PICKUP_CONTACT_CONTRACT = [
        'customer_whatsapp_contacts' => [
            'id',
            'customer_id',
            'whatsapp_contact_id',
            'role',
            'status',
            'authorized_at',
            'authorized_by',
            'revoked_at',
            'revoked_by',
            'created_at',
            'updated_at',
        ],
        'whatsapp_contacts' => [
            'id',
            'wa_id',
            'phone',
            'display_name',
            'verification_status',
            'last_verified_at',
            'blocked_at',
            'created_at',
            'updated_at',
        ],
    ];

    /** @var array<string, list<string>> */
    private const PICKUP_MESSAGE_CONTRACT = [
        'whatsapp_messages' => [
            'id',
            'whatsapp_contact_id',
            'customer_id',
            'direction',
            'provider_message_id',
            'message_type',
            'message_status',
            'related_entity_type',
            'related_entity_id',
            'correlation_id',
            'payload_json',
            'sent_at',
            'received_at',
            'created_at',
            'updated_at',
        ],
        'whatsapp_contacts' => self::PICKUP_CONTACT_CONTRACT['whatsapp_contacts'],
    ];

    /** @var array<string, bool> */
    private array $tableState = [];

    /** @var array<string, array<string, true>> */
    private array $columnState = [];

    public function supportsPickupContacts(): bool
    {
        return $this->hasContract(self::PICKUP_CONTACT_CONTRACT);
    }

    public function supportsPickupMessages(): bool
    {
        return $this->hasContract(self::PICKUP_MESSAGE_CONTRACT);
    }

    public function supportsPickupNotifications(): bool
    {
        return $this->supportsPickupContacts()
            && $this->supportsPickupMessages();
    }

    /**
     * @param  array<string, list<string>>  $contract
     */
    private function hasContract(array $contract): bool
    {
        foreach ($contract as $table => $requiredColumns) {
            $this->tableState[$table] ??= Schema::hasTable($table);

            if (! $this->tableState[$table]) {
                return false;
            }

            $this->columnState[$table] ??= array_fill_keys(
                Schema::getColumnListing($table),
                true,
            );

            foreach ($requiredColumns as $column) {
                if (! isset($this->columnState[$table][$column])) {
                    return false;
                }
            }
        }

        return true;
    }
}
