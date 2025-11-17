<?php
require_once '../config/db.php';
require_once '../auth_middleware.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query('SELECT * FROM web_settings LIMIT 1');
        $settings = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode($settings ?: new stdClass());
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_data = auth_middleware();
    if (!$user_data['isAdmin']) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    try {
        $stmt = $pdo->query('SELECT * FROM web_settings LIMIT 1');
        $settings = $stmt->fetch();
        if ($settings) {
            $stmt = $pdo->prepare('UPDATE web_settings SET importLanguage = ?, displayLanguage = ?, heroSlider_posters = ?, heroSlider_random = ?, heroSlider_recent = ?, homepage_enEstreno = ?, homepage_recienAgregado = ?, homepage_peliculasPopulares = ?, homepage_seriesPopulares = ? WHERE id = ?');
            $stmt->execute([$data['importLanguage'], $data['displayLanguage'], $data['heroSlider']['posters'], $data['heroSlider']['random'], $data['heroSlider']['recent'], $data['homepageSections']['enEstreno'], $data['homepageSections']['recienAgregado'], $data['homepageSections']['peliculasPopulares'], $data['homepageSections']['seriesPopulares'], $settings['id']]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO web_settings (importLanguage, displayLanguage, heroSlider_posters, heroSlider_random, heroSlider_recent, homepage_enEstreno, homepage_recienAgregado, homepage_peliculasPopulares, homepage_seriesPopulares) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$data['importLanguage'], $data['displayLanguage'], $data['heroSlider']['posters'], $data['heroSlider']['random'], $data['heroSlider']['recent'], $data['homepageSections']['enEstreno'], $data['homepageSections']['recienAgregado'], $data['homepageSections']['peliculasPopulares'], $data['homepageSections']['seriesPopulares']]);
        }
        http_response_code(200);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
