<?php
require_once '../config/db.php';

header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$posterId = $data['posterId'];

try {
    $stmt = $pdo->prepare('SELECT * FROM poster_clicks WHERE id = ?');
    $stmt->execute([$posterId]);
    $poster = $stmt->fetch();

    if ($poster) {
        $stmt = $pdo->prepare('UPDATE poster_clicks SET click_count = click_count + 1 WHERE id = ?');
        $stmt->execute([$posterId]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO poster_clicks (id, click_count) VALUES (?, 1)');
        $stmt->execute([$posterId]);
    }
    http_response_code(200);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
