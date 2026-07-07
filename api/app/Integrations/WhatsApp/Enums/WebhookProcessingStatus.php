<?php

namespace App\Integrations\WhatsApp\Enums;

enum WebhookProcessingStatus: string
{
    case RECEIVED = 'RECEIVED';
    case DEDUPED = 'DEDUPED';
    case QUEUED = 'QUEUED';
    case PROCESSED = 'PROCESSED';
    case FAILED = 'FAILED';
    case IGNORED = 'IGNORED';
}
