DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `sessions` ADD `uuid` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `updated_at` integer;--> statement-breakpoint
UPDATE `sessions` SET `uuid` = lower(hex(randomblob(16))) WHERE `uuid` IS NULL;--> statement-breakpoint
UPDATE `sessions` SET `updated_at` = `completed_at` WHERE `updated_at` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_uuid_unique` ON `sessions` (`uuid`);
