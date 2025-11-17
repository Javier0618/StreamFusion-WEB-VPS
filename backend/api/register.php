<?php
require_once '../config/db.php';
require_once '../vendor/autoload.php';
use \Firebase\JWT\JWT;

header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$name = $data['name'];
$email = $data['email'];
$password = $data['password'];

$hashed_password = password_hash($password, PASSWORD_BCRYPT);

try {
    $stmt = $pdo->prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
    $stmt->execute([$name, $email, $hashed_password]);

    $user_id = $pdo->lastInsertId();

    $secret_key = "your_secret_key";
    $issuer_claim = "localhost";
    $audience_claim = "localhost";
    $issuedat_claim = time();
    $notbefore_claim = $issuedat_claim + 10;
    $expire_claim = $issuedat_claim + 3600;

    $token = array(
        "iss" => $issuer_claim,
        "aud" => $audience_claim,
        "iat" => $issuedat_claim,
        "nbf" => $notbefore_claim,
        "exp" => $expire_claim,
        "data" => array(
            "id" => $user_id,
    ));

    $jwt = JWT::encode($token, $secret_key, 'HS256');
    echo json_encode(['token' => $jwt]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
