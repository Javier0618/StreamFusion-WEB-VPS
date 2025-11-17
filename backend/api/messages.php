<?php
require_once '../config/db.php';
require_once '../auth_middleware.php';

header('Content-Type: application/json');

$user_data = auth_middleware();
$user_id = $user_data['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->prepare('SELECT * FROM messages WHERE to_user = ? OR from_user = ?');
        $stmt->execute([$user_id, $user_id]);
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($messages);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $to_user = $data['to'];
    $content = $data['content'];
    try {
        $stmt = $pdo->prepare('INSERT INTO messages (from_user, to_user, content) VALUES (?, ?, ?)');
        $stmt->execute([$user_id, $to_user, $content]);
        http_response_code(201);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $message_id = $_GET['messageId'];
    try {
        $stmt = $pdo->prepare('DELETE FROM messages WHERE id = ? AND from_user = ?');
        $stmt->execute([$message_id, $user_id]);
        http_response_code(204);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
