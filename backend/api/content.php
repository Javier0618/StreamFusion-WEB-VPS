<?php
require_once '../config/db.php';

header('Content-Type: application/json');

try {
    $stmt = $pdo->query('SELECT * FROM content');
    $content = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($content);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
