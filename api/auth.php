<?php
// api/auth.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        registerUser();
        break;
    case 'login':
        loginUser();
        break;
    case 'logout':
        logoutUser();
        break;
    case 'check_session':
        checkSession();
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida']);
        break;
}

function registerUser() {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);

    $name = $data['name'] ?? '';
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';

    if (empty($name) || empty($email) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Todos los campos son obligatorios.']);
        return;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Correo electrónico no válido.']);
        return;
    }

    // Verificar si el correo ya existe
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->store_result();
    if ($stmt->num_rows > 0) {
        echo json_encode(['success' => false, 'message' => 'Este correo electrónico ya está registrado.']);
        $stmt->close();
        return;
    }
    $stmt->close();

    // Hashear la contraseña
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);

    // Insertar usuario
    $stmt = $conn->prepare("INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)");
    $is_admin = ($email === 'javiervelasquez0618@gmail.com') ? 1 : 0;
    $stmt->bind_param("sssi", $name, $email, $hashed_password, $is_admin);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Registro exitoso. Ahora puedes iniciar sesión.']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error en el registro.']);
    }
    $stmt->close();
}

function loginUser() {
    global $conn;
    $data = json_decode(file_get_contents('php://input'), true);

    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';

    if (empty($email) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Correo y contraseña son obligatorios.']);
        return;
    }

    $stmt = $conn->prepare("SELECT id, name, email, password, is_admin, registered_at FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($user = $result->fetch_assoc()) {
        if (password_verify($password, $user['password'])) {
            // Contraseña correcta, iniciar sesión
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['is_admin'] = (bool)$user['is_admin'];

            // Actualizar last_activity
            $update_stmt = $conn->prepare("UPDATE users SET last_activity = NOW() WHERE id = ?");
            $update_stmt->bind_param("i", $user['id']);
            $update_stmt->execute();
            $update_stmt->close();

            echo json_encode([
                'success' => true,
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'isAdmin' => (bool)$user['is_admin'],
                    'registeredAt' => $user['registered_at']
                ]
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Correo electrónico o contraseña incorrectos.']);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Correo electrónico o contraseña incorrectos.']);
    }
    $stmt->close();
}

function logoutUser() {
    session_destroy();
    echo json_encode(['success' => true]);
}

function checkSession() {
    global $conn;
    if (isset($_SESSION['user_id'])) {
         // Actualizar last_activity
        $update_stmt = $conn->prepare("UPDATE users SET last_activity = NOW() WHERE id = ?");
        $update_stmt->bind_param("i", $_SESSION['user_id']);
        $update_stmt->execute();
        $update_stmt->close();

        // Obtener datos actualizados del usuario
        $stmt = $conn->prepare("SELECT id, name, email, is_admin, registered_at FROM users WHERE id = ?");
        $stmt->bind_param("i", $_SESSION['user_id']);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result->fetch_assoc();
        $stmt->close();

        echo json_encode([
            'authenticated' => true,
            'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'isAdmin' => (bool)$user['is_admin'],
                    'registeredAt' => $user['registered_at']
                ]
        ]);
    } else {
        echo json_encode(['authenticated' => false]);
    }
}

$conn->close();
?>
