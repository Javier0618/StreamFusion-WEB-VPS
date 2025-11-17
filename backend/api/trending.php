<?php
require_once '../config/db.php';

header('Content-Type: application/json');

try {
    $stmt = $pdo->query('SELECT * FROM poster_clicks ORDER BY click_count DESC LIMIT 10');
    $trending = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($trending);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
