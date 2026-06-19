<?php
header('Content-Type: application/json');
echo json_encode([
    'dir' => __DIR__,
    'file' => __FILE__,
    'cwd' => getcwd(),
    'routes_file_exists' => file_exists(__DIR__.'/../routes/api.php'),
    'routes_file_mtime' => file_exists(__DIR__.'/../routes/api.php') ? date('Y-m-d H:i:s', filemtime(__DIR__.'/../routes/api.php')) : null,
    'routes_file_size' => file_exists(__DIR__.'/../routes/api.php') ? filesize(__DIR__.'/../routes/api.php') : null,
], JSON_PRETTY_PRINT);
