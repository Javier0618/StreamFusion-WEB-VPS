<?php
require_once '../config/db.php';

header('Content-Type: application/json');

try {
    $stmt = $pdo->query('SELECT * FROM home_sections ORDER BY `order`');
    $sections = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($sections);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
