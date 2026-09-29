<?php
// DETECTION TEST FIXTURE -- legacy dynamic callback builder.
$multiplier = create_function('$x', 'return $x * 2;');

echo $multiplier(21);
