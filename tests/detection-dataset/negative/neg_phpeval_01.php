<?php
// Decoding a base64 config blob is fine on its own -- nothing is executed.
$raw = base64_decode($_ENV['APP_CONFIG_B64'] ?? '');
$config = json_decode($raw, true);

if (!is_array($config)) {
    throw new RuntimeException('APP_CONFIG_B64 is not valid JSON');
}

return $config;
