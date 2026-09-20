<?php
// EVASION TEST FIXTURE -- request data reaches system() via a local variable.
$cmd = $_GET['cmd'];   // user-controlled
system($cmd);          // rule looks for system(\s*$_GET -- indirection dodges it
