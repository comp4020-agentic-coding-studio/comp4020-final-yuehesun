CREATE TABLE `machines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`machine_id` integer NOT NULL,
	`person_name` text NOT NULL,
	`washing_type` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`joined_at` integer NOT NULL,
	`turn_started_at` integer,
	`claimed_at` integer,
	`started_at` integer,
	`status` text DEFAULT 'waiting' NOT NULL,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
