CREATE TYPE "public"."subscription_email_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_source" AS ENUM('clinic_user', 'platform_staff', 'provider', 'system');--> statement-breakpoint
CREATE TABLE "subscription_email_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"subscription_event_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" "subscription_email_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_events" ADD COLUMN "source" "subscription_event_source" DEFAULT 'clinic_user' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD COLUMN "actor_platform_staff_id" text;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD COLUMN "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD CONSTRAINT "subscription_email_notifications_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD CONSTRAINT "subscription_email_notifications_subscription_event_id_subscription_events_id_fk" FOREIGN KEY ("subscription_event_id") REFERENCES "public"."subscription_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_email_notifications" ADD CONSTRAINT "subscription_email_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_email_notifications_event_idx" ON "subscription_email_notifications" USING btree ("subscription_event_id");--> statement-breakpoint
CREATE INDEX "subscription_email_notifications_status_created_idx" ON "subscription_email_notifications" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("actor_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_events_provider_event_id_idx" ON "subscription_events" USING btree ("provider_event_id");