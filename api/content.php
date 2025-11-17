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

if ($action == 'get_all') {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM content");
    $content = [];
    while ($row = $result->fetch_assoc()) {
        $row['display_options'] = json_decode($row['display_options'], true);
        $row['genres'] = json_decode($row['genres'], true);
        $content[] = $row;
    }
    $conn->close();
    echo json_encode($content);

} elseif ($action == 'get_by_id') {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id > 0) {
        $conn = getDbConnection();
        $stmt = $conn->prepare("SELECT * FROM content WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($content = $result->fetch_assoc()) {
            $content['display_options'] = json_decode($content['display_options'], true);
            $content['genres'] = json_decode($content['genres'], true);

            // Obtener temporadas y episodios
            $stmt_seasons = $conn->prepare("SELECT DISTINCT season_number FROM episodes WHERE content_id = ? ORDER BY season_number");
            $stmt_seasons->bind_param("i", $id);
            $stmt_seasons->execute();
            $result_seasons = $stmt_seasons->get_result();

            $seasons = [];
            while ($season_row = $result_seasons->fetch_assoc()) {
                $season_number = $season_row['season_number'];
                $stmt_episodes = $conn->prepare("SELECT * FROM episodes WHERE content_id = ? AND season_number = ? ORDER BY episode_number");
                $stmt_episodes->bind_param("ii", $id, $season_number);
                $stmt_episodes->execute();
                $result_episodes = $stmt_episodes->get_result();
                $episodes = [];
                while ($episode = $result_episodes->fetch_assoc()) {
                    $episodes[$episode['episode_number']] = $episode;
                }
                $seasons[$season_number] = [
                    'season_number' => $season_number,
                    'episodes' => $episodes
                ];
                $stmt_episodes->close();
            }
            $content['seasons'] = $seasons;
            $stmt_seasons->close();

            echo json_encode($content);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Contenido no encontrado']);
        }
        $stmt->close();
        $conn->close();
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'ID de contenido inválido']);
    }

} elseif ($action == 'search') {
    $query = isset($_GET['query']) ? $_GET['query'] : '';
    $conn = getDbConnection();
    $stmt = $conn->prepare("SELECT * FROM content WHERE title LIKE ? OR original_title LIKE ?");
    $search_query = "%" . $query . "%";
    $stmt->bind_param("ss", $search_query, $search_query);
    $stmt->execute();
    $result = $stmt->get_result();
    $content = [];
    while ($row = $result->fetch_assoc()) {
        $row['display_options'] = json_decode($row['display_options'], true);
        $row['genres'] = json_decode($row['genres'], true);
        $content[] = $row;
    }
    $stmt->close();
    $conn->close();
    echo json_encode($content);

} elseif ($action == 'import') {
    $user = get_user_from_token();
    if (!$user || !$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    $conn = getDbConnection();

    // Iniciar transacción
    $conn->begin_transaction();

    try {
        // Insertar contenido principal
        $stmt = $conn->prepare("INSERT INTO content (id, media_type, title, original_title, overview, poster_path, backdrop_path, release_date, vote_average, genres, imported_by, display_options, video_url, next_episode_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("isssssssdsssss",
            $data['id'],
            $data['media_type'],
            $data['title'],
            $data['original_title'],
            $data['overview'],
            $data['poster_path'],
            $data['backdrop_path'],
            $data['release_date'],
            $data['vote_average'],
            json_encode($data['genres']),
            $user->email,
            json_encode($data['display_options']),
            $data['video_url'],
            $data['next_episode_note']
        );
        $stmt->execute();
        $stmt->close();

        // Insertar temporadas y episodios si es una serie
        if ($data['media_type'] === 'tv' && isset($data['seasons'])) {
            foreach ($data['seasons'] as $season) {
                foreach ($season['episodes'] as $episode) {
                    $stmt_episode = $conn->prepare("INSERT INTO episodes (content_id, season_number, episode_number, name, overview, still_path, video_url) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $stmt_episode->bind_param("iiissss",
                        $data['id'],
                        $season['season_number'],
                        $episode['episode_number'],
                        $episode['name'],
                        $episode['overview'],
                        $episode['still_path'],
                        $episode['video_url']
                    );
                    $stmt_episode->execute();
                    $stmt_episode->close();
                }
            }
        }

        // Confirmar transacción
        $conn->commit();
        echo json_encode(['success' => 'Contenido importado con éxito']);

    } catch (Exception $e) {
        // Revertir transacción en caso de error
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Error al importar contenido: ' . $e->getMessage()]);
    }

    $conn->close();

} elseif ($action == 'delete') {
    $user = get_user_from_token();
    if (!$user || !$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }

    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id > 0) {
        $conn = getDbConnection();
        $stmt = $conn->prepare("DELETE FROM content WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) {
            echo json_encode(['success' => 'Contenido eliminado con éxito']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Error al eliminar contenido']);
        }
        $stmt->close();
        $conn->close();
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'ID de contenido inválido']);
    }

} elseif ($action == 'update_urls') {
    $user = get_user_from_token();
    if (!$user || !$user->isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'];

    $conn = getDbConnection();
    $conn->begin_transaction();

    try {
        if ($data['media_type'] === 'movie') {
            $stmt = $conn->prepare("UPDATE content SET video_url = ? WHERE id = ?");
            $stmt->bind_param("si", $data['video_url'], $id);
            $stmt->execute();
            $stmt->close();
        } elseif ($data['media_type'] === 'tv') {
            foreach ($data['seasons'] as $season) {
                foreach ($season['episodes'] as $episode) {
                    $stmt = $conn->prepare("UPDATE episodes SET video_url = ? WHERE content_id = ? AND season_number = ? AND episode_number = ?");
                    $stmt->bind_param("siii", $episode['video_url'], $id, $season['season_number'], $episode['episode_number']);
                    $stmt->execute();
                    $stmt->close();
                }
            }
        }
        $conn->commit();
        echo json_encode(['success' => 'URLs actualizadas con éxito']);
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Error al actualizar URLs: ' . $e->getMessage()]);
    }

    $conn->close();

} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
