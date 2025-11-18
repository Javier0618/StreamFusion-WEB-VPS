<?php
// api/user.php

require_once 'db_config.php';
session_start();

$conn = getDbConnection();

// Verificar que el usuario esté autenticado para todas las acciones
if (!isset($_SESSION['user_id'])) {
    jsonResponse(403, 'Acceso denegado. Se requiere iniciar sesión.');
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$userId = $_SESSION['user_id'];

switch ($action) {
    case 'getMyList':
        handleGetUserList($conn, $userId);
        break;
    case 'toggleMyList':
        handleToggleMyList($conn, $userId);
        break;
    case 'getMessages':
        handleGetMessages($conn, $userId);
        break;
    case 'sendMessage':
        handleSendMessage($conn, $userId);
        break;
    case 'checkMessageLimit':
        handleCheckMessageLimit($conn, $userId);
        break;
    default:
        jsonResponse(400, 'Acción no válida para el perfil de usuario.');
}

function handleGetUserList($conn, $userId) {
    $stmt = $conn->prepare("
        SELECT c.*
        FROM user_list ul
        JOIN content c ON ul.content_id = c.id
        WHERE ul.user_id = ?
        ORDER BY ul.added_at DESC
    ");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $myList = [];
    while ($row = $result->fetch_assoc()) {
        $myList[] = $row;
    }
    $stmt->close();
    jsonResponse(200, 'Lista de usuario obtenida.', $myList);
}

function handleToggleMyList($conn, $userId) {
    $contentId = $_POST['content_id'] ?? 0;
    if (empty($contentId)) {
        jsonResponse(400, 'ID de contenido no proporcionado.');
    }

    // Verificar si ya está en la lista
    $stmt = $conn->prepare("SELECT content_id FROM user_list WHERE user_id = ? AND content_id = ?");
    $stmt->bind_param("ii", $userId, $contentId);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        // Eliminar de la lista
        $stmt_delete = $conn->prepare("DELETE FROM user_list WHERE user_id = ? AND content_id = ?");
        $stmt_delete->bind_param("ii", $userId, $contentId);
        if ($stmt_delete->execute()) {
            jsonResponse(200, 'Contenido eliminado de tu lista.', ['action' => 'removed']);
        } else {
            jsonResponse(500, 'Error al eliminar de la lista.');
        }
        $stmt_delete->close();
    } else {
        // Añadir a la lista
        $stmt_add = $conn->prepare("INSERT INTO user_list (user_id, content_id) VALUES (?, ?)");
        $stmt_add->bind_param("ii", $userId, $contentId);
        if ($stmt_add->execute()) {
            jsonResponse(200, 'Contenido añadido a tu lista.', ['action' => 'added']);
        } else {
            jsonResponse(500, 'Error al añadir a la lista.');
        }
        $stmt_add->close();
    }
    $stmt->close();
}

function handleGetMessages($conn, $userId) {
    $stmt = $conn->prepare("
        SELECT m.id, m.content, m.sent_at, m.is_read,
               CASE WHEN m.from_admin = 1 THEN 'admin' ELSE u.name END as sender_name,
               m.from_admin
        FROM messages m
        LEFT JOIN users u ON m.from_user_id = u.id
        WHERE (m.to_user_id = ? OR m.to_all = 1) OR (m.from_user_id = ?)
        ORDER BY m.sent_at DESC
    ");
    $stmt->bind_param("ii", $userId, $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }
    $stmt->close();

    // Marcar mensajes como leídos
    $stmt_update = $conn->prepare("UPDATE messages SET is_read = 1 WHERE to_user_id = ? AND is_read = 0");
    $stmt_update->bind_param("i", $userId);
    $stmt_update->execute();
    $stmt_update->close();

    jsonResponse(200, 'Mensajes obtenidos.', $messages);
}

function handleSendMessage($conn, $userId) {
    $content = $_POST['content'] ?? '';
    if (empty($content)) {
        jsonResponse(400, 'El contenido del mensaje no puede estar vacío.');
    }

    // Verificar límite de mensajes (2 por día)
    $stmt_limit = $conn->prepare("SELECT COUNT(id) as count FROM messages WHERE from_user_id = ? AND DATE(sent_at) = CURDATE()");
    $stmt_limit->bind_param("i", $userId);
    $stmt_limit->execute();
    $result_limit = $stmt_limit->get_result()->fetch_assoc();
    $stmt_limit->close();

    if ($result_limit['count'] >= 2 && !$_SESSION['is_admin']) {
        jsonResponse(429, 'Has alcanzado el límite de 2 mensajes por día.');
    }

    // Insertar mensaje
    $stmt = $conn->prepare("INSERT INTO messages (from_user_id, to_admin, content) VALUES (?, 1, ?)");
    $stmt->bind_param("is", $userId, $content);
    if ($stmt->execute()) {
        jsonResponse(201, 'Mensaje enviado correctamente.');
    } else {
        jsonResponse(500, 'Error al enviar el mensaje.');
    }
    $stmt->close();
}

function handleCheckMessageLimit($conn, $userId) {
    if ($_SESSION['is_admin']) {
        jsonResponse(200, 'Límite de mensajes verificado.', ['limitReached' => false, 'canSend' => 999]);
    }

    $stmt = $conn->prepare("SELECT COUNT(id) as count FROM messages WHERE from_user_id = ? AND DATE(sent_at) = CURDATE()");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $sentCount = (int)$result['count'];
    $limitReached = $sentCount >= 2;
    $canSend = 2 - $sentCount;

    jsonResponse(200, 'Límite de mensajes verificado.', [
        'limitReached' => $limitReached,
        'canSend' => $canSend < 0 ? 0 : $canSend
    ]);
}

$conn->close();
?>
