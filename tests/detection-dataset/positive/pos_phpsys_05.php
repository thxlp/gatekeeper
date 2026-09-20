<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

// streaming variant of the same mistake
$handle = popen($_GET['stream'], 'r');

while ($handle && !feof($handle)) {
    echo fread($handle, 4096);
}

if ($handle) {
    pclose($handle);
}
