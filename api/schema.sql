-- Habilitar el soporte para UTF-8 en toda la base de datos
SET NAMES utf8mb4;

-- Tabla de Usuarios
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `registered_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_activity` TIMESTAMP NULL,
  `is_admin` BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Contenido (Películas y Series)
CREATE TABLE `content` (
  `id` INT PRIMARY KEY COMMENT 'TMDB ID',
  `media_type` ENUM('movie', 'tv') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `original_title` VARCHAR(255),
  `overview` TEXT,
  `poster_path` VARCHAR(255),
  `backdrop_path` VARCHAR(255),
  `release_date` DATE,
  `vote_average` DECIMAL(3, 1),
  `video_url` VARCHAR(2048) COMMENT 'URL principal para películas',
  `imported_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `imported_by` VARCHAR(255),
  `next_episode_note` VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Temporadas (para series)
CREATE TABLE `seasons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `content_id` INT NOT NULL,
  `season_number` INT NOT NULL,
  `name` VARCHAR(255),
  `poster_path` VARCHAR(255),
  `air_date` DATE,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `content_season` (`content_id`, `season_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Episodios (para series)
CREATE TABLE `episodes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `season_id` INT NOT NULL,
  `episode_number` INT NOT NULL,
  `name` VARCHAR(255),
  `overview` TEXT,
  `still_path` VARCHAR(255),
  `video_url` VARCHAR(2048),
  `air_date` DATE,
  FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `season_episode` (`season_id`, `episode_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Géneros
CREATE TABLE `genres` (
  `id` INT PRIMARY KEY COMMENT 'TMDB Genre ID',
  `name` VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Unión para Contenido y Géneros (Muchos a Muchos)
CREATE TABLE `content_genres` (
  `content_id` INT NOT NULL,
  `genre_id` INT NOT NULL,
  PRIMARY KEY (`content_id`, `genre_id`),
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para las opciones de visualización del contenido (secciones, plataformas)
CREATE TABLE `display_options` (
  `content_id` INT NOT NULL,
  `option_type` ENUM('main_section', 'home_section', 'platform') NOT NULL,
  `option_value` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`content_id`, `option_type`, `option_value`),
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla "Mi Lista" de Usuarios (Muchos a Muchos)
CREATE TABLE `user_list` (
  `user_id` INT NOT NULL,
  `content_id` INT NOT NULL,
  `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_visited` TIMESTAMP NULL,
  PRIMARY KEY (`user_id`, `content_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Mensajes
CREATE TABLE `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `from_user_id` INT,
  `to_user_id` INT,
  `from_admin` BOOLEAN DEFAULT FALSE,
  `to_admin` BOOLEAN DEFAULT FALSE,
  `to_all` BOOLEAN DEFAULT FALSE,
  `content` TEXT NOT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `is_read` BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Clicks en Posters
CREATE TABLE `poster_clicks` (
  `content_id` INT PRIMARY KEY,
  `click_count` INT DEFAULT 1,
  `last_clicked` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Configuración Web (usando JSON para flexibilidad)
CREATE TABLE `web_settings` (
  `id` INT PRIMARY KEY DEFAULT 1,
  `settings_json` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para las Secciones Dinámicas de la Página de Inicio
CREATE TABLE `home_sections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `options_json` JSON,
  `display_order` INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para las Secciones Dinámicas de los Modales
CREATE TABLE `modal_sections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `options_json` JSON,
  `display_order` INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar géneros por defecto desde TMDB
INSERT INTO `genres` (`id`, `name`) VALUES
(28, 'Acción'), (12, 'Aventura'), (16, 'Animación'), (35, 'Comedia'),
(80, 'Crimen'), (99, 'Documental'), (18, 'Drama'), (10751, 'Familia'),
(14, 'Fantasía'), (36, 'Historia'), (27, 'Terror'), (10402, 'Música'),
(9648, 'Misterio'), (10749, 'Romance'), (878, 'Ciencia ficción'),
(10770, 'Película de TV'), (53, 'Suspense'), (10752, 'Bélica'), (37, 'Western');

-- Insertar configuración por defecto
INSERT INTO `web_settings` (`id`, `settings_json`) VALUES (1, '{
    "importLanguage": "es-MX",
    "displayLanguage": "es-MX",
    "heroSlider": {
        "posters": 8,
        "random": 4,
        "recent": 4
    },
    "visibleCategories": ["28", "12", "16", "35", "80", "99", "18", "10751", "14", "36", "27", "10402", "9648", "10749", "878", "10770", "53", "10752", "37"],
    "visiblePlatforms": ["netflix", "disney", "hbo", "prime", "paramount"],
    "homepageSections": {
        "enEstreno": 20,
        "recienAgregado": 20,
        "peliculasPopulares": 20,
        "seriesPopulares": 20
    }
}');
