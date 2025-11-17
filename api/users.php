<?php
// api/users.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'No autenticado']);
    exit;
}

$action = $_GET['action'] ?? '';
$user_id = $_SESSION['user_id'];

switch ($action) {
    case 'get_my_list':
        getMyList($user_id);
        break;
    case 'add_to_my_list':
        addToMyList($user_id);
        break;
    case 'remove_from_my_list':
        removeFromMyList($user_id);
        break;
    // ... otros casos para gestionar usuarios (desde el panel de admin)
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida en users.php']);
        break;
}

function getMyList($user_id) {
    global $conn;
    $sql = "SELECT c.* FROM content c JOIN user_list ul ON c.id = ul.content_id WHERE ul.user_id = ? ORDER BY ul.last_visited DESC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $list = [];
    while ($row = $result->fetch_assoc()) {
        $row['genres'] = json_decode($row['genres']);
        $row['display_options'] = json_decode($row['display_options']);
        $list[] = $row;
    }
    echo json_encode($list);
    $stmt->close();
}

function addToMyList($user_id) {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);
    $content_id = $data['content_id'] ?? null;

    if (!$content_id) {
        echo json_encode(['success' => false, 'message' => 'ID de contenido no proporcionado.']);
        return;
    }

    // Actualizar también el contador de clics
    $click_sql = "INSERT INTO poster_clicks (content_id, click_count, last_clicked) VALUES (?, 1, NOW()) ON DUPLICATE KEY UPDATE click_count = click_count + 1, last_clicked = NOW()";
    $click_stmt = $conn->prepare($click_sql);
    $click_stmt->bind_param("i", $content_id);
    $click_stmt->execute();
    $click_stmt->close();

    $sql = "INSERT INTO user_list (user_id, content_id, last_visited) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_visited = NOW()";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ii", $user_id, $content_id);
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al añadir a la lista.']);
    }
    $stmt->close();
}

function removeFromMyList($user_id) {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);
    $content_id = $data['content_id'] ?? null;

    if (!$content_id) {
        echo json_encode(['success' => false, 'message' => 'ID de contenido no proporcionado.']);
        return;
    }

    $sql = "DELETE FROM user_list WHERE user_id = ? AND content_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ii", $user_id, $content_id);
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al eliminar de la lista.']);
    }

if ($action == 'get_all_users') {
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id, email, username, photo_url FROM users");
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'users' => $users]);
}

if ($action == 'get_user') {
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $user_id = $_GET['id'];
    $stmt = $pdo->prepare("SELECT id, email, username FROM users WHERE id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();

    if ($user) {
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'message' => 'User not found']);
    }
}

if ($action == 'update_user') {
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = $data['id'];
    $username = $data['name'];
    $email = $data['email'];

    $stmt = $pdo->prepare("UPDATE users SET username = ?, email = ? WHERE id = ?");
    $stmt->bind_param("ssi", $username, $email, $user_id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error updating user']);
    }
}

if ($action == 'delete_user') {
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = $data['id'];

    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
    $stmt->bind_param("i", $user_id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error deleting user']);
    }
}
    $stmt->close();
}


$conn->close();
?>
