<?php
// api/stats.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_trending':
        getTrendingContent();
        break;
    case 'update_click_count':
        updateClickCount();
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida en stats.php']);
        break;
}

function getTrendingContent() {
    global $conn;
    $sql = "SELECT c.*, pc.click_count FROM content c JOIN poster_clicks pc ON c.id = pc.content_id ORDER BY pc.click_count DESC LIMIT 10";
    $result = $conn->query($sql);
    $list = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['genres'] = json_decode($row['genres']);
            $row['display_options'] = json_decode($row['display_options']);
            $list[] = $row;
        }
    }
    echo json_encode($list);
}

function updateClickCount() {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);
    $content_id = $data['content_id'] ?? null;

    if (!$content_id) {
        echo json_encode(['success' => false, 'message' => 'ID de contenido no proporcionado.']);
        return;
    }

    $sql = "INSERT INTO poster_clicks (content_id, click_count, last_clicked) VALUES (?, 1, NOW()) ON DUPLICATE KEY UPDATE click_count = click_count + 1, last_clicked = NOW()";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $content_id);
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al actualizar el contador de clics.']);
    }
    $stmt->close();
}

$conn->close();
?>
