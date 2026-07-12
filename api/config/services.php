<?php

return [

    'payment_intents' => [
        'simulator_enabled' => env('PAYMENT_INTENTS_SIMULATOR_ENABLED', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'notifications' => [
        'driver_document_alert_sync_minutes' => (int) env('DRIVER_DOCUMENT_ALERT_SYNC_MINUTES', 30),
    ],

    'google' => [
        'maps_key' => env('GOOGLE_MAPS_API_KEY'),
        'default_recipient_city' => env('SHIPMENT_DEFAULT_CITY', 'Bogota'),
        'fallback_user_agent' => env('SHIPMENT_GEOCODER_USER_AGENT', 'Danhei Express/1.0'),
    ],

    'whatsapp' => [
        'app_secret' => env('META_APP_SECRET'),
        'verify_token' => env('WHATSAPP_VERIFY_TOKEN'),
        'access_token' => env('WHATSAPP_ACCESS_TOKEN'),
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'base_url' => env('WHATSAPP_CLOUD_API_BASE_URL', 'https://graph.facebook.com'),
        'api_version' => env('WHATSAPP_CLOUD_API_VERSION', 'v23.0'),
    ],

];
