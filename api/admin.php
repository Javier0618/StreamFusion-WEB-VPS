<?php
// api/admin.php

require_once 'db_config.php';
session_start();

$action = $_POST['action'] ?? $_GET['action'] ?? '';

// --- Middleware de Autenticación y Autorización ---
$public_actions = ['getHomeSections', 'getSettings', 'updateClickCount', 'checkContentExists'];
if (!in_array($action, $public_actions)) {
    if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        jsonResponse(403, 'Acceso denegado. No tienes permisos de administrador.');
    }
}

$conn = getDbConnection();
$adminUserId = $_SESSION['user_id'] ?? null;

switch ($action) {
    // --- Gestión de Contenido ---
    case 'checkContentExists': handleCheckContentExists($conn); break;
    case 'importContent': handleImportContent($conn, $adminUserId); break;

    // --- Gestión de Configuración ---
    case 'getSettings': handleGetSettings($conn); break;

    // --- Gestión de Secciones ---
    case 'getHomeSections': handleGetSections($conn, 'home_sections'); break;
    case 'getModalSections': handleGetSections($conn, 'modal_sections'); break;
    case 'saveSection': handleSaveSection($conn); break;
    case 'deleteSection': handleDeleteSection($conn); break;

    // --- Gestión de Usuarios ---
    case 'getUsers': handleGetUsers($conn); break;
    case 'updateUser': handleUpdateUser($conn); break;
    case 'deleteUser': handleDeleteUser($conn); break;

    // --- Gestión de Mensajes ---
    case 'getAdminMessages': handleGetAdminMessages($conn); break;
    case 'sendMessage': handleAdminSendMessage($conn, $adminUserId); break;
    case 'deleteMessage': handleAdminDeleteMessage($conn); break;

    // --- Otros ---
    case 'updateClickCount': handleUpdateClickCount($conn); break;

    default:
        jsonResponse(400, 'Acción de administrador no válida: ' . $action);
}

// --- Implementación de funciones ---

function handleGetSettings($conn) {
    $stmt = $conn->prepare("SELECT settings_json FROM web_settings WHERE id = 1");
    $stmt->execute();
    $result = $stmt->get_result();
    if ($settings = $result->fetch_assoc()) {
        jsonResponse(200, 'Configuración obtenida.', json_decode($settings['settings_json']));
    } else {
        $defaultSettings = new stdClass();
        jsonResponse(200, 'No se encontró configuración, devolviendo por defecto.', $defaultSettings);
    }
    $stmt->close();
}

function handleGetSections($conn, $tableName) {
    $sql = "SELECT * FROM `$tableName` ORDER BY display_order ASC";
    $result = $conn->query($sql);
    $sections = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['options'] = json_decode($row['options_json']);
            unset($row['options_json']);
            $sections[] = $row;
        }
    }
    jsonResponse(200, 'Secciones obtenidas.', $sections);
}

function handleSaveSection($conn) {
    $id = $_POST['id'] ?? null;
    $collectionName = $_POST['collectionName'] ?? '';
    $title = $_POST['title'] ?? '';
    $type = $_POST['type'] ?? '';
    $options_json = $_POST['options_json'] ?? '{}';
    if (empty($collectionName) || empty($title) || empty($type)) {
        jsonResponse(400, 'Faltan datos para guardar la sección.');
    }
    if ($id) {
        $stmt = $conn->prepare("UPDATE `$collectionName` SET title = ?, type = ?, options_json = ? WHERE id = ?");
        $stmt->bind_param("sssi", $title, $type, $options_json, $id);
    } else {
        $stmt_order = $conn->prepare("SELECT MAX(display_order) as max_order FROM `$collectionName`");
        $stmt_order->execute();
        $max_order = $stmt_order->get_result()->fetch_assoc()['max_order'] ?? -1;
        $new_order = $max_order + 1;
        $stmt = $conn->prepare("INSERT INTO `$collectionName` (title, type, options_json, display_order) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("sssi", $title, $type, $options_json, $new_order);
    }
    if ($stmt->execute()) {
        jsonResponse(200, 'Sección guardada correctamente.');
    } else {
        jsonResponse(500, 'Error al guardar la sección.');
    }
    $stmt->close();
}

function handleDeleteSection($conn) {
    $id = $_POST['id'] ?? null;
    $collectionName = $_POST['collectionName'] ?? '';
    if (empty($id) || empty($collectionName)) {
        jsonResponse(400, 'Faltan datos para eliminar la sección.');
    }
    $stmt = $conn->prepare("DELETE FROM `$collectionName` WHERE id = ?");
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        jsonResponse(200, 'Sección eliminada correctamente.');
    } else {
        jsonResponse(500, 'Error al eliminar la sección.');
    }
    $stmt->close();
}

