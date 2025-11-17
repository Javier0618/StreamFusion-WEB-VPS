<?php
require_once 'db.php';
require_once 'config.php';
require_once 'JWT.php';

use Firebase\JWT\JWT;

$action = isset($_GET['action']) ? $_GET['action'] : '';

function get_user_from_token() {
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');
        if ($jwt) {
            try {
                $decoded = JWT::decode($jwt, JWT_SECRET, ['HS256']);
                return $decoded->data;
            } catch (Exception $e) {
                return null;
            }
        }
    }
    return null;
}

$user = get_user_from_token();
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Acceso no autorizado']);
    exit;
}

if ($action == 'get_all') {
    if (!$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No tienes permisos para realizar esta acción']);
        exit;
    }
    $conn = getDbConnection();
    $result = $conn->query("SELECT id, name, email, registered_at, last_activity, is_admin FROM users");
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $users[] = $row;
    }
    $conn->close();
    echo json_encode($users);
} elseif ($action == 'update') {
    if (!$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No tienes permisos para realizar esta acción']);
        exit;
    }
    $data = json_decode(file_get_contents('php://input'), true);
    $conn = getDbConnection();
    $stmt = $conn->prepare("UPDATE users SET name = ?, email = ? WHERE id = ?");
    $stmt->bind_param("ssi", $data['name'], $data['email'], $data['id']);
    if ($stmt->execute()) {
        echo json_encode(['success' => 'Usuario actualizado con éxito']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error al actualizar el usuario']);
    }
    $stmt->close();
    $conn->close();
} elseif ($action == 'delete') {
    if (!$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No tienes permisos para realizar esta acción']);
        exit;
    }
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id > 0) {
        $conn = getDbConnection();
        $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) {
            echo json_encode(['success' => 'Usuario eliminado con éxito']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Error al eliminar el usuario']);
        }
        $stmt->close();
        $conn->close();
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'ID de usuario inválido']);
    }
} elseif ($action == 'get_my_list') {
    $conn = getDbConnection();
    $stmt = $conn->prepare("SELECT * FROM user_list WHERE user_id = ?");
    $stmt->bind_param("i", $user->id);
    $stmt->execute();
    $result = $stmt->get_result();
    $my_list = [];
    while ($row = $result->fetch_assoc()) {
        $my_list[] = $row;
    }
    $stmt->close();
    $conn->close();
    echo json_encode($my_list);
} elseif ($action == 'add_to_my_list') {
    $data = json_decode(file_get_contents('php://input'), true);
    $conn = getDbConnection();

    // Primero, verificamos si el elemento ya está en la lista
    $stmt_check = $conn->prepare("SELECT id FROM user_list WHERE user_id = ? AND content_id = ?");
    $stmt_check->bind_param("ii", $user->id, $data['id']);
    $stmt_check->execute();
    $stmt_check->store_result();

    if ($stmt_check->num_rows > 0) {
        // El elemento ya existe, actualizamos last_visited
        $stmt_update = $conn->prepare("UPDATE user_list SET last_visited = CURRENT_TIMESTAMP WHERE user_id = ? AND content_id = ?");
        $stmt_update->bind_param("ii", $user->id, $data['id']);
        $stmt_update->execute();
        $stmt_update->close();
    } else {
        // El elemento no existe, lo insertamos
        $stmt_insert = $conn->prepare("INSERT INTO user_list (user_id, content_id, media_type, title, poster_path, release_date, vote_average) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt_insert->bind_param("iissssd", $user->id, $data['id'], $data['media_type'], $data['title'], $data['poster_path'], $data['release_date'], $data['vote_average']);
        $stmt_insert->execute();
        $stmt_insert->close();
    }

    $stmt_check->close();
    $conn->close();

    echo json_encode(['success' => 'Elemento añadido/actualizado en tu lista']);

} elseif ($action == 'remove_from_my_list') {
    $data = json_decode(file_get_contents('php://input'), true);
    $conn = getDbConnection();
    $stmt = $conn->prepare("DELETE FROM user_list WHERE user_id = ? AND content_id = ?");
    $stmt->bind_param("ii", $user->id, $data['id']);
    if ($stmt->execute()) {
        echo json_encode(['success' => 'Elemento eliminado de tu lista']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error al eliminar el elemento de tu lista']);
    }
    $stmt->close();
    $conn->close();
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
