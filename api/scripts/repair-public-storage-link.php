<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$publicDir = $root.'/public';
$storagePublicDir = $root.'/storage/app/public';
$publicStorageLink = $publicDir.'/storage';

echo 'repair-public-storage-link.php '.date('Y-m-d H:i:s').PHP_EOL;

ensureDirectory($publicDir);
ensureDirectory($storagePublicDir);

foreach ([
    $storagePublicDir.'/drivers',
    $storagePublicDir.'/drivers/documents',
    $storagePublicDir.'/intake',
    $storagePublicDir.'/evidence',
] as $directory) {
    ensureDirectory($directory);
}

if (is_link($publicStorageLink)) {
    echo "[ok] public/storage ya es un symlink".PHP_EOL;
    exit(0);
}

if (is_dir($publicStorageLink)) {
    $entries = array_values(array_diff(scandir($publicStorageLink) ?: [], ['.', '..']));

    if ($entries === []) {
        if (! @rmdir($publicStorageLink)) {
            echo "[warn] no se pudo eliminar public/storage vacío para recrear symlink".PHP_EOL;
        }
    } else {
        $backupPath = $publicDir.'/storage_backup_'.date('Ymd_His');
        if (@rename($publicStorageLink, $backupPath)) {
            echo "[ok] public/storage existente movido a {$backupPath}".PHP_EOL;
        } else {
            echo "[warn] public/storage existe con contenido y no se pudo mover; se conserva como está".PHP_EOL;
            exit(0);
        }
    }
}

if (file_exists($publicStorageLink) && ! is_link($publicStorageLink)) {
    echo "[warn] public/storage existe como archivo no compatible".PHP_EOL;
    exit(0);
}

if (@symlink($storagePublicDir, $publicStorageLink)) {
    echo "[ok] symlink public/storage -> storage/app/public creado".PHP_EOL;
    exit(0);
}

$sourceEscaped = escapeshellarg($storagePublicDir);
$targetEscaped = escapeshellarg($publicStorageLink);
$output = [];
$resultCode = 1;
@exec("ln -sfn {$sourceEscaped} {$targetEscaped} 2>&1", $output, $resultCode);

if ($resultCode === 0 && is_link($publicStorageLink)) {
    echo "[ok] symlink public/storage creado con ln -sfn".PHP_EOL;
    exit(0);
}

echo "[warn] no se pudo crear public/storage automáticamente".PHP_EOL;
if ($output !== []) {
    echo implode(PHP_EOL, $output).PHP_EOL;
}

exit(0);

function ensureDirectory(string $path): void
{
    if (is_dir($path)) {
        return;
    }

    if (@mkdir($path, 0775, true) || is_dir($path)) {
        echo "[ok] directorio listo: {$path}".PHP_EOL;
        return;
    }

    echo "[warn] no se pudo crear directorio: {$path}".PHP_EOL;
}
