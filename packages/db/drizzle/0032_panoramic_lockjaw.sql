CREATE TYPE "public"."device_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_user_links" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id_hash" text NOT NULL,
	"platform" text NOT NULL,
	"display_name" text NOT NULL,
	"app_version" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ip_address" text,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_platform_staff_id" text,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_user_links" ADD CONSTRAINT "device_user_links_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_user_links" ADD CONSTRAINT "device_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("revoked_by_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_sessions_device_id_idx" ON "device_sessions" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_sessions_session_id_idx" ON "device_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_user_links_device_user_idx" ON "device_user_links" USING btree ("device_id","user_id");--> statement-breakpoint
CREATE INDEX "device_user_links_user_id_idx" ON "device_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_installation_id_hash_idx" ON "devices" USING btree ("installation_id_hash");--> statement-breakpoint
CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "devices_last_seen_at_idx" ON "devices" USING btree ("last_seen_at" DESC NULLS LAST);