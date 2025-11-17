<?php
// Muestra todos los errores
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Conexión a la Base de Datos
define('DB_HOST', 'localhost');
define('DB_USER', 'nombre_de_usuario');
define('DB_PASS', 'contraseña');
define('DB_NAME', 'nombre_de_la_base_de_datos');

// Clave Secreta para JWT
define('JWT_SECRET', 'tu_clave_secreta_aqui');

// Email del Administrador
define('ADMIN_EMAIL', 'javiervelasquez0618@gmail.com');

// Configuración de la API de TMDB
define('TMDB_API_KEY', '32e5e53999e380a0291d66fb304153fe');

// Configuración de CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
  http_response_code(200);
  exit();
}
