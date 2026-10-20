CREATE TABLE `api_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`screen_id` integer,
	`group_id` integer,
	`playlist_id` integer NOT NULL,
	`weekdays` integer DEFAULT 127 NOT NULL,
	`time_from` text,
	`time_to` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `screen_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`screen_id` integer NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_by` integer,
	`delivered_at` integer,
	`acked_at` integer,
	`success` integer,
	`result` text,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `commands_screen_idx` ON `commands` (`screen_id`,`acked_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`screen_id` integer,
	`at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`source` text DEFAULT 'server' NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_at_idx` ON `events` (`at`);--> statement-breakpoint
CREATE INDEX `events_screen_idx` ON `events` (`screen_id`,`at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_filename_unique` ON `media` (`filename`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`device_secret_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_screen_id` integer,
	`pending_token` text,
	`ip` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`claimed_screen_id`) REFERENCES `screens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_codes_device_secret_hash_unique` ON `pairing_codes` (`device_secret_hash`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`playlist_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`duration_s` integer DEFAULT 10 NOT NULL,
	`reload_each_time` integer DEFAULT false NOT NULL,
	`sign_url` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_items_playlist_idx` ON `playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `screen_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `screens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`group_id` integer,
	`token_hash` text NOT NULL,
	`last_seen_at` integer,
	`agent_seen_at` integer,
	`last_ip` text,
	`browser_version` text,
	`agent_version` text,
	`resolution` text,
	`display_on` integer,
	`last_error` text,
	`last_error_at` integer,
	`current_url` text,
	`current_item` text,
	`status` text,
	`screenshot_at` integer,
	`nightly_reboot` text,
	`offline_notified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `screen_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screens_token_hash_unique` ON `screens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`password_hash` text,
	`oidc_sub` text,
	`disabled` integer DEFAULT false NOT NULL,
	`invite_token_hash` text,
	`invite_expires_at` integer,
	`locale` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_sub_unique` ON `users` (`oidc_sub`);