<?php
require_once 'db.php';
require_once 'config.php';
require_once 'JWT.php';

use Firebase\JWT\JWT;

$action = isset($_GET['action']) ? $_GET['action'] : '';

function get_user_from_token() {
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');
        if ($jwt) {
            try {
                $decoded = JWT::decode($jwt, JWT_SECRET, ['HS256']);
                return $decoded->data;
            } catch (Exception $e) {
                return null;
            }
        }
    }
    return null;
}

if ($action == 'get') {
    $conn = getDbConnection();
    // Suponemos que siempre hay una única fila de configuración con id=1
    $result = $conn->query("SELECT * FROM web_config WHERE id = 1");
    if ($settings = $result->fetch_assoc()) {
        $settings['visible_categories'] = json_decode($settings['visible_categories'], true);
        $settings['visible_platforms'] = json_decode($settings['visible_platforms'], true);
        echo json_encode($settings);
    } else {
        // Si no hay configuración, devolver valores por defecto
        echo json_encode([
            'import_language' => 'es-MX',
            'display_language' => 'es-MX',
            'hero_slider_posters' => 8,
            'hero_slider_random' => 4,
            'hero_slider_recent' => 4,
            'visible_categories' => [],
            'visible_platforms' => [],
            'posters_en_estreno' => 20,
            'posters_recien_agregado' => 20,
            'posters_peliculas_populares' => 20,
            'posters_series_populares' => 20,
        ]);
    }
    $conn->close();
} elseif ($action == 'update') {
    $user = get_user_from_token();
    if (!$user || !$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    $conn = getDbConnection();
    $stmt = $conn->prepare("UPDATE web_config SET
        import_language = ?,
        display_language = ?,
        hero_slider_posters = ?,
        hero_slider_random = ?,
        hero_slider_recent = ?,
        visible_categories = ?,
        visible_platforms = ?,
        posters_en_estreno = ?,
        posters_recien_agregado = ?,
        posters_peliculas_populares = ?,
        posters_series_populares = ?
        WHERE id = 1");

    $stmt->bind_param("ssiiissiiii",
        $data['importLanguage'],
        $data['displayLanguage'],
        $data['heroSlider']['posters'],
        $data['heroSlider']['random'],
        $data['heroSlider']['recent'],
        json_encode($data['visibleCategories']),
        json_encode($data['visiblePlatforms']),
        $data['homepageSections']['enEstreno'],
        $data['homepageSections']['recienAgregado'],
        $data['homepageSections']['peliculasPopulares'],
        $data['homepageSections']['seriesPopulares']
    );

    if ($stmt->execute()) {
        echo json_encode(['success' => 'Configuración actualizada con éxito']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Error al actualizar la configuración']);
    }

    $stmt->close();
    $conn->close();
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
