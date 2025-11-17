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

if ($action == 'get_my_messages') {
    $conn = getDbConnection();
    $stmt = $conn->prepare("SELECT m.*, u.name as from_user_name FROM messages m LEFT JOIN users u ON m.from_user_id = u.id WHERE m.to_user_id = ? OR m.to_all = 1 ORDER BY m.date DESC");
    $stmt->bind_param("i", $user->id);
    $stmt->execute();
    $result = $stmt->get_result();
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    $stmt->close();

    // Marcar mensajes como leídos
    $stmt_read = $conn->prepare("UPDATE messages SET `read` = 1 WHERE to_user_id = ? AND `read` = 0");
    $stmt_read->bind_param("i", $user->id);
    $stmt_read->execute();
    $stmt_read->close();

    $conn->close();
    echo json_encode($messages);

} elseif ($action == 'send_to_admin') {
    $data = json_decode(file_get_contents('php://input'), true);
    $content = $data['content'];
    if (empty($content)) {
        http_response_code(400);
        echo json_encode(['error' => 'El contenido del mensaje no puede estar vacío']);
        exit;
    }

    $conn = getDbConnection();
    $stmt = $conn->prepare("INSERT INTO messages (from_user_id, to_admin, content) VALUES (?, 1, ?)");
    $stmt->bind_param("is", $user->id, $content);

    if ($stmt->execute()) {
        echo json_encode(['success' => 'Mensaje enviado al administrador']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error al enviar el mensaje']);
    }

    $stmt->close();
    $conn->close();

} elseif ($action == 'admin_get_messages') {
    if (!$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No tienes permisos para realizar esta acción']);
        exit;
    }

    $conn = getDbConnection();
    $result = $conn->query("SELECT m.*, u.name as from_user_name FROM messages m JOIN users u ON m.from_user_id = u.id WHERE m.to_admin = 1 ORDER BY m.date DESC");
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    $conn->close();
    echo json_encode($messages);

} elseif ($action == 'admin_send_message') {
    if (!$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No tienes permisos para realizar esta acción']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $to_user_id = $data['to_user_id'];
    $content = $data['content'];

    if (empty($content)) {
        http_response_code(400);
        echo json_encode(['error' => 'El contenido del mensaje no puede estar vacío']);
        exit;
    }

    $conn = getDbConnection();

    if ($to_user_id === 'all') {
        $stmt = $conn->prepare("INSERT INTO messages (from_admin, to_all, content) VALUES (1, 1, ?)");
        $stmt->bind_param("s", $content);
    } else {
        $stmt = $conn->prepare("INSERT INTO messages (from_admin, to_user_id, content) VALUES (1, ?, ?)");
        $stmt->bind_param("is", $to_user_id, $content);
    }

    if ($stmt->execute()) {
        echo json_encode(['success' => 'Mensaje enviado con éxito']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error al enviar el mensaje']);
    }

    $stmt->close();
    $conn->close();

} elseif ($action == 'delete') {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'ID de mensaje inválido']);
        exit;
    }

    $conn = getDbConnection();

    // Primero, verificamos que el usuario tenga permiso para borrar el mensaje
    $stmt_check = $conn->prepare("SELECT from_user_id, from_admin FROM messages WHERE id = ?");
    $stmt_check->bind_param("i", $id);
    $stmt_check->execute();
    $result_check = $stmt_check->get_result();

    if ($message = $result_check->fetch_assoc()) {
        if ($user->isAdmin || ($message['from_user_id'] == $user->id && !$message['from_admin'])) {
            $stmt_delete = $conn->prepare("DELETE FROM messages WHERE id = ?");
            $stmt_delete->bind_param("i", $id);
            if ($stmt_delete->execute()) {
                echo json_encode(['success' => 'Mensaje eliminado con éxito']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al eliminar el mensaje']);
            }
            $stmt_delete->close();
        } else {
            http_response_code(403);
            echo json_encode(['error' => 'No tienes permisos para eliminar este mensaje']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Mensaje no encontrado']);
    }

    $stmt_check->close();
    $conn->close();

} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
