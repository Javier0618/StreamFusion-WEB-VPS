<?php
// api/db_config.php

// --- Habilitar reporte de errores para depuración ---
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Cargar variables de entorno si existe un archivo .env (para desarrollo local)
// En producción, estas variables se deben configurar directamente en el servidor.
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[$name] = $value;
    }
}

// Configuración para la conexión a la base de datos desde variables de entorno
define('DB_SERVER', $_ENV['DB_SERVER'] ?? 'localhost');
define('DB_USERNAME', $_ENV['DB_USERNAME'] ?? 'root');
define('DB_PASSWORD', $_ENV['DB_PASSWORD'] ?? '');
define('DB_NAME', $_ENV['DB_NAME'] ?? 'streamfusion');

// Función para obtener la conexión a la base de datos
function getDbConnection() {
    // ... (el resto del archivo no cambia)
    $conn = new mysqli(DB_SERVER, DB_USERNAME, DB_PASSWORD, DB_NAME);
    if ($conn->connect_error) {
        die("Error de conexión: " . $conn->connect_error);
    }
    $conn->set_charset("utf8mb4");
    return $conn;
}

function jsonResponse($status, $message, $data = null) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($status);
    $response = ['message' => $message];
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response);
    exit;
}
?>
