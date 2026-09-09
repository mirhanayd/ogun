CREATE TYPE "public"."support_event_type" AS ENUM('created', 'status_changed', 'priority_changed', 'assigned', 'unassigned', 'public_reply_added', 'internal_note_added', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."support_message_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "public"."support_notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."support_notification_type" AS ENUM('ticket_created', 'public_reply', 'waiting_for_clinic', 'resolved', 'closed', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_area" AS ENUM('dashboard', 'clients', 'appointments', 'plan_editor', 'foods_recipes', 'measurements_devices', 'finance', 'team_permissions', 'appointment_reminders', 'plan_sharing', 'data_security', 'desktop_sync', 'subscription_billing', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('P1', 'P2', 'P3', 'P4');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_reported_impact" AS ENUM('blocking', 'major', 'minor', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('submitted', 'triaged', 'in_progress', 'waiting_for_clinic', 'resolved', 'closed', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_type" AS ENUM('technical_issue', 'product_request', 'complaint', 'billing', 'other');--> statement-breakpoint
CREATE TABLE "support_email_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"message_id" text,
	"event_id" text NOT NULL,
	"type" "support_notification_type" NOT NULL,
	"recipient_user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" "support_notification_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"event_type" "support_event_type" NOT NULL,
	"actor_user_id" text,
	"actor_platform_staff_id" text,
	"from_status" "support_ticket_status",
	"to_status" "support_ticket_status",
	"from_priority" "support_ticket_priority",
	"to_priority" "support_ticket_priority",
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_events_actor_check" CHECK (("support_ticket_events"."actor_user_id" is not null)::int + ("support_ticket_events"."actor_platform_staff_id" is not null)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"author_user_id" text,
	"author_platform_staff_id" text,
	"visibility" "support_message_visibility" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_messages_exactly_one_author_check" CHECK (("support_ticket_messages"."author_user_id" is not null)::int + ("support_ticket_messages"."author_platform_staff_id" is not null)::int = 1),
	CONSTRAINT "support_ticket_messages_body_check" CHECK (length(trim("support_ticket_messages"."body")) between 2 and 5000)
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"clinic_id" text NOT NULL,
	"requester_user_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"type" "support_ticket_type" NOT NULL,
	"area" "support_ticket_area" NOT NULL,
	"other_area" text,
	"title" text NOT NULL,
	"reported_impact" "support_ticket_reported_impact" NOT NULL,
	"triage_priority" "support_ticket_priority",
	"status" "support_ticket_status" DEFAULT 'submitted' NOT NULL,
	"assigned_platform_staff_id" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triaged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_other_area_check" CHECK ("support_tickets"."area" <> 'other' or length(trim("support_tickets"."other_area")) between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD CONSTRAINT "support_email_notifications_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD CONSTRAINT "support_email_notifications_message_id_support_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_ticket_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD CONSTRAINT "support_email_notifications_event_id_support_ticket_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."support_ticket_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_email_notifications" ADD CONSTRAINT "support_email_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("actor_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("author_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_platform_staff_id_platform_staff_id_fk" FOREIGN KEY ("assigned_platform_staff_id") REFERENCES "public"."platform_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_email_notifications_event_idx" ON "support_email_notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "support_email_notifications_status_idx" ON "support_email_notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "support_email_notifications_ticket_idx" ON "support_email_notifications" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_created_idx" ON "support_ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_messages_request_idx" ON "support_ticket_messages" USING btree ("ticket_id","client_request_id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_created_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_reference_code_idx" ON "support_tickets" USING btree ("reference_code");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_requester_client_request_idx" ON "support_tickets" USING btree ("requester_user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "support_tickets_clinic_last_activity_idx" ON "support_tickets" USING btree ("clinic_id","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_activity_idx" ON "support_tickets" USING btree ("status","triage_priority","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_activity_idx" ON "support_tickets" USING btree ("assigned_platform_staff_id","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets" USING btree ("created_at" DESC NULLS LAST);