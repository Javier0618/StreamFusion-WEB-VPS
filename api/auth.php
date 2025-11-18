<?php
// api/auth.php

// Incluir la configuración de la base de datos
require_once 'db_config.php';

// Iniciar la sesión para mantener el estado del usuario
session_start();

// Obtener la conexión a la base de datos
$conn = getDbConnection();

// Determinar la acción solicitada por el frontend
$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        handleRegister($conn);
        break;
    case 'login':
        handleLogin($conn);
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check_session':
        checkSession();
        break;
    default:
        jsonResponse(400, 'Acción no válida');
}

// Función para manejar el registro de un nuevo usuario
function handleRegister($conn) {
    $name = $_POST['name'] ?? '';
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    // Validación simple
    if (empty($name) || empty($email) || empty($password)) {
        jsonResponse(400, 'Todos los campos son obligatorios.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(400, 'El formato del correo electrónico no es válido.');
    }
    if (strlen($password) < 6) {
        jsonResponse(400, 'La contraseña debe tener al menos 6 caracteres.');
    }

    // Verificar si el correo electrónico ya existe
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->store_result();
    if ($stmt->num_rows > 0) {
        jsonResponse(409, 'Este correo electrónico ya está registrado.');
    }
    $stmt->close();

    // Hashear la contraseña
    $password_hash = password_hash($password, PASSWORD_BCRYPT);

    // Insertar el nuevo usuario en la base de datos
    $stmt = $conn->prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)");
    $isAdmin = (strtolower($email) === 'javiervelasquez0618@gmail.com');
    $stmt->bind_param("sssi", $name, $email, $password_hash, $isAdmin);

    if ($stmt->execute()) {
        jsonResponse(201, 'Usuario registrado con éxito. Ahora puedes iniciar sesión.');
    } else {
        jsonResponse(500, 'Error al registrar el usuario.');
    }
    $stmt->close();
}

// Función para manejar el inicio de sesión
function handleLogin($conn) {
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';

    if (empty($email) || empty($password)) {
        jsonResponse(400, 'Correo electrónico y contraseña son obligatorios.');
    }

    // Obtener el usuario de la base de datos
    $stmt = $conn->prepare("SELECT id, name, email, password_hash, is_admin, registered_at FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($user = $result->fetch_assoc()) {
        // Verificar la contraseña
        if (password_verify($password, $user['password_hash'])) {
            // Contraseña correcta, iniciar sesión
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['is_admin'] = (bool)$user['is_admin'];

            // Actualizar la última actividad
            $updateStmt = $conn->prepare("UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?");
            $updateStmt->bind_param("i", $user['id']);
            $updateStmt->execute();
            $updateStmt->close();

            // Preparar los datos del usuario para la respuesta
            $userData = [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'isAdmin' => (bool)$user['is_admin'],
                'registeredAt' => $user['registered_at']
            ];

            jsonResponse(200, 'Inicio de sesión exitoso.', $userData);
        } else {
            jsonResponse(401, 'Correo electrónico o contraseña incorrectos.');
        }
    } else {
        jsonResponse(401, 'Correo electrónico o contraseña incorrectos.');
    }
    $stmt->close();
}

// Función para cerrar la sesión
function handleLogout() {
    // Destruir todas las variables de sesión
    $_SESSION = array();

    // Si se desea destruir la sesión completamente, borre también la cookie de sesión.
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }

    // Finalmente, destruir la sesión
    session_destroy();
    jsonResponse(200, 'Sesión cerrada con éxito.');
}

// Función para verificar si hay una sesión activa
function checkSession() {
    if (isset($_SESSION['user_id'])) {
        // Hay una sesión activa, devolver los datos del usuario
        $userData = [
            'id' => $_SESSION['user_id'],
            'name' => $_SESSION['user_name'],
            'email' => $_SESSION['user_email'],
            'isAdmin' => $_SESSION['is_admin']
        ];

        // Actualizar la última actividad
        $conn = getDbConnection();
        $stmt = $conn->prepare("UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->bind_param("i", $_SESSION['user_id']);
        $stmt->execute();
        $stmt->close();

        jsonResponse(200, 'Sesión activa.', $userData);
    } else {
        jsonResponse(401, 'No hay sesión activa.');
    }
}

// Cerrar la conexión al final del script
$conn->close();
?>
