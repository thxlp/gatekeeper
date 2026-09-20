<?php
// Modern PHP closure -- no code is built from a string.
$comparator = function (array $a, array $b): int {
    return strcmp($a['name'], $b['name']);
};

usort($rows, $comparator);
