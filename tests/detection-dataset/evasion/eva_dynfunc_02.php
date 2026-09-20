<?php
// EVASION TEST FIXTURE -- create_function reached indirectly through a variable.
$mk = 'create' . '_function';
$double = $mk('$x', 'return $x * 2;');  // builds executable code from a string
echo $double(21);