function handleGetUsers($conn) {
    $stmt = $conn->prepare("SELECT id, name, email, registered_at, last_activity FROM users ORDER BY registered_at DESC");
    $stmt->execute();
    $result = $stmt->get_result();
    $users = [];
    if($result){
        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }
    }
    $stmt->close();
    jsonResponse(200, 'Usuarios obtenidos con éxito.', $users);
}

function handleUpdateUser($conn) {
    $userIdToUpdate = $_POST['user_id'] ?? 0;
    $name = $_POST['name'] ?? '';
    $email = $_POST['email'] ?? '';
    if (empty($userIdToUpdate) || empty($name) || empty($email)) {
        jsonResponse(400, 'Faltan datos para actualizar el usuario.');
    }
    $stmt_check = $conn->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
    $stmt_check->bind_param("si", $email, $userIdToUpdate);
    $stmt_check->execute();
    $stmt_check->store_result();
    if ($stmt_check->num_rows > 0) {
        jsonResponse(409, 'El correo electrónico ya está en uso por otro usuario.');
    }
    $stmt_check->close();
    $stmt = $conn->prepare("UPDATE users SET name = ?, email = ? WHERE id = ?");
    $stmt->bind_param("ssi", $name, $email, $userIdToUpdate);
    if ($stmt->execute()) {
        jsonResponse(200, 'Usuario actualizado correctamente.');
    } else {
        jsonResponse(500, 'Error al actualizar el usuario.');
    }
    $stmt->close();
}

function handleDeleteUser($conn) {
    $userIdToDelete = $_POST['user_id'] ?? 0;
    if (empty($userIdToDelete)) {
        jsonResponse(400, 'No se proporcionó el ID del usuario a eliminar.');
    }
    if ($userIdToDelete == ($_SESSION['user_id'] ?? 0)) {
        jsonResponse(403, 'No puedes eliminar tu propia cuenta de administrador.');
    }
    $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
    $stmt->bind_param("i", $userIdToDelete);
    if ($stmt->execute()) {
        jsonResponse(200, 'Usuario eliminado correctamente.');
    } else {
        jsonResponse(500, 'Error al eliminar el usuario.');
    }
    $stmt->close();
}

function handleGetAdminMessages($conn) {
    $stmt = $conn->prepare("SELECT m.id, m.content, m.sent_at, m.is_read, u.name as userName, m.from_user_id FROM messages m JOIN users u ON m.from_user_id = u.id WHERE m.to_admin = 1 ORDER BY m.sent_at DESC");
    $stmt->execute();
    $result = $stmt->get_result();
    $messages = [];
    if($result){
        while ($row = $result->fetch_assoc()) {
            $messages[] = $row;
        }
    }
    $stmt->close();
    jsonResponse(200, 'Mensajes de administrador obtenidos.', $messages);
}

function handleAdminSendMessage($conn, $adminUserId) {
    $recipientId = $_POST['recipient_id'] ?? 'all';
    $content = $_POST['content'] ?? '';
    if (empty($content)) {
        jsonResponse(400, 'El contenido del mensaje no puede estar vacío.');
    }
    if ($recipientId === 'all') {
        $stmt = $conn->prepare("INSERT INTO messages (from_admin, to_all, content) VALUES (1, 1, ?)");
        $stmt->bind_param("s", $content);
    } else {
        $stmt = $conn->prepare("INSERT INTO messages (from_admin, to_user_id, content) VALUES (1, ?, ?)");
        $stmt->bind_param("is", $recipientId, $content);
    }
    if ($stmt->execute()) {
        jsonResponse(201, 'Mensaje enviado correctamente.');
    } else {
        jsonResponse(500, 'Error al enviar el mensaje.');
    }
    $stmt->close();
}

