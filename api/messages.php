<?php
// api/messages.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'No autenticado']);
    exit;
}

$action = $_GET['action'] ?? '';
$user_id = $_SESSION['user_id'];
$is_admin = $_SESSION['is_admin'];

switch ($action) {
    case 'get_user_messages':
        getUserMessages($user_id);
        break;
    case 'send_user_message':
        sendUserMessage($user_id);
        break;
    case 'delete_message':
        deleteMessage($user_id, $is_admin);
        break;
    // ... otros casos para admin ...
    case 'get_admin_messages':
        getAdminMessages($is_admin);
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida en messages.php']);
        break;
}

function getAdminMessages($is_admin) {
    if (!$is_admin) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    global $conn;

    $sql = "SELECT m.*, u.username as from_username
            FROM messages m
            LEFT JOIN users u ON m.from_user_id = u.id
            WHERE m.recipient_type = 'admin'
            ORDER BY m.date DESC";

    $result = $conn->query($sql);
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    echo json_encode($messages);
}

function getUserMessages($user_id) {
    global $conn;

    // Marcar mensajes como leídos
    $update_sql = "UPDATE messages SET is_read = 1 WHERE to_user_id = ? AND is_read = 0";
    $update_stmt = $conn->prepare($update_sql);
    $update_stmt->bind_param("i", $user_id);
    $update_stmt->execute();
    $update_stmt->close();

    // Obtener mensajes
    $sql = "SELECT * FROM messages WHERE to_user_id = ? OR recipient_type = 'all' OR from_user_id = ? ORDER BY date DESC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ii", $user_id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    echo json_encode($messages);
    $stmt->close();
}

function sendUserMessage($user_id) {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);
    $content = $data['content'] ?? '';

    if (empty($content)) {
        echo json_encode(['success' => false, 'message' => 'El contenido del mensaje no puede estar vacío.']);
        return;
    }

    // Aquí podrías añadir la lógica para limitar el número de mensajes por día
    // (requiere una tabla o campo adicional en la tabla de usuarios)

    $sql = "INSERT INTO messages (from_user_id, recipient_type, content) VALUES (?, 'admin', ?)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("is", $user_id, $content);
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al enviar el mensaje.']);
    }
    $stmt->close();
}

if ($action == 'send_admin_message') {
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $recipient_id = $data['recipient'];
    $content = $data['content'];

    if ($recipient_id === 'all') {
        // Send to all users
        $stmt = $pdo->prepare("SELECT id FROM users");
        $stmt->execute();
        $result = $stmt->get_result();
        $users = $result->fetch_all(MYSQLI_ASSOC);

        $stmt = $pdo->prepare("INSERT INTO messages (from_user_id, to_user_id, content) VALUES (NULL, ?, ?)");
        foreach ($users as $user) {
            $stmt->bind_param("is", $user['id'], $content);
            $stmt->execute();
        }
    } else {
        // Send to a single user
        $stmt = $pdo->prepare("INSERT INTO messages (from_user_id, to_user_id, content) VALUES (NULL, ?, ?)");
        $stmt->bind_param("is", $recipient_id, $content);
        $stmt->execute();
    }

    echo json_encode(['success' => true]);
}

function deleteMessage($user_id, $is_admin) {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);
    $message_id = $data['message_id'] ?? null;

    if (!$message_id) {
        echo json_encode(['success' => false, 'message' => 'ID de mensaje no proporcionado.']);
        return;
    }

    if ($is_admin) {
        $sql = "DELETE FROM messages WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("i", $message_id);
    } else {
        // Un usuario normal solo puede borrar sus propios mensajes
        $sql = "DELETE FROM messages WHERE id = ? AND from_user_id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("ii", $message_id, $user_id);
    }

    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'No se pudo eliminar el mensaje o no tienes permiso.']);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al eliminar el mensaje.']);
    }
    $stmt->close();
}


$conn->close();
?>
