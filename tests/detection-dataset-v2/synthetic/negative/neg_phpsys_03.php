<?php
// Request data is used, but only as data: it is escaped and passed as an
// argument to a fixed binary through escapeshellarg().
$host = $_GET['host'] ?? 'localhost';

if (!filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
    http_response_code(400);
    exit('bad hostname');
}

$cmd = '/bin/ping -c 1 ' . escapeshellarg($host);
$output = shell_exec($cmd);
echo '<pre>' . htmlspecialchars($output ?? '') . '</pre>';
