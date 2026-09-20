<?php
// DETECTION TEST FIXTURE -- sorting callback assembled at runtime.
$comparator = Create_Function('$a, $b', 'return strcmp($a["name"], $b["name"]);');

usort($rows, $comparator);
