<?php
// User input selects an entry from a fixed allow-list; the value from
// the request is never concatenated into a command string.
$ALLOWED = [
    'uptime' => '/usr/bin/uptime',
    'disk'   => '/bin/df -h',
];

$key = $_GET['what'] ?? '';
if (!isset($ALLOWED[$key])) {
    http_response_code(400);
    exit('unknown diagnostic');
}

$output = shell_exec($ALLOWED[$key]);
echo '<pre>' . htmlspecialchars($output ?? '') . '</pre>';
