<?php

namespace App\Integrations\WhatsApp\Jobs;

use App\Integrations\WhatsApp\Enums\WebhookProcessingStatus;
use App\Integrations\WhatsApp\Models\WhatsAppWebhookInbox;
use App\Integrations\WhatsApp\Services\MetaFlowMessageExtractor;
use App\Integrations\WhatsApp\Services\PickupFlowSubmissionProcessor;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ProcessWhatsAppWebhookInbox implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $inboxId,
    ) {
    }

    public function handle(
        MetaFlowMessageExtractor $extractor,
        PickupFlowSubmissionProcessor $processor,
    ): void
    {
        $inbox = WhatsAppWebhookInbox::query()->find($this->inboxId);

        if (! $inbox) {
            return;
        }

        try {
            $submissions = $extractor->extractPickupSubmissions($inbox->payload_json ?? []);

            if ($submissions === []) {
                $inbox->forceFill([
                    'processing_status' => WebhookProcessingStatus::IGNORED,
                    'processed_at' => now(),
                    'error_code' => null,
                    'error_message' => null,
                ])->save();

                return;
            }

            foreach ($submissions as $submission) {
                $processor->process($submission, $inbox->correlation_id);
            }

            $inbox->forceFill([
                'processing_status' => WebhookProcessingStatus::PROCESSED,
                'processed_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ])->save();
        } catch (Throwable $exception) {
            $inbox->forceFill([
                'processing_status' => WebhookProcessingStatus::FAILED,
                'processed_at' => now(),
                'error_code' => 'WHATSAPP_FLOW_PROCESSING_FAILED',
                'error_message' => $exception->getMessage(),
            ])->save();

            throw $exception;
        }
    }
}
