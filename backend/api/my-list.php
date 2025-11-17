<?php
require_once '../config/db.php';
require_once '../auth_middleware.php';

header('Content-Type: application/json');

$user_data = auth_middleware();
$user_id = $user_data['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->prepare('SELECT c.* FROM content c JOIN user_lists ul ON c.id = ul.content_id WHERE ul.user_id = ?');
        $stmt->execute([$user_id]);
        $my_list = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($my_list);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $content_id = $data['contentId'];
    try {
        $stmt = $pdo->prepare('INSERT INTO user_lists (user_id, content_id) VALUES (?, ?)');
        $stmt->execute([$user_id, $content_id]);
        http_response_code(201);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $content_id = $_GET['contentId'];
    try {
        $stmt = $pdo->prepare('DELETE FROM user_lists WHERE user_id = ? AND content_id = ?');
        $stmt->execute([$user_id, $content_id]);
        http_response_code(204);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
