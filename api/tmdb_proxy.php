<?php
// api/tmdb_proxy.php

// Cargar variables de entorno
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[$name] = $value;
    }
}

$apiKey = $_ENV['TMDB_API_KEY'] ?? '';

if (empty($apiKey)) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'La clave de API de TMDB no está configurada en el servidor.']);
    exit;
}

// Obtener el path de la API solicitado por el cliente
$path = $_GET['path'] ?? '';
if (empty($path)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => 'No se ha especificado una ruta para la API de TMDB.']);
    exit;
}

// Construir la URL completa de la API de TMDB
$queryParams = $_GET;
unset($queryParams['path']); // Eliminar nuestro parámetro 'path' de los parámetros de TMDB
$queryString = http_build_query($queryParams);
$tmdbUrl = "https://api.themoviedb.org/3/" . ltrim($path, '/') . "?api_key=" . $apiKey . "&" . $queryString;

// Realizar la petición a la API de TMDB usando cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $tmdbUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_USERAGENT, 'StreamFusion/1.0'); // Es buena práctica enviar un User-Agent

$response = curl_exec($ch);
$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Devolver la respuesta de TMDB al cliente
header('Content-Type: application/json');
http_response_code($httpcode);
echo $response;
?>
