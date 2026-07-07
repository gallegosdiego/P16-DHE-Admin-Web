<?php

namespace App\Integrations\WhatsApp\Enums;

enum WhatsAppFlowSubmissionStatus: string
{
    case RECEIVED = 'RECEIVED';
    case VALIDATED = 'VALIDATED';
    case PROCESSED = 'PROCESSED';
    case FAILED = 'FAILED';
    case DUPLICATE = 'DUPLICATE';
}
