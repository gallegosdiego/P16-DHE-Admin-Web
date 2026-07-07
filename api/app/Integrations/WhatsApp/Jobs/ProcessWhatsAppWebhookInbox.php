<?php

namespace App\Integrations\WhatsApp\Jobs;

use App\Integrations\WhatsApp\Enums\WebhookProcessingStatus;
use App\Integrations\WhatsApp\Models\WhatsAppWebhookInbox;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessWhatsAppWebhookInbox implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $inboxId,
    ) {
    }

    public function handle(): void
    {
        $inbox = WhatsAppWebhookInbox::query()->find($this->inboxId);

        if (! $inbox) {
            return;
        }

        $inbox->forceFill([
            'processing_status' => WebhookProcessingStatus::PROCESSED,
            'processed_at' => now(),
            'error_code' => null,
            'error_message' => null,
        ])->save();
    }
}
