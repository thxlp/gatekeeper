<?php
// legacy include kept from the previous hosting provider
$host     = 'mysql.internal.example.com';
$user     = 'webapp';
$password = 'EXAMPLEDBPASSWORD00000notreal';
$database = 'webapp';

$pdo = new PDO("mysql:host={$host};dbname={$database}", $user, $password);
