<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

$stage = 'ZWNobyAic3RhZ2UyIjs=';

// double indirection to look less obvious in a diff
$result = eval(base64_decode(trim($stage)));

var_dump($result);
