CREATE TABLE `users` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `registeredAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `lastActivity` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `isAdmin` BOOLEAN DEFAULT FALSE
);

CREATE TABLE `content` (
  `id` INT NOT NULL PRIMARY KEY,
  `media_type` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `original_title` VARCHAR(255),
  `overview` TEXT,
  `poster_path` VARCHAR(255),
  `backdrop_path` VARCHAR(255),
  `release_date` VARCHAR(255),
  `vote_average` FLOAT,
  `imported_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `imported_by` VARCHAR(255),
  `video_url` VARCHAR(255),
  `next_episode_note` TEXT
);

CREATE TABLE `seasons` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `content_id` INT NOT NULL,
  `season_number` INT NOT NULL,
  `name` VARCHAR(255),
  `poster_path` VARCHAR(255),
  `air_date` VARCHAR(255),
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
);

CREATE TABLE `episodes` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `season_id` INT NOT NULL,
  `episode_number` INT NOT NULL,
  `name` VARCHAR(255),
  `overview` TEXT,
  `still_path` VARCHAR(255),
  `video_url` VARCHAR(255),
  FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON DELETE CASCADE
);

CREATE TABLE `genres` (
  `id` INT NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL
);

CREATE TABLE `content_genres` (
  `content_id` INT NOT NULL,
  `genre_id` INT NOT NULL,
  PRIMARY KEY (`content_id`, `genre_id`),
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON DELETE CASCADE
);

CREATE TABLE `user_lists` (
  `user_id` VARCHAR(255) NOT NULL,
  `content_id` INT NOT NULL,
  `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `content_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
);

CREATE TABLE `messages` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `from_user` VARCHAR(255),
  `to_user` VARCHAR(255),
  `content` TEXT NOT NULL,
  `date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `is_read` BOOLEAN DEFAULT FALSE
);

CREATE TABLE `poster_clicks` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `click_count` INT DEFAULT 0,
  `last_clicked` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `web_settings` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `importLanguage` VARCHAR(255) DEFAULT 'es-MX',
  `displayLanguage` VARCHAR(255) DEFAULT 'es-MX',
  `heroSlider_posters` INT DEFAULT 8,
  `heroSlider_random` INT DEFAULT 4,
  `heroSlider_recent` INT DEFAULT 4,
  `homepage_enEstreno` INT DEFAULT 20,
  `homepage_recienAgregado` INT DEFAULT 20,
  `homepage_peliculasPopulares` INT DEFAULT 20,
  `homepage_seriesPopulares` INT DEFAULT 20
);

CREATE TABLE `home_sections` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `options` JSON,
  `order` INT
);

CREATE TABLE `modal_sections` (
  `id` VARCHAR(255) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `options` JSON,
  `order` INT
);

CREATE TABLE `display_options` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `content_id` INT NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON DELETE CASCADE
);
