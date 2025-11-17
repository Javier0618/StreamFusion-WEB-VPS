<?php
require_once 'db.php';
require_once 'config.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action == 'record_click') {
    $data = json_decode(file_get_contents('php://input'), true);
    $poster_id = $data['posterId'];
    $media_type = $data['mediaType'];
    $title = $data['title'];
    $poster_path = $data['posterPath'];
    $vote_average = $data['voteAverage'];

    $conn = getDbConnection();

    // Primero, verificamos si el poster ya existe en la tabla
    $stmt_check = $conn->prepare("SELECT id, click_count FROM poster_clicks WHERE poster_id = ?");
    $stmt_check->bind_param("i", $poster_id);
    $stmt_check->execute();
    $result = $stmt_check->get_result();

    if ($row = $result->fetch_assoc()) {
        // El poster existe, incrementamos el contador
        $new_click_count = $row['click_count'] + 1;
        $stmt_update = $conn->prepare("UPDATE poster_clicks SET click_count = ?, last_clicked = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt_update->bind_param("ii", $new_click_count, $row['id']);
        $stmt_update->execute();
        $stmt_update->close();
    } else {
        // El poster no existe, lo insertamos
        $stmt_insert = $conn->prepare("INSERT INTO poster_clicks (poster_id, media_type, title, poster_path, vote_average, click_count) VALUES (?, ?, ?, ?, ?, 1)");
        $stmt_insert->bind_param("isssd", $poster_id, $media_type, $title, $poster_path, $vote_average);
        $stmt_insert->execute();
        $stmt_insert->close();
    }

    $stmt_check->close();
    $conn->close();

    echo json_encode(['success' => 'Click registrado con éxito']);

} elseif ($action == 'get_top_clicks') {
    $conn = getDbConnection();
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 10;

    $result = $conn->query("SELECT * FROM poster_clicks ORDER BY click_count DESC LIMIT " . $limit);
    $stats = [];
    while ($row = $result->fetch_assoc()) {
        $stats[] = $row;
    }

    $conn->close();
    echo json_encode($stats);

} else {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada']);
}
