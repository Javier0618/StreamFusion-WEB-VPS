<?php
// api/setup.php
require_once 'db_config.php';

// Sentencias SQL para crear las tablas
$sql_statements = [
    "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME,
        is_admin TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS content (
        id INT PRIMARY KEY,
        media_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        original_title VARCHAR(255),
        overview TEXT,
        poster_path VARCHAR(255),
        backdrop_path VARCHAR(255),
        release_date DATE,
        vote_average DECIMAL(3,1),
        genres JSON,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        imported_by VARCHAR(255),
        display_options JSON,
        video_url VARCHAR(1024),
        next_episode_note TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS seasons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content_id INT NOT NULL,
        season_number INT NOT NULL,
        name VARCHAR(255),
        poster_path VARCHAR(255),
        air_date DATE,
        FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
        UNIQUE KEY (content_id, season_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS episodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        season_id INT NOT NULL,
        episode_number INT NOT NULL,
        name VARCHAR(255),
        overview TEXT,
        still_path VARCHAR(255),
        video_url VARCHAR(1024),
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
        UNIQUE KEY (season_id, episode_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS user_list (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content_id INT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_visited DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
        UNIQUE KEY (user_id, content_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        from_user_id INT,
        to_user_id INT,
        recipient_type ENUM('admin', 'all', 'user') NOT NULL,
        content TEXT NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read TINYINT(1) DEFAULT 0,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS poster_clicks (
        content_id INT PRIMARY KEY,
        click_count INT DEFAULT 1,
        last_clicked DATETIME,
        FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS web_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(255) NOT NULL UNIQUE,
        setting_value JSON NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS home_sections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        options JSON,
        display_order INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",

    "CREATE TABLE IF NOT EXISTS modal_sections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        options JSON,
        display_order INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
];

// Ejecutar cada sentencia
foreach ($sql_statements as $sql) {
    if ($conn->query($sql) === TRUE) {
        echo "Tabla creada o ya existente correctamente.<br>";
    } else {
        echo "Error al crear tabla: " . $conn->error . "<br>";
    }
}

echo "Proceso de configuración de la base de datos completado.";

$conn->close();
?>
