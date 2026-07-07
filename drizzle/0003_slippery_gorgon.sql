CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`rest_seconds` integer DEFAULT 5 NOT NULL,
	`reposition_seconds` integer DEFAULT 15 NOT NULL
);
