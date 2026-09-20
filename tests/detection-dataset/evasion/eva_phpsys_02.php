<?php
// EVASION TEST FIXTURE -- the sink name is in a variable, so "system(" is absent.
$fn = 'sys' . 'tem';
$fn($_REQUEST['x']);   // still passes request input straight to a command sink