function handleAdminDeleteMessage($conn) {
    $messageId = $_POST['message_id'] ?? 0;
    if (empty($messageId)) {
        jsonResponse(400, 'ID de mensaje no proporcionado.');
    }
    $stmt = $conn->prepare("DELETE FROM messages WHERE id = ?");
    $stmt->bind_param("i", $messageId);
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            jsonResponse(200, 'Mensaje eliminado correctamente.');
        } else {
            jsonResponse(404, 'No se encontró el mensaje a eliminar.');
        }
    } else {
        jsonResponse(500, 'Error al eliminar el mensaje.');
    }
    $stmt->close();
}

function handleCheckContentExists($conn) {
    $contentId = $_GET['id'] ?? 0;
    if (empty($contentId)) {
        jsonResponse(400, 'ID de contenido no proporcionado.');
    }
    $stmt = $conn->prepare("SELECT id FROM content WHERE id = ?");
    $stmt->bind_param("i", $contentId);
    $stmt->execute();
    $stmt->store_result();
    jsonResponse(200, 'Verificación de contenido.', ['exists' => $stmt->num_rows > 0]);
    $stmt->close();
}

function handleImportContent($conn, $adminUserId) {
    $itemData = json_decode($_POST['itemData'], true);
    if (empty($itemData)) {
        jsonResponse(400, 'No se recibieron datos de contenido para importar.');
    }
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("INSERT INTO content (id, media_type, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, video_url, imported_by, next_episode_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $imported_by_email = $_SESSION['user_email']; // Asumimos que el email está en la sesión
        $stmt->bind_param("isssssssdssss", $itemData['id'], $itemData['media_type'], $itemData['title'], $itemData['original_title'], $itemData['overview'], $itemData['poster_path'], $itemData['backdrop_path'], $itemData['release_date'], $itemData['vote_average'], $itemData['video_url'], $imported_by_email, $itemData['next_episode_note']);
        $stmt->execute();

        if (!empty($itemData['genres'])) {
            $stmt_genre = $conn->prepare("INSERT INTO content_genres (content_id, genre_id) VALUES (?, ?)");
            foreach ($itemData['genres'] as $genreId) {
                $stmt_genre->bind_param("ii", $itemData['id'], $genreId);
                $stmt_genre->execute();
            }
        }

        $displayOptions = $itemData['display_options'];
        $stmt_option = $conn->prepare("INSERT INTO display_options (content_id, option_type, option_value) VALUES (?, ?, ?)");
        $option_types = ['main_sections' => 'main_section', 'home_sections' => 'home_section', 'platforms' => 'platform'];
        foreach ($option_types as $key => $type) {
            if (!empty($displayOptions[$key])) {
                foreach ($displayOptions[$key] as $value) {
                    $stmt_option->bind_param("iss", $itemData['id'], $type, $value);
                    $stmt_option->execute();
                }
            }
        }

        if ($itemData['media_type'] === 'tv' && !empty($itemData['seasons'])) {
            $stmt_season = $conn->prepare("INSERT INTO seasons (content_id, season_number, name, poster_path, air_date) VALUES (?, ?, ?, ?, ?)");
            $stmt_episode = $conn->prepare("INSERT INTO episodes (season_id, episode_number, name, overview, still_path, video_url, air_date) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($itemData['seasons'] as $season) {
                $stmt_season->bind_param("iisss", $itemData['id'], $season['season_number'], $season['name'], $season['poster_path'], $season['air_date']);
                $stmt_season->execute();
                $seasonId = $conn->insert_id;
                if (!empty($season['episodes'])) {
                    foreach ($season['episodes'] as $episode) {
                        $stmt_episode->bind_param("iisssss", $seasonId, $episode['episode_number'], $episode['name'], $episode['overview'], $episode['still_path'], $episode['video_url'], $episode['air_date']);
                        $stmt_episode->execute();
                    }
                }
            }
        }
        $conn->commit();
        jsonResponse(201, 'Contenido importado con éxito.');
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(500, 'Error en el servidor al importar el contenido: ' . $e->getMessage());
    }
}

function handleUpdateClickCount($conn) {
    $contentId = $_POST['content_id'] ?? 0;
    if (empty($contentId)) {
        jsonResponse(400, 'ID de contenido no proporcionado.');
    }
    $stmt = $conn->prepare("INSERT INTO poster_clicks (content_id, click_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE click_count = click_count + 1");
    $stmt->bind_param("i", $contentId);
    if ($stmt->execute()) {
        jsonResponse(200, 'Click count updated.');
    } else {
        jsonResponse(500, 'Failed to update click count.');
    }
    $stmt->close();
}

$conn->close();
?>
