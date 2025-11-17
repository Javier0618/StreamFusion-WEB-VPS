<?php
require_once 'db.php';
require_once 'JWT.php';
require_once 'config.php';

use Firebase\JWT\JWT;

$data = json_decode(file_get_contents('php://input'), true);
$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action == 'register') {
    $name = $data['name'];
    $email = $data['email'];
    $password = $data['password'];

    if (empty($name) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Todos los campos son obligatorios']);
        exit;
    }

    $conn = getDbConnection();
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'El correo electrónico ya está registrado']);
        $stmt->close();
        $conn->close();
        exit;
    }

    $stmt->close();

    $hashed_password = password_hash($password, PASSWORD_BCRYPT);
    $is_admin = ($email === ADMIN_EMAIL) ? 1 : 0;

    $stmt = $conn->prepare("INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("sssi", $name, $email, $hashed_password, $is_admin);

    if ($stmt->execute()) {
        http_response_code(201);
        echo json_encode(['success' => 'Usuario registrado con éxito']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error en el registro']);
    }

    $stmt->close();
    $conn->close();
} elseif ($action == 'login') {
    $email = $data['email'];
    $password = $data['password'];

    $conn = getDbConnection();
    $stmt = $conn->prepare("SELECT id, name, email, password, is_admin FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($user = $result->fetch_assoc()) {
        if (password_verify($password, $user['password'])) {
            $payload = [
                'iat' => time(),
                'exp' => time() + (60*60*24*7), // Expira en 7 días
                'data' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'isAdmin' => (bool)$user['is_admin']
                ]
            ];

            $jwt = JWT::encode($payload, JWT_SECRET, 'HS256');

            echo json_encode([
                'token' => $jwt,
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'isAdmin' => (bool)$user['is_admin']
                ]
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'Correo electrónico o contraseña incorrectos']);
        }
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Correo electrónico o contraseña incorrectos']);
    }

    $stmt->close();
    $conn->close();
} elseif ($action == 'status') {
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');

        if ($jwt) {
            try {
                $decoded = JWT::decode($jwt, JWT_SECRET, ['HS256']);
                http_response_code(200);
                echo json_encode(['user' => $decoded->data]);
            } catch (Exception $e) {
                http_response_code(401);
                echo json_encode(['error' => 'Token inválido', 'message' => $e->getMessage()]);
            }
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'Token no proporcionado']);
        }
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Falta la cabecera de autorización']);
    }
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
