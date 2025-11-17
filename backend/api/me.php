<?php
require_once '../config/db.php';
require_once '../auth_middleware.php';

header('Content-Type: application/json');

$user_data = auth_middleware();

try {
    $stmt = $pdo->prepare('SELECT id, name, email, isAdmin FROM users WHERE id = ?');
    $stmt->execute([$user_data['id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode($user);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
