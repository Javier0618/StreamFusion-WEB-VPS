<?php
require_once __DIR__ . '/vendor/autoload.php';
use \Firebase\JWT\JWT;
use \Firebase\JWT\Key;

function auth_middleware() {
    $headers = getallheaders();
    if (!isset($headers['x-auth-token'])) {
        http_response_code(401);
        echo json_encode(['error' => 'No token, authorization denied']);
        exit;
    }

    $token = $headers['x-auth-token'];
    $secret_key = "your_secret_key";

    try {
        $decoded = JWT::decode($token, new Key($secret_key, 'HS256'));
        return (array) $decoded->data;
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode(['error' => 'Token is not valid']);
        exit;
    }
}
