CREATE TABLE `session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_slug` text NOT NULL,
	`unit` text NOT NULL,
	`target_units` integer NOT NULL,
	`completed_units` integer NOT NULL
);
