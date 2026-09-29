<?php
// Fixed command, no user input reaches the shell.
$output = shell_exec('/usr/bin/uptime');
echo '<pre>' . htmlspecialchars($output ?? '') . '</pre>';
