<?php
// api/content.php

require_once 'db_config.php';
session_start();

// --- Logging ---
function log_message($message) {
    $logFile = __DIR__ . '/debug.log';
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$timestamp] " . print_r($message, true) . "\n", FILE_APPEND);
}

log_message("--- New request to content.php ---");

$conn = getDbConnection();

handleGetAllContent($conn);

function handleGetAllContent($conn) {
    try {
        // 1. Obtener todo el contenido principal
        $sql = "SELECT * FROM content ORDER BY imported_at DESC";
        $result = $conn->query($sql);
        $contentList = [];
        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                $row['id'] = (int)$row['id'];
                $row['vote_average'] = (float)$row['vote_average'];
                $row['genres'] = [];
                $row['display_options'] = [
                    'main_sections' => [],
                    'home_sections' => [],
                    'platforms' => []
                ];
                $contentList[$row['id']] = $row;
            }
        }
        log_message("Step 1: " . count($contentList) . " items found in 'content' table.");

        // 2. Obtener y mapear géneros
        $sql_genres = "SELECT cg.content_id, cg.genre_id FROM content_genres cg";
        $result_genres = $conn->query($sql_genres);
        if ($result_genres->num_rows > 0) {
            while ($row = $result_genres->fetch_assoc()) {
                $contentId = (int)$row['content_id'];
                if (isset($contentList[$contentId])) {
                    $contentList[$contentId]['genres'][] = (int)$row['genre_id'];
                }
            }
        }
        log_message("Step 2: Genres mapped.");

        // 3. Obtener y mapear opciones de visualización
        $sql_options = "SELECT do.content_id, do.option_type, do.option_value FROM display_options do";
        $result_options = $conn->query($sql_options);
        if ($result_options->num_rows > 0) {
            while ($row = $result_options->fetch_assoc()) {
                $contentId = (int)$row['content_id'];
                if (isset($contentList[$contentId])) {
                    $typeKey = $row['option_type'] . 's';
                    if ($typeKey === 'main_sections' || $typeKey === 'home_sections' || $typeKey === 'platforms') {
                       $contentList[$contentId]['display_options'][$typeKey][] = $row['option_value'];
                    }
                }
            }
        }
        log_message("Step 3: Display options mapped.");

        $finalContentList = array_values($contentList);
        log_message("Final JSON response preview: " . substr(json_encode($finalContentList), 0, 500) . "...");

        jsonResponse(200, 'Contenido obtenido con éxito.', $finalContentList);

    } catch (Exception $e) {
        log_message("ERROR: " . $e->getMessage());
        jsonResponse(500, 'Error en el servidor al obtener el contenido: ' . $e->getMessage());
    } finally {
        $conn->close();
    }
}
?>
