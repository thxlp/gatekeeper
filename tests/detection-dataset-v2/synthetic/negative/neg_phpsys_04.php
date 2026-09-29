<?php
// Plain request handling -- reads parameters, writes to the database.
$title = trim($_POST['title'] ?? '');
$body  = trim($_POST['body'] ?? '');

if ($title === '') {
    http_response_code(422);
    exit('title is required');
}

$stmt = $pdo->prepare('INSERT INTO notes (title, body) VALUES (?, ?)');
$stmt->execute([$title, $body]);

header('Location: /notes');
