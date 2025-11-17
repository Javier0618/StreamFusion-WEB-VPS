<?php
// api/settings.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_settings':
        getWebSettings();
        break;
    case 'save_settings':
        saveWebSettings();
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida en settings.php']);
        break;
}

function getWebSettings() {
    global $conn;
    $sql = "SELECT setting_value FROM web_config WHERE setting_key = 'main_settings'";
    $result = $conn->query($sql);
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        echo $row['setting_value']; // El valor ya está en formato JSON
    } else {
        // Devolver configuración por defecto si no se encuentra en la BD
        $default_settings = [
            'importLanguage' => 'es-MX',
            'displayLanguage' => 'es-MX',
            'heroSlider' => ['posters' => 8, 'random' => 4, 'recent' => 4],
            'visibleCategories' => [],
            'visiblePlatforms' => [],
            'homepageSections' => ['enEstreno' => 20, 'recienAgregado' => 20, 'peliculasPopulares' => 20, 'seriesPopulares' => 20]
        ];
        echo json_encode($default_settings);
    }
}

function saveWebSettings() {
    global $conn;

    // Solo los administradores pueden guardar la configuración
    if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
        echo json_encode(['success' => false, 'message' => 'No autorizado']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    if (empty($data)) {
        echo json_encode(['success' => false, 'message' => 'No se recibieron datos.']);
        return;
    }

    $settings_json = json_encode($data);

    $sql = "INSERT INTO web_config (setting_key, setting_value) VALUES ('main_settings', ?) ON DUPLICATE KEY UPDATE setting_value = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $settings_json, $settings_json);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al guardar la configuración.']);
    }
    $stmt->close();
}

$conn->close();
?>
