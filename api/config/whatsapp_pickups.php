<?php

return [
    'inbound_enabled' => env('WHATSAPP_INBOUND_ENABLED', false),
    'admin_ui_enabled' => env('WHATSAPP_ADMIN_UI_ENABLED', false),
    'required_permission' => env('WHATSAPP_PICKUP_REQUIRED_PERMISSION', 'CREATE_PICKUP'),
    'default_pickup_city' => env('WHATSAPP_PICKUP_DEFAULT_CITY', 'Bogota'),
    'outbound_enabled' => env('WHATSAPP_OUTBOUND_ENABLED', false),
    'supported_pickup_cities' => [
        'bogota',
        'bogotá',
        'soacha',
        'mosquera',
        'funza',
        'madrid',
        'cota',
        'chia',
        'cajica',
        'zipaquira',
    ],
];
