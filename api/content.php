<?php
// api/content.php
require_once 'db_config.php';

session_start();

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_all':
        getAllContent();
        break;
    // ... otros casos para crear, actualizar, eliminar contenido ...
    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida en content.php']);
        break;
}

function getAllContent() {
    global $conn;

    $content_list = [];
    $sql = "SELECT * FROM content";
    $result = $conn->query($sql);

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            // Decodificar los campos JSON
            $row['genres'] = json_decode($row['genres']);
            $row['display_options'] = json_decode($row['display_options']);

            // Si es una serie, podríamos necesitar cargar temporadas y episodios
            if ($row['media_type'] === 'tv') {
                $seasons_sql = "SELECT * FROM seasons WHERE content_id = " . $row['id'] . " ORDER BY season_number ASC";
                $seasons_result = $conn->query($seasons_sql);
                $seasons = [];
                if ($seasons_result) {
                    while ($season_row = $seasons_result->fetch_assoc()) {
                        $episodes_sql = "SELECT * FROM episodes WHERE season_id = " . $season_row['id'] . " ORDER BY episode_number ASC";
                        $episodes_result = $conn->query($episodes_sql);
                        $episodes = [];
                        if ($episodes_result) {
                            while ($episode_row = $episodes_result->fetch_assoc()) {
                                $episodes[$episode_row['episode_number']] = $episode_row;
                            }
                        }
                        $season_row['episodes'] = $episodes;
                        $seasons[$season_row['season_number']] = $season_row;
                    }
                }
                $row['seasons'] = $seasons;
            }
            $content_list[] = $row;
        }
        echo json_encode($content_list);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al obtener el contenido.']);
    }
}

$conn->close();
?>
